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

import {
  CONTRACT_TYPE_LABELS,
  DEPARTMENT_LABELS,
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  MOE_APPROVAL_LABELS,
  ROLE_LABELS,
} from "../constants";
import type { User } from "../types";
import { computeEOSG, totalLiability } from "./eosg";
import { remainingDays, resolveBalances } from "./leave";

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

// Date cells: CSV downloads keep ISO yyyy-mm-dd (Excel-friendly, sortable);
// the on-screen preview/print tables use the project-wide en-GB display
// format. Date fields are stored as UTC midnight, so both yield the intended
// calendar date.
function fmtDate(d: Date | null | undefined): string {
  if (!(d instanceof Date)) return "";
  return d.toISOString().split("T")[0];
}

function fmtDateDisplay(d: Date | null | undefined): string {
  if (!(d instanceof Date)) return "";
  return d.toLocaleDateString("en-GB");
}

/** Date-cell formatter: *Rows() default to fmtDateDisplay; CSV wrappers pass fmtDate. */
type DateFormat = typeof fmtDate;

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

// Header + rows pair so the Reports UI can preview/print a report on screen
// without re-parsing the CSV. Every *Report() below is a thin CSV wrapper
// around the matching *Rows() builder.
export interface ReportTable {
  header: string[];
  rows: (string | number)[][];
}

function tableCSV(table: ReportTable): string {
  return toCSV([table.header, ...table.rows]);
}

// ----------------------------------------------------------------------------
// Shared row-builder helpers
// ----------------------------------------------------------------------------

function fullName(u: User): string {
  return u.displayName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "";
}

function deptLabel(u: User): string {
  return u.department ? DEPARTMENT_LABELS[u.department] || u.department : "";
}

function contractLabel(u: User): string {
  return u.contractType ? CONTRACT_TYPE_LABELS[u.contractType] || u.contractType : "";
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000; // averaged for leap years

/** Fractional years from `d` to now, or null when the date is missing. */
function yearsSince(d: Date | null | undefined): number | null {
  if (!(d instanceof Date)) return null;
  return Math.max(0, (Date.now() - d.getTime()) / YEAR_MS);
}

function joinList(values: string[] | undefined): string {
  return (values || []).join("; ");
}

function isApproved(u: User): boolean {
  return u.status === "approved";
}

/** Same BH-prefix check the WPS export uses to decide an IBAN is payable. */
function hasBahrainIban(u: User): boolean {
  return !!u.iban && u.iban.startsWith("BH");
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
// 5. Staff Master — one row per employee, every identity/employment field.
//
// Salary columns are appended only when opts.includeSalary is set. The UI
// gates that toggle behind can(actor, "user.edit.salary"); this library just
// obeys the flag.
// ============================================================================

export function staffMasterRows(
  users: User[],
  opts?: { includeSalary?: boolean; dates?: DateFormat },
): ReportTable {
  const date = opts?.dates ?? fmtDateDisplay;
  const header = [
    "Employee Number",
    "Name",
    "Arabic Name",
    "Email",
    "Personal Email",
    "Phone",
    "Role",
    "Department",
    "Position",
    "Contract Type",
    "Contract Start",
    "Contract End",
    "Date of Joining",
    "Tenure (Years)",
    "Status",
    "Nationality",
    "Gender",
    "Date of Birth",
    "Marital Status",
    "CPR Number",
    "CPR Expiry",
    "Passport Number",
    "Passport Expiry",
    "RP Number",
    "RP Expiry",
    "IBAN",
    "Bank",
    "Emergency Contact",
    "Emergency Phone",
    "Teacher",
    "Subjects",
    "Grades Taught",
  ];
  if (opts?.includeSalary) {
    header.push("Basic Salary", "Housing Allowance", "Transport Allowance", "Phone Allowance", "Gross");
  }

  const rows: (string | number)[][] = [];
  for (const u of users) {
    const isBahraini = u.nationality === "Bahraini";
    const tenure = yearsSince(u.dateOfJoining);
    const row: (string | number)[] = [
      u.employeeNumber || "",
      fullName(u),
      u.arabicName || "",
      u.email || "",
      u.personalEmail || "",
      u.phoneNumber || "",
      ROLE_LABELS[u.role] || u.role || "",
      deptLabel(u),
      u.position || "",
      contractLabel(u),
      date(u.contractStartDate),
      date(u.contractEndDate),
      date(u.dateOfJoining),
      tenure === null ? "" : tenure.toFixed(1),
      u.status || "",
      u.nationality || "",
      u.gender || "",
      date(u.dateOfBirth),
      u.maritalStatus || "",
      u.cprNumber || "",
      date(u.cprExpiry),
      u.passportNumber || "",
      date(u.passportExpiry),
      isBahraini ? "" : u.residencePermitNumber || "",
      isBahraini ? "" : date(u.residencePermitExpiry),
      u.iban || "",
      u.bankName || "",
      u.emergencyContactName || "",
      u.emergencyContactPhone || "",
      u.isTeacher ? "Yes" : "",
      joinList(u.subjects),
      joinList(u.gradesTaught),
    ];
    if (opts?.includeSalary) {
      const basic = num(u.basicSalary);
      const housing = num(u.housingAllowance);
      const transport = num(u.transportAllowance);
      const phone = num(u.phoneAllowance);
      row.push(
        fmtMoney(basic),
        fmtMoney(housing),
        fmtMoney(transport),
        fmtMoney(phone),
        fmtMoney(basic + housing + transport + phone),
      );
    }
    rows.push(row);
  }

  return { header, rows };
}

export function staffMasterReport(users: User[], opts?: { includeSalary?: boolean }): GeneratedReport {
  return csvReport("staff_master", tableCSV(staffMasterRows(users, { ...opts, dates: fmtDate })));
}

// ============================================================================
// 6. Headcount & Demographics — monthly management summary over active
// (approved) employees, including the LMRA Bahrainization quota metric.
// ============================================================================

export function headcountRows(users: User[]): ReportTable {
  const active = users.filter(isApproved);
  const total = active.length;
  const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : "0.0");

  const rows: (string | number)[][] = [["Total active headcount", "", total, pct(total)]];

  const section = (metric: string, bucketOf: (u: User) => string) => {
    const counts = new Map<string, number>();
    for (const u of active) {
      const bucket = bucketOf(u) || "Not set";
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
    }
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [bucket, count] of entries) rows.push([metric, bucket, count, pct(count)]);
  };

  section("By department", deptLabel);
  section("By role", (u) => ROLE_LABELS[u.role] || u.role || "");

  section("By nationality", (u) => u.nationality || "");
  const bahraini = active.filter((u) => u.nationality === "Bahraini").length;
  rows.push(["By nationality", "Bahrainization rate", bahraini, pct(bahraini)]);

  section("By gender", (u) => u.gender || "");
  section("By contract type", contractLabel);
  section("Teachers vs non-teachers", (u) => (u.isTeacher ? "Teachers" : "Non-teachers"));

  const AGE_BANDS = ["Under 25", "25-34", "35-44", "45-54", "55+", "Unknown"];
  const bandOf = (u: User): string => {
    const age = yearsSince(u.dateOfBirth);
    if (age === null) return "Unknown";
    if (age < 25) return "Under 25";
    if (age < 35) return "25-34";
    if (age < 45) return "35-44";
    if (age < 55) return "45-54";
    return "55+";
  };
  const bandCounts = new Map<string, number>();
  for (const u of active) {
    const band = bandOf(u);
    bandCounts.set(band, (bandCounts.get(band) || 0) + 1);
  }
  for (const band of AGE_BANDS) {
    const count = bandCounts.get(band) || 0;
    if (count > 0) rows.push(["By age band", band, count, pct(count)]);
  }

  const tenures = active
    .map((u) => yearsSince(u.dateOfJoining))
    .filter((t): t is number => t !== null);
  const avgTenure = tenures.length > 0 ? tenures.reduce((s, t) => s + t, 0) / tenures.length : 0;
  rows.push(["Average tenure (years)", "", avgTenure.toFixed(1), ""]);

  return { header: ["Metric", "Breakdown", "Count", "Share %"], rows };
}

export function headcountReport(users: User[]): GeneratedReport {
  return csvReport("headcount_demographics", tableCSV(headcountRows(users)));
}

// ============================================================================
// 7. Leave Balances & Utilization — per approved employee per leave type.
//
// Annual and sick always appear; other types only when there is activity
// (nonzero entitlement or usage). Balances resolve through hr/leave so legacy
// annualLeaveBalance / sickDaysUsed fields keep working.
// ============================================================================

export function leaveBalancesRows(users: User[]): ReportTable {
  const rows: (string | number)[][] = [];

  for (const u of users.filter(isApproved)) {
    const balances = resolveBalances(u);
    for (const type of LEAVE_TYPES) {
      const balance = balances[type];
      const alwaysShown = type === "annual" || type === "sick";
      if (!alwaysShown && balance.entitled <= 0 && balance.used <= 0) continue;

      const remaining = remainingDays(balance);
      let flag = "";
      if (remaining <= 0) flag = "EXHAUSTED";
      else if (type === "annual" && remaining <= 2) flag = "LOW";

      rows.push([
        fullName(u),
        deptLabel(u),
        LEAVE_TYPE_LABELS[type],
        balance.entitled,
        balance.used,
        remaining,
        flag,
      ]);
    }
  }

  return {
    header: ["Employee", "Department", "Leave Type", "Entitled", "Used", "Remaining", "Flag"],
    rows,
  };
}

export function leaveBalancesReport(users: User[]): GeneratedReport {
  return csvReport("leave_balances", tableCSV(leaveBalancesRows(users)));
}

// ============================================================================
// 8. Payroll Summary — monthly payroll cost per approved employee with a
// basic salary, including GOSI both ways and a grand totals row.
// ============================================================================

export function payrollSummaryRows(users: User[], gosi: GosiRates = DEFAULT_GOSI_RATES): ReportTable {
  const payable = users.filter((u) => isApproved(u) && num(u.basicSalary) > 0);

  const rows: (string | number)[][] = [];
  let tBasic = 0;
  let tHousing = 0;
  let tTransport = 0;
  let tPhone = 0;
  let tGross = 0;
  let tEmployee = 0;
  let tNet = 0;
  let tEmployer = 0;
  let tCost = 0;

  for (const u of payable) {
    const basic = num(u.basicSalary);
    const housing = num(u.housingAllowance);
    const transport = num(u.transportAllowance);
    const phone = num(u.phoneAllowance);
    const gross = basic + housing + transport + phone;
    const isBahraini = u.nationality === "Bahraini";
    const rates = isBahraini ? gosi.bahraini : gosi.expat;
    const employeeGosi = basic * rates.employeeRate;
    const employerGosi = basic * rates.employerRate;
    const net = gross - employeeGosi;
    const cost = gross + employerGosi;

    tBasic += basic;
    tHousing += housing;
    tTransport += transport;
    tPhone += phone;
    tGross += gross;
    tEmployee += employeeGosi;
    tNet += net;
    tEmployer += employerGosi;
    tCost += cost;

    rows.push([
      fullName(u),
      deptLabel(u),
      isBahraini ? "Bahraini" : "Expat",
      fmtMoney(basic),
      fmtMoney(housing),
      fmtMoney(transport),
      fmtMoney(phone),
      fmtMoney(gross),
      fmtMoney(employeeGosi),
      fmtMoney(net),
      fmtMoney(employerGosi),
      fmtMoney(cost),
    ]);
  }

  rows.push([
    "TOTAL",
    "",
    "",
    fmtMoney(tBasic),
    fmtMoney(tHousing),
    fmtMoney(tTransport),
    fmtMoney(tPhone),
    fmtMoney(tGross),
    fmtMoney(tEmployee),
    fmtMoney(tNet),
    fmtMoney(tEmployer),
    fmtMoney(tCost),
  ]);

  return {
    header: [
      "Employee",
      "Department",
      "Nationality Class",
      "Basic",
      "Housing",
      "Transport",
      "Phone",
      "Gross",
      "GOSI Employee",
      "Net Pay",
      "GOSI Employer",
      "Total Monthly Cost",
    ],
    rows,
  };
}

export function payrollSummaryReport(users: User[], gosi: GosiRates = DEFAULT_GOSI_RATES): GeneratedReport {
  return csvReport("payroll_summary", tableCSV(payrollSummaryRows(users, gosi)));
}

// ============================================================================
// 9. MOE Teacher Roster — inspection-ready list of active teachers.
// ============================================================================

export function moeTeacherRosterRows(users: User[], dates: DateFormat = fmtDateDisplay): ReportTable {
  const teachers = users
    .filter((u) => isApproved(u) && u.isTeacher === true)
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  const rows: (string | number)[][] = teachers.map((u) => [
    fullName(u),
    u.arabicName || "",
    u.cprNumber || "",
    u.nationality || "",
    joinList(u.subjects),
    joinList(u.gradesTaught),
    u.homeroomClass || "",
    u.teachingLicenseNumber || "",
    dates(u.teachingLicenseExpiry),
    u.moeApprovalStatus ? MOE_APPROVAL_LABELS[u.moeApprovalStatus] || u.moeApprovalStatus : "",
    dates(u.moeApprovalExpiry),
    u.yearsExperienceTotal ?? "",
    u.yearsAtAFS ?? "",
  ]);

  return {
    header: [
      "Name",
      "Arabic Name",
      "CPR Number",
      "Nationality",
      "Subjects",
      "Grades Taught",
      "Homeroom",
      "License Number",
      "License Expiry",
      "MOE Approval",
      "MOE Approval Expiry",
      "Years Experience (Total)",
      "Years at AFS",
    ],
    rows,
  };
}

export function moeTeacherRosterReport(users: User[]): GeneratedReport {
  return csvReport("moe_teacher_roster", tableCSV(moeTeacherRosterRows(users, fmtDate)));
}

// ============================================================================
// 10. Data Completeness — whose file is missing what, sorted worst-first.
// Conditional checks (Arabic name, RP, contract dates, MOE status) only count
// when applicable, so the completeness % denominator varies per employee.
// ============================================================================

interface CompletenessCheck {
  label: string;
  ok: boolean;
}

function completenessChecks(u: User): CompletenessCheck[] {
  const isBahraini = u.nationality === "Bahraini";
  const checks: CompletenessCheck[] = [{ label: "IBAN", ok: hasBahrainIban(u) }];

  if (isBahraini) checks.push({ label: "Arabic name", ok: !!u.arabicName });
  checks.push(
    { label: "CPR number", ok: !!u.cprNumber },
    { label: "CPR expiry", ok: u.cprExpiry instanceof Date },
    { label: "Passport number", ok: !!u.passportNumber },
    { label: "Passport expiry", ok: u.passportExpiry instanceof Date },
  );
  if (!isBahraini) {
    checks.push(
      { label: "Residence permit number", ok: !!u.residencePermitNumber },
      { label: "Residence permit expiry", ok: u.residencePermitExpiry instanceof Date },
    );
  }
  checks.push(
    { label: "Date of birth", ok: u.dateOfBirth instanceof Date },
    { label: "Emergency contact name", ok: !!u.emergencyContactName },
    { label: "Emergency contact phone", ok: !!u.emergencyContactPhone },
    { label: "Department", ok: !!u.department },
    { label: "Position", ok: !!u.position },
    { label: "Date of joining", ok: u.dateOfJoining instanceof Date },
  );
  if (u.contractType === "fixed_term") {
    checks.push(
      { label: "Contract start date", ok: u.contractStartDate instanceof Date },
      { label: "Contract end date", ok: u.contractEndDate instanceof Date },
    );
  }
  if (u.isTeacher) checks.push({ label: "MOE approval status", ok: !!u.moeApprovalStatus });
  checks.push({ label: "Uploaded documents", ok: Object.keys(u.documents || {}).length > 0 });

  return checks;
}

export function dataCompletenessRows(users: User[]): ReportTable {
  const incomplete = users
    .filter(isApproved)
    .map((u) => {
      const checks = completenessChecks(u);
      const missing = checks.filter((c) => !c.ok).map((c) => c.label);
      const completeness = Math.round(((checks.length - missing.length) / checks.length) * 100);
      return { u, missing, completeness };
    })
    .filter((it) => it.missing.length > 0)
    .sort(
      (a, b) =>
        a.completeness - b.completeness ||
        b.missing.length - a.missing.length ||
        fullName(a.u).localeCompare(fullName(b.u)),
    );

  const rows: (string | number)[][] = incomplete.map((it) => [
    fullName(it.u),
    deptLabel(it.u),
    it.missing.length,
    it.completeness,
    it.missing.join("; "),
  ]);

  return {
    header: ["Employee", "Department", "Missing Count", "Completeness %", "Missing Items"],
    rows,
  };
}

export function dataCompletenessReport(users: User[]): GeneratedReport {
  return csvReport("data_completeness", tableCSV(dataCompletenessRows(users)));
}

// ============================================================================
// 11. Joiners & Leavers — GOSI/LMRA monthly reconciliation over a date range.
// No status filter: leavers are usually suspended/blocked by the time this
// report runs, and the date range itself scopes the output.
// ============================================================================

export function joinersLeaversRows(
  users: User[],
  from: Date,
  to: Date,
  dates: DateFormat = fmtDateDisplay,
): ReportTable {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime();
  const inRange = (d: Date | null | undefined): boolean =>
    d instanceof Date && d.getTime() >= start && d.getTime() <= end;

  const byDate = (key: "dateOfJoining" | "separationDate") => (a: User, b: User) =>
    (a[key]?.getTime() ?? 0) - (b[key]?.getTime() ?? 0);

  const joiners = users.filter((u) => inRange(u.dateOfJoining)).sort(byDate("dateOfJoining"));
  const leavers = users.filter((u) => inRange(u.separationDate)).sort(byDate("separationDate"));

  const rows: (string | number)[][] = [];
  for (const u of joiners) {
    rows.push(["JOINED", fullName(u), deptLabel(u), u.position || "", dates(u.dateOfJoining), contractLabel(u)]);
  }
  rows.push(["JOINED", "TOTAL", "", "", "", joiners.length]);
  for (const u of leavers) {
    rows.push(["LEFT", fullName(u), deptLabel(u), u.position || "", dates(u.separationDate), u.separationReason || ""]);
  }
  rows.push(["LEFT", "TOTAL", "", "", "", leavers.length]);

  return { header: ["Type", "Employee", "Department", "Position", "Date", "Detail"], rows };
}

export function joinersLeaversReport(users: User[], from: Date, to: Date): GeneratedReport {
  return csvReport("joiners_leavers", tableCSV(joinersLeaversRows(users, from, to, fmtDate)));
}

// ============================================================================
// 12. Emergency Contact Sheet — crisis-preparedness list per active employee.
// Home-country contact columns are filled for non-Bahrainis only.
// ============================================================================

export function emergencyContactRows(users: User[]): ReportTable {
  const active = users
    .filter(isApproved)
    .sort((a, b) => deptLabel(a).localeCompare(deptLabel(b)) || fullName(a).localeCompare(fullName(b)));

  const rows: (string | number)[][] = active.map((u) => {
    const showHomeCountry = u.nationality !== "Bahraini";
    return [
      fullName(u),
      deptLabel(u),
      u.position || "",
      u.phoneNumber || "",
      u.secondaryPhone || "",
      u.emergencyContactName || "",
      u.emergencyContactRelationship || "",
      u.emergencyContactPhone || "",
      u.emergencyContactAltPhone || "",
      showHomeCountry ? u.homeCountryEmergency1Name || "" : "",
      showHomeCountry ? u.homeCountryEmergency1Phone || "" : "",
      showHomeCountry ? u.homeCountryEmergency1Relationship || "" : "",
    ];
  });

  return {
    header: [
      "Employee",
      "Department",
      "Position",
      "Phone",
      "Secondary Phone",
      "Emergency Contact",
      "Relationship",
      "Emergency Phone",
      "Alt Phone",
      "Home Country Contact",
      "Home Country Phone",
      "Home Country Relationship",
    ],
    rows,
  };
}

export function emergencyContactReport(users: User[]): GeneratedReport {
  return csvReport("emergency_contacts", tableCSV(emergencyContactRows(users)));
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
