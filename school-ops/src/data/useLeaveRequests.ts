import { collection, query, where } from "firebase/firestore";
import { db } from "../firebase";
import type { LeaveRequest, LeaveStatus } from "../types";
import type { Actor } from "../permissions";
import { can } from "../permissions";
import { useFirestoreQuery, toDate } from "./firestoreSubscription";

export const LEAVE_REQUESTS_KEY = ["leave_requests"] as const;

function convert(id: string, data: Record<string, unknown>): LeaveRequest {
  return {
    id,
    ...data,
    leaveStart: toDate(data.leaveStart),
    leaveEnd: toDate(data.leaveEnd),
    submittedAt: toDate(data.submittedAt),
    processedAt: toDate(data.processedAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as LeaveRequest;
}

/**
 * Managers see all leave requests (optionally filtered by status).
 * Non-managers see only their own.
 */
export function useLeaveRequests(actor: Actor | null, statusFilter?: LeaveStatus) {
  const seeAll = can(actor, "leave.view.all");
  const uid = actor?.uid ?? null;

  const scope = seeAll
    ? statusFilter
      ? `all:${statusFilter}`
      : "all"
    : uid
      ? `own:${uid}`
      : "none";

  return useFirestoreQuery<LeaveRequest>(
    [...LEAVE_REQUESTS_KEY, scope],
    () => {
      const col = collection(db, "leave_requests");
      if (seeAll) {
        return statusFilter ? query(col, where("status", "==", statusFilter)) : col;
      }
      if (uid) return query(col, where("userId", "==", uid));
      return null;
    },
    convert,
    { enabled: scope !== "none" },
  );
}
