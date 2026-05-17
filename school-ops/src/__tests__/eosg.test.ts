import { describe, expect, it } from "vitest";
import { computeEOSG, totalLiability } from "../hr/eosg";
import type { User } from "../types";

function userWith(overrides: Partial<User>): User {
  return {
    uid: "u1",
    email: "u1@example.com",
    role: "staff",
    status: "approved",
    ...overrides,
  } as User;
}

describe("computeEOSG", () => {
  it("returns zero when salary or start date missing", () => {
    expect(computeEOSG(userWith({ basicSalary: 0 })).totalAmount).toBe(0);
    expect(computeEOSG(userWith({ basicSalary: 500 })).totalAmount).toBe(0); // no start date
  });

  it("1 year of service @ BHD 600 basic = 300 BHD (15 days at 20/day)", () => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    const r = computeEOSG(
      userWith({
        basicSalary: 600,
        dateOfJoining: start,
      }),
    );
    expect(r.dailyRate).toBe(20);
    // ~15 days * 20 = ~300 (within fractional-year tolerance)
    expect(r.totalAmount).toBeGreaterThan(299);
    expect(r.totalAmount).toBeLessThan(301);
    expect(r.tier2Amount).toBe(0); // no tier 2 yet
  });

  it("3 years of service uses only tier 1", () => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 3);
    const r = computeEOSG(
      userWith({
        basicSalary: 600,
        dateOfJoining: start,
      }),
    );
    // ~45 days * 20 = ~900
    expect(r.totalAmount).toBeGreaterThan(890);
    expect(r.totalAmount).toBeLessThan(910);
    expect(r.tier2Days).toBeLessThan(1); // virtually nothing in tier 2 yet
  });

  it("5 years of service crosses into tier 2 (30 days/year)", () => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 5);
    const r = computeEOSG(
      userWith({
        basicSalary: 600,
        dateOfJoining: start,
      }),
    );
    // tier 1: 3y * 15 = 45 days * 20 = 900
    // tier 2: 2y * 30 = 60 days * 20 = 1200
    // total ≈ 2100
    expect(r.totalAmount).toBeGreaterThan(2090);
    expect(r.totalAmount).toBeLessThan(2110);
  });

  it("uses separationDate over today when set", () => {
    const start = new Date("2020-01-01");
    const sep = new Date("2023-01-01");
    const r = computeEOSG(
      userWith({
        basicSalary: 600,
        dateOfJoining: start,
        separationDate: sep,
      }),
    );
    expect(r.yearsOfService).toBeCloseTo(3, 1);
    // Exactly tier-1 territory: 45 days * 20 = 900
    expect(r.totalAmount).toBeGreaterThan(890);
    expect(r.totalAmount).toBeLessThan(910);
  });

  it("falls back to contractStartDate when dateOfJoining missing", () => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    const r = computeEOSG(
      userWith({
        basicSalary: 600,
        contractStartDate: start,
      }),
    );
    expect(r.yearsOfService).toBeCloseTo(2, 1);
    expect(r.totalAmount).toBeGreaterThan(595);
    expect(r.totalAmount).toBeLessThan(605);
  });

  it("string salary is coerced", () => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    const r = computeEOSG(
      userWith({
        basicSalary: "600" as unknown as number,
        dateOfJoining: start,
      }),
    );
    expect(r.basicSalary).toBe(600);
    expect(r.totalAmount).toBeGreaterThan(299);
  });
});

describe("totalLiability", () => {
  it("sums across multiple users", () => {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    const users = [
      userWith({ uid: "a", basicSalary: 600, dateOfJoining: start }),
      userWith({ uid: "b", basicSalary: 1200, dateOfJoining: start }),
      userWith({ uid: "c", basicSalary: 0 }), // contributes 0
    ];
    const total = totalLiability(users);
    // ~300 + ~600 = ~900
    expect(total).toBeGreaterThan(890);
    expect(total).toBeLessThan(910);
  });
});
