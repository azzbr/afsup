// Unit tests for the SIS numeric primitives (Phase 1a). Hand-derived expected
// values lock these to the Python oracle's behavior before any metric wiring.
import { describe, expect, it } from "vitest";
import {
  nanMean,
  nanSum,
  sampleStd,
  olsSlopeIntercept,
  pearsonR,
  quantileLinear,
  cutBand,
} from "../lib/numeric";

const BAND_EDGES = [-1, 0, 3, 7, 14, 9999];
const BAND_LABELS = ["0", "1-3", "4-7", "8-14", "15+"];

describe("nanMean", () => {
  it("averages finite values", () => {
    expect(nanMean([90, null, 80])).toBe(85);
  });
  it("ignores null/undefined/NaN — never counts them as 0", () => {
    expect(nanMean([100, null, undefined, NaN, 50])).toBe(75);
  });
  it("returns null when nothing finite remains", () => {
    expect(nanMean([])).toBeNull();
    expect(nanMean([null, NaN, undefined])).toBeNull();
  });
});

describe("nanSum", () => {
  it("sums finite values; empty -> 0", () => {
    expect(nanSum([1, null, 2, NaN, 3])).toBe(6);
    expect(nanSum([])).toBe(0);
  });
});

describe("sampleStd (ddof=1)", () => {
  it("divides by n-1, NOT n", () => {
    // [2,4,4,4,5,5,7,9]: mean 5, SS = 32, /(8-1) = 4.5714..., sqrt = 2.138090...
    // (population std ÷n would give exactly 2.0 — the wrong answer.)
    expect(sampleStd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
  });
  it("ignores nulls and needs >= 2 finite values", () => {
    expect(sampleStd([5, null, 5])).toBe(0);
    expect(sampleStd([5])).toBeNull();
    expect(sampleStd([])).toBeNull();
  });
});

describe("olsSlopeIntercept", () => {
  it("fits an exact line y = 2x + 1", () => {
    expect(olsSlopeIntercept([1, 2, 3], [3, 5, 7])).toEqual({ slope: 2, intercept: 1 });
  });
  it("drops non-finite pairs before fitting", () => {
    const fit = olsSlopeIntercept([1, 2, null, 3], [3, 5, 99, 7]);
    expect(fit).not.toBeNull();
    expect(fit?.slope).toBeCloseTo(2, 10);
    expect(fit?.intercept).toBeCloseTo(1, 10);
  });
  it("returns null with <2 pairs or zero x-variance", () => {
    expect(olsSlopeIntercept([1], [2])).toBeNull();
    expect(olsSlopeIntercept([5, 5, 5], [1, 2, 3])).toBeNull();
  });
});

describe("pearsonR", () => {
  it("is +1 for perfect positive, -1 for perfect negative correlation", () => {
    expect(pearsonR([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(pearsonR([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10);
  });
  it("returns null without variance on an axis", () => {
    expect(pearsonR([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("quantileLinear (type-7, pandas default)", () => {
  it("matches pandas .quantile(0.25)", () => {
    expect(quantileLinear([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantileLinear([10, 20, 30, 40], 0.25)).toBe(17.5);
  });
  it("handles single-element, empty, and the extremes", () => {
    expect(quantileLinear([42], 0.25)).toBe(42);
    expect(quantileLinear([], 0.25)).toBeNull();
    expect(quantileLinear([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(quantileLinear([1, 2, 3, 4, 5], 1)).toBe(5);
  });
});

describe("cutBand (pd.cut right-closed (lo, hi])", () => {
  const band = (v: number) => cutBand(v, BAND_EDGES, BAND_LABELS);
  it("places boundary values in the upper-closed band", () => {
    expect(band(0)).toBe("0");
    expect(band(1)).toBe("1-3");
    expect(band(3)).toBe("1-3");
    expect(band(4)).toBe("4-7");
    expect(band(7)).toBe("4-7");
    expect(band(8)).toBe("8-14");
    expect(band(14)).toBe("8-14");
    expect(band(15)).toBe("15+");
  });
  it("returns null outside (edges[0], edges[last]]", () => {
    expect(band(-1)).toBeNull(); // -1 is not > -1
  });
  it("throws when edges/labels lengths disagree", () => {
    expect(() => cutBand(1, [0, 1], ["a", "b"])).toThrow();
  });
});
