// SIS Cohort Analysis — cross-sectional views from sis_analytics: the subject×
// grade difficulty heatmap (where the curriculum gets hard), section equity gaps,
// and the term-2 slump per subject. All pooled across years. Read-only.

import React, { useMemo } from 'react';
import { Loader2, AlertTriangle, GraduationCap } from 'lucide-react';
import { useSisAnalytics } from '../data/useSisAnalytics';
import { fmtNum, scoreToHeat, isNum } from './format';

function Card({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <h3 className="font-bold text-slate-800">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5 mb-3">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}

export default function CohortAnalysisTab({ actor }) {
  const { data: analytics, isLoading, error } = useSisAnalytics(actor);

  const heat = useMemo(() => {
    const grid = analytics?.bottleneckGrid ?? [];
    const grades = [...new Set(grid.map((c) => c.grade))].sort((a, b) => a - b);
    const subjects = [...new Set(grid.map((c) => c.subject))].sort();
    const meanByKey = new Map(grid.map((c) => [`${c.subject}|${c.grade}`, c.mean]));
    return { grades, subjects, meanByKey };
  }, [analytics]);

  const slumpMax = useMemo(
    () => Math.max(1, ...(analytics?.termSlump ?? []).map((t) => Math.abs(t.avgT2MinusT1 ?? 0))),
    [analytics],
  );

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
        <p className="text-sm text-red-700">{error.message}</p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }
  if (!analytics) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-slate-400">
        <GraduationCap size={40} className="mb-3 opacity-40" />
        <p className="text-sm font-medium text-slate-500">No data yet — import a workbook.</p>
      </div>
    );
  }

  const flaggedSpread = [...analytics.sectionSpread].sort((a, b) => b.gap - a.gap);

  return (
    <div className="space-y-4">
      <Card title="Curriculum difficulty (subject × grade)" subtitle="Mean annual score pooled across years — red is where it gets hard.">
        {heat.subjects.length === 0 ? (
          <p className="text-sm text-slate-400">No data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-slate-200 px-3 py-2 bg-slate-50 text-left font-semibold text-slate-500">Subject</th>
                  {heat.grades.map((g) => (
                    <th key={g} className="border border-slate-200 px-3 py-2 bg-slate-50 font-semibold text-slate-500">G{g}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.subjects.map((subject) => (
                  <tr key={subject}>
                    <td className="border border-slate-200 px-3 py-2 font-medium text-slate-700 bg-slate-50">{subject}</td>
                    {heat.grades.map((g) => {
                      const v = heat.meanByKey.get(`${subject}|${g}`);
                      return (
                        <td key={g} className={`border border-slate-200 px-3 py-2 text-center font-bold ${scoreToHeat(v)}`}>
                          {isNum(v) ? v.toFixed(1) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Section equity" subtitle="Spread between sections within a (year, grade, subject). Composition differs — a prompt to investigate, not proof.">
          {flaggedSpread.length === 0 ? (
            <p className="text-sm text-slate-400">No multi-section groups.</p>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-slate-500">Year / Grade / Subject</th>
                    <th className="px-3 py-2 font-semibold text-slate-500 text-right">Gap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {flaggedSpread.slice(0, 40).map((s, i) => (
                    <tr key={`${s.year}-${s.grade}-${s.subject}-${i}`} className={s.flag ? 'bg-amber-50/40' : ''}>
                      <td className="px-3 py-2 text-slate-700">{s.year} · G{s.grade} · {s.subject}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${s.flag ? 'text-amber-700' : 'text-slate-600'}`}>
                        {fmtNum(s.gap)}{s.flag ? ' ⚑' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Term-2 slump by subject" subtitle="Mean (T2 − T1). Negative = second-term decline.">
          {analytics.termSlump.length === 0 ? (
            <p className="text-sm text-slate-400">No data.</p>
          ) : (
            <div className="space-y-2">
              {analytics.termSlump.map((t) => {
                const v = t.avgT2MinusT1 ?? 0;
                const pct = (Math.abs(v) / slumpMax) * 50;
                return (
                  <div key={t.subject} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 text-slate-600 truncate">{t.subject}</span>
                    <div className="flex-1 flex items-center">
                      <div className="w-1/2 flex justify-end">
                        {v < 0 && <div className="h-3 rounded-l bg-red-400" style={{ width: `${pct}%` }} />}
                      </div>
                      <div className="w-px h-4 bg-slate-300" />
                      <div className="w-1/2">
                        {v > 0 && <div className="h-3 rounded-r bg-emerald-400" style={{ width: `${pct}%` }} />}
                      </div>
                    </div>
                    <span className={`w-12 text-right font-semibold ${v < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtNum(v)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
