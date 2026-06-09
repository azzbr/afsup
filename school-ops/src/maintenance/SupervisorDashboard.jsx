import React, { useMemo } from 'react';
import { Building2, Repeat, Timer, Users, AlertTriangle } from 'lucide-react';
import {
  isActiveTicket, buildingOf, BUILDING_LABELS, groupForCategory,
  categoryGroupLabel, averageResolutionHours,
} from './ticketUtils';

const BUILDING_ORDER = ['B3', 'B4', 'B5', 'Admin', 'Other'];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const REPEAT_THRESHOLD = 3;

// Clock reads stay out of component render (react-hooks/purity), mirroring
// how getTimeOpen in ticketUtils reads Date.now internally.
const withinLastWeek = (d) => d instanceof Date && Date.now() - d.getTime() <= WEEK_MS;

const formatDuration = (hours) => {
  if (hours == null) return 'N/A';
  if (hours < 1) return '<1h';
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
};

const InsightCard = ({ icon, title, subtitle, children }) => {
  const Icon = icon;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-indigo-600" />
        <h3 className="font-bold text-slate-800">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
};

const EmptyNote = ({ text }) => (
  <p className="text-sm text-slate-400 text-center py-6">{text}</p>
);

// Label + count + proportional horizontal bar (no chart library).
const BarRow = ({ label, count, max, detail }) => (
  <div>
    <div className="flex items-center justify-between gap-2 text-xs mb-1">
      <span className="font-medium text-slate-600 truncate">{label}</span>
      <span className="font-bold text-slate-700 whitespace-nowrap">
        {count}
        {detail && <span className="font-normal text-slate-400 ml-1">{detail}</span>}
      </span>
    </div>
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-indigo-500 rounded-full"
        style={{ width: `${max > 0 ? Math.max((count / max) * 100, 4) : 0}%` }}
      />
    </div>
  </div>
);

// Pure client-side insights computed from the already-subscribed tickets prop.
export default function SupervisorDashboard({ tickets = [] }) {
  const { buildingCounts, repeatOffenders, resolutionByGroup, weeklyByTechnician } = useMemo(() => {
    const active = tickets.filter(isActiveTicket);
    const resolved = tickets.filter(t => t.status === 'resolved');

    // (a) Active tickets per building, in walk order.
    const byBuilding = new Map();
    for (const t of active) {
      const key = buildingOf(t.location || '');
      byBuilding.set(key, (byBuilding.get(key) || 0) + 1);
    }
    const buildingCounts = BUILDING_ORDER
      .filter(key => byBuilding.has(key))
      .map(key => ({ key, label: BUILDING_LABELS[key], count: byBuilding.get(key) }));

    // (b) Repeat offenders: locations with 3+ active tickets OR 3+ tickets
    // created in the last 7 days. Duplicates and cancellations don't count.
    const perLocation = new Map();
    for (const t of tickets) {
      if (!isActiveTicket(t) && t.status !== 'resolved') continue;
      const loc = t.location || 'Unknown';
      const entry = perLocation.get(loc) || { active: 0, recent: 0 };
      if (isActiveTicket(t)) entry.active++;
      if (withinLastWeek(t.createdAt)) entry.recent++;
      perLocation.set(loc, entry);
    }
    const repeatOffenders = [...perLocation.entries()]
      .filter(([, c]) => c.active >= REPEAT_THRESHOLD || c.recent >= REPEAT_THRESHOLD)
      .map(([location, c]) => ({ location, ...c }))
      .sort((a, b) => Math.max(b.active, b.recent) - Math.max(a.active, a.recent));

    // (c) Average resolution time per category group over resolved tickets.
    const byGroup = new Map();
    for (const t of resolved) {
      const key = t.categoryGroup || groupForCategory(t.category || '');
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(t);
      else byGroup.set(key, [t]);
    }
    const resolutionByGroup = [...byGroup.entries()]
      .map(([key, group]) => ({
        key,
        label: categoryGroupLabel(key),
        count: group.length,
        avgHours: averageResolutionHours(group),
      }))
      .filter(g => g.avgHours != null)
      .sort((a, b) => b.avgHours - a.avgHours);

    // (d) Resolved in the last 7 days, per technician.
    const byTech = new Map();
    for (const t of resolved) {
      if (!withinLastWeek(t.resolvedAt)) continue;
      const name = t.assignedToName || t.resolvedBy || t.resolvedByUid || t.completedBy || 'Unknown';
      byTech.set(name, (byTech.get(name) || 0) + 1);
    }
    const weeklyByTechnician = [...byTech.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { buildingCounts, repeatOffenders, resolutionByGroup, weeklyByTechnician };
  }, [tickets]);

  const maxBuildingCount = buildingCounts.reduce((max, b) => Math.max(max, b.count), 0);
  const maxTechCount = weeklyByTechnician.reduce((max, t) => Math.max(max, t.count), 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InsightCard icon={Building2} title="Open by Building" subtitle="Active tickets per building">
        {buildingCounts.length === 0 ? (
          <EmptyNote text="No active tickets right now." />
        ) : (
          <div className="space-y-3">
            {buildingCounts.map(b => (
              <BarRow key={b.key} label={b.label} count={b.count} max={maxBuildingCount} />
            ))}
          </div>
        )}
      </InsightCard>

      <InsightCard icon={Repeat} title="Repeat Offenders" subtitle="Locations with 3+ active tickets or 3+ reports in 7 days">
        {repeatOffenders.length === 0 ? (
          <EmptyNote text="No recurring problem locations. Good sign." />
        ) : (
          <div className="space-y-2">
            {repeatOffenders.map(o => (
              <div key={o.location} className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700 truncate">{o.location}</span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {o.active} active / {o.recent} in 7d
                  </span>
                </div>
                <p className="text-xs text-amber-700 font-medium mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} /> recurring - consider root-cause fix
                </p>
              </div>
            ))}
          </div>
        )}
      </InsightCard>

      <InsightCard icon={Timer} title="Average Resolution Time" subtitle="By category group, over resolved tickets">
        {resolutionByGroup.length === 0 ? (
          <EmptyNote text="No resolved tickets to measure yet." />
        ) : (
          <div className="divide-y divide-slate-100">
            {resolutionByGroup.map(g => (
              <div key={g.key} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{g.label}</p>
                  <p className="text-[11px] text-slate-400">{g.count} resolved</p>
                </div>
                <span className="px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-bold whitespace-nowrap">
                  {formatDuration(g.avgHours)}
                </span>
              </div>
            ))}
          </div>
        )}
      </InsightCard>

      <InsightCard icon={Users} title="This Week by Technician" subtitle="Tickets resolved in the last 7 days">
        {weeklyByTechnician.length === 0 ? (
          <EmptyNote text="Nothing resolved in the last 7 days." />
        ) : (
          <div className="space-y-3">
            {weeklyByTechnician.map(t => (
              <BarRow key={t.name} label={t.name} count={t.count} max={maxTechCount} />
            ))}
          </div>
        )}
      </InsightCard>
    </div>
  );
}
