// Daily compliance scan — runs once per day, writes notifications for
// expiring documents and other HR concerns.
//
// Replaces the client-side calculateComplianceAlerts that ran on every HR
// dashboard load. Benefits:
//   - one calculation per day, not per page view
//   - employees see their own alerts (not just HR)
//   - critical alerts can fire email immediately
//
// Schedule: every day at 02:00 Bahrain time (low traffic window).

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "./admin";
import { sendInviteEmail, RESEND_API_KEY } from "./email";

const DAY_MS = 24 * 60 * 60 * 1000;

type Priority = "critical" | "warning" | "info";
type NotificationType =
  | "compliance"
  | "leave_request"
  | "ticket_sla"
  | "ticket_assigned"
  | "system";

interface UserDoc {
  uid: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  nationality?: string;
  status?: string;
  role?: string;
  isTeacher?: boolean;
  cprExpiry?: Timestamp | null;
  residencePermitExpiry?: Timestamp | null;
  moeApprovalStatus?: string;
  moeApprovalExpiry?: Timestamp | null;
  contractType?: string;
  contractEndDate?: Timestamp | null;
  probationEndDate?: Timestamp | null;
  iban?: string;
  arabicName?: string;
}

interface Finding {
  uid: string;
  email: string;
  displayName: string;
  type: NotificationType;
  priority: Priority;
  subject: string;
  body: string;
}

function toDate(ts: Timestamp | null | undefined): Date | null {
  if (!ts) return null;
  return ts.toDate();
}

function dayName(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function pushFinding(out: Finding[], u: UserDoc, partial: Omit<Finding, "uid" | "email" | "displayName">): void {
  const displayName = u.displayName || `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
  out.push({ uid: u.uid, email: u.email, displayName, ...partial });
}

/**
 * Pure: given a user list and the "now" timestamp, returns all findings.
 * Easy to unit-test (no Firestore involved).
 */
function scanUsers(users: UserDoc[], now: Date): Finding[] {
  const findings: Finding[] = [];
  const in30d = new Date(now.getTime() + 30 * DAY_MS);
  const in60d = new Date(now.getTime() + 60 * DAY_MS);
  const in90d = new Date(now.getTime() + 90 * DAY_MS);

  for (const u of users) {
    if (u.status === "blocked" || u.status === "suspended") continue;

    const cpr = toDate(u.cprExpiry);
    if (cpr) {
      if (cpr < now) {
        pushFinding(findings, u, {
          type: "compliance", priority: "critical",
          subject: "CPR expired",
          body: `Your CPR (Bahrain ID) expired on ${dayName(cpr)}. Renew immediately to avoid loss of access.`,
        });
      } else if (cpr < in90d) {
        pushFinding(findings, u, {
          type: "compliance", priority: "warning",
          subject: "CPR expiring soon",
          body: `Your CPR expires on ${dayName(cpr)}. Plan a renewal appointment.`,
        });
      }
    }

    if (u.nationality !== "Bahraini") {
      const rp = toDate(u.residencePermitExpiry);
      if (rp) {
        if (rp < now) {
          pushFinding(findings, u, {
            type: "compliance", priority: "critical",
            subject: "Residence permit expired",
            body: `Your residence permit expired on ${dayName(rp)}. This is an LMRA compliance issue — contact HR immediately.`,
          });
        } else if (rp < in30d) {
          pushFinding(findings, u, {
            type: "compliance", priority: "warning",
            subject: "Residence permit expiring soon",
            body: `Your residence permit expires on ${dayName(rp)}. Begin renewal paperwork now.`,
          });
        }
      }
    }

    if (u.isTeacher) {
      const moe = toDate(u.moeApprovalExpiry);
      if (u.moeApprovalStatus === "expired" || u.moeApprovalStatus === "rejected") {
        pushFinding(findings, u, {
          type: "compliance", priority: "critical",
          subject: `MOE approval ${u.moeApprovalStatus}`,
          body: `Your Ministry of Education approval is ${u.moeApprovalStatus}. You may not be permitted to teach until this is resolved.`,
        });
      } else if (moe) {
        if (moe < now) {
          pushFinding(findings, u, {
            type: "compliance", priority: "critical",
            subject: "MOE approval expired",
            body: `Your MOE approval expired on ${dayName(moe)}.`,
          });
        } else if (moe < in90d) {
          pushFinding(findings, u, {
            type: "compliance", priority: "warning",
            subject: "MOE approval expiring soon",
            body: `Your MOE approval expires on ${dayName(moe)}.`,
          });
        }
      } else if (u.moeApprovalStatus === "pending") {
        pushFinding(findings, u, {
          type: "compliance", priority: "info",
          subject: "MOE approval pending",
          body: "Your MOE approval is still under review.",
        });
      }
    }

    if (u.contractType === "fixed_term") {
      const ce = toDate(u.contractEndDate);
      if (ce) {
        if (ce < now) {
          pushFinding(findings, u, {
            type: "compliance", priority: "critical",
            subject: "Contract expired",
            body: `Your contract expired on ${dayName(ce)}. Speak with HR about renewal.`,
          });
        } else if (ce < in60d) {
          pushFinding(findings, u, {
            type: "compliance", priority: "warning",
            subject: "Contract renewal due",
            body: `Your contract ends on ${dayName(ce)}. Renewal discussions should begin now.`,
          });
        }
      }
    }

    const probe = toDate(u.probationEndDate);
    if (probe) {
      if (probe < now) {
        pushFinding(findings, u, {
          type: "compliance", priority: "info",
          subject: "Probation period ended",
          body: `Probation ended on ${dayName(probe)}. HR should confirm or extend.`,
        });
      } else if (probe < in30d) {
        pushFinding(findings, u, {
          type: "compliance", priority: "warning",
          subject: "Probation ending soon",
          body: `Probation ends on ${dayName(probe)}.`,
        });
      }
    }

    if (!u.iban || !u.iban.startsWith("BH")) {
      pushFinding(findings, u, {
        type: "compliance", priority: "info",
        subject: "IBAN missing or invalid",
        body: "Set a valid Bahrain IBAN in your profile so payroll can pay you (WPS compliance).",
      });
    }
  }

  return findings;
}

export const dailyComplianceScan = onSchedule(
  {
    schedule: "every day 02:00",
    region: "us-central1",
    timeZone: "Asia/Bahrain",
    secrets: [RESEND_API_KEY],
  },
  async () => {
    const now = new Date();

    // Read all approved users
    const usersSnap = await db.collection("users").get();
    const users: UserDoc[] = usersSnap.docs.map((d) => ({ ...(d.data() as UserDoc), uid: d.id }));

    const findings = scanUsers(users, now);
    logger.info(`Compliance scan: ${findings.length} findings across ${users.length} users`);

    if (findings.length === 0) return;

    // ----- Replace yesterday's compliance notifications -----
    // We don't want a 90-day-warning pile-up. Delete all "compliance"-type
    // notifications older than 25 hours, then re-create today's.
    const cutoff = Timestamp.fromDate(new Date(now.getTime() - 25 * 60 * 60 * 1000));
    const stale = await db
      .collection("notifications")
      .where("type", "==", "compliance")
      .where("createdAt", "<", cutoff)
      .get();
    if (!stale.empty) {
      const batches: FirebaseFirestore.WriteBatch[] = [db.batch()];
      let opCount = 0;
      for (const doc of stale.docs) {
        if (opCount === 450) {
          batches.push(db.batch());
          opCount = 0;
        }
        batches[batches.length - 1].delete(doc.ref);
        opCount++;
      }
      await Promise.all(batches.map((b) => b.commit()));
      logger.info(`Deleted ${stale.size} stale compliance notifications.`);
    }

    // ----- Write per-employee notifications -----
    let writeCount = 0;
    let emailSent = 0;
    const writeBatch = db.batch();
    let batchOps = 0;

    for (const f of findings) {
      const ref = db.collection("notifications").doc();
      writeBatch.set(ref, {
        type: f.type,
        priority: f.priority,
        targetUid: f.uid,
        subject: f.subject,
        body: f.body,
        link: "/profile",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "system",
        readAt: null,
      });
      writeCount++;
      batchOps++;

      // Roll to a new batch every ~450 ops (Firestore limit is 500)
      if (batchOps >= 450) {
        await writeBatch.commit();
        batchOps = 0;
      }

      // Critical: also email the employee (best-effort, ignore failures)
      if (f.priority === "critical") {
        try {
          const sent = await sendInviteEmail({
            to: f.email,
            recipientName: f.displayName,
            inviteUrl: "https://afsup-3ff9b.web.app/profile",
            inviterName: "Al Fajer School HR",
            role: f.subject,
          });
          if (sent) emailSent++;
        } catch (err) {
          logger.warn("Email send failed (continuing)", { err: String(err), uid: f.uid });
        }
      }
    }

    if (batchOps > 0) await writeBatch.commit();

    // ----- One broadcast notification to HR/admin per critical -----
    const critical = findings.filter((f) => f.priority === "critical");
    if (critical.length > 0) {
      const hrBroadcast = db.collection("notifications").doc();
      await hrBroadcast.set({
        type: "compliance",
        priority: "critical",
        targetUid: "role:hr",
        subject: `${critical.length} critical compliance items`,
        body: critical.slice(0, 5).map((c) => `• ${c.displayName}: ${c.subject}`).join("\n"),
        link: "/hr",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: "system",
        readAt: null,
      });
    }

    logger.info(
      `Compliance scan wrote ${writeCount} notifications (${emailSent} emails sent, ${critical.length} critical).`,
    );
  },
);
