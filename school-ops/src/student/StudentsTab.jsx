// SIS Students — searchable/filterable roster for the selected year, joining
// year metrics (overall, attendance) with the latest-year risk flag (tier +
// Progress Index). Row click opens the per-student profile drawer.

import React, { useMemo, useState } from 'react';
import { Loader2, Search, GraduationCap } from 'lucide-react';
import { useStudents } from '../data/useStudents';
import { useStudentYearMetrics } from '../data/useStudentYearMetrics';
import { useRiskFlags } from '../data/useRiskFlags';
import RiskBadge from './RiskBadge';
import StudentProfileDrawer from './StudentProfileDrawer';
import { fmtPct, fmtPi, piColor, isNum } from './format';

export default function StudentsTab({ actor, year }) {
  const { data: students = [] } = useStudents(actor);
  const { data: yearMetrics = [], isLoading } = useStudentYearMetrics(actor);
  const { data: riskFlags = [] } = useRiskFlags(actor);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const nameById = useMemo(() => new Map(students.map((s) => [String(s.studentId), s.name])), [students]);
  // Latest-year risk flag per student (one doc per student).
  const riskById = useMemo(() => new Map(riskFlags.map((r) => [String(r.studentId), r])), [riskFlags]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return yearMetrics
      .filter((m) => m.year === year)
      .map((m) => {
        const risk = riskById.get(String(m.studentId)) || null;
        return {
          id: m.id,
          studentId: m.studentId,
          name: nameById.get(String(m.studentId)) || '',
          grade: m.grade,
          section: m.section,
          overall: m.overall,
          daysAbsent: m.daysAbsent,
          absenceRate: m.absenceRate,
          progressIndex: risk?.progressIndex ?? null,
          tier: risk?.tier ?? null,
          signals: risk?.signals ?? '',
        };
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q) || String(r.studentId).includes(q))
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  }, [yearMetrics, year, riskById, nameById, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 max-w-sm">
        <Search size={16} className="text-slate-400" />
        <input
          type="text"
          placeholder="Search name or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 outline-none text-sm text-slate-700 placeholder-slate-400 bg-transparent"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-500">ID</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Grade</th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-right">Overall</th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-right">Progress</th>
                <th className="px-4 py-3 font-semibold text-slate-500 text-right">Absences</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-slate-500">{r.studentId}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.name || `#${r.studentId}`}</td>
                  <td className="px-4 py-3 text-slate-600">{r.grade != null ? `${r.grade}${r.section || ''}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-700">{fmtPct(r.overall)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${piColor(r.progressIndex)}`}>{fmtPi(r.progressIndex)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{isNum(r.daysAbsent) ? r.daysAbsent : '—'}</td>
                  <td className="px-4 py-3">{r.tier ? <RiskBadge tier={r.tier} /> : <span className="text-slate-300">—</span>}</td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    <GraduationCap size={32} className="mx-auto mb-2 opacity-40" />
                    No students for {year}{search ? ' matching your search' : ''}.
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600 mx-auto" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <StudentProfileDrawer actor={actor} student={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
