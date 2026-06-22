// SIS Overview — cohort-trajectory line (mean overall by year), the biggest
// curriculum bottlenecks, and the top movers by PROGRESS INDEX (never raw delta).
// KPI cards live in StudentSystem (above the tabs). Read-only over sis_analytics
// + sis_student_year_metrics + sis_risk_flags + sis_students.

import React, { useMemo } from 'react';
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, GraduationCap } from 'lucide-react';
import { useSisAnalytics } from '../data/useSisAnalytics';
import { useStudentYearMetrics } from '../data/useStudentYearMetrics';
import { useRiskFlags } from '../data/useRiskFlags';
import { useStudents } from '../data/useStudents';
import { fmtNum, fmtPct, fmtPi, piColor, isNum } from './format';

// Mean overall by year, ordered (cohort trajectory points).
function trajectory(yearMetrics) {
  const byYear = new Map();
  for (const m of yearMetrics) {
    if (!isNum(m.overall)) continue;
    const e = byYear.get(m.year) || { sum: 0, n: 0 };
    e.sum += m.overall;
    e.n += 1;
    byYear.set(m.year, e);
  }
  return [...byYear.entries()]
    .map(([year, { sum, n }]) => ({ year, mean: sum / n }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

function TrajectoryChart({ points }) {
  if (points.length < 2) {
    return <p className="text-sm text-slate-400">Need at least two years of data to chart a trajectory.</p>;
  }
  const W = 480;
  const H = 120;
  const pad = 28;
  const means = points.map((p) => p.mean);
  const lo = Math.min(...means) - 2;
  const hi = Math.max(...means) + 2;
  const x = (i) => pad + (i * (W - 2 * pad)) / (points.length - 1);
  const y = (m) => H - pad - ((m - lo) / (hi - lo || 1)) * (H - 2 * pad);
  const line = points.map((p, i) => `${x(i)},${y(p.mean)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-lg" role="img" aria-label="Cohort attainment by year">
      <polyline points={line} fill="none" stroke="#4f46e5" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={p.year}>
          <circle cx={x(i)} cy={y(p.mean)} r="3.5" fill="#4f46e5" />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-500" fontSize="10">{p.year}</text>
          <text x={x(i)} y={y(p.mean) - 8} textAnchor="middle" className="fill-slate-700" fontSize="10">{p.mean.toFixed(1)}</text>
        </g>
      ))}
    </svg>
  );
}

function Card({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-indigo-600" />
        <h3 className="font-bold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function OverviewTab({ actor }) {
  const { data: analytics, isLoading, error } = useSisAnalytics(actor);
  const { data: yearMetrics = [] } = useStudentYearMetrics(actor);
  const { data: riskFlags = [] } = useRiskFlags(actor);
  const { data: students = [] } = useStudents(actor);

  const nameById = useMemo(
    () => new Map(students.map((s) => [String(s.studentId), s.name])),
    [students],
  );
  const points = useMemo(() => trajectory(yearMetrics), [yearMetrics]);
  const movers = useMemo(() => {
    const withPi = riskFlags.filter((r) => isNum(r.progressIndex));
    const sorted = [...withPi].sort((a, b) => b.progressIndex - a.progressIndex);
    return { gainers: sorted.slice(0, 5), decliners: sorted.slice(-5).reverse() };
  }, [riskFlags]);

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

  const moverRow = (r) => (
    <div key={r.id} className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-700 truncate">{nameById.get(String(r.studentId)) || `#${r.studentId}`}</span>
      <span className={`font-semibold ${piColor(r.progressIndex)}`}>{fmtPi(r.progressIndex)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Cohort attainment by year" icon={TrendingUp}>
          <TrajectoryChart points={points} />
        </Card>

        <Card title="Biggest bottlenecks" icon={TrendingDown}>
          {analytics.bottleneckDrops.length === 0 ? (
            <p className="text-sm text-slate-400">No bottlenecks computed.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {analytics.bottleneckDrops.slice(0, 5).map((d) => (
                <div key={`${d.subject}-${d.hardestStepIntoGrade}`} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-slate-700">
                    {d.subject} <span className="text-slate-400">into Grade {d.hardestStepIntoGrade}</span>
                  </span>
                  <span className="font-semibold text-red-600">{fmtNum(d.dropPoints)} pts</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Top movers (Progress Index)" icon={TrendingUp}>
          {movers.gainers.length === 0 ? (
            <p className="text-sm text-slate-400">No matched cohort yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">{movers.gainers.map(moverRow)}</div>
          )}
        </Card>

        <Card title="Falling behind (Progress Index)" icon={TrendingDown}>
          {movers.decliners.length === 0 ? (
            <p className="text-sm text-slate-400">No matched cohort yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">{movers.decliners.map(moverRow)}</div>
          )}
        </Card>
      </div>

      {analytics.attendanceSummary?.available && (
        <Card title="Attendance impact" icon={AlertTriangle}>
          <p className="text-sm text-slate-600">
            Correlation of absences with attainment:{' '}
            <strong>{fmtNum(analytics.attendanceSummary.correlation, 2)}</strong>
            {isNum(analytics.attendanceSummary.pointsPerAbsenceDay) && (
              <> · ≈ <strong>{fmtNum(analytics.attendanceSummary.pointsPerAbsenceDay, 2)}</strong> points per day absent</>
            )}
          </p>
          {analytics.attendanceBands?.length > 0 && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
              {analytics.attendanceBands.map((b) => (
                <div key={b.band} className="p-2 rounded-lg border border-slate-100 bg-slate-50 text-center">
                  <p className="text-[11px] text-slate-400">{b.band} absences</p>
                  <p className="font-bold text-slate-700">{fmtPct(b.meanOverall)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
