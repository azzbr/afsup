// HR report generators.
//
// Each function takes the canonical User list and returns a downloadable
// CSV blob. The Reports tab UI wraps these in download buttons.
//
// CSV format: standard RFC 4180 (quote fields containing commas/quotes,
// double-quote escapes within quoted fields, CRLF line endings).
//
// IMPORTANT: the official WPS (LMRA EMS portal) and GOSI submission formats
// are revised periodically. The CSVs here are pragmatic approximations — HR
// should review against the latest LMRA/GOSI templates before submitting.
// Refining to portal-exact formats is a separate task.

import type { User } from "../types";
import { computeEOSG, totalLiability } from "./eosg";

// ============================================================================
// CSV helpers
// ============================================================================

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function fmtDate(d: Date | null | undefined): string {
  if (!(d instanceof Date)) return "";
  return d.toISOString().split("T")[0];
}

function fmtMoney(n: number): string {
  return n.toFixed(3); // BHD has 3 decimal places (fils)
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export interface GeneratedReport {
  filename: string;
  content: string;
  mime: string;
}

export function csvReport(name: string, content: string): GeneratedReport {
  const stamp = new Date().toISOString().split("T")[0];
  return {
    filename: `${name}_${stamp}.csv`,
    content,
    mime: "text/csv;charset=utf-8;",
  };
}

// ============================================================================
// 1. GOSI Monthly Submission
//
// Bahrain GOSI 2026 rates: Bahraini employees pay 8% of basic and the
// employer 17%; expat employees pay 1% and the employer 3%. ALL active
// employees are included — expats are insured too, not exempt. Rates are
// injectable from school_settings (gosi.*) so a statutory change does not
// require a code change.
// ============================================================================

export interface GosiRatePair {
  employerRate: number;
  employeeRate: number;
}

export interface GosiRates {
  bahraini: GosiRatePair;
  expat: GosiRatePair;
}

export const DEFAULT_GOSI_RATES: GosiRates = {
  bahraini: { employerRate: 0.17, employeeRate: 0.08 },
  expat: { employerRate: 0.03, employeeRate: 0.01 },
};

export function gosiSubmissionReport(users: User[], gosiRates: GosiRates = DEFAULT_GOSI_RATES): GeneratedReport {
  const insured = users
    .filter((u) => u.status !== "blocked" && u.status !== "suspended")
    .filter((u) => num(u.basicSalary) > 0);

  const rows: (string | number)[][] = [
    [
      "CPR Number",
      "Full Name (Arabic)",
      "Full Name (English)",
      "Nationality Class",
      "Basic Salary (BHD)",
      "Employee Contribution",
      "Employer Contribution",
      "Total Contribution",
      "Date of Joining",
      "Position",
      "Department",
    ],
  ];

  let totalBasic = 0;
  let totalEmployee = 0;
  let totalEmployer = 0;

  for (const u of insured) {
    const basic = num(u.basicSalary);
    const isBahraini = u.nationality === "Bahraini";
    const rates = isBahraini ? gosiRates.bahraini : gosiRates.expat;
    const employee = basic * rates.employeeRate;
    const employer = basic * rates.employerRate;
    totalBasic += basic;
    totalEmployee += employee;
    totalEmployer += employer;

    rows.push([
      u.cprNumber || "",
      u.arabicName || "",
      u.displayName || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      isBahraini ? "Bahraini" : "Expat",
      fmtMoney(basic),
      fmtMoney(employee),
      fmtMoney(employer),
      fmtMoney(employee + employer),
      fmtDate(u.dateOfJoining),
      u.position || "",
      u.department || "",
    ]);
  }

  // Totals row — sums of the per-row contributions (rates differ per row)
  rows.push([]);
  rows.push([
    "",
    "",
    "TOTAL",
    "",
    fmtMoney(totalBasic),
    fmtMoney(totalEmployee),
    fmtMoney(totalEmployer),
    fmtMoney(totalEmployee + totalEmployer),
    "",
    "",
    "",
  ]);

  return csvReport("gosi_submission", toCSV(rows));
}

// ============================================================================
// 2. WPS LMRA CSV (approximation)
//
// Bahrain WPS 2.0 salary files are uploaded through the LMRA EMS portal —
// NOT the UAE SIF format this report was previously framed as. LMRA revises
// the official column set periodically; this CSV carries the universally
// required fields so HR can map them onto the current LMRA template.
// ============================================================================

export function wpsLmraReport(users: User[]): GeneratedReport {
  const payable = users.filter(
    (u) =>
      u.status === "approved" &&
      u.iban &&
      u.iban.startsWith("BH") &&
      num(u.basicSalary) > 0,
  );

  const rows: (string | number)[][] = [
    [
      "Employee Number",
      "CPR Number",
      "Full Name",
      "IBAN",
      "Bank Name",
      "Basic Salary",
      "Housing Allowance",
      "Transport Allowance",
      "Phone Allowance",
      "Other Allowances",
      "Total Gross",
      "Currency",
    ],
  ];

  for (const u of payable) {
    const basic = num(u.basicSalary);
    const housing = num(u.housingAllowance);
    const transport = num(u.transportAllowance);
    const phone = num(u.phoneAllowance);
    const total = basic + housing + transport + phone;

    rows.push([
      u.employeeNumber || "",
      u.cprNumber || "",
      u.displayName || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      u.iban || "",
      u.bankName || "",
      fmtMoney(basic),
      fmtMoney(housing),
      fmtMoney(transport),
      fmtMoney(phone),
      fmtMoney(0),
      fmtMoney(total),
      "BHD",
    ]);
  }

  const totalPayroll = payable.reduce(
    (s, u) => s + num(u.basicSalary) + num(u.housingAllowance) + num(u.transportAllowance) + num(u.phoneAllowance),
    0,
  );
  rows.push([]);
  rows.push(["", "", "TOTAL PAYROLL", "", "", "", "", "", "", "", fmtMoney(totalPayroll), "BHD"]);

  return csvReport("wps_lmra", toCSV(rows));
}

// ============================================================================
// 3. Expiry Watchlist — anything expiring in the next 90 days
// ============================================================================

interface ExpiryItem {
  uid: string;
  name: string;
  documentType: string;
  documentNumber: string;
  expiresAt: Date;
  daysAway: number;
  nationality: string;
  status: string;
}

export function expiryWatchlistReport(users: User[], horizonDays = 90): GeneratedReport {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const items: ExpiryItem[] = [];
  const days = (d: Date) => Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  const push = (
    u: User,
    documentType: string,
    documentNumber: string,
    expiresAt: Date | null | undefined,
  ) => {
    if (!(expiresAt instanceof Date)) return;
    if (expiresAt > horizon) return;
    items.push({
      uid: u.uid,
      name: u.displayName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
      documentType,
      documentNumber,
      expiresAt,
      daysAway: days(expiresAt),
      nationality: u.nationality || "Unknown",
      status: u.status,
    });
  };

  for (const u of users) {
    if (u.status === "blocked" || u.status === "suspended") continue;

    push(u, "CPR", u.cprNumber || "", u.cprExpiry);
    push(u, "Passport", u.passportNumber || "", u.passportExpiry);
    if (u.nationality !== "Bahraini") {
      push(u, "Residence Permit", u.residencePermitNumber || "", u.residencePermitExpiry);
    }
    if (u.isTeacher) {
      push(u, "MOE Approval", u.moeApprovalStatus || "", u.moeApprovalExpiry);
      push(u, "Teaching License", u.teachingLicenseNumber || "", u.teachingLicenseExpiry);
    }
    if (u.contractType === "fixed_term") {
      push(u, "Contract", u.employeeNumber || "", u.contractEndDate);
    }
  }

  items.sort((a, b) => a.daysAway - b.daysAway);

  const rows: (string | number)[][] = [
    [
      "Employee",
      "Document",
      "Number",
      "Expiry Date",
      "Days Until Expiry",
      "Status",
      "Nationality",
    ],
  ];

  for (const it of items) {
    rows.push([
      it.name,
      it.documentType,
      it.documentNumber,
      fmtDate(it.expiresAt),
      it.daysAway,
      it.daysAway < 0 ? "EXPIRED" : it.daysAway < 30 ? "URGENT" : "Upcoming",
      it.nationality,
    ]);
  }

  return csvReport("expiry_watchlist", toCSV(rows));
}

// ============================================================================
// 4. EOSG Liability — accounting-grade summary
// ============================================================================

export function eosgLiabilityReport(users: User[]): GeneratedReport {
  const active = users.filter((u) => u.status === "approved");

  const rows: (string | number)[][] = [
    [
      "Employee Number",
      "Full Name",
      "CPR",
      "Nationality",
      "Date of Joining",
      "Years of Service",
      "Basic Salary (BHD)",
      "Tier 1 (15d/y, first 3y)",
      "Tier 2 (30d/y, after 3y)",
      "Total EOSG Liability (BHD)",
    ],
  ];

  for (const u of active) {
    const r = computeEOSG(u);
    if (r.totalAmount <= 0) continue;

    rows.push([
      u.employeeNumber || "",
      u.displayName || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      u.cprNumber || "",
      u.nationality || "Unknown",
      fmtDate(u.dateOfJoining),
      r.yearsOfService.toFixed(2),
      fmtMoney(r.basicSalary),
      fmtMoney(r.tier1Amount),
      fmtMoney(r.tier2Amount),
      fmtMoney(r.totalAmount),
    ]);
  }

  rows.push([]);
  rows.push([
    "",
    "TOTAL LIABILITY",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    fmtMoney(totalLiability(active)),
  ]);

  return csvReport("eosg_liability", toCSV(rows));
}

// ============================================================================
// Trigger a browser download for a generated report
// ============================================================================

export function downloadReport(report: GeneratedReport): void {
  // UTF-8 BOM for Excel to read Arabic correctly
  const blob = new Blob(["﻿" + report.content], { type: report.mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = report.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
