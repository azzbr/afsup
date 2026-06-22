// Student System (SIS) shell — see SIS/CLAUDE.md. KPI cards + academic-year
// selector + tab bar, then the active tab's content. KPIs and the year list are
// data-driven from sis_analytics/current; the four data tabs read the sis_*
// collections (admin-tier only). Import tab is Head-Admin gated inside ImportTab.

import React, { useState } from 'react';
import { GraduationCap, Users, AlertTriangle, TrendingUp, Layers, Upload } from 'lucide-react';
import { useSisAnalytics } from '../data/useSisAnalytics';
import { fmtPct } from './format';
import OverviewTab from './OverviewTab';
import StudentsTab from './StudentsTab';
import CohortAnalysisTab from './CohortAnalysisTab';
import EarlyWarningTab from './EarlyWarningTab';
import ImportTab from './ImportTab';

const TABS = [
  { id: 'overview', label: 'Overview', icon: GraduationCap },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'cohort', label: 'Cohort Analysis', icon: Layers },
  { id: 'early_warning', label: 'Early Warning', icon: AlertTriangle },
  { id: 'import', label: 'Import', icon: Upload },
];

const KPI_META = [
  { key: 'totalStudents', label: 'Total Students', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
  { key: 'trackedCohort', label: 'Tracked Cohort', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  { key: 'atRisk', label: 'At-Risk', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
  { key: 'avgAttainment', label: 'Avg Attainment %', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
];

export default function StudentSystem({ actor }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [yearOverride, setYearOverride] = useState(null);
  const { data: analytics } = useSisAnalytics(actor);

  const years = analytics?.years ?? [];
  const year = yearOverride ?? analytics?.latestYear ?? years[years.length - 1] ?? '';
  const kpis = analytics?.kpis;

  const kpiValue = (k) => {
    if (!kpis) return '—';
    if (k === 'avgAttainment') return fmtPct(kpis.avgAttainment);
    return kpis[k] ?? '—';
  };

  return (
    <div className="space-y-6">
      {/* --- Header row: year selector --- */}
      <div className="flex items-center justify-end">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Academic Year
          <select
            value={year}
            onChange={(e) => setYearOverride(e.target.value)}
            disabled={years.length === 0}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm disabled:opacity-50"
          >
            {years.length === 0 ? (
              <option value="">—</option>
            ) : (
              years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))
            )}
          </select>
        </label>
      </div>

      {/* --- KPI Cards (live from sis_analytics) --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPI_META.map((card) => (
          <div key={card.key} className={`p-4 rounded-2xl border ${card.bg} ${card.border}`}>
            <p className={`text-2xl font-bold ${card.color}`}>{kpiValue(card.key)}</p>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{card.label}</p>
          </div>
        ))}
      </div>

      {/* --- Tabs --- */}
      <div className="flex gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* --- Content --- */}
      {activeTab === 'overview' && <OverviewTab actor={actor} />}
      {activeTab === 'students' && <StudentsTab actor={actor} year={year} />}
      {activeTab === 'cohort' && <CohortAnalysisTab actor={actor} />}
      {activeTab === 'early_warning' && <EarlyWarningTab actor={actor} />}
      {activeTab === 'import' && <ImportTab actor={actor} />}
    </div>
  );
}
