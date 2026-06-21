// SIS analytics metrics — pure TS port of SIS/sis_engine.py §3/§4 (the oracle).
// Operates on the tidy arrays from types.ts; no Firestore, no SheetJS, no DOM.
// All averages ignore nulls (see lib/numeric). Progress is measured by the
// conditional-growth Progress Index (standardized residual), NEVER raw delta.

import {
  nanMean,
  nanSum,
  sampleStd,
  olsSlopeIntercept,
  pearsonR,
  quantileLinear,
  cutBand,
} from "./lib/numeric";
import type { StudentId, Tidy } from "./types";
import type { StudentRiskTier } from "../constants";

// ---------------------------------------------------------------------------
// internal helpers
// ---------------------------------------------------------------------------

// "|" is a safe key separator: student ids are numeric, subjects are UPPER_SNAKE,
// years are "YYYY-YYYY", grades are digits and sections single letters — none
// contain "|" or "~". A null part becomes "~" so it can't collide with data.
const SEP = "|";
const NULLKEY = "~";

/** Build a composite group key from heterogeneous parts (null-safe). */
function gkey(...parts: (StudentId | string | number | null)[]): string {
  return parts.map((p) => (p === null || p === undefined ? NULLKEY : String(p))).join(SEP);
}

function groupBy<T>(rows: readonly T[], keyFn: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Distinct academic-year labels ordered by their integer start (never lexically). */
function uniqueYearsSorted(rows: readonly { year: string; yearStart: number }[]): string[] {
  const m = new Map<string, number>();
  for (const r of rows) if (!m.has(r.year)) m.set(r.year, r.yearStart);
  return [...m.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
}

/** Transition label, e.g. "2023-2024 → 2024-2025" (must match riskRegister's filter). */
function transitionLabel(y0: string, y1: string): string {
  return `${y0} → ${y1}`;
}

// ---------------------------------------------------------------------------
// derived tables
// ---------------------------------------------------------------------------

export interface SubjectYearRow {
  studentId: StudentId;
  year: string;
  yearStart: number;
  grade: number | null;
  section: string | null;
  subject: string;
  t1: number | null;
  t2: number | null;
  scoreYear: number;
  termDelta: number | null;
}

/** Annual subject score = mean of available terms; plus the T2-T1 within-year delta. */
export function subjectYear(tidy: Tidy): SubjectYearRow[] {
  const withScore = tidy.scores.filter((r) => typeof r.score === "number" && Number.isFinite(r.score));
  const groups = groupBy(withScore, (r) => gkey(r.studentId, r.year, r.subject));
  const out: SubjectYearRow[] = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    const t1 = nanMean(rows.filter((r) => r.term === 1).map((r) => r.score));
    const t2 = nanMean(rows.filter((r) => r.term === 2).map((r) => r.score));
    out.push({
      studentId: first.studentId,
      year: first.year,
      yearStart: first.yearStart,
      grade: first.grade,
      section: first.section,
      subject: first.subject,
      t1,
      t2,
      // group exists only when >=1 non-null score, so this is never null
      scoreYear: nanMean([t1, t2]) as number,
      termDelta: t1 !== null && t2 !== null ? t2 - t1 : null,
    });
  }
  return out;
}

export interface StudentYearRow {
  studentId: StudentId;
  year: string;
  yearStart: number;
  grade: number | null;
  section: string | null;
  overall: number;
  subjectsTaken: number;
}

/** Overall annual attainment = mean of a student's annual subject scores that year. */
export function studentYear(sy: readonly SubjectYearRow[]): StudentYearRow[] {
  const groups = groupBy(sy, (r) => gkey(r.studentId, r.year));
  const out: StudentYearRow[] = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    out.push({
      studentId: first.studentId,
      year: first.year,
      yearStart: first.yearStart,
      grade: first.grade,
      section: first.section,
      overall: nanMean(rows.map((r) => r.scoreYear)) as number,
      subjectsTaken: new Set(rows.map((r) => r.subject)).size,
    });
  }
  return out;
}

export interface AttendanceYearRow {
  studentId: StudentId;
  year: string;
  yearStart: number;
  daysSchool: number;
  daysPresent: number;
  daysAbsent: number;
  daysTardy: number;
  absenceRate: number | null;
}

/** Attendance per year = sum of each metric across terms; absence_rate = absent/school. */
export function attendanceYear(tidy: Tidy): AttendanceYearRow[] {
  const withVal = tidy.attendance.filter((r) => typeof r.value === "number" && Number.isFinite(r.value));
  const groups = groupBy(withVal, (r) => gkey(r.studentId, r.year));
  const out: AttendanceYearRow[] = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    const pick = (m: string) => rows.filter((r) => r.metric === m).map((r) => r.value);
    const daysSchool = nanSum(pick("days_school"));
    const daysAbsent = nanSum(pick("days_absent"));
    out.push({
      studentId: first.studentId,
      year: first.year,
      yearStart: first.yearStart,
      daysSchool,
      daysPresent: nanSum(pick("days_present")),
      daysAbsent,
      daysTardy: nanSum(pick("days_tardy")),
      absenceRate: daysSchool > 0 ? daysAbsent / daysSchool : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// the analyst metrics
// ---------------------------------------------------------------------------

export interface ProgressIndexResult {
  pi: (number | null)[];
  pred: (number | null)[];
  slope: number | null;
  intercept: number | null;
}

/**
 * Conditional growth: regress curr on prev, return the standardized residual —
 * how much better/worse than expected GIVEN the starting point. Mirrors
 * _progress_index: needs >= 5 finite pairs, OLS via the closed form (= polyfit),
 * sd is the SAMPLE stdev (ddof=1) of residuals with a `|| 1.0` guard.
 */
export function progressIndex(
  prev: readonly (number | null)[],
  curr: readonly (number | null)[],
): ProgressIndexResult {
  const n = Math.min(prev.length, curr.length);
  const okPrev: number[] = [];
  const okCurr: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = prev[i];
    const y = curr[i];
    if (typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)) {
      okPrev.push(x);
      okCurr.push(y);
    }
  }
  if (okPrev.length < 5) {
    return { pi: prev.map(() => null), pred: prev.map(() => null), slope: null, intercept: null };
  }
  const fit = olsSlopeIntercept(okPrev, okCurr);
  const slope = fit ? fit.slope : 0;
  const intercept = fit ? fit.intercept : (nanMean(okCurr) as number);
  const residOk = okPrev.map((x, i) => okCurr[i] - (intercept + slope * x));
  const sd = sampleStd(residOk) || 1.0; // 0 or null -> 1.0, matching `or 1.0`
  const pred: (number | null)[] = [];
  const pi: (number | null)[] = [];
  for (let i = 0; i < prev.length; i++) {
    const x = prev[i];
    const y = curr[i];
    const xFinite = typeof x === "number" && Number.isFinite(x);
    const yFinite = typeof y === "number" && Number.isFinite(y);
    const p = xFinite ? intercept + slope * (x as number) : null;
    pred.push(p);
    pi.push(p !== null && yFinite ? ((y as number) - p) / sd : null);
  }
  return { pi, pred, slope, intercept };
}

export interface ProgressDetailRow {
  studentId: StudentId;
  transition: string;
  prev: number;
  curr: number;
  gradePrev: number | null;
  gradeCurr: number | null;
  rawDelta: number;
  expected: number | null;
  progressIndex: number | null;
}

export interface TransitionSummary {
  transition: string;
  n: number;
  meanPrev: number | null;
  meanCurr: number | null;
  slope: number | null;
}

/** For every consecutive-year transition, match students present in both years
 * (by student id) and compute attainment + raw delta + conditional Progress Index. */
export function cohortProgress(syear: readonly StudentYearRow[]): {
  detail: ProgressDetailRow[];
  summary: TransitionSummary[];
} {
  const years = uniqueYearsSorted(syear);
  const detail: ProgressDetailRow[] = [];
  const summary: TransitionSummary[] = [];
  for (let i = 0; i + 1 < years.length; i++) {
    const y0 = years[i];
    const y1 = years[i + 1];
    const bByStudent = new Map<string, StudentYearRow>();
    for (const r of syear) if (r.year === y1) bByStudent.set(String(r.studentId), r);
    const matched: { a: StudentYearRow; b: StudentYearRow }[] = [];
    for (const a of syear) {
      if (a.year !== y0) continue;
      const b = bByStudent.get(String(a.studentId));
      if (b) matched.push({ a, b });
    }
    if (matched.length === 0) continue;
    const prev = matched.map((m) => m.a.overall);
    const curr = matched.map((m) => m.b.overall);
    const { pi, pred, slope } = progressIndex(prev, curr);
    const transition = transitionLabel(y0, y1);
    matched.forEach((m, idx) => {
      detail.push({
        studentId: m.a.studentId,
        transition,
        prev: m.a.overall,
        curr: m.b.overall,
        gradePrev: m.a.grade,
        gradeCurr: m.b.grade,
        rawDelta: m.b.overall - m.a.overall,
        expected: pred[idx],
        progressIndex: pi[idx],
      });
    });
    summary.push({ transition, n: matched.length, meanPrev: nanMean(prev), meanCurr: nanMean(curr), slope });
  }
  return { detail, summary };
}

export interface SubjectProgressRow {
  transition: string;
  subject: string;
  n: number;
  meanPrev: number | null;
  meanCurr: number | null;
  rawChange: number | null;
}

/** Per-subject mean attainment across each transition over the matched cohort. */
export function subjectProgress(sy: readonly SubjectYearRow[]): SubjectProgressRow[] {
  const years = uniqueYearsSorted(sy);
  const subjects = [...new Set(sy.map((r) => r.subject))].sort();
  const out: SubjectProgressRow[] = [];
  for (let i = 0; i + 1 < years.length; i++) {
    const y0 = years[i];
    const y1 = years[i + 1];
    for (const subj of subjects) {
      const aMap = new Map<string, number>();
      for (const r of sy) if (r.year === y0 && r.subject === subj) aMap.set(String(r.studentId), r.scoreYear);
      const prev: number[] = [];
      const curr: number[] = [];
      for (const r of sy) {
        if (r.year !== y1 || r.subject !== subj) continue;
        const p = aMap.get(String(r.studentId));
        if (p !== undefined) {
          prev.push(p);
          curr.push(r.scoreYear);
        }
      }
      if (prev.length < 5) continue;
      const mp = nanMean(prev);
      const mc = nanMean(curr);
      out.push({
        transition: transitionLabel(y0, y1),
        subject: subj,
        n: prev.length,
        meanPrev: mp,
        meanCurr: mc,
        rawChange: mp !== null && mc !== null ? mc - mp : null,
      });
    }
  }
  return out;
}

export interface BottleneckGridCell {
  subject: string;
  grade: number;
  mean: number;
}

export interface BottleneckDrop {
  subject: string;
  hardestStepIntoGrade: number;
  dropPoints: number;
}

/** Cross-sectional difficulty: mean score by (subject, grade) pooled across years;
 * the largest grade-to-grade drop per subject is the "wall". */
export function curriculumBottleneck(sy: readonly SubjectYearRow[]): {
  grid: BottleneckGridCell[];
  drops: BottleneckDrop[];
} {
  const groups = groupBy(
    sy.filter((r) => r.grade !== null),
    (r) => gkey(r.subject, r.grade),
  );
  const grid: BottleneckGridCell[] = [];
  const bySubject = new Map<string, Map<number, number>>();
  for (const rows of groups.values()) {
    const subject = rows[0].subject;
    const grade = rows[0].grade as number;
    const mean = nanMean(rows.map((r) => r.scoreYear));
    if (mean === null) continue;
    grid.push({ subject, grade, mean });
    if (!bySubject.has(subject)) bySubject.set(subject, new Map());
    bySubject.get(subject)!.set(grade, mean);
  }
  const drops: BottleneckDrop[] = [];
  for (const [subject, gmap] of bySubject) {
    const grades = [...gmap.keys()].sort((a, b) => a - b);
    if (grades.length < 2) continue;
    let worstGrade = grades[1];
    let worstDiff = Infinity;
    for (let i = 1; i < grades.length; i++) {
      const diff = (gmap.get(grades[i]) as number) - (gmap.get(grades[i - 1]) as number);
      if (diff < worstDiff) {
        worstDiff = diff;
        worstGrade = grades[i];
      }
    }
    drops.push({ subject, hardestStepIntoGrade: worstGrade, dropPoints: worstDiff });
  }
  drops.sort((a, b) => a.dropPoints - b.dropPoints);
  grid.sort((a, b) => a.subject.localeCompare(b.subject) || a.grade - b.grade);
  return { grid, drops };
}

export interface SectionSpreadRow {
  year: string;
  grade: number;
  subject: string;
  max: number;
  min: number;
  mean: number;
  count: number;
  gap: number;
  flag: boolean;
}

/** Within each (year, grade, subject), the spread of section means. */
export function sectionEquity(sy: readonly SubjectYearRow[], gapFlag = 4.0): SectionSpreadRow[] {
  const usable = sy.filter((r) => r.section !== null && r.grade !== null);
  const secGroups = groupBy(usable, (r) => gkey(r.year, r.grade, r.subject, r.section));
  const sectionMeans: { year: string; grade: number; subject: string; mean: number }[] = [];
  for (const rows of secGroups.values()) {
    const first = rows[0];
    const mean = nanMean(rows.map((r) => r.scoreYear));
    if (mean === null) continue;
    sectionMeans.push({ year: first.year, grade: first.grade as number, subject: first.subject, mean });
  }
  const ygs = groupBy(sectionMeans, (r) => gkey(r.year, r.grade, r.subject));
  const spread: SectionSpreadRow[] = [];
  for (const rows of ygs.values()) {
    if (rows.length < 2) continue;
    const means = rows.map((r) => r.mean);
    const max = Math.max(...means);
    const min = Math.min(...means);
    const gap = max - min;
    const first = rows[0];
    spread.push({
      year: first.year,
      grade: first.grade,
      subject: first.subject,
      max,
      min,
      mean: nanMean(means) as number,
      count: rows.length,
      gap,
      flag: gap >= gapFlag,
    });
  }
  spread.sort((a, b) => b.gap - a.gap);
  return spread;
}

export interface AttendanceImpactSummary {
  available: boolean;
  pointsPerAbsenceDay: number | null;
  correlation: number | null;
  n: number;
}

export interface AttendanceBandRow {
  band: string;
  students: number;
  meanOverall: number | null;
  meanAbsent: number | null;
}

const ABSENCE_EDGES = [-1, 0, 3, 7, 14, 9999];
const ABSENCE_LABELS = ["0", "1-3", "4-7", "8-14", "15+"];

/** Quantify the achievement cost of absence: regression slope + Pearson r + a
 * banded table. Mirrors attendance_impact (needs >= 10 joined rows). */
export function attendanceImpact(
  syear: readonly StudentYearRow[],
  att: readonly AttendanceYearRow[],
): { summary: AttendanceImpactSummary; bands: AttendanceBandRow[] } {
  const attMap = new Map<string, AttendanceYearRow>();
  for (const a of att) attMap.set(gkey(a.studentId, a.year, a.yearStart), a);
  const absent: number[] = [];
  const overall: number[] = [];
  for (const s of syear) {
    const a = attMap.get(gkey(s.studentId, s.year, s.yearStart));
    if (a && typeof a.daysAbsent === "number" && Number.isFinite(a.daysAbsent)) {
      absent.push(a.daysAbsent);
      overall.push(s.overall);
    }
  }
  if (absent.length < 10) {
    return { summary: { available: false, pointsPerAbsenceDay: null, correlation: null, n: absent.length }, bands: [] };
  }
  const fit = olsSlopeIntercept(absent, overall);
  const r = pearsonR(absent, overall);
  const bandGroups = new Map<string, { overall: number[]; absent: number[] }>();
  for (let i = 0; i < absent.length; i++) {
    const label = cutBand(absent[i], ABSENCE_EDGES, ABSENCE_LABELS);
    if (!label) continue;
    let g = bandGroups.get(label);
    if (!g) {
      g = { overall: [], absent: [] };
      bandGroups.set(label, g);
    }
    g.overall.push(overall[i]);
    g.absent.push(absent[i]);
  }
  const bands: AttendanceBandRow[] = ABSENCE_LABELS.filter((l) => bandGroups.has(l)).map((label) => {
    const g = bandGroups.get(label)!;
    return { band: label, students: g.overall.length, meanOverall: nanMean(g.overall), meanAbsent: nanMean(g.absent) };
  });
  return {
    summary: { available: true, pointsPerAbsenceDay: fit ? fit.slope : null, correlation: r, n: absent.length },
    bands,
  };
}

export interface TermSlumpRow {
  subject: string;
  avgT2MinusT1: number | null;
}

/** Mean (T2 - T1) per subject; negative = second-term decline. */
export function termSlump(sy: readonly SubjectYearRow[]): { rows: TermSlumpRow[]; overall: number | null } {
  const groups = groupBy(sy, (r) => r.subject);
  const rows: TermSlumpRow[] = [];
  for (const g of groups.values()) {
    rows.push({ subject: g[0].subject, avgT2MinusT1: nanMean(g.map((r) => r.termDelta)) });
  }
  rows.sort((a, b) => (a.avgT2MinusT1 ?? Infinity) - (b.avgT2MinusT1 ?? Infinity));
  return { rows, overall: nanMean(sy.map((r) => r.termDelta)) };
}

export interface VolatilityRow {
  studentId: StudentId;
  volatility: number | null;
}

/** Per-student instability = sample stdev of term-to-term changes (>= 2 needed). */
export function volatility(sy: readonly SubjectYearRow[]): VolatilityRow[] {
  const withDelta = sy.filter((r) => r.termDelta !== null);
  const groups = groupBy(withDelta, (r) => String(r.studentId));
  const out: VolatilityRow[] = [];
  for (const g of groups.values()) {
    out.push({ studentId: g[0].studentId, volatility: sampleStd(g.map((r) => r.termDelta)) });
  }
  return out;
}

export interface RiskRow {
  studentId: StudentId;
  name: string | null;
  year: string;
  grade: number | null;
  section: string | null;
  overall: number;
  progressIndex: number | null;
  rawDelta: number | null;
  expected: number | null;
  daysAbsent: number | null;
  absenceRate: number | null;
  tier: StudentRiskTier;
  signals: string;
}

const TIER_ORDER: Record<StudentRiskTier, number> = {
  critical: 0,
  attendance_risk: 1,
  slipping: 2,
  hidden_gem: 3,
  on_track: 4,
};

const ABSENCE_THRESHOLD = 12;

/** Fuse attainment + progress + attendance into actionable tiers for the latest
 * year. Tier priority: critical > attendance_risk > slipping > hidden_gem > on_track.
 * Mirrors risk_register; tier keys map to the oracle's emoji labels. */
export function riskRegister(
  syear: readonly StudentYearRow[],
  progressDetail: readonly ProgressDetailRow[],
  att: readonly AttendanceYearRow[],
  students: readonly { studentId: StudentId; name: string }[],
): { rows: RiskRow[]; latestYear: string | null; lowCut: number | null } {
  const years = uniqueYearsSorted(syear);
  if (years.length === 0) return { rows: [], latestYear: null, lowCut: null };
  const latest = years[years.length - 1];
  const base = syear.filter((r) => r.year === latest);
  const lowCut = quantileLinear(base.map((r) => r.overall), 0.25);

  const transMap = new Map<string, ProgressDetailRow>();
  for (const d of progressDetail) if (d.transition.endsWith(latest)) transMap.set(String(d.studentId), d);
  const attMap = new Map<string, AttendanceYearRow>();
  for (const a of att) if (a.year === latest) attMap.set(String(a.studentId), a);
  const nameMap = new Map<string, string>();
  for (const s of students) nameMap.set(String(s.studentId), s.name);

  const rows: RiskRow[] = base.map((b) => {
    const d = transMap.get(String(b.studentId)) ?? null;
    const a = attMap.get(String(b.studentId)) ?? null;
    const pi = d ? d.progressIndex : null;
    const daysAbsent = a ? a.daysAbsent : null;
    const overall = b.overall;

    const low = lowCut !== null && overall <= lowCut;
    const slip = pi !== null && pi <= -1.0;
    const gem = pi !== null && pi >= 1.0;
    const absnt = daysAbsent !== null && daysAbsent >= ABSENCE_THRESHOLD;

    let tier: StudentRiskTier;
    if (low && (slip || absnt)) tier = "critical";
    else if (absnt) tier = "attendance_risk";
    else if (slip) tier = "slipping";
    else if (gem) tier = "hidden_gem";
    else tier = "on_track";

    const bits: string[] = [];
    if (pi !== null) bits.push(`progress ${pi >= 0 ? "+" : ""}${pi.toFixed(1)}σ`);
    if (daysAbsent !== null) bits.push(`${Math.trunc(daysAbsent)} absences`);
    bits.push(`avg ${overall.toFixed(1)}`);

    return {
      studentId: b.studentId,
      name: nameMap.get(String(b.studentId)) ?? null,
      year: latest,
      grade: b.grade,
      section: b.section,
      overall,
      progressIndex: pi,
      rawDelta: d ? d.rawDelta : null,
      expected: d ? d.expected : null,
      daysAbsent,
      absenceRate: a ? a.absenceRate : null,
      tier,
      signals: bits.join("; "),
    };
  });

  rows.sort((x, y) => TIER_ORDER[x.tier] - TIER_ORDER[y.tier] || x.overall - y.overall);
  return { rows, latestYear: latest, lowCut };
}

// ---------------------------------------------------------------------------
// pipeline
// ---------------------------------------------------------------------------

export interface PipelineResult {
  subjectYear: SubjectYearRow[];
  studentYear: StudentYearRow[];
  attendanceYear: AttendanceYearRow[];
  progressDetail: ProgressDetailRow[];
  progressSummary: TransitionSummary[];
  subjectProgress: SubjectProgressRow[];
  bottleneckGrid: BottleneckGridCell[];
  bottleneckDrops: BottleneckDrop[];
  sectionSpread: SectionSpreadRow[];
  attendanceSummary: AttendanceImpactSummary;
  attendanceBands: AttendanceBandRow[];
  termSlump: TermSlumpRow[];
  termSlumpOverall: number | null;
  volatility: VolatilityRow[];
  risk: RiskRow[];
  latestYear: string | null;
}

/** Run every metric over a tidy workbook (mirrors run_pipeline). Pure — the
 * caller persists the results to the sis_* collections (Phase 1d). */
export function runPipeline(tidy: Tidy): PipelineResult {
  const sy = subjectYear(tidy);
  const syear = studentYear(sy);
  const att = attendanceYear(tidy);
  const { detail: progressDetail, summary: progressSummary } = cohortProgress(syear);
  const bottleneck = curriculumBottleneck(sy);
  const impact = attendanceImpact(syear, att);
  const slump = termSlump(sy);
  const risk = riskRegister(syear, progressDetail, att, tidy.students);
  return {
    subjectYear: sy,
    studentYear: syear,
    attendanceYear: att,
    progressDetail,
    progressSummary,
    subjectProgress: subjectProgress(sy),
    bottleneckGrid: bottleneck.grid,
    bottleneckDrops: bottleneck.drops,
    sectionSpread: sectionEquity(sy),
    attendanceSummary: impact.summary,
    attendanceBands: impact.bands,
    termSlump: slump.rows,
    termSlumpOverall: slump.overall,
    volatility: volatility(sy),
    risk: risk.rows,
    latestYear: risk.latestYear,
  };
}
