// ORACLE GATE — validates the TS port against the REAL workbook (children's PII,
// git-ignored). Local/dev only: it SKIPS unless SIS_ORACLE_WORKBOOK points at the
// real file, so CI stays green without the data. Run manually:
//
//   SIS_ORACLE_WORKBOOK="SIS/SUMMARY OF GRADES-AY2023-2026.xlsx" npm test
//
// Asserts the §9 numbers ONLY — never logs names or scores.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { loadWorkbookTidy } from "../parser";
import { runPipeline } from "../metrics";
import { yearClean } from "../lib/parse";
import type { Tidy } from "../types";

const WORKBOOK = process.env.SIS_ORACLE_WORKBOOK;
const enabled = !!WORKBOOK && existsSync(WORKBOOK);

function auditForYear(tidy: Tidy, year: string) {
  for (const [name, a] of Object.entries(tidy.audit.sheets)) if (yearClean(name) === year) return a;
  return undefined;
}

if (!enabled) {
  // Keep CI green and self-documenting when the real workbook isn't available.
  describe.skip("SIS oracle — real workbook (set SIS_ORACLE_WORKBOOK to run)", () => {
    it("skipped — no workbook", () => {
      expect(true).toBe(true);
    });
  });
} else {
  describe("SIS oracle — real workbook (CLAUDE.md §9)", () => {
    // Parsed once at collection; only reached when the workbook is present.
    const tidy = loadWorkbookTidy(readFileSync(WORKBOOK as string));
    const result = runPipeline(tidy);

    it("year student counts: 200 (2023-2024) and 173 (2024-2025)", () => {
      expect(auditForYear(tidy, "2023-2024")?.students).toBe(200);
      expect(auditForYear(tidy, "2024-2025")?.students).toBe(173);
    });

    it("detects 12 subjects each year", () => {
      expect(auditForYear(tidy, "2023-2024")?.subjectsDetected.length).toBe(12);
      expect(auditForYear(tidy, "2024-2025")?.subjectsDetected.length).toBe(12);
    });

    it("matched cohort across the two years = 133", () => {
      const t = result.progressSummary.find((s) => s.transition.endsWith("2024-2025"));
      expect(t?.n).toBe(133);
    });

    it("English cohort annual average ~ 91.7 (Y1) and ~ 91.6 (Y2)", () => {
      const eng = result.subjectProgress.find((s) => s.subject === "ENGLISH" && s.transition.endsWith("2024-2025"));
      expect(eng?.meanPrev as number).toBeGreaterThan(91.4);
      expect(eng?.meanPrev as number).toBeLessThan(92.0);
      expect(eng?.meanCurr as number).toBeGreaterThan(91.3);
      expect(eng?.meanCurr as number).toBeLessThan(91.9);
    });

    it("attendance vs overall correlation ~ -0.41", () => {
      expect(result.attendanceSummary.available).toBe(true);
      const r = result.attendanceSummary.correlation as number;
      expect(r).toBeGreaterThan(-0.46);
      expect(r).toBeLessThan(-0.36);
    });

    it("biggest bottleneck: English into Grade 4 ~ -5 points", () => {
      const eng = result.bottleneckDrops.find((d) => d.subject === "ENGLISH");
      expect(eng?.hardestStepIntoGrade).toBe(4);
      expect(eng?.dropPoints as number).toBeGreaterThan(-6);
      expect(eng?.dropPoints as number).toBeLessThan(-4);
    });
  });
}
