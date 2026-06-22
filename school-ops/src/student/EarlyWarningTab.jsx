// SIS Early Warning — the risk register leadership lives in. One row per flagged
// student (latest year) from sis_risk_flags, joined to names, filterable by tier,
// with the contributing signals and a CSV export. Read-only.

import React, { useMemo, useState } from 'react';
import { Loader2, Download, ShieldAlert } from 'lucide-react';
import { useRiskFlags } from '../data/useRiskFlags';
import { useStudents } from '../data/useStudents';
import { STUDENT_RISK_TIERS, STUDENT_RISK_LABELS } from '../sis/riskTiers';
import { toCSV, csvReport, downloadReport } from '../hr/reports';
import RiskBadge from './RiskBadge';
import { fmtPct, fmtPi, piColor, isNum } from './format';

const TIER_ORDER = Object.fromEntries(STUDENT_RISK_TIERS.map((t, i) => [t, i]));

export default function EarlyWarningTab({ actor }) {
  const { data: riskFlags = [], isLoading } = useRiskFlags(actor);
  const { data: students = [] } = useStudents(actor);
  const [activeTiers, setActiveTiers] = useState([]); // empty = all

  const nameById = useMemo(() => new Map(students.map((s) => [String(s.studentId), s.name])), [students]);

  const counts = useMemo(() => {
    const c = {};
    for (const r of riskFlags) c[r.tier] = (c[r.tier] || 0) + 1;
    return c;
  }, [riskFlags]);

  const rows = useMemo(() => {
    return riskFlags
      .filter((r) => activeTiers.length === 0 || activeTiers.includes(r.tier))
      .map((r) => ({ ...r, name: nameById.get(String(r.studentId)) || '' }))
      .sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) || (a.overall ?? 0) - (b.overall ?? 0));
  }, [riskFlags, activeTiers, nameById]);

  const toggleTier = (tier) =>
    setActiveTiers((prev) => (prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]));

  const exportCsv = () => {
    const header = ['ID', 'Name', 'Grade', 'Section', 'Overall', 'Progress Index', 'Absences', 'Tier', 'Signals'];
    const data = rows.map((r) => [
      r.studentId,
      r.name,
      r.grade ?? '',
      r.section ?? '',
      isNum(r.overall) ? r.overall.toFixed(1) : '',
      isNum(r.progressIndex) ? r.progressIndex.toFixed(2) : '',
      isNum(r.daysAbsent) ? r.daysAbsent : '',
      STUDENT_RISK_LABELS[r.tier] || r.tier,
      r.signals || '',
    ]);
    downloadReport(csvReport('sis_early_warning', toCSV([header, ...data])));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {STUDENT_RISK_TIERS.map((tier) => {
            const active = activeTiers.includes(tier);
            return (
              <button
                key={tier}
                onClick={() => toggleTier(tier)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {STUDENT_RISK_LABELS[tier]} <span className="opacity-70">({counts[tier] || 0})</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-500">Student</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Grade</th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-right">Overall</th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-right">Progress</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Tier</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800">{r.name || `#${r.studentId}`}</span>
                    <span className="text-slate-400 text-xs ml-1">{r.studentId}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.grade != null ? `${r.grade}${r.section || ''}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">{fmtPct(r.overall)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${piColor(r.progressIndex)}`}>{fmtPi(r.progressIndex)}</td>
                  <td className="px-4 py-3"><RiskBadge tier={r.tier} /></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.signals}</td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    <ShieldAlert size={32} className="mx-auto mb-2 opacity-40" />
                    {riskFlags.length === 0 ? 'No data yet — import a workbook.' : 'No students match the selected tiers.'}
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600 mx-auto" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
