import { describe, expect, it } from "vitest";
import { fmtPct, fmtNum, fmtPi, piColor, scoreToHeat, isNum } from "../format";

describe("SIS formatters", () => {
  it("fmtPi signs, rounds to 2dp, suffixes σ", () => {
    expect(fmtPi(1.234)).toBe("+1.23σ");
    expect(fmtPi(-0.8)).toBe("-0.80σ");
    expect(fmtPi(0)).toBe("+0.00σ");
    expect(fmtPi(null)).toBe("—");
  });
  it("fmtPct / fmtNum round to 1dp with em-dash fallback", () => {
    expect(fmtPct(91.66)).toBe("91.7%");
    expect(fmtPct(null)).toBe("—");
    expect(fmtNum(-5.04, 1)).toBe("-5.0");
    expect(fmtNum(undefined)).toBe("—");
  });
  it("piColor flags beat/behind expectation", () => {
    expect(piColor(1.2)).toContain("emerald");
    expect(piColor(-1.5)).toContain("red");
    expect(piColor(0.3)).toContain("slate");
    expect(piColor(null)).toContain("slate");
  });
  it("scoreToHeat bands low->high", () => {
    expect(scoreToHeat(40)).toContain("red");
    expect(scoreToHeat(90)).toContain("emerald");
    expect(scoreToHeat(null)).toContain("slate");
  });
  it("isNum rejects NaN/null", () => {
    expect(isNum(5)).toBe(true);
    expect(isNum(NaN)).toBe(false);
    expect(isNum(null)).toBe(false);
  });
});
