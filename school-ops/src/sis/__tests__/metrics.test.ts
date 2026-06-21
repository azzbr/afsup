// Unit tests for the SIS metrics module (Phase 1b). Synthetic, fully-fake data
// with hand-derived expected values, asserting the §9-shaped invariants and the
// crown-jewel math (Progress Index, risk tiers, bottleneck, attendance impact)
// before the real-workbook oracle check in 1c.
import { describe, expect, it } from "vitest";
import {
  subjectYear,
  studentYear,
  attendanceYear,
  progressIndex,
  cohortProgress,
  curriculumBottleneck,
  sectionEquity,
  attendanceImpact,
  termSlump,
  riskRegister,
  type SubjectYearRow,
  type StudentYearRow,
  type AttendanceYearRow,
  type ProgressDetailRow,
} from "../metrics";
import type { AttendanceCellRow, ScoreRow, StudentNameRow, Tidy } from "../types";

const ys = (year: string) => Number(year.slice(0, 4));

function sc(
  studentId: number,
  year: string,
  subject: string,
  term: number,
  score: number | null,
  grade: number | null = 1,
  section: string | null = "A",
): ScoreRow {
  return { studentId, year, yearStart: ys(year), grade, section, subject, term, score };
}
function at(
  studentId: number,
  year: string,
  term: number,
  metric: AttendanceCellRow["metric"],
  value: number | null,
): AttendanceCellRow {
  return { studentId, year, yearStart: ys(year), grade: 1, section: "A", term, metric, value };
}
function tidy(scores: ScoreRow[], attendance: AttendanceCellRow[] = [], students: StudentNameRow[] = []): Tidy {
  return { scores, attendance, students, audit: { sheets: {} } };
}
function syRow(studentId: number, year: string, overall: number, grade: number | null = 3): StudentYearRow {
  return { studentId, year, yearStart: ys(year), grade, section: "A", overall, subjectsTaken: 12 };
}
function subjRow(
  studentId: number,
  year: string,
  subject: string,
  grade: number | null,
  scoreYear: number,
  section: string | null = "A",
  termDelta: number | null = 0,
): SubjectYearRow {
  return { studentId, year, yearStart: ys(year), grade, section, subject, t1: scoreYear, t2: scoreYear, scoreYear, termDelta };
}

describe("subjectYear / studentYear", () => {
  it("averages terms, keeps null term-delta, and rolls up to overall", () => {
    const sy = subjectYear(
      tidy([
        sc(1, "2024-2025", "ENGLISH", 1, 90),
        sc(1, "2024-2025", "ENGLISH", 2, 80),
        sc(1, "2024-2025", "MATH", 1, 70),
        sc(1, "2024-2025", "MATH", 2, null), // N/A term -> excluded, not 0
      ]),
    );
    const eng = sy.find((r) => r.subject === "ENGLISH")!;
    expect(eng.scoreYear).toBe(85);
    expect(eng.termDelta).toBe(-10);
    const math = sy.find((r) => r.subject === "MATH")!;
    expect(math.scoreYear).toBe(70); // single term, not averaged with 0
    expect(math.termDelta).toBeNull();

    const syear = studentYear(sy);
    expect(syear).toHaveLength(1);
    expect(syear[0].overall).toBe(77.5);
    expect(syear[0].subjectsTaken).toBe(2);
  });
});

describe("attendanceYear", () => {
  it("sums metrics across terms and computes absence_rate (null when no school days)", () => {
    const ay = attendanceYear(
      tidy(
        [],
        [
          at(1, "2024-2025", 1, "days_school", 90),
          at(1, "2024-2025", 2, "days_school", 90),
          at(1, "2024-2025", 1, "days_absent", 4),
          at(1, "2024-2025", 2, "days_absent", 6),
          at(2, "2024-2025", 0, "days_school", 0),
          at(2, "2024-2025", 0, "days_absent", 3),
        ],
      ),
    );
    const s1 = ay.find((r) => r.studentId === 1)!;
    expect(s1.daysSchool).toBe(180);
    expect(s1.daysAbsent).toBe(10);
    expect(s1.absenceRate).toBeCloseTo(10 / 180, 9);
    const s2 = ay.find((r) => r.studentId === 2)!;
    expect(s2.absenceRate).toBeNull();
  });
});

describe("progressIndex (conditional growth)", () => {
  it("returns nulls when fewer than 5 finite pairs", () => {
    const r = progressIndex([1, 2, 3, 4], [2, 3, 4, 5]);
    expect(r.slope).toBeNull();
    expect(r.pi).toEqual([null, null, null, null]);
  });

  it("is all-zero when growth is perfectly linear (residuals 0 -> sd guard 1.0)", () => {
    const prev = [1, 2, 3, 4, 5, 6];
    const curr = prev.map((x) => 2 * x + 1);
    const r = progressIndex(prev, curr);
    expect(r.slope).toBeCloseTo(2, 9);
    expect(r.intercept).toBeCloseTo(1, 9);
    r.pi.forEach((v) => expect(v).toBeCloseTo(0, 9));
  });

  it("matches a hand-derived standardized residual", () => {
    // x=[0..4], y=[0,1,2,3,8]: OLS slope 1.8, intercept -0.8; resid sd (ddof=1)
    // = sqrt(6.4/4) = 1.264911; pi = resid / sd.
    const r = progressIndex([0, 1, 2, 3, 4], [0, 1, 2, 3, 8]);
    expect(r.slope).toBeCloseTo(1.8, 9);
    expect(r.intercept).toBeCloseTo(-0.8, 9);
    expect(r.pi[4]).toBeCloseTo(1.264911, 5);
    expect(r.pi[3]).toBeCloseTo(-1.264911, 5);
    expect(r.pi[1]).toBeCloseTo(0, 9);
  });
});

describe("cohortProgress", () => {
  it("matches by student id; raw delta + Progress Index over a >=5 cohort", () => {
    const overalls = [50, 60, 70, 80, 90, 55, 65];
    const syear: StudentYearRow[] = [
      ...overalls.map((o, i) => syRow(i + 1, "2023-2024", o)),
      ...overalls.map((o, i) => syRow(i + 1, "2024-2025", o + 5)),
    ];
    const { detail, summary } = cohortProgress(syear);
    expect(detail).toHaveLength(7);
    expect(detail.every((d) => d.rawDelta === 5)).toBe(true);
    detail.forEach((d) => expect(d.progressIndex).toBeCloseTo(0, 9)); // uniform shift
    expect(summary[0].n).toBe(7);
    expect((summary[0].meanCurr as number) - (summary[0].meanPrev as number)).toBeCloseTo(5, 9);
  });

  it("only counts students present in BOTH years; pi null when cohort < 5", () => {
    const syear: StudentYearRow[] = [
      syRow(1, "2023-2024", 70),
      syRow(2, "2023-2024", 70),
      syRow(3, "2023-2024", 70),
      syRow(3, "2024-2025", 75),
      syRow(4, "2024-2025", 75),
      syRow(5, "2024-2025", 75),
    ];
    const { detail } = cohortProgress(syear);
    expect(detail).toHaveLength(1); // only student 3 overlaps
    expect(detail[0].studentId).toBe(3);
    expect(detail[0].rawDelta).toBe(5);
    expect(detail[0].progressIndex).toBeNull();
  });
});

describe("curriculumBottleneck", () => {
  it("finds the destination grade with the biggest negative step", () => {
    // ENGLISH grade means 90,88,87,82,81 -> biggest drop is into grade 4 (-5)
    const rows: SubjectYearRow[] = [
      subjRow(1, "2024-2025", "ENGLISH", 1, 90),
      subjRow(2, "2024-2025", "ENGLISH", 2, 88),
      subjRow(3, "2024-2025", "ENGLISH", 3, 87),
      subjRow(4, "2024-2025", "ENGLISH", 4, 82),
      subjRow(5, "2024-2025", "ENGLISH", 5, 81),
    ];
    const { drops } = curriculumBottleneck(rows);
    const eng = drops.find((d) => d.subject === "ENGLISH")!;
    expect(eng.hardestStepIntoGrade).toBe(4);
    expect(eng.dropPoints).toBeCloseTo(-5, 9);
  });
});

describe("sectionEquity", () => {
  it("flags (year, grade, subject) section gaps >= 4 points", () => {
    const rows: SubjectYearRow[] = [
      subjRow(1, "2024-2025", "ENGLISH", 3, 90, "A"),
      subjRow(2, "2024-2025", "ENGLISH", 3, 84, "B"),
      subjRow(3, "2024-2025", "MATH", 3, 90, "A"),
      subjRow(4, "2024-2025", "MATH", 3, 88, "B"),
    ];
    const spread = sectionEquity(rows);
    const eng = spread.find((s) => s.subject === "ENGLISH")!;
    expect(eng.gap).toBeCloseTo(6, 9);
    expect(eng.flag).toBe(true);
    const math = spread.find((s) => s.subject === "MATH")!;
    expect(math.gap).toBeCloseTo(2, 9);
    expect(math.flag).toBe(false);
    expect(spread[0].subject).toBe("ENGLISH"); // sorted by gap desc
  });
});

describe("attendanceImpact", () => {
  it("recovers a perfect negative relationship (r ~ -1, slope ~ -2)", () => {
    const syear: StudentYearRow[] = [];
    const att: AttendanceYearRow[] = [];
    for (let i = 0; i < 10; i++) {
      syear.push(syRow(i + 1, "2024-2025", 100 - 2 * i));
      att.push({
        studentId: i + 1,
        year: "2024-2025",
        yearStart: 2024,
        daysSchool: 180,
        daysPresent: 180 - i,
        daysAbsent: i,
        daysTardy: 0,
        absenceRate: i / 180,
      });
    }
    const { summary, bands } = attendanceImpact(syear, att);
    expect(summary.available).toBe(true);
    expect(summary.n).toBe(10);
    expect(summary.correlation).toBeCloseTo(-1, 6);
    expect(summary.pointsPerAbsenceDay).toBeCloseTo(-2, 6);
    expect(bands.length).toBeGreaterThan(0);
  });

  it("is unavailable with fewer than 10 joined rows", () => {
    const { summary } = attendanceImpact([syRow(1, "2024-2025", 90)], []);
    expect(summary.available).toBe(false);
  });
});

describe("termSlump", () => {
  it("averages T2-T1 per subject and overall", () => {
    const rows: SubjectYearRow[] = [
      subjRow(1, "2024-2025", "ENGLISH", 3, 80, "A", -3),
      subjRow(2, "2024-2025", "ENGLISH", 3, 80, "A", -1),
      subjRow(3, "2024-2025", "MATH", 3, 80, "A", 2),
    ];
    const { rows: slump, overall } = termSlump(rows);
    expect(slump.find((r) => r.subject === "ENGLISH")!.avgT2MinusT1).toBeCloseTo(-2, 9);
    expect(overall).toBeCloseTo((-3 - 1 + 2) / 3, 9);
    expect(slump[0].subject).toBe("ENGLISH"); // most negative first
  });
});

describe("riskRegister", () => {
  const syear: StudentYearRow[] = [
    syRow(1, "2024-2025", 40),
    syRow(2, "2024-2025", 95),
    syRow(3, "2024-2025", 70),
    syRow(4, "2024-2025", 85),
    syRow(5, "2024-2025", 60),
    syRow(6, "2024-2025", 50),
  ];
  const pd = (studentId: number, pi: number): ProgressDetailRow => ({
    studentId,
    transition: "2023-2024 → 2024-2025",
    prev: 0,
    curr: 0,
    gradePrev: 2,
    gradeCurr: 3,
    rawDelta: 0,
    expected: 0,
    progressIndex: pi,
  });
  const ay = (studentId: number, daysAbsent: number): AttendanceYearRow => ({
    studentId,
    year: "2024-2025",
    yearStart: 2024,
    daysSchool: 180,
    daysPresent: 180 - daysAbsent,
    daysAbsent,
    daysTardy: 0,
    absenceRate: daysAbsent / 180,
  });
  const detail = [pd(1, -1.5), pd(2, 1.5), pd(3, -1.2)];
  const att = [ay(1, 0), ay(5, 15), ay(6, 5)];
  const students: StudentNameRow[] = [{ studentId: 1, name: "Anon One" }];

  it("computes the 25th-percentile low cut and assigns tiers by priority", () => {
    const { rows, latestYear, lowCut } = riskRegister(syear, detail, att, students);
    expect(latestYear).toBe("2024-2025");
    expect(lowCut).toBeCloseTo(52.5, 9); // quantile([40,50,60,70,85,95], .25)
    const tierOf = (id: number) => rows.find((r) => r.studentId === id)!.tier;
    expect(tierOf(1)).toBe("critical"); // low AND slip
    expect(tierOf(5)).toBe("attendance_risk"); // not low, 15 absences
    expect(tierOf(3)).toBe("slipping"); // pi -1.2, not low/absent
    expect(tierOf(2)).toBe("hidden_gem"); // pi +1.5
    expect(tierOf(4)).toBe("on_track"); // no signals
    expect(tierOf(6)).toBe("on_track"); // low alone is not critical
  });

  it("builds the signals string and is sorted by tier priority", () => {
    const { rows } = riskRegister(syear, detail, att, students);
    expect(rows[0].tier).toBe("critical");
    const s1 = rows.find((r) => r.studentId === 1)!;
    expect(s1.signals).toBe("progress -1.5σ; 0 absences; avg 40.0");
  });
});
