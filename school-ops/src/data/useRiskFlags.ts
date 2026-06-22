// Real-time read of sis_risk_flags (latest-year early-warning tiers + Progress
// Index per student). Powers the Early Warning register and the Students/Overview
// tier + Progress-Index columns. Admin tier only.

import { collection } from "firebase/firestore";
import { db } from "../firebase";
import { can, type Actor } from "../permissions";
import { useFirestoreQuery, toDate } from "./firestoreSubscription";
import type { StudentId } from "../sis/types";
import type { StudentRiskTier } from "../sis/riskTiers";

export const SIS_RISK_FLAGS_KEY = ["sis_risk_flags"] as const;

export interface SisRiskFlag {
  id: string;
  studentId: StudentId;
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
  updatedAt: Date | null;
}

function convertRiskFlag(id: string, data: Record<string, unknown>): SisRiskFlag {
  return { id, ...data, updatedAt: toDate(data.updatedAt) } as SisRiskFlag;
}

export function useRiskFlags(actor?: Actor | null) {
  const enabled = can(actor, "student.view");
  return useFirestoreQuery<SisRiskFlag>(
    SIS_RISK_FLAGS_KEY,
    () => (enabled ? collection(db, "sis_risk_flags") : null),
    convertRiskFlag,
    { enabled },
  );
}
