// Real-time read of sis_students (admin-tier only — mirrors the sis_* read rule
// and can(actor, "student.view")). Foundation for the Overview KPIs and the
// Students table. Clients never write — the import Cloud Function owns writes.

import { collection } from "firebase/firestore";
import { db } from "../firebase";
import { can, type Actor } from "../permissions";
import { useFirestoreQuery, toDate } from "./firestoreSubscription";
import type { StudentId } from "../sis/types";

export const SIS_STUDENTS_KEY = ["sis_students"] as const;

export interface SisStudent {
  id: string;
  studentId: StudentId;
  name?: string;
  updatedAt: Date | null;
}

function convertStudent(id: string, data: Record<string, unknown>): SisStudent {
  return { id, ...data, updatedAt: toDate(data.updatedAt) } as SisStudent;
}

export function useStudents(actor?: Actor | null) {
  const enabled = can(actor, "student.view");
  return useFirestoreQuery<SisStudent>(
    [...SIS_STUDENTS_KEY],
    () => (enabled ? collection(db, "sis_students") : null),
    convertStudent,
    { enabled },
  );
}
