// Audit logging for sensitive actions. Server-side equivalent of the client
// audit.ts. Each invocation writes one document to /audit_log.

import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";

export interface AuditEntry {
  actorUid: string;
  action: string; // e.g. "user.invited", "user.approved"
  targetType: "user" | "ticket" | "leave_request" | "scheduled_task" | "invitation";
  targetId: string;
  /** Diff or context for the action. Avoid PII beyond what's necessary. */
  metadata?: Record<string, unknown>;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await db.collection("audit_log").add({
    ...entry,
    at: FieldValue.serverTimestamp(),
  });
}
