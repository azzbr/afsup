// Ticket status change trigger — audits every transition and notifies the
// original reporter when their ticket moves forward.
//
// Clients cannot write to audit_log directly (firestore.rules), so this
// trigger is what gives ticket status transitions a real audit trail. The
// audit entry is written first; the notification is best-effort and a
// failure there only logs a warning.

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";

import { db } from "./admin";
import { writeAudit } from "./audit";

// Only the fields this trigger reads. All optional — the ~43 legacy tickets
// predate several of these and readers must tolerate their absence.
interface TicketDoc {
  category?: string;
  location?: string;
  status?: string;
  reportedBy?: string | null;
  reporterName?: string | null;
  assignedToName?: string | null;
  startedByName?: string | null;
  resolvedBy?: string | null;
  completionNotes?: string | null;
  updatedBy?: string | null;
}

export const onTicketStatusChange = onDocumentUpdated(
  {
    document: "maintenance_tickets/{ticketId}",
    region: "us-central1",
  },
  async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    if (!beforeSnap || !afterSnap) return;

    const before = beforeSnap.data() as TicketDoc;
    const after = afterSnap.data() as TicketDoc;
    if (before.status === after.status) return;

    const ticketId = event.params.ticketId;

    // Audit first — every status transition is recorded regardless of
    // whether a notification goes out.
    await writeAudit({
      actorUid: after.updatedBy || "unknown",
      action: "ticket.statusChanged",
      targetType: "ticket",
      targetId: ticketId,
      before: { status: before.status ?? null },
      after: { status: after.status ?? null },
      metadata: {
        category: after.category ?? null,
        location: after.location ?? null,
      },
    });

    // Notifications only make sense for user-reported tickets.
    if (!after.reportedBy || after.reporterName === "Scheduled Maintenance") return;

    const category = after.category || "Maintenance";
    const location = after.location || "unknown location";

    let subject: string | null = null;
    let body: string | null = null;

    if (after.status === "in_progress") {
      const technician = after.assignedToName || after.startedByName || "a technician";
      subject = "Maintenance started on your report";
      body = `${category} at ${location} — ${technician} is on it.`;
    } else if (after.status === "resolved") {
      subject = "Your maintenance report was resolved";
      body = `${category} at ${location} was resolved by ${after.resolvedBy || "the maintenance team"}.`;
      if (after.completionNotes) {
        body += ` Notes: ${after.completionNotes}`;
      }
    } else if (after.status === "open" && before.status === "resolved") {
      subject = "Your report was reopened";
      body = `${category} at ${location} was reopened and is back in the maintenance queue.`;
    }

    // Other transitions (e.g. to "duplicate") produce no notification.
    if (!subject || !body) return;

    try {
      await db.collection("notifications").add({
        type: "ticket_update",
        priority: "info",
        targetUid: after.reportedBy,
        subject,
        body,
        link: "/",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "system",
        readAt: null,
      });
    } catch (err) {
      logger.warn("Ticket notification write failed (audit already recorded)", {
        err: String(err),
        ticketId,
      });
    }
  },
);
