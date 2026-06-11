// /audit-log — read-only viewer over the append-only audit_log collection
// (Phase 2.9b).
//
// Route access is gated by RequireAction "audit.read" in router.tsx. The
// data scope itself (HR/admin see non-admin-tier entries only, Head Admin
// sees everything) is enforced twice: by the query shape in useAuditLog and
// server-side by firestore.rules. This component just renders whatever the
// hook is allowed to stream.

import React, { useMemo, useState } from 'react';
import { ScrollText, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

import { can } from '../permissions';
import { useAuditLog } from '../data/useAuditLog';
import { useUsers } from '../data/useUsers';
import { useRouteContext } from './guards';

const PAGE_SIZE = 50;

const TARGET_TYPE_LABELS = {
  user: 'User',
  ticket: 'Ticket',
  leave_request: 'Leave request',
  scheduled_task: 'Scheduled task',
  invitation: 'Invitation',
  school_settings: 'School settings',
};

function fmtTimestamp(d) {
  if (!(d instanceof Date)) return 'Just now';
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function DiffBlock({ label, value }) {
  if (value === undefined) return null;
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words text-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function AuditEntryRow({ entry, actorName }) {
  const [open, setOpen] = useState(false);
  const hasDetail =
    entry.before !== undefined || entry.after !== undefined || entry.metadata !== undefined;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl">
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        className={`w-full text-left p-4 flex items-start gap-3 ${hasDetail ? 'cursor-pointer hover:bg-slate-50 rounded-2xl' : 'cursor-default'}`}
      >
        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <ScrollText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
              {entry.action}
            </code>
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {TARGET_TYPE_LABELS[entry.targetType] || entry.targetType}
            </span>
            {entry.targetAdminTier === true && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                Admin tier
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-1">
            By <span className="font-medium text-slate-800">{actorName}</span>
            {entry.targetId && (
              <>
                {' '}on <code className="text-xs bg-slate-50 px-1 py-0.5 rounded">{entry.targetId}</code>
              </>
            )}
          </p>
          <p className="text-xs text-slate-400 mt-1">{fmtTimestamp(entry.at)}</p>
        </div>
        {hasDetail && (
          <span className="text-slate-300 shrink-0 mt-2">
            {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </span>
        )}
      </button>

      {open && hasDetail && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 flex flex-col md:flex-row gap-3">
          <DiffBlock label="Before" value={entry.before} />
          <DiffBlock label="After" value={entry.after} />
          <DiffBlock label="Metadata" value={entry.metadata} />
        </div>
      )}
    </div>
  );
}

export default function AuditLogRoute() {
  const { actor } = useRouteContext();
  const [max, setMax] = useState(PAGE_SIZE);
  const [actionFilter, setActionFilter] = useState('all');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');

  const { data: entries = [], isLoading } = useAuditLog(actor, max);
  const { data: users = [] } = useUsers(actor, Boolean(actor));

  const nameByUid = useMemo(() => {
    const m = new Map();
    for (const u of users) m.set(u.uid, u.displayName || u.email || u.uid);
    return m;
  }, [users]);

  const actorNameOf = (entry) => {
    if (entry.actorUid === 'system') return 'System';
    return nameByUid.get(entry.actorUid) || entry.actorUid || 'Unknown';
  };

  // Filter options derive from the loaded entries so the dropdown only ever
  // offers actions that actually exist in the visible scope.
  const actionOptions = useMemo(
    () => [...new Set(entries.map((e) => e.action))].sort(),
    [entries],
  );

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (actionFilter === 'all' || e.action === actionFilter) &&
          (targetTypeFilter === 'all' || e.targetType === targetTypeFilter),
      ),
    [entries, actionFilter, targetTypeFilter],
  );

  const seesAll = can(actor, 'audit.readAll');
  // The subscription is capped at `max`; when it comes back full there are
  // probably older entries beyond the cap.
  const mayHaveMore = entries.length >= max;

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Audit Log</h1>
        <p className="text-slate-500 mt-1">
          {seesAll
            ? 'Every recorded action, including those about admin-tier users. Newest first.'
            : 'Recorded actions about non-admin users. Admin-tier entries are visible to the Head Admin only.'}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700"
        >
          <option value="all">All actions</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={targetTypeFilter}
          onChange={(e) => setTargetTypeFilter(e.target.value)}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700"
        >
          <option value="all">All target types</option>
          {Object.entries(TARGET_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {(actionFilter !== 'all' || targetTypeFilter !== 'all') && (
          <span className="self-center text-xs text-slate-400">
            {filtered.length} of {entries.length} loaded entries match
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading audit log…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <ScrollText size={48} className="text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-700">No entries</p>
          <p className="text-sm text-slate-500 mt-1">
            {entries.length === 0
              ? 'Nothing has been recorded in your visible scope yet.'
              : 'No loaded entries match the current filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <AuditEntryRow key={entry.id} entry={entry} actorName={actorNameOf(entry)} />
          ))}
        </div>
      )}

      {!isLoading && mayHaveMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setMax((m) => m + PAGE_SIZE)}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-sm font-medium text-slate-700"
          >
            Load older entries
          </button>
        </div>
      )}
    </>
  );
}
