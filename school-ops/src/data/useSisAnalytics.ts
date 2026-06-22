// Real-time read of the sis_analytics/current singleton — the workbook-level
// aggregates that power the Overview KPIs and the Cohort Analysis tab. Admin tier
// only (mirrors the sis_* read rules). Written by the import Cloud Function.

import { doc } from "firebase/firestore";
import { db } from "../firebase";
import { can, type Actor } from "../permissions";
import { useFirestoreDoc, toDate } from "./firestoreSubscription";

export const SIS_ANALYTICS_KEY = ["sis_analytics", "current"] as const;

export interface SisKpis {
  totalStudents: number;
  trackedCohort: number;
  atRisk: number;
  avgAttainment: number | null;
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
export interface TermSlumpRow {
  subject: string;
  avgT2MinusT1: number | null;
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
export interface TransitionSummary {
  transition: string;
  n: number;
  meanPrev: number | null;
  meanCurr: number | null;
  slope: number | null;
}
export interface SubjectProgressRow {
  transition: string;
  subject: string;
  n: number;
  meanPrev: number | null;
  meanCurr: number | null;
  rawChange: number | null;
}

export interface SisAnalytics {
  id: string;
  latestYear: string | null;
  years: string[];
  kpis: SisKpis;
  cohortTrajectory: TransitionSummary[];
  bottleneckGrid: BottleneckGridCell[];
  bottleneckDrops: BottleneckDrop[];
  sectionSpread: SectionSpreadRow[];
  termSlump: TermSlumpRow[];
  termSlumpOverall: number | null;
  attendanceSummary: AttendanceImpactSummary;
  attendanceBands: AttendanceBandRow[];
  subjectProgress: SubjectProgressRow[];
  updatedAt: Date | null;
}

function convertAnalytics(id: string, data: Record<string, unknown>): SisAnalytics {
  return { id, ...data, updatedAt: toDate(data.updatedAt) } as SisAnalytics;
}

export function useSisAnalytics(actor?: Actor | null) {
  const enabled = can(actor, "student.view");
  return useFirestoreDoc<SisAnalytics>(
    SIS_ANALYTICS_KEY,
    () => (enabled ? doc(db, "sis_analytics", "current") : null),
    convertAnalytics,
    { enabled },
  );
}
