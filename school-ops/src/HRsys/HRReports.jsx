// Reports tab — the actual numbers an HR officer needs every month.
//
// Each card describes a report, shows how many rows it'd contain right now,
// and offers a one-click CSV download (UTF-8 with BOM so Excel reads Arabic).
//
// All computation is client-side from the already-loaded users + EOSG math.
// For Bahrain-specific submission formats (GOSI portal, WPS SIF) the CSV is
// pragmatic — HR should map columns into the latest official template before
// upload. See hr/reports.ts for the exact field lists.

import React, { useMemo } from 'react';
import { FileText, Download, AlertTriangle, Users, Banknote, ShieldCheck } from 'lucide-react';

import { computeEOSG, totalLiability } from '../hr/eosg';
import {
  gosiSubmissionReport,
  wpsSifReport,
  expiryWatchlistReport,
  eosgLiabilityReport,
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

function ReportCard({ icon: Icon, color, title, description, stats, onDownload, disabled, disabledReason }) {
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

      <button
        type="button"
        onClick={onDownload}
        disabled={disabled}
        title={disabled ? disabledReason : 'Download CSV'}
        className="mt-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Download size={16} /> Download CSV
      </button>
    </div>
  );
}

export default function HRReports({ employees }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ninetyDays = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  const gosiStats = useMemo(() => {
    const bahrainis = employees.filter((u) => u.nationality === 'Bahraini' && num(u.basicSalary) > 0);
    const totalBasic = bahrainis.reduce((s, u) => s + num(u.basicSalary), 0);
    return {
      count: bahrainis.length,
      totalBasic,
      employee5: totalBasic * 0.05,
      employer12: totalBasic * 0.12,
    };
  }, [employees]);

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">HR Reports</h2>
        <p className="text-sm text-slate-500">Generate the monthly + on-demand reports HR needs for Bahrain compliance and accounting.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <ReportCard
          icon={ShieldCheck}
          color="bg-emerald-100 text-emerald-600"
          title="GOSI Monthly Submission"
          description="Bahraini employees with basic salary breakdown for GOSI portal upload."
          stats={[
            { label: 'Bahraini employees', value: gosiStats.count },
            { label: 'Total basic payroll', value: fmtBHD(gosiStats.totalBasic) },
            { label: 'Employee contributions (5%)', value: fmtBHD(gosiStats.employee5) },
            { label: 'Employer contributions (12%)', value: fmtBHD(gosiStats.employer12) },
          ]}
          onDownload={() => downloadReport(gosiSubmissionReport(employees))}
          disabled={gosiStats.count === 0}
          disabledReason="No Bahraini employees with basic salary set"
        />

        <ReportCard
          icon={Banknote}
          color="bg-blue-100 text-blue-600"
          title="WPS Salary Information File"
          description="Monthly payroll for bank upload. Maps to most Bahraini bank SIF templates."
          stats={[
            { label: 'Payable employees', value: wpsStats.count },
            { label: 'Total gross payroll', value: fmtBHD(wpsStats.totalGross) },
            { label: 'Skipped (no IBAN/salary)', value: wpsStats.ineligible },
          ]}
          onDownload={() => downloadReport(wpsSifReport(employees))}
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

      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800 flex items-start gap-3">
        <AlertTriangle size={20} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-bold mb-1">Before submitting GOSI or WPS</p>
          <p className="text-amber-700">
            These CSVs include the universally required fields. Bahrain GOSI and bank SIF templates
            change periodically — open the CSV in Excel, map columns to the latest official template,
            then upload. Always cross-check totals before final submission.
          </p>
        </div>
      </div>
    </div>
  );
}

// Keep a small reference to Users icon so lint doesn't strip the import in
// case we add a department breakdown later. Suppressing for now is cleaner.
void Users;
