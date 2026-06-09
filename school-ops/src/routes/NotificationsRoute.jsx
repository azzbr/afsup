// /notifications — list view with mark-as-read.
//
// Backed by useNotifications(). Tapping a notification with a `link` field
// navigates there (and marks it read en route).

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Bell, AlertTriangle, Clock, Check, ChevronRight, CalendarDays, CalendarCheck, Wrench } from 'lucide-react';

import { db } from '../firebase';
import { useNotifications } from '../data/useNotifications';
import { useRouteContext } from './guards';

// Per-type icon + label (see NotificationType in types.ts). Unknown types
// fall back to the priority icon below.
const typeMeta = {
  compliance:      { icon: AlertTriangle, label: 'Compliance' },
  leave_request:   { icon: CalendarDays,  label: 'Leave request' },
  leave_decision:  { icon: CalendarCheck, label: 'Leave decision' },
  ticket_sla:      { icon: Clock,         label: 'Ticket SLA' },
  ticket_assigned: { icon: Wrench,        label: 'Ticket assigned' },
  ticket_update:   { icon: Wrench,        label: 'Ticket update' },
  system:          { icon: Bell,          label: 'System' },
};

const priorityStyles = {
  critical: { ring: 'border-red-200 bg-red-50', icon: 'text-red-600 bg-red-100', label: 'Critical' },
  warning:  { ring: 'border-amber-200 bg-amber-50', icon: 'text-amber-600 bg-amber-100', label: 'Warning' },
  info:     { ring: 'border-slate-200 bg-slate-50', icon: 'text-slate-600 bg-slate-100', label: 'Info' },
};

function relativeTime(date) {
  if (!(date instanceof Date)) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 1) return `${days}d ago`;
  if (hrs >= 1) return `${hrs}h ago`;
  if (mins >= 1) return `${mins}m ago`;
  return 'just now';
}

export default function NotificationsRoute() {
  const { actor } = useRouteContext();
  const navigate = useNavigate();
  const { notifications, isLoading } = useNotifications(actor);

  const markRead = async (n) => {
    if (n.readAt) return;
    try {
      await updateDoc(doc(db, 'notifications', n.id), { readAt: serverTimestamp() });
    } catch (err) {
      // Read marking is best-effort — broadcasts to role:* can't be marked
      // read by individual users (firestore.rules restricts updates to
      // notifications whose targetUid matches the requester). Ignore silently.
      console.debug('mark-read skipped:', err.message);
    }
  };

  const handleClick = async (n) => {
    await markRead(n);
    if (n.link) navigate(n.link);
  };

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.readAt);
    await Promise.allSettled(unread.map(markRead));
  };

  return (
    <>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Notifications</h1>
          <p className="text-slate-500 mt-1">Compliance alerts and system events addressed to you.</p>
        </div>
        {notifications.some((n) => !n.readAt) && (
          <button
            onClick={markAllRead}
            className="px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-1"
          >
            <Check size={14} /> Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Bell size={48} className="text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-700">All caught up</p>
          <p className="text-sm text-slate-500 mt-1">Nothing requires your attention right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const style = priorityStyles[n.priority] || priorityStyles.info;
            const meta = typeMeta[n.type];
            const TypeIcon = meta?.icon;
            const isUnread = !n.readAt;
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left p-4 rounded-2xl border transition-all hover:shadow-sm flex gap-4 items-start
                  ${style.ring}
                  ${isUnread ? 'border-l-4 border-l-indigo-500' : 'opacity-70'}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.icon}`}>
                  {TypeIcon ? <TypeIcon size={20} /> : n.priority === 'critical' ? <AlertTriangle size={20} /> : n.priority === 'warning' ? <Clock size={20} /> : <Bell size={20} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-900 truncate">{n.subject}</h3>
                    {meta && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">{meta.label}</span>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{style.label}</span>
                  </div>
                  <p className="text-sm text-slate-600 whitespace-pre-line">{n.body}</p>
                  <p className="text-xs text-slate-400 mt-2">{relativeTime(n.createdAt)}</p>
                </div>
                {n.link && <ChevronRight size={20} className="text-slate-300 shrink-0 mt-3" />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
