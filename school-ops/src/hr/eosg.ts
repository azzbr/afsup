// End-of-Service Gratuity (EOSG) calculations per Bahrain Labour Law 2012,
// articles 116 & 117.
//
// Rule of thumb:
//   - Years 1–3:  15 days of last basic monthly pay per year of service
//   - Years 4+:   30 days of last basic monthly pay per year of service
//   - Less than 12 months → pro-rated against 15-day rate
//
// We compute "years of service" as the elapsed time between dateOfJoining
// (or contractStartDate as fallback) and a reference date (today by default,
// or separationDate if set). Fractional years are kept as decimals for the
// pro-rata calculation.
//
// All amounts are in BHD. Pass `basicSalary` as a number; we coerce strings.

import type { User } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_DAYS = 365.25; // averaged for leap years

const DAYS_PER_YEAR_TIER1 = 15;
const DAYS_PER_YEAR_TIER2 = 30;
const TIER1_YEARS = 3;
const DAYS_IN_MONTH = 30;

export interface EOSGResult {
  yearsOfService: number;
  dailyRate: number;            // basic salary / 30
  tier1Days: number;
  tier1Amount: number;
  tier2Days: number;
  tier2Amount: number;
  totalAmount: number;
  asOf: Date;
  basicSalary: number;
}

function startDateOf(u: User): Date | null {
  if (u.dateOfJoining instanceof Date) return u.dateOfJoining;
  if (u.contractStartDate instanceof Date) return u.contractStartDate;
  return null;
}

function endDateOf(u: User): Date {
  if (u.separationDate instanceof Date) return u.separationDate;
  return new Date();
}

function numericSalary(u: User): number {
  const v = u.basicSalary;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export function computeEOSG(u: User): EOSGResult {
  const basicSalary = numericSalary(u);
  const start = startDateOf(u);
  const end = endDateOf(u);

  if (!start || basicSalary <= 0) {
    return {
      yearsOfService: 0,
      dailyRate: 0,
      tier1Days: 0,
      tier1Amount: 0,
      tier2Days: 0,
      tier2Amount: 0,
      totalAmount: 0,
      asOf: end,
      basicSalary,
    };
  }

  const elapsedDays = Math.max(0, (end.getTime() - start.getTime()) / DAY_MS);
  const yearsOfService = elapsedDays / YEAR_DAYS;
  const dailyRate = basicSalary / DAYS_IN_MONTH;

  const tier1Years = Math.min(yearsOfService, TIER1_YEARS);
  const tier1Days = tier1Years * DAYS_PER_YEAR_TIER1;
  const tier1Amount = tier1Days * dailyRate;

  const tier2Years = Math.max(0, yearsOfService - TIER1_YEARS);
  const tier2Days = tier2Years * DAYS_PER_YEAR_TIER2;
  const tier2Amount = tier2Days * dailyRate;

  return {
    yearsOfService,
    dailyRate,
    tier1Days,
    tier1Amount,
    tier2Days,
    tier2Amount,
    totalAmount: tier1Amount + tier2Amount,
    asOf: end,
    basicSalary,
  };
}

/** Total EOSG liability across a roster, useful for accounting. */
export function totalLiability(users: User[]): number {
  return users.reduce((sum, u) => sum + computeEOSG(u).totalAmount, 0);
}
