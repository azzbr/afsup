// Real-time read of the most recent sis_import_batches (admin tier only).
// Powers the "Recent imports" history in the Import tab (decision #4: show both
// the just-completed run and persisted history).

import { collection, limit, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { can, type Actor } from "../permissions";
import { useFirestoreQuery, toDate } from "./firestoreSubscription";

export const SIS_IMPORT_BATCHES_KEY = ["sis_import_batches"] as const;

export interface SisSheetAudit {
  headerRowExcel: number;
  students: number;
  subjectsDetected: string[];
  attendanceDetected: string[];
  nameColumn: string;
}

export interface SisImportBatch {
  id: string;
  status?: "processing" | "completed" | "failed";
  fileName?: string;
  importedBy?: string;
  latestYear?: string | null;
  counts?: Record<string, number>;
  sheets?: Record<string, SisSheetAudit>;
  error?: string;
  createdAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}

function convertBatch(id: string, data: Record<string, unknown>): SisImportBatch {
  return {
    id,
    ...data,
    createdAt: toDate(data.createdAt),
    completedAt: toDate(data.completedAt),
    failedAt: toDate(data.failedAt),
  } as SisImportBatch;
}

export function useImportBatches(actor?: Actor | null, max = 20) {
  const enabled = can(actor, "student.view");
  return useFirestoreQuery<SisImportBatch>(
    [...SIS_IMPORT_BATCHES_KEY, `max:${max}`],
    () => (enabled ? query(collection(db, "sis_import_batches"), orderBy("createdAt", "desc"), limit(max)) : null),
    convertBatch,
    { enabled },
  );
}
