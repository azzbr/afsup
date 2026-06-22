// Real-time read of sis_student_year_metrics (one doc per student per year) —
// the backbone of the Students table and the cohort-trajectory line. Admin tier only.

import { collection } from "firebase/firestore";
import { db } from "../firebase";
import { can, type Actor } from "../permissions";
import { useFirestoreQuery, toDate } from "./firestoreSubscription";
import type { StudentId } from "../sis/types";

export const SIS_YEAR_METRICS_KEY = ["sis_student_year_metrics"] as const;

export interface SisYearMetric {
  id: string;
  studentId: StudentId;
  year: string;
  yearStart?: number;
  grade: number | null;
  section: string | null;
  overall: number;
  subjectsTaken: number;
  daysSchool?: number | null;
  daysAbsent: number | null;
  absenceRate: number | null;
  updatedAt: Date | null;
}

function convertYearMetric(id: string, data: Record<string, unknown>): SisYearMetric {
  return { id, ...data, updatedAt: toDate(data.updatedAt) } as SisYearMetric;
}

export function useStudentYearMetrics(actor?: Actor | null) {
  const enabled = can(actor, "student.view");
  return useFirestoreQuery<SisYearMetric>(
    SIS_YEAR_METRICS_KEY,
    () => (enabled ? collection(db, "sis_student_year_metrics") : null),
    convertYearMetric,
    { enabled },
  );
}
