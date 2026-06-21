// Numeric primitives ported 1:1 from SIS/sis_engine.py (the SIS oracle).
// These back the SIS analytics metrics (Progress Index, risk tiers, attendance
// impact). Getting any of them subtly wrong silently rescales results, so each
// is unit-tested in isolation against hand-derived values. Pure — no Firestore,
// no SheetJS, no DOM.
//
// "Nullable number" inputs model the Python NaN/None (a missing score). Every
// helper SKIPS null/undefined/NaN — it NEVER treats a missing value as 0 —
// mirroring pandas/numpy NaN-aware aggregation.

export type Num = number | null | undefined;

/** Keep only finite numbers (drops null/undefined/NaN/±Infinity). */
function finite(values: readonly Num[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Mean ignoring nulls/NaN. Returns null when nothing finite remains (never 0). */
export function nanMean(values: readonly Num[]): number | null {
  const xs = finite(values);
  if (xs.length === 0) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** Sum ignoring nulls/NaN. Empty -> 0 (mirrors pandas .sum() over dropna'd). */
export function nanSum(values: readonly Num[]): number {
  let sum = 0;
  for (const x of finite(values)) sum += x;
  return sum;
}

/**
 * Sample standard deviation (ddof=1) ignoring nulls/NaN — divides by (n-1),
 * matching np.nanstd(..., ddof=1) and np.std(..., ddof=1). Returns null for
 * fewer than 2 finite values.
 *
 * THE DDOF IS LOAD-BEARING: population std (ddof=0, ÷n) would rescale every
 * Progress Index and break the ±1.0σ slip/gem flags and risk tiers.
 */
export function sampleStd(values: readonly Num[]): number | null {
  const xs = finite(values);
  if (xs.length < 2) return null;
  const mean = nanMean(xs) as number;
  let ss = 0;
  for (const x of xs) ss += (x - mean) ** 2;
  return Math.sqrt(ss / (xs.length - 1));
}

export interface LinearFit {
  slope: number;
  intercept: number;
}

/**
 * Ordinary least-squares line y = slope*x + intercept over finite (x, y) pairs,
 * closed form — equivalent to np.polyfit(x, y, 1). Pairs where either side is
 * non-finite are dropped. Returns null when fewer than 2 pairs remain or x has
 * zero variance (a vertical fit np.polyfit could not produce).
 */
export function olsSlopeIntercept(xs: readonly Num[], ys: readonly Num[]): LinearFit | null {
  const px: number[] = [];
  const py: number[] = [];
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) {
      px.push(x);
      py.push(y);
    }
  }
  if (px.length < 2) return null;
  const xbar = nanMean(px) as number;
  const ybar = nanMean(py) as number;
  let num = 0;
  let den = 0;
  for (let i = 0; i < px.length; i++) {
    const dx = px[i] - xbar;
    num += dx * (py[i] - ybar);
    den += dx * dx;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: ybar - slope * xbar };
}

/**
 * Pearson correlation coefficient over finite (x, y) pairs — equivalent to
 * np.corrcoef(x, y)[0, 1] (ddof cancels, so sample vs population is irrelevant).
 * Returns null with fewer than 2 pairs or zero variance on either axis.
 */
export function pearsonR(xs: readonly Num[], ys: readonly Num[]): number | null {
  const px: number[] = [];
  const py: number[] = [];
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) {
      px.push(x);
      py.push(y);
    }
  }
  if (px.length < 2) return null;
  const xbar = nanMean(px) as number;
  const ybar = nanMean(py) as number;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < px.length; i++) {
    const dx = px[i] - xbar;
    const dy = py[i] - ybar;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const den = Math.sqrt(sxx * syy);
  if (den === 0) return null;
  return sxy / den;
}

/**
 * Linear-interpolation quantile (pandas/numpy default, "type 7") over finite
 * values. `q` in [0, 1]. Returns null on empty input. NOT nearest-rank — the
 * 25th-percentile risk cut depends on this exact interpolation.
 */
export function quantileLinear(values: readonly Num[], q: number): number | null {
  const xs = finite(values).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (xs.length === 1) return xs[0];
  const pos = q * (xs.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return xs[lo] + frac * (xs[hi] - xs[lo]);
}

/**
 * Bin a value into a labelled band, replicating pandas pd.cut with default
 * right-closed intervals: band i covers (edges[i], edges[i+1]]. `edges` must be
 * ascending with length === labels.length + 1. Returns null when the value
 * falls outside (edges[0], edges[last]].
 */
export function cutBand(value: number, edges: readonly number[], labels: readonly string[]): string | null {
  if (!Number.isFinite(value)) return null;
  if (edges.length !== labels.length + 1) {
    throw new Error("cutBand: edges.length must equal labels.length + 1");
  }
  for (let i = 0; i < labels.length; i++) {
    if (value > edges[i] && value <= edges[i + 1]) return labels[i];
  }
  return null;
}
