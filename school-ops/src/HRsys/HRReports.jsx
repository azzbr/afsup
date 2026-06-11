// Reports tab — the Phase 2.9a Reports Center.
//
// Categorized report cards (Government & Compliance / People / Money /
// Movements & Leave). Each card shows live row counts, offers a one-click
// CSV download (UTF-8 with BOM so Excel reads Arabic), and — for the reports
// backed by a *Rows() builder in hr/reports.ts — an on-screen preview of the
// first 10 rows. The MOE Teacher Roster and Emergency Contact Sheet also get
// a print view (full table + window.print with @media print scoping).
//
// All computation is client-side from the already-loaded users. Salary
// columns on the Staff Master are gated behind can(actor, 'user.edit.salary').
// For Bahrain-specific submission formats (GOSI portal, WPS via the LMRA EMS
// portal) the CSV is pragmatic — HR should map columns into the latest
// official template before upload. GOSI rates come live from school_settings.

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Banknote,
  CalendarDays,
  ClipboardList,
  Download,
  Eye,
  FileText,
  GraduationCap,
  ListChecks,
  PieChart,
  Phone,
  Printer,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';

import { computeEOSG, totalLiability } from '../hr/eosg';
import { useSchoolSettings, effectiveSettings } from '../data/useSchoolSettings';
import { can } from '../permissions';
import {
  gosiSubmissionReport,
  wpsLmraReport,
  expiryWatchlistReport,
  eosgLiabilityReport,
  staffMasterRows,
  staffMasterReport,
  headcountRows,
  headcountReport,
  leaveBalancesRows,
  leaveBalancesReport,
  payrollSummaryRows,
  payrollSummaryReport,
  moeTeacherRosterRows,
  moeTeacherRosterReport,
  dataCompletenessRows,
  dataCompletenessReport,
  joinersLeaversRows,
  joinersLeaversReport,
  emergencyContactRows,
  emergencyContactReport,
  downloadReport,
} from '../hr/reports';

const fmtBHD = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'BHD', minimumFractionDigits: 3 }).format(n);

const num = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

const pct = (rate) => `${+(rate * 100).toFixed(2)}%`;

// <input type="date"> works in yyyy-mm-dd strings; parse them as LOCAL dates
// (new Date('yyyy-mm-dd') would be UTC midnight and shift the day in Bahrain).
const parseDateInput = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const toDateInput = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function ReportCard({
  icon: Icon,
  color,
  title,
  description,
  stats,
  controls,
  onDownload,
  onPreview,
  onPrint,
  disabled,
  disabledReason,
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>

      {stats && (
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{s.label}</span>
              <span className="font-bold text-slate-800">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {controls && <div className="mb-4">{controls}</div>}

      <div className="mt-auto flex items-center gap-2">
        {onPreview && (
          <button
            type="button"
            onClick={onPreview}
            disabled={disabled}
            title={disabled ? disabledReason : 'Preview the first 10 rows'}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Eye size={16} /> Preview
          </button>
        )}
        {onPrint && (
          <button
            type="button"
            onClick={onPrint}
            disabled={disabled}
            title={disabled ? disabledReason : 'Open the printable view'}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Printer size={16} /> Print
          </button>
        )}
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled}
          title={disabled ? disabledReason : 'Download CSV'}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={16} /> Download CSV
        </button>
      </div>
    </div>
  );
}

function ReportSection({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>
    </div>
  );
}

// Full-screen modal rendering a ReportTable. In preview mode only the first
// 10 rows show; in printable mode the whole table renders and a Print button
// triggers window.print() with @media print rules that isolate the table.
function ReportModal({ title, table, printable, onDownload, onClose }) {
  const rows = printable ? table.rows : table.rows.slice(0, 10);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      {printable && (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            .hr-report-print-area, .hr-report-print-area * { visibility: visible !important; }
            .hr-report-print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              max-height: none !important;
              box-shadow: none !important;
              border: none !important;
            }
            .hr-report-print-scroll { overflow: visible !important; max-height: none !important; }
            .hr-report-no-print { display: none !important; }
          }
        `}</style>
      )}
      <div className="hr-report-print-area bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col">
        <div className="hr-report-no-print flex items-center justify-between gap-3 p-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-900 truncate">{title}</h3>
          <div className="flex items-center gap-2 shrink-0">
            {printable && (
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200"
              >
                <Printer size={16} /> Print
              </button>
            )}
            <button
              type="button"
              onClick={onDownload}
              className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800"
            >
              <Download size={16} /> CSV
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Print-only heading so the paper copy is self-describing. */}
        {printable && (
          <div className="hidden print:block p-4">
            <h3 className="font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">
              Generated {new Date().toLocaleDateString('en-GB')} — Al Fajer International School
            </p>
          </div>
        )}

        <div className="hr-report-print-scroll overflow-auto p-4">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {table.header.map((h, i) => (
                  <th
                    key={i}
                    className="text-left px-2 py-1.5 font-bold text-slate-600 bg-slate-50 whitespace-nowrap border-b border-slate-200"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-slate-100">
                  {table.header.map((_, ci) => (
                    <td key={ci} className="px-2 py-1.5 text-slate-700 whitespace-nowrap">
                      {row[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!printable && table.rows.length > rows.length && (
          <p className="hr-report-no-print px-4 pb-4 text-xs text-slate-400">
            Showing the first {rows.length} of {table.rows.length} rows — download the CSV for the full report.
          </p>
        )}
      </div>
    </div>
  );
}

export default function HRReports({ employees, actor }) {
  const settings = effectiveSettings(useSchoolSettings().data);
  const gosiRates = settings.gosi;

  const canSeeSalary = can(actor, 'user.edit.salary');
  const [includeSalary, setIncludeSalary] = useState(false);
  const [modal, setModal] = useState(null); // { title, table, printable, onDownload }

  // Joiners & Leavers date range — defaults to the current month so far.
  const now = new Date();
  const [jlFrom, setJlFrom] = useState(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [jlTo, setJlTo] = useState(toDateInput(now));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ninetyDays = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  // -------------------------------------------------------------- legacy four
  const gosiStats = useMemo(() => {
    const insured = employees.filter(
      (u) => u.status !== 'blocked' && u.status !== 'suspended' && num(u.basicSalary) > 0,
    );
    let totalBasic = 0;
    let employeeTotal = 0;
    let employerTotal = 0;
    let bahrainiCount = 0;
    for (const u of insured) {
      const basic = num(u.basicSalary);
      const isBahraini = u.nationality === 'Bahraini';
      const rates = isBahraini ? gosiRates.bahraini : gosiRates.expat;
      if (isBahraini) bahrainiCount++;
      totalBasic += basic;
      employeeTotal += basic * rates.employeeRate;
      employerTotal += basic * rates.employerRate;
    }
    return {
      count: insured.length,
      bahrainiCount,
      expatCount: insured.length - bahrainiCount,
      totalBasic,
      employeeTotal,
      employerTotal,
    };
  }, [employees, gosiRates]);

  const wpsStats = useMemo(() => {
    const payable = employees.filter(
      (u) => u.status === 'approved' && u.iban?.startsWith('BH') && num(u.basicSalary) > 0,
    );
    const totalGross = payable.reduce(
      (s, u) =>
        s +
        num(u.basicSalary) +
        num(u.housingAllowance) +
        num(u.transportAllowance) +
        num(u.phoneAllowance),
      0,
    );
    const ineligible = employees.length - payable.length;
    return { count: payable.length, totalGross, ineligible };
  }, [employees]);

  const expiryStats = useMemo(() => {
    let total = 0;
    let critical = 0;

    const check = (d) => {
      if (!(d instanceof Date)) return;
      if (d > ninetyDays) return;
      total++;
      if (d < today) critical++;
    };

    for (const u of employees) {
      if (u.status === 'blocked' || u.status === 'suspended') continue;
      check(u.cprExpiry);
      check(u.passportExpiry);
      if (u.nationality !== 'Bahraini') check(u.residencePermitExpiry);
      if (u.isTeacher) {
        check(u.moeApprovalExpiry);
        check(u.teachingLicenseExpiry);
      }
      if (u.contractType === 'fixed_term') check(u.contractEndDate);
    }
    return { total, critical };
  }, [employees, today, ninetyDays]);

  const eosgStats = useMemo(() => {
    const active = employees.filter((u) => u.status === 'approved');
    const eligible = active.filter((u) => {
      const r = computeEOSG(u);
      return r.totalAmount > 0;
    });
    return {
      eligible: eligible.length,
      totalLiability: totalLiability(active),
    };
  }, [employees]);

  // ------------------------------------------------------- Phase 2.9a tables
  const activeCount = useMemo(
    () => employees.filter((u) => u.status === 'approved').length,
    [employees],
  );

  const staffMasterTable = useMemo(
    () => staffMasterRows(employees, { includeSalary: includeSalary && canSeeSalary }),
    [employees, includeSalary, canSeeSalary],
  );
  const headcountTable = useMemo(() => headcountRows(employees), [employees]);
  const leaveTable = useMemo(() => leaveBalancesRows(employees), [employees]);
  const payrollTable = useMemo(() => payrollSummaryRows(employees, gosiRates), [employees, gosiRates]);
  const moeTable = useMemo(() => moeTeacherRosterRows(employees), [employees]);
  const completenessTable = useMemo(() => dataCompletenessRows(employees), [employees]);
  const emergencyTable = useMemo(() => emergencyContactRows(employees), [employees]);

  const jlFromDate = parseDateInput(jlFrom);
  const jlToDate = parseDateInput(jlTo);
  const jlValid = Boolean(jlFromDate && jlToDate && jlFromDate <= jlToDate);
  const joinersTable = useMemo(
    () => (jlValid ? joinersLeaversRows(employees, jlFromDate, jlToDate) : null),
    // Dates are derived from the string state — depend on the strings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, jlFrom, jlTo, jlValid],
  );
  const joinedCount = joinersTable
    ? joinersTable.rows.filter((r) => r[0] === 'JOINED' && r[1] !== 'TOTAL').length
    : 0;
  const leftCount = joinersTable
    ? joinersTable.rows.filter((r) => r[0] === 'LEFT' && r[1] !== 'TOTAL').length
    : 0;

  // payrollTable always ends with a TOTAL row; the employee count excludes it.
  const payrollEmployeeCount = Math.max(0, payrollTable.rows.length - 1);
  const payrollTotalCost = payrollTable.rows.length > 0
    ? payrollTable.rows[payrollTable.rows.length - 1][11]
    : '0.000';

  const flaggedLeaveRows = useMemo(
    () => leaveTable.rows.filter((r) => r[6] === 'EXHAUSTED' || r[6] === 'LOW').length,
    [leaveTable],
  );

  const openPreview = (title, table, onDownload) =>
    setModal({ title, table, printable: false, onDownload });
  const openPrint = (title, table, onDownload) =>
    setModal({ title, table, printable: true, onDownload });

  // Download callbacks (shared by cards and the modal).
  const dlStaffMaster = () =>
    downloadReport(staffMasterReport(employees, { includeSalary: includeSalary && canSeeSalary }));
  const dlHeadcount = () => downloadReport(headcountReport(employees));
  const dlLeave = () => downloadReport(leaveBalancesReport(employees));
  const dlPayroll = () => downloadReport(payrollSummaryReport(employees, gosiRates));
  const dlMoe = () => downloadReport(moeTeacherRosterReport(employees));
  const dlCompleteness = () => downloadReport(dataCompletenessReport(employees));
  const dlJoiners = () => {
    if (jlValid) downloadReport(joinersLeaversReport(employees, jlFromDate, jlToDate));
  };
  const dlEmergency = () => downloadReport(emergencyContactReport(employees));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">HR Reports</h2>
        <p className="text-sm text-slate-500">
          Generate the monthly + on-demand reports HR needs for Bahrain compliance, payroll, and people ops.
        </p>
      </div>

      <ReportSection title="Government & Compliance">
        <ReportCard
          icon={ShieldCheck}
          color="bg-emerald-100 text-emerald-600"
          title="GOSI Monthly Submission"
          description={`All active employees for GOSI portal upload. Rates: Bahraini ${pct(gosiRates.bahraini.employeeRate)} employee + ${pct(gosiRates.bahraini.employerRate)} employer, expat ${pct(gosiRates.expat.employeeRate)} + ${pct(gosiRates.expat.employerRate)}.`}
          stats={[
            { label: 'Employees included', value: `${gosiStats.count} (${gosiStats.bahrainiCount} Bahraini / ${gosiStats.expatCount} expat)` },
            { label: 'Total basic payroll', value: fmtBHD(gosiStats.totalBasic) },
            { label: 'Employee contributions', value: fmtBHD(gosiStats.employeeTotal) },
            { label: 'Employer contributions', value: fmtBHD(gosiStats.employerTotal) },
          ]}
          onDownload={() => downloadReport(gosiSubmissionReport(employees, gosiRates))}
          disabled={gosiStats.count === 0}
          disabledReason="No active employees with basic salary set"
        />

        <ReportCard
          icon={Banknote}
          color="bg-blue-100 text-blue-600"
          title="WPS LMRA CSV (approximation)"
          description="Monthly payroll for upload via the LMRA EMS portal (Bahrain WPS 2.0). Map columns to the latest LMRA template."
          stats={[
            { label: 'Payable employees', value: wpsStats.count },
            { label: 'Total gross payroll', value: fmtBHD(wpsStats.totalGross) },
            { label: 'Skipped (no IBAN/salary)', value: wpsStats.ineligible },
          ]}
          onDownload={() => downloadReport(wpsLmraReport(employees))}
          disabled={wpsStats.count === 0}
          disabledReason="No employees with valid IBAN and salary"
        />

        <ReportCard
          icon={AlertTriangle}
          color={expiryStats.critical > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}
          title="Expiry Watchlist"
          description="All documents expiring in the next 90 days: CPR, passport, RP, MOE approval, teaching license, contracts."
          stats={[
            { label: 'Total items expiring', value: expiryStats.total },
            { label: 'Already expired', value: expiryStats.critical },
          ]}
          onDownload={() => downloadReport(expiryWatchlistReport(employees))}
          disabled={expiryStats.total === 0}
          disabledReason="Nothing expiring in the next 90 days"
        />

        <ReportCard
          icon={GraduationCap}
          color="bg-sky-100 text-sky-600"
          title="MOE Teacher Roster"
          description="Inspection-ready roster: EN+AR names, CPR, subjects, grades, MOE approval + expiry, license, experience."
          stats={[{ label: 'Active teachers', value: moeTable.rows.length }]}
          onDownload={dlMoe}
          onPreview={() => openPreview('MOE Teacher Roster', moeTable, dlMoe)}
          onPrint={() => openPrint('MOE Teacher Roster', moeTable, dlMoe)}
          disabled={moeTable.rows.length === 0}
          disabledReason="No approved teachers on file"
        />
      </ReportSection>

      <ReportSection title="People">
        <ReportCard
          icon={ClipboardList}
          color="bg-slate-200 text-slate-600"
          title="Staff Master"
          description="Everything about everyone: identity, contact, employment, and teacher fields for every employee on file."
          stats={[{ label: 'Employees (all statuses)', value: employees.length }]}
          controls={
            canSeeSalary && (
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSalary}
                  onChange={(e) => setIncludeSalary(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Include salary columns
              </label>
            )
          }
          onDownload={dlStaffMaster}
          onPreview={() => openPreview('Staff Master', staffMasterTable, dlStaffMaster)}
          disabled={employees.length === 0}
          disabledReason="No employees on file"
        />

        <ReportCard
          icon={PieChart}
          color="bg-violet-100 text-violet-600"
          title="Headcount & Demographics"
          description="Monthly management summary: department, role, nationality (with Bahrainization %), gender, contract type, age bands, tenure."
          stats={[{ label: 'Active headcount', value: activeCount }]}
          onDownload={dlHeadcount}
          onPreview={() => openPreview('Headcount & Demographics', headcountTable, dlHeadcount)}
          disabled={activeCount === 0}
          disabledReason="No approved employees"
        />

        <ReportCard
          icon={ListChecks}
          color="bg-amber-100 text-amber-600"
          title="Data Completeness"
          description="Whose file is missing what: IBAN, Arabic name, CPR, passport, RP, emergency contact, DOB, contract fields, documents. Worst first."
          stats={[{ label: 'Employees with gaps', value: completenessTable.rows.length }]}
          onDownload={dlCompleteness}
          onPreview={() => openPreview('Data Completeness', completenessTable, dlCompleteness)}
          disabled={completenessTable.rows.length === 0}
          disabledReason="All employee files are complete"
        />

        <ReportCard
          icon={Phone}
          color="bg-rose-100 text-rose-600"
          title="Emergency Contact Sheet"
          description="Crisis preparedness: local emergency contact for everyone, plus home-country contact for expat staff. Printable."
          stats={[{ label: 'Active employees', value: emergencyTable.rows.length }]}
          onDownload={dlEmergency}
          onPreview={() => openPreview('Emergency Contact Sheet', emergencyTable, dlEmergency)}
          onPrint={() => openPrint('Emergency Contact Sheet', emergencyTable, dlEmergency)}
          disabled={emergencyTable.rows.length === 0}
          disabledReason="No approved employees"
        />
      </ReportSection>

      <ReportSection title="Money">
        <ReportCard
          icon={Wallet}
          color="bg-emerald-100 text-emerald-600"
          title="Payroll Summary"
          description="Monthly payroll cost per employee: gross, GOSI deduction, net pay, employer GOSI, and total cost with grand totals."
          stats={[
            { label: 'Employees included', value: payrollEmployeeCount },
            { label: 'Total monthly cost', value: `BHD ${payrollTotalCost}` },
          ]}
          onDownload={dlPayroll}
          onPreview={() => openPreview('Payroll Summary', payrollTable, dlPayroll)}
          disabled={payrollEmployeeCount === 0}
          disabledReason="No approved employees with basic salary set"
        />

        <ReportCard
          icon={FileText}
          color="bg-indigo-100 text-indigo-600"
          title="EOSG Liability Report"
          description="End-of-Service Gratuity liability per Bahrain Labour Law 2012 — for the school's financial statements."
          stats={[
            { label: 'Eligible employees', value: eosgStats.eligible },
            { label: 'Total accrued liability', value: fmtBHD(eosgStats.totalLiability) },
          ]}
          onDownload={() => downloadReport(eosgLiabilityReport(employees))}
          disabled={eosgStats.eligible === 0}
          disabledReason="No employees with computed EOSG"
        />
      </ReportSection>

      <ReportSection title="Movements & Leave">
        <ReportCard
          icon={ArrowLeftRight}
          color="bg-teal-100 text-teal-600"
          title="Joiners & Leavers"
          description="GOSI/LMRA monthly reconciliation: who joined (date of joining) and who left (separation date + reason) in the range."
          stats={[
            { label: 'Joined in range', value: joinedCount },
            { label: 'Left in range', value: leftCount },
          ]}
          controls={
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <label className="flex items-center gap-1.5">
                From
                <input
                  type="date"
                  value={jlFrom}
                  onChange={(e) => setJlFrom(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
              </label>
              <label className="flex items-center gap-1.5">
                To
                <input
                  type="date"
                  value={jlTo}
                  onChange={(e) => setJlTo(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                />
              </label>
            </div>
          }
          onDownload={dlJoiners}
          onPreview={() =>
            joinersTable && openPreview('Joiners & Leavers', joinersTable, dlJoiners)
          }
          disabled={!jlValid}
          disabledReason="Pick a valid date range (From must not be after To)"
        />

        <ReportCard
          icon={CalendarDays}
          color="bg-cyan-100 text-cyan-600"
          title="Leave Balances & Utilization"
          description="Per employee per leave type: entitled, used, and remaining days — with exhausted and low-balance flags."
          stats={[
            { label: 'Balance rows', value: leaveTable.rows.length },
            { label: 'Flagged (low/exhausted)', value: flaggedLeaveRows },
          ]}
          onDownload={dlLeave}
          onPreview={() => openPreview('Leave Balances & Utilization', leaveTable, dlLeave)}
          disabled={leaveTable.rows.length === 0}
          disabledReason="No approved employees"
        />
      </ReportSection>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
        <AlertTriangle size={20} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-bold mb-1">Before submitting GOSI or WPS</p>
          <p className="text-amber-700">
            These CSVs include the universally required fields. Bahrain GOSI and LMRA WPS templates
            change periodically — open the CSV in Excel, map columns to the latest official template,
            then upload via the relevant portal. Always cross-check totals before final submission.
          </p>
        </div>
      </div>

      {modal && (
        <ReportModal
          title={modal.title}
          table={modal.table}
          printable={modal.printable}
          onDownload={modal.onDownload}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
