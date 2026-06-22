// Per-student raw academic records (sis_academic_records filtered to one student)
// for the profile drawer's per-subject / per-term trajectory. Only subscribes
// when a student is selected. Admin tier only.

import { collection, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { can, type Actor } from "../permissions";
import { useFirestoreQuery, toDate } from "./firestoreSubscription";
import type { StudentId } from "../sis/types";

export const SIS_ACADEMIC_RECORDS_KEY = ["sis_academic_records"] as const;

export interface SisAcademicRecord {
  id: string;
  studentId: StudentId;
  year: string;
  yearStart?: number;
  subject: string;
  term: number;
  grade: number | null;
  section: string | null;
  score: number | null;
  updatedAt: Date | null;
}

function convertRecord(id: string, data: Record<string, unknown>): SisAcademicRecord {
  return { id, ...data, updatedAt: toDate(data.updatedAt) } as SisAcademicRecord;
}

export function useStudentRecords(actor?: Actor | null, studentId?: StudentId | null) {
  const enabled = can(actor, "student.view") && studentId != null && studentId !== "";
  return useFirestoreQuery<SisAcademicRecord>(
    [...SIS_ACADEMIC_RECORDS_KEY, `student:${studentId ?? "none"}`],
    () =>
      enabled ? query(collection(db, "sis_academic_records"), where("studentId", "==", studentId)) : null,
    convertRecord,
    { enabled },
  );
}
