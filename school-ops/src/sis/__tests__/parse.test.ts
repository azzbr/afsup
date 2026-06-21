// Unit tests for the SIS parse helpers (Phase 1a). These exercise the real
// messy-header quirks called out in SIS/CLAUDE.md §5 against the oracle's logic.
import { describe, expect, it } from "vitest";
import {
  normHeader,
  matchSubject,
  classifyColumn,
  findHeaderRow,
  parseSection,
  toScore,
  toAttendanceNumber,
  yearStart,
  yearClean,
} from "../lib/parse";

describe("normHeader", () => {
  it("lowercases and strips non-alphanumerics", () => {
    expect(normHeader("ENGLISH-T1 (6)")).toBe("englisht16");
    expect(normHeader("SOC.STU-T1 (1)")).toBe("socstut11");
    expect(normHeader(null)).toBe("");
  });
});

describe("matchSubject", () => {
  it("maps canonical and drifted tokens", () => {
    expect(matchSubject("english")).toBe("ENGLISH");
    expect(matchSubject("math")).toBe("MATH");
    expect(matchSubject("socstu")).toBe("SOCIAL_STUDIES");
    expect(matchSubject("islam")).toBe("ISLAMIC"); // year 1
    expect(matchSubject("isl")).toBe("ISLAMIC"); // year 2 drift
    expect(matchSubject("lfskl")).toBe("LIFE_SKILLS");
    expect(matchSubject("comp")).toBe("COMPUTER");
    expect(matchSubject("fre")).toBe("FRENCH");
    expect(matchSubject("art")).toBe("ART");
    expect(matchSubject("pe")).toBe("PE");
    expect(matchSubject("xyz")).toBeNull();
  });
});

describe("classifyColumn", () => {
  it("identifies id / name / section / grade", () => {
    expect(classifyColumn("NO").kind).toBe("id");
    expect(classifyColumn("NAME").kind).toBe("name");
    expect(classifyColumn("Unnamed: 2").kind).toBe("name"); // blank header fallback marker
    expect(classifyColumn("SECTION").kind).toBe("section");
    expect(classifyColumn("Grade").kind).toBe("grade");
    expect(classifyColumn("").kind).toBe("ignore");
  });

  it("parses subject + term across year-to-year header drift", () => {
    expect(classifyColumn("ENGLISH-T1 (6)")).toMatchObject({ kind: "subject", subject: "ENGLISH", term: 1 });
    expect(classifyColumn("MATH-T2(4)")).toMatchObject({ kind: "subject", subject: "MATH", term: 2 });
    expect(classifyColumn("SOC.STU-T1 (1)")).toMatchObject({ kind: "subject", subject: "SOCIAL_STUDIES", term: 1 });
    expect(classifyColumn("ISLAM-T1 (1)")).toMatchObject({ kind: "subject", subject: "ISLAMIC", term: 1 });
    expect(classifyColumn("ISL-T1 (1)")).toMatchObject({ kind: "subject", subject: "ISLAMIC", term: 1 });
    expect(classifyColumn("LF SKL-T2")).toMatchObject({ kind: "subject", subject: "LIFE_SKILLS", term: 2 });
    expect(classifyColumn("PE-T1 (2) ")).toMatchObject({ kind: "subject", subject: "PE", term: 1 });
  });

  it("classifies attendance by keyword + term, with bare TARDY annual", () => {
    expect(classifyColumn("#T1 SchDays1")).toMatchObject({ kind: "att", metric: "days_school", term: 1 });
    expect(classifyColumn("T1 DaysPres1")).toMatchObject({ kind: "att", metric: "days_present", term: 1 });
    expect(classifyColumn("T2 DaysAbs2")).toMatchObject({ kind: "att", metric: "days_absent", term: 2 });
    expect(classifyColumn("DaysTard2")).toMatchObject({ kind: "att", metric: "days_tardy", term: 2 });
    expect(classifyColumn("TARDY")).toMatchObject({ kind: "att", metric: "days_tardy", term: 0 });
  });
});

describe("findHeaderRow", () => {
  it("detects the header row under a title row", () => {
    const rows: unknown[][] = [
      ["AL FAJER SCHOOL — SUMMARY OF GRADES", null, null, null],
      ["SECTION", "NO", "NAME", "ENGLISH-T1 (6)"],
      ["G1A", 1, "Pupil One", 95],
    ];
    expect(findHeaderRow(rows)).toBe(1);
  });
});

describe("parseSection", () => {
  it("splits grade and section, tolerating missing parts", () => {
    expect(parseSection("G4B")).toEqual({ grade: 4, section: "B" });
    expect(parseSection("3A")).toEqual({ grade: 3, section: "A" });
    expect(parseSection("G1")).toEqual({ grade: 1, section: null });
    expect(parseSection(null)).toEqual({ grade: null, section: null });
    expect(parseSection("staff")).toEqual({ grade: null, section: null });
  });
});

describe("toScore", () => {
  it("keeps full-precision numbers and strips %", () => {
    expect(toScore("98.9166")).toBeCloseTo(98.9166, 4);
    expect(toScore("85%")).toBe(85);
    expect(toScore(0)).toBe(0);
  });
  it("maps N/A and blanks to null — never 0", () => {
    expect(toScore("N/A")).toBeNull();
    expect(toScore("na")).toBeNull();
    expect(toScore("-")).toBeNull();
    expect(toScore("")).toBeNull();
    expect(toScore(null)).toBeNull();
    expect(toScore("abc")).toBeNull();
  });
});

describe("toAttendanceNumber", () => {
  it("coerces numbers; blanks and non-numerics -> null", () => {
    expect(toAttendanceNumber(180)).toBe(180);
    expect(toAttendanceNumber("175")).toBe(175);
    expect(toAttendanceNumber("")).toBeNull();
    expect(toAttendanceNumber("N/A")).toBeNull();
    expect(toAttendanceNumber(null)).toBeNull();
  });
});

describe("yearStart / yearClean", () => {
  it("extracts the sortable start year", () => {
    expect(yearStart("AY2023-2024")).toBe(2023);
    expect(yearStart("Sheet1")).toBe(0);
  });
  it("canonicalizes the academic-year label", () => {
    expect(yearClean("AY2023-2024")).toBe("2023-2024");
    expect(yearClean("2024 - 2025 grades")).toBe("2024-2025");
    expect(yearClean("Misc")).toBe("Misc");
  });
});
