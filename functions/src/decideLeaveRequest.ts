// Approve or reject a leave request — server-side, atomically.
//
// Lives on the server because the decision and the balance debit must happen
// together (the old client flow updated the request and the user doc in two
// separate writes, so a crash in between corrupted balances), and because the
// matrix forbids deciding your own request — a rule the client can't enforce
// against itself. firestore.rules pins client updates to non-status fields;
// only this function (admin SDK, bypasses rules) flips status.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "./admin";
import { writeAudit } from "./audit";
import { loadActor } from "./userMutations";
import type { ActorDoc } from "./permissions";

type Decision = "approved" | "rejected";

interface DecideLeaveRequestPayload {
  requestId: string;
  decision: Decision;
  reason?: string;
}

interface LeaveRequestDoc {
  userId?: string;
  employeeName?: string;
  leaveStart?: Timestamp | null;
  leaveEnd?: Timestamp | null;
  daysRequested?: number;
  leaveType?: string;
  status?: string;
}

interface LeaveBalanceEntry {
  entitled?: number;
  used?: number;
}

// Bahrain Labour Law defaults — keep in sync with
// school-ops/src/hr/leave.ts DEFAULT_ENTITLEMENTS.
const DEFAULT_ENTITLEMENTS: Record<string, number> = {
  annual: 30,
  sick: 55,
  maternity: 60,
  paternity: 1,
  hajj: 14,
  bereavement: 3,
  study: 0,
  unpaid: 0,
};

function canDecideLeave(actor: ActorDoc | null): boolean {
  if (!actor) return false;
  if (actor.status === "blocked" || actor.status === "suspended") return false;
  return (
    actor.role === "hr" ||
    actor.role === "admin" ||
    actor.role === "super_admin" ||
    actor.viewAll === true
  );
}

function dayName(ts: Timestamp | null | undefined): string | null {
  if (!ts) return null;
  return ts.toDate().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const decideLeaveRequest = onCall<DecideLeaveRequestPayload>(
  { region: "us-central1" },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required.");

    const requestId = String(req.data?.requestId ?? "").trim();
    if (!requestId) {
      throw new HttpsError("invalid-argument", "Missing or invalid field: requestId");
    }
    const decision = req.data?.decision;
    if (decision !== "approved" && decision !== "rejected") {
      throw new HttpsError("invalid-argument", "decision must be 'approved' or 'rejected'.");
    }
    const reason = typeof req.data?.reason === "string" ? req.data.reason.trim() : "";

    const actor = await loadActor(callerUid);
    if (!canDecideLeave(actor)) {
      throw new HttpsError("permission-denied", "Only HR or admin can decide leave requests.");
    }

    const requestRef = db.collection("leave_requests").doc(requestId);

    const outcome = await db.runTransaction(async (tx) => {
      const requestSnap = await tx.get(requestRef);
      if (!requestSnap.exists) {
        throw new HttpsError("not-found", "Leave request not found.");
      }
      const request = requestSnap.data() as LeaveRequestDoc;

      if (request.status !== "pending") {
        throw new HttpsError("failed-precondition", "Request already decided.");
      }

      const requesterUid = String(request.userId ?? "");
      if (requesterUid === callerUid) {
        throw new HttpsError(
          "permission-denied",
          "Your own leave request must be decided by someone else.",
        );
      }

      const days = Number(request.daysRequested) || 0;
      const leaveType = request.leaveType || "annual";

      const userRef = db.collection("users").doc(requesterUid);
      const userSnap = await tx.get(userRef);
      // Requester role read inside the transaction — drives the audit
      // entry's admin-tier scoping (rejects reuse the same doc fetch).
      const requesterRole = String(
        (userSnap.data() as { role?: string } | undefined)?.role ?? "",
      );

      if (decision === "approved") {
        if (!userSnap.exists) {
          throw new HttpsError("not-found", "Requester user record not found.");
        }
        const user = userSnap.data() as {
          annualLeaveBalance?: number;
          sickDaysUsed?: number;
          leaveBalances?: Record<string, LeaveBalanceEntry>;
        };
        const balances = user.leaveBalances;
        const hasBalancesMap = balances !== undefined && balances !== null;

        const userUpdates: Record<string, unknown> = {
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: callerUid,
        };

        const debitedEntry = (type: string): LeaveBalanceEntry => {
          const entry = hasBalancesMap ? balances[type] : undefined;
          const entitled = Number(entry?.entitled);
          return {
            entitled: Number.isFinite(entitled) ? entitled : DEFAULT_ENTITLEMENTS[type] ?? 0,
            used: (Number(entry?.used) || 0) + days,
          };
        };

        if (leaveType === "annual") {
          const current = Number(user.annualLeaveBalance) || 0;
          userUpdates.annualLeaveBalance = Math.max(0, current - days);
          if (hasBalancesMap) {
            userUpdates["leaveBalances.annual"] = debitedEntry("annual");
          }
        } else if (leaveType === "sick") {
          userUpdates.sickDaysUsed = (Number(user.sickDaysUsed) || 0) + days;
          if (hasBalancesMap) {
            userUpdates["leaveBalances.sick"] = debitedEntry("sick");
          }
        } else {
          // Other types track usage in leaveBalances only, synthesizing the
          // entry (and the map itself) when absent.
          userUpdates[`leaveBalances.${leaveType}`] = debitedEntry(leaveType);
        }

        tx.update(userRef, userUpdates);
      }

      const requestUpdates: Record<string, unknown> = {
        status: decision,
        processedAt: FieldValue.serverTimestamp(),
        processedBy: callerUid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: callerUid,
      };
      if (decision === "rejected" && reason) {
        requestUpdates.decisionReason = reason;
      }
      tx.update(requestRef, requestUpdates);

      return {
        requesterUid,
        requesterRole,
        days,
        leaveType,
        startLabel: dayName(request.leaveStart),
        endLabel: dayName(request.leaveEnd),
      };
    });

    await writeAudit({
      actorUid: callerUid,
      action: decision === "approved" ? "leave.approved" : "leave.rejected",
      targetType: "leave_request",
      targetId: requestId,
      targetAdminTier:
        outcome.requesterRole === "admin" || outcome.requesterRole === "super_admin",
      before: { status: "pending" },
      after: { status: decision, days: outcome.days, leaveType: outcome.leaveType },
    });

    const range =
      outcome.startLabel && outcome.endLabel
        ? `${outcome.startLabel} to ${outcome.endLabel}, `
        : "";
    let body =
      `Your ${outcome.leaveType} leave request (${range}${outcome.days} day(s)) was ${decision}.`;
    if (decision === "rejected" && reason) {
      body += ` Reason: ${reason}`;
    }

    try {
      await db.collection("notifications").add({
        type: "leave_decision",
        priority: "info",
        targetUid: outcome.requesterUid,
        subject: decision === "approved" ? "Leave request approved" : "Leave request rejected",
        body,
        link: "/profile",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: callerUid,
        readAt: null,
      });
    } catch (err) {
      logger.warn("Leave decision notification write failed (audit already recorded)", {
        err: String(err),
        requestId,
      });
    }

    logger.info(`decideLeaveRequest: ${callerUid} ${decision} ${requestId} (${outcome.leaveType}, ${outcome.days}d)`);
    return { ok: true, requestId, decision };
  },
);
