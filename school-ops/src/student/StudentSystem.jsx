// Student System (SIS) view shell — see SIS/CLAUDE.md.
//
// Phase 0 is the empty, native-looking shell: KPI placeholder cards, a tab bar,
// and an academic-year selector. No data hooks, no real values, no import yet —
// those land in Phases 1+. UI patterns are copied from AdminView.jsx so the
// module looks native.

import React, { useState } from 'react';
import { GraduationCap, Users, AlertTriangle, TrendingUp, Layers, Upload } from 'lucide-react';

// Placeholder academic-year options. Real years come from imported data later
// (golden rule: do not hardcode years in logic — these are display-only stubs).
const YEAR_OPTIONS = ['2025-2026', '2024-2025', '2023-2024'];

const KPI_CARDS = [
  { label: 'Total Students', icon: GraduationCap, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
  { label: 'Tracked Cohort', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  { label: 'At-Risk', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
  { label: 'Avg Attainment %', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
];

const TABS = [
  { id: 'overview', label: 'Overview', icon: GraduationCap },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'cohort', label: 'Cohort Analysis', icon: Layers },
  { id: 'early_warning', label: 'Early Warning', icon: AlertTriangle },
  { id: 'import', label: 'Import', icon: Upload },
];

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 text-slate-400">
      <GraduationCap size={40} className="mb-3 opacity-40" />
      <p className="text-sm font-medium text-slate-500">No data yet — import a workbook.</p>
    </div>
  );
}

export default function StudentSystem() {
  const [activeTab, setActiveTab] = useState('overview');
  const [academicYear, setAcademicYear] = useState(YEAR_OPTIONS[0]);

  return (
    <div className="space-y-6">

      {/* --- Header row: KPI context + year selector --- */}
      <div className="flex items-center justify-end">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Academic Year
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      {/* --- KPI Cards (placeholders in Phase 0) --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPI_CARDS.map((card) => (
          <div key={card.label} className={`p-4 rounded-2xl border ${card.bg} ${card.border}`}>
            <p className={`text-2xl font-bold ${card.color}`}>—</p>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{card.label}</p>
          </div>
        ))}
      </div>

      {/* --- Tabs --- */}
      <div className="flex gap-2 border-b border-slate-200 pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* --- Content: every tab is empty in Phase 0 --- */}
      <div className="bg-white rounded-2xl border border-slate-200">
        <EmptyState />
      </div>
    </div>
  );
}
