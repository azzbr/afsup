// Public landing — submit a new maintenance ticket. Available to everyone,
// authenticated or anonymous. Signed-in (non-anonymous) users also see a
// compact "My Reports" list of their own tickets below the form.

import React from 'react';
import { MapPin } from 'lucide-react';
import ReportForm from '../components/ReportForm';
import { useRouteContext } from './guards';
import { useTickets } from '../data/useTickets';
import { shortRef } from '../maintenance/ticketUtils';

const STATUS_STYLES = {
  open: { cls: 'bg-red-50 text-red-700 border-red-200', label: 'Open' },
  in_progress: { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'In Progress' },
  resolved: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Resolved' },
  duplicate: { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Duplicate' }
};

function timeAgo(date) {
  if (!(date instanceof Date)) return '';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function MyReports({ actor, uid }) {
  const { data: tickets } = useTickets(actor);

  // useTickets returns ALL tickets for actors with ticket.view.all, so
  // client-filter down to the viewer's own reports either way.
  const myTickets = (tickets || [])
    .filter((t) => t.reportedBy === uid)
    .sort((a, b) => {
      const aMs = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const bMs = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return bMs - aMs;
    })
    .slice(0, 15);

  return (
    <div id="my-reports" className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-lg font-semibold text-slate-900">My Reports</h2>
        <p className="text-sm text-slate-500">Your most recent maintenance requests.</p>
      </div>

      {myTickets.length === 0 ? (
        <p className="p-6 text-sm text-slate-400">No reports yet. Submitted requests will show up here.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {myTickets.map((ticket) => {
            const status = STATUS_STYLES[ticket.status] || STATUS_STYLES.open;
            return (
              <div key={ticket.id} className="px-6 py-3.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-slate-400 shrink-0">{shortRef(ticket.id)}</span>
                    <span className="text-sm font-medium text-slate-800">{ticket.category}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                    <MapPin size={11} className="text-slate-400 shrink-0" />
                    <span>{ticket.location}</span>
                    <span className="text-slate-300">&middot;</span>
                    <span>{timeAgo(ticket.createdAt)}</span>
                  </div>
                  {ticket.status === 'resolved' && ticket.completionNotes && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 mt-1.5">
                      {ticket.completionNotes}
                    </p>
                  )}
                </div>
                <span className={`inline-flex shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border ${status.cls}`}>
                  {status.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StaffRoute() {
  const { user, actor } = useRouteContext();
  const isReal = Boolean(user && !user.isAnonymous);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-900">Submit New Request</h2>
          <p className="text-sm text-slate-500">Please describe the issue.</p>
        </div>
        <div className="p-6">
          <ReportForm user={user} />
        </div>
      </div>

      {isReal && <MyReports actor={actor} uid={user.uid} />}
    </div>
  );
}
