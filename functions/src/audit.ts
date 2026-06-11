// Audit logging for sensitive actions. Server-side equivalent of the client
// audit.ts. Each invocation writes one document to /audit_log.

import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";

export interface AuditEntry {
  actorUid: string;
  action: string; // e.g. "user.invited", "user.approved"
  targetType: "user" | "ticket" | "leave_request" | "scheduled_task" | "invitation" | "school_settings";
  targetId: string;
  /**
   * True when the entry concerns an admin-tier (admin/super_admin) user.
   * Drives the audit-log read scope: HR/admin may only read entries where
   * this is false; super_admin reads everything (CLAUDE.md section 6).
   */
  targetAdminTier?: boolean;
  /** Diff or context for the action. Avoid PII beyond what's necessary. */
  metadata?: Record<string, unknown>;
  /** Optional before/after snapshots for mutation audit (CLAUDE.md §5). */
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  // Strip undefined fields so Firestore doesn't complain.
  const doc: Record<string, unknown> = {
    actorUid: entry.actorUid,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    // ALWAYS written (never undefined): the HR/admin reader queries on
    // equality (targetAdminTier == false), and Firestore equality filters
    // never match documents missing the field.
    targetAdminTier: entry.targetAdminTier === true,
    at: FieldValue.serverTimestamp(),
  };
  if (entry.metadata !== undefined) doc.metadata = entry.metadata;
  if (entry.before !== undefined) doc.before = entry.before;
  if (entry.after !== undefined) doc.after = entry.after;
  await db.collection("audit_log").add(doc);
}
