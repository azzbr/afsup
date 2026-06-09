// Single shared compliance module — replaces the drifting copies in
// AdminView.jsx (calculateHRAlerts), HRSystem.jsx (calculateComplianceAlerts),
// EmployeeDetailView.jsx (ComplianceAlerts) and mirrors the thresholds in
// functions/src/dailyComplianceScan.ts.
//
// Pure: no Firebase imports. User date fields are already JS Dates (the data
// hooks convert Firestore Timestamps at the read boundary — never .toDate()).

import type { User } from "../types";

export interface ComplianceAlert {
  uid: string;
  name: string;
  type: string;
  severity: "critical" | "warning";
  message: string;
  /** Days until the relevant expiry (negative = already past). */
  daysAway?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Bahrain IBAN: "BH" + 2 check digits + 18 alphanumeric (22 chars total).
const BH_IBAN_REGEX = /^BH\d{2}[A-Z0-9]{18}$/;

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

function daysAway(date: Date, today: Date): number {
  return Math.ceil((date.getTime() - today.getTime()) / DAY_MS);
}

function nameOf(user: User): string {
  return user.displayName || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
}

/** All compliance alerts for a single user. `today` is injectable for tests. */
export function complianceAlertsFor(user: User, today: Date = new Date()): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];
  const name = nameOf(user);

  const push = (type: string, severity: "critical" | "warning", message: string, away?: number) => {
    alerts.push({ uid: user.uid, name, type, severity, message, ...(away !== undefined ? { daysAway: away } : {}) });
  };

  const expiryCheck = (
    type: string,
    date: Date | null | undefined,
    warnWithinDays: number,
    expiredMsg: string,
    expiringMsg: string,
  ) => {
    if (!isValidDate(date)) return;
    const away = daysAway(date, today);
    if (date < today) {
      push(type, "critical", expiredMsg, away);
    } else if (away <= warnWithinDays) {
      push(type, "warning", expiringMsg, away);
    }
  };

  // CPR (Bahrain ID) — required for all residents
  expiryCheck("cpr", user.cprExpiry, 60, `CPR expired: ${name}`, `CPR expiring soon: ${name}`);

  // Passport
  expiryCheck("passport", user.passportExpiry, 90, `Passport expired: ${name}`, `Passport expiring soon: ${name}`);

  // Residence permit — non-Bahrainis only (LMRA-critical)
  if (user.nationality !== "Bahraini") {
    expiryCheck(
      "residence_permit",
      user.residencePermitExpiry,
      60,
      `Residence permit expired: ${name}`,
      `Residence permit expiring soon: ${name}`,
    );
  }

  // IBAN — WPS compliance
  if (!user.iban || !BH_IBAN_REGEX.test(user.iban)) {
    push("iban", "warning", `Missing or invalid IBAN: ${name}`);
  }

  // Arabic name — required for Bahrainis (GOSI submissions)
  if (user.nationality === "Bahraini" && !user.arabicName) {
    push("arabic_name", "warning", `Missing Arabic name (GOSI): ${name}`);
  }

  // MOE approval — teachers only
  if (user.isTeacher) {
    if (user.moeApprovalStatus === "expired" || user.moeApprovalStatus === "rejected") {
      push("moe_approval", "critical", `MOE approval ${user.moeApprovalStatus}: ${name}`);
    } else {
      expiryCheck(
        "moe_approval",
        user.moeApprovalExpiry,
        60,
        `MOE approval expired: ${name}`,
        `MOE approval expiring soon: ${name}`,
      );
    }
  }

  // Contract end — fixed-term only
  if (user.contractType === "fixed_term") {
    expiryCheck(
      "contract",
      user.contractEndDate,
      60,
      `Contract expired: ${name}`,
      `Contract renewal due: ${name}`,
    );
  }

  // Probation ending — warning only (past-probation confirmation is an HR
  // workflow item, not a compliance failure)
  if (isValidDate(user.probationEndDate)) {
    const away = daysAway(user.probationEndDate, today);
    if (away >= 0 && away <= 30) {
      push("probation", "warning", `Probation ending soon: ${name}`, away);
    }
  }

  return alerts;
}

/** Alerts across a user list, critical first. Skips blocked/suspended users. */
export function complianceAlertsAll(users: User[], today: Date = new Date()): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];
  for (const user of users) {
    if (user.status === "blocked" || user.status === "suspended") continue;
    alerts.push(...complianceAlertsFor(user, today));
  }
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
