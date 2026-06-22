// Small display formatters shared across the SIS dashboard tabs. Display-only —
// the stored values keep full precision (rounding happens here, per CLAUDE.md §5).

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Percentage / score to 1 decimal, em-dash for missing. */
export const fmtPct = (v) => (isNum(v) ? `${v.toFixed(1)}%` : '—');

/** Plain number to `d` decimals, em-dash for missing. */
export const fmtNum = (v, d = 1) => (isNum(v) ? v.toFixed(d) : '—');

/** Progress Index with sign + sigma, e.g. "+1.24σ" / "-0.80σ". */
export const fmtPi = (v) => (isNum(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}σ` : '—');

/** Color for a Progress Index value (green beat expectation, red fell behind). */
export const piColor = (v) => (!isNum(v) ? 'text-slate-400' : v >= 1 ? 'text-emerald-600' : v <= -1 ? 'text-red-600' : 'text-slate-600');

/** Heatmap cell color by mean score (red low -> green high). */
export const scoreToHeat = (v) => {
  if (!isNum(v)) return 'bg-slate-50 text-slate-400';
  if (v < 50) return 'bg-red-500 text-white';
  if (v < 65) return 'bg-amber-400 text-white';
  if (v < 75) return 'bg-yellow-200 text-slate-800';
  if (v < 85) return 'bg-lime-200 text-slate-800';
  return 'bg-emerald-500 text-white';
};
