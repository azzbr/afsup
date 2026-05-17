import { describe, expect, it } from "vitest";
import {
  resolveBalances,
  sickLeaveBreakdown,
  remainingDays,
  debitLeave,
  DEFAULT_ENTITLEMENTS,
} from "../hr/leave";
import type { User } from "../types";

function u(partial: Partial<User>): User {
  return { uid: "x", email: "x@y", role: "staff", status: "approved", ...partial } as User;
}

describe("resolveBalances", () => {
  it("returns full defaults for a brand-new user", () => {
    const b = resolveBalances(u({}));
    expect(b.annual.entitled).toBe(30);
    expect(b.annual.used).toBe(0);
    expect(b.sick.entitled).toBe(55);
    expect(b.sick.used).toBe(0);
    expect(b.maternity.entitled).toBe(60);
    expect(b.hajj.entitled).toBe(14);
  });

  it("synthesizes annual from legacy annualLeaveBalance (remaining → used)", () => {
    const b = resolveBalances(u({ annualLeaveBalance: 22 }));
    expect(b.annual.entitled).toBe(30);
    expect(b.annual.used).toBe(8); // 30 - 22 = 8 days used
  });

  it("synthesizes sick from legacy sickDaysUsed", () => {
    const b = resolveBalances(u({ sickDaysUsed: 10 }));
    expect(b.sick.used).toBe(10);
  });

  it("prefers explicit leaveBalances over legacy", () => {
    const b = resolveBalances(
      u({
        annualLeaveBalance: 22, // legacy says 8 used
        leaveBalances: { annual: { entitled: 25, used: 12 } },
      }),
    );
    expect(b.annual.entitled).toBe(25);
    expect(b.annual.used).toBe(12);
  });

  it("never returns negative used from legacy fields", () => {
    const b = resolveBalances(u({ sickDaysUsed: -5 }));
    expect(b.sick.used).toBe(0);
  });
});

describe("sickLeaveBreakdown", () => {
  it("fresh employee has full balances", () => {
    const r = sickLeaveBreakdown(0);
    expect(r.fullPayRemaining).toBe(15);
    expect(r.halfPayRemaining).toBe(20);
    expect(r.unpaidRemaining).toBe(20);
  });

  it("after 10 days used", () => {
    const r = sickLeaveBreakdown(10);
    expect(r.fullPayRemaining).toBe(5);
    expect(r.halfPayRemaining).toBe(20);
    expect(r.unpaidRemaining).toBe(20);
  });

  it("after exactly 15 days used (full pay exhausted)", () => {
    const r = sickLeaveBreakdown(15);
    expect(r.fullPayRemaining).toBe(0);
    expect(r.halfPayRemaining).toBe(20);
  });

  it("after 25 days (into half-pay)", () => {
    const r = sickLeaveBreakdown(25);
    expect(r.fullPayRemaining).toBe(0);
    expect(r.halfPayRemaining).toBe(10);
    expect(r.unpaidRemaining).toBe(20);
  });

  it("after 50 days (into unpaid)", () => {
    const r = sickLeaveBreakdown(50);
    expect(r.fullPayRemaining).toBe(0);
    expect(r.halfPayRemaining).toBe(0);
    expect(r.unpaidRemaining).toBe(5);
  });

  it("clamps to 0 (cannot go negative)", () => {
    const r = sickLeaveBreakdown(100);
    expect(r.fullPayRemaining).toBe(0);
    expect(r.halfPayRemaining).toBe(0);
    expect(r.unpaidRemaining).toBe(0);
  });
});

describe("remainingDays", () => {
  it("returns entitled - used", () => {
    expect(remainingDays({ entitled: 30, used: 5 })).toBe(25);
  });
  it("never returns negative", () => {
    expect(remainingDays({ entitled: 10, used: 50 })).toBe(0);
  });
});

describe("debitLeave", () => {
  it("debits annual leave", () => {
    const start = {
      annual: { entitled: 30, used: 5 },
      sick: { entitled: 55, used: 0 },
    } as Record<string, { entitled: number; used: number }>;
    const next = debitLeave(start as never, "annual", 3);
    expect(next.annual.used).toBe(8);
    expect(next.annual.entitled).toBe(30);
    // sick unchanged
    expect(next.sick.used).toBe(0);
  });

  it("creates a balance entry if missing", () => {
    const next = debitLeave({} as never, "hajj", 14);
    expect(next.hajj.used).toBe(14);
    expect(next.hajj.entitled).toBe(DEFAULT_ENTITLEMENTS.hajj);
  });

  it("does not mutate input", () => {
    const start = {
      annual: { entitled: 30, used: 5 },
    } as Record<string, { entitled: number; used: number }>;
    debitLeave(start as never, "annual", 3);
    expect(start.annual.used).toBe(5);
  });
});
