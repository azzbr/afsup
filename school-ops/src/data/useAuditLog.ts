// Real-time subscription to the `audit_log` collection (Phase 2.9b).
//
// Scope mirrors firestore.rules: super_admin subscribes to everything;
// hr must carry an explicit `targetAdminTier == false` filter because a
// Firestore list grant has to hold for EVERY doc the query could match.
// Plain admin is DISABLED entirely — the audit log is people data (HR
// privacy lockdown, Phase 2.9.1). Pre-2026-06-11 entries lack the field
// and are therefore super_admin-only.

import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import type { Actor } from "../permissions";
import { useFirestoreQuery, toDate } from "./firestoreSubscription";

export const AUDIT_LOG_KEY = ["audit_log"] as const;

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  targetAdminTier?: boolean;
  at: Date | null;
}

function convertEntry(id: string, data: Record<string, unknown>): AuditLogEntry {
  return {
    id,
    ...data,
    at: toDate(data.at),
  } as AuditLogEntry;
}

/**
 * Subscribe to the newest `max` audit entries the actor may read.
 * super_admin sees the full log; hr sees non-admin-tier entries only;
 * everyone else — including plain admin — gets a disabled query.
 */
export function useAuditLog(actor?: Partial<Pick<Actor, "role">> | null, max = 100) {
  const role = actor?.role;
  const scope = role === "super_admin" ? "all" : role === "hr" ? "nonAdmin" : null;

  return useFirestoreQuery<AuditLogEntry>(
    [...AUDIT_LOG_KEY, `scope:${scope ?? "none"}`, `max:${max}`],
    () => {
      if (scope === "all") {
        return query(collection(db, "audit_log"), orderBy("at", "desc"), limit(max));
      }
      if (scope === "nonAdmin") {
        return query(
          collection(db, "audit_log"),
          where("targetAdminTier", "==", false),
          orderBy("at", "desc"),
          limit(max),
        );
      }
      return null;
    },
    convertEntry,
    { enabled: scope !== null },
  );
}
