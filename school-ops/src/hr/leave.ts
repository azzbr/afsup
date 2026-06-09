// Multi-type leave system per Bahrain Labour Law 2012.
//
// Each user has a `leaveBalances` sub-object on their User doc, keyed by
// leave type, containing { entitled, used }. We synthesize it from legacy
// fields (annualLeaveBalance, sickDaysUsed) when missing so existing data
// continues to work — no migration script needed.
//
// Default entitlements (per Bahrain Labour Law):
//   - annual:     30 days/year
//   - sick:       55 days total (15 full / 20 half / 20 unpaid — see tiers)
//   - maternity:  60 days (women only, per event)
//   - paternity:   1 day (per event)
//   - hajj:       14 days (once in service)
//   - bereavement: 3 days (per event)
//   - study:       unpaid, by agreement
//   - unpaid:      manager discretion

import { SICK_LEAVE_TIERS, type LeaveType } from "../constants";
import type { LeaveRequest, User } from "../types";

export interface LeaveBalance {
  /**
   * Annual entitlement (days). For types that work per-event (maternity,
   * bereavement) this is the cap per occurrence.
   */
  entitled: number;
  /** Days used this leave-cycle. */
  used: number;
}

export type LeaveBalances = Partial<Record<LeaveType, LeaveBalance>>;

/** Standard Bahrain Labour Law entitlements. */
export const DEFAULT_ENTITLEMENTS: Record<LeaveType, number> = {
  annual: 30,
  sick: SICK_LEAVE_TIERS.FULL_PAY + SICK_LEAVE_TIERS.HALF_PAY + SICK_LEAVE_TIERS.NO_PAY, // 55
  maternity: 60,
  paternity: 1,
  hajj: 14,
  bereavement: 3,
  study: 0,
  unpaid: 0,
};

/**
 * Build a complete LeaveBalances object from whatever is on the user doc,
 * falling back to legacy fields and then to defaults. NEVER mutates input.
 *
 * Rules:
 *   - If `user.leaveBalances[type]` exists, use it.
 *   - Else: try legacy fields (annualLeaveBalance → annual.used; sickDaysUsed → sick.used).
 *   - Else: default { entitled: DEFAULT_ENTITLEMENTS[type], used: 0 }.
 */
export function resolveBalances(user: Partial<User>): Record<LeaveType, LeaveBalance> {
  const existing = (user as { leaveBalances?: LeaveBalances }).leaveBalances || {};
  const result = {} as Record<LeaveType, LeaveBalance>;

  for (const type of Object.keys(DEFAULT_ENTITLEMENTS) as LeaveType[]) {
    const entry = existing[type];
    if (entry && typeof entry.entitled === "number") {
      result[type] = {
        entitled: entry.entitled,
        used: Number(entry.used) || 0,
      };
      continue;
    }

    // Legacy fall-throughs
    if (type === "annual") {
      const entitled = DEFAULT_ENTITLEMENTS.annual;
      const legacyRemaining = Number(user.annualLeaveBalance);
      const used = Number.isFinite(legacyRemaining)
        ? Math.max(0, entitled - legacyRemaining)
        : 0;
      result.annual = { entitled, used };
      continue;
    }
    if (type === "sick") {
      result.sick = {
        entitled: DEFAULT_ENTITLEMENTS.sick,
        used: Math.max(0, Number(user.sickDaysUsed) || 0),
      };
      continue;
    }

    result[type] = { entitled: DEFAULT_ENTITLEMENTS[type], used: 0 };
  }

  return result;
}

export interface SickLeaveBreakdown {
  /** Total used across all tiers (= the input `used`). */
  used: number;
  /** Days remaining at full pay (first 15 days). */
  fullPayRemaining: number;
  /** Days remaining at half pay (days 16-35). */
  halfPayRemaining: number;
  /** Days remaining unpaid (days 36-55). */
  unpaidRemaining: number;
}

/**
 * Bahrain Labour Law sick leave is tiered, not a flat entitlement. Returns
 * remaining days at each pay rate given total `used` so far.
 */
export function sickLeaveBreakdown(used: number): SickLeaveBreakdown {
  const usedClamped = Math.max(0, used);
  const fullPayUsed = Math.min(usedClamped, SICK_LEAVE_TIERS.FULL_PAY);
  const afterFull = usedClamped - fullPayUsed;

  const halfPayUsed = Math.min(Math.max(afterFull, 0), SICK_LEAVE_TIERS.HALF_PAY);
  const afterHalf = afterFull - halfPayUsed;

  const unpaidUsed = Math.min(Math.max(afterHalf, 0), SICK_LEAVE_TIERS.NO_PAY);

  return {
    used: usedClamped,
    fullPayRemaining: SICK_LEAVE_TIERS.FULL_PAY - fullPayUsed,
    halfPayRemaining: SICK_LEAVE_TIERS.HALF_PAY - halfPayUsed,
    unpaidRemaining: SICK_LEAVE_TIERS.NO_PAY - unpaidUsed,
  };
}

/**
 * Days remaining for a leave type. For sick, this is the total of all 3 tiers.
 * For per-event types (maternity, bereavement) this is the cap per event.
 */
export function remainingDays(balance: LeaveBalance): number {
  return Math.max(0, balance.entitled - balance.used);
}

/**
 * Used by the HR approval flow to compute the new balances after debiting
 * `days` from `type`. Returns a fresh map; never mutates input.
 */
export function debitLeave(
  balances: Record<LeaveType, LeaveBalance>,
  type: LeaveType,
  days: number,
): Record<LeaveType, LeaveBalance> {
  const next = { ...balances };
  const before = next[type] || { entitled: DEFAULT_ENTITLEMENTS[type], used: 0 };
  next[type] = { entitled: before.entitled, used: Math.max(0, before.used + days) };
  return next;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Inclusive calendar days between two dates (same day = 1). Returns 0 for
 * invalid dates or when `end` is before `start`.
 */
export function daysRequestedBetween(start: Date, end: Date): number {
  if (!(start instanceof Date) || !(end instanceof Date)) return 0;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const s = atMidnight(start);
  const e = atMidnight(end);
  if (e < s) return 0;
  return Math.round((e.getTime() - s.getTime()) / DAY_MS) + 1;
}

/**
 * First pending/approved request whose [leaveStart, leaveEnd] range intersects
 * the given range (inclusive, day granularity), or null if none does.
 */
export function findOverlap(requests: LeaveRequest[], start: Date, end: Date): LeaveRequest | null {
  if (!(start instanceof Date) || !(end instanceof Date)) return null;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const s = atMidnight(start).getTime();
  const e = atMidnight(end).getTime();
  for (const request of requests) {
    if (request.status !== "pending" && request.status !== "approved") continue;
    if (!(request.leaveStart instanceof Date) || !(request.leaveEnd instanceof Date)) continue;
    if (isNaN(request.leaveStart.getTime()) || isNaN(request.leaveEnd.getTime())) continue;
    const rs = atMidnight(request.leaveStart).getTime();
    const re = atMidnight(request.leaveEnd).getTime();
    if (rs <= e && re >= s) return request;
  }
  return null;
}
