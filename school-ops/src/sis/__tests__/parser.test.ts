// Parser tests (Phase 1c) — build tiny synthetic .xlsx workbooks with SheetJS
// that deliberately reproduce the messy-header quirks from SIS/CLAUDE.md §5
// (header on row 2, blank NAME header + SECTION/NO/NAME order, drifted subject
// tokens, N/A -> null, G#X sections, a non-year sheet that must be skipped).
// All data is obviously fake.
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { loadWorkbookTidy } from "../parser";

function toBuffer(sheets: Record<string, unknown[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

const YEAR1 = "AY2023-2024";
const YEAR2 = "AY2024-2025";

const buffer = toBuffer({
  // Title row, header on row 2, attendance + subject drift, an N/A score.
  [YEAR1]: [
    ["AL FAJER — SUMMARY OF GRADES", null, null, null, null, null, null, null, null],
    ["SECTION", "NO", "NAME", "ENGLISH-T1 (6)", "ENGLISH-T2", "MATH-T1 (4)", "#T1 SchDays1", "T1 DaysAbs1", "TARDY"],
    ["G1A", 1, "Pupil One", 90, 80, 70, 90, 4, 1],
    ["G1A", 2, "Pupil Two", "N/A", 85, 60, 88, 6, 0],
    ["G4B", 3, "Pupil Three", 50, 55, 40, 80, 12, 2],
  ],
  // Blank NAME header (col index 2 is null) + drifted ISL/COMP tokens.
  [YEAR2]: [
    ["GRADES 2024-2025", null, null, null, null],
    ["SECTION", "NO", null, "ISL-T1 (1)", "COMP-T1 (1)"],
    ["G2A", 1, "Pupil One", 95, 88],
    ["G2A", 5, "Pupil Five", 70, 60],
  ],
  // Non-year sheet — must be skipped entirely.
  Notes: [["just some notes"]],
});

const tidy = loadWorkbookTidy(buffer);

describe("loadWorkbookTidy — audit", () => {
  it("processes only the year sheets (skips non-year)", () => {
    expect(Object.keys(tidy.audit.sheets).sort()).toEqual([YEAR1, YEAR2]);
  });
  it("detects the header row (Excel row 2) and counts students", () => {
    expect(tidy.audit.sheets[YEAR1].headerRowExcel).toBe(2);
    expect(tidy.audit.sheets[YEAR1].students).toBe(3);
    expect(tidy.audit.sheets[YEAR2].students).toBe(2);
  });
  it("fingerprints subjects and attendance by meaning", () => {
    expect(tidy.audit.sheets[YEAR1].subjectsDetected).toEqual(["ENGLISH", "MATH"]);
    expect(tidy.audit.sheets[YEAR1].attendanceDetected).toEqual(["days_absent", "days_school", "days_tardy"]);
    expect(tidy.audit.sheets[YEAR2].subjectsDetected).toEqual(["COMPUTER", "ISLAMIC"]);
  });
  it("recovers the blank/unlabeled NAME column via the text-ratio fallback", () => {
    expect(tidy.audit.sheets[YEAR2].nameColumn).not.toBe("None");
  });
});

describe("loadWorkbookTidy — rows", () => {
  it("normalizes year labels and keeps full-precision scores", () => {
    const eng1 = tidy.scores.find(
      (r) => r.studentId === 1 && r.year === "2023-2024" && r.subject === "ENGLISH" && r.term === 1,
    )!;
    expect(eng1.score).toBe(90);
  });
  it("maps N/A scores to null (never 0)", () => {
    const eng2t1 = tidy.scores.find(
      (r) => r.studentId === 2 && r.year === "2023-2024" && r.subject === "ENGLISH" && r.term === 1,
    )!;
    expect(eng2t1.score).toBeNull();
  });
  it("parses G#X sections into grade + section", () => {
    const row = tidy.scores.find((r) => r.studentId === 3 && r.year === "2023-2024")!;
    expect(row.grade).toBe(4);
    expect(row.section).toBe("B");
  });
  it("classifies attendance with term and bare-TARDY annual", () => {
    const tardy = tidy.attendance.find((r) => r.studentId === 1 && r.metric === "days_tardy")!;
    expect(tardy.term).toBe(0);
    const sch = tidy.attendance.find((r) => r.studentId === 1 && r.metric === "days_school")!;
    expect(sch.term).toBe(1);
    expect(sch.value).toBe(90);
  });
  it("collects names across sheets, including the recovered blank column", () => {
    const ids = tidy.students.map((s) => s.studentId).sort((a, b) => Number(a) - Number(b));
    expect(ids).toEqual([1, 2, 3, 5]);
    expect(tidy.students.find((s) => s.studentId === 5)!.name).toBe("Pupil Five");
  });
});
