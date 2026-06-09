// /admin-management — Head Admin only view of the admin tier (Phase 2.6).
//
// Lists admins + super_admins with promote/demote/suspend/reactivate actions.
// All mutations go through Cloud Functions (updateUserRole / updateUserStatus)
// which enforce the permissions matrix and the last-Head-Admin guard
// server-side; the client mirrors the guard for better UX.

import React from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  ShieldCheck, Crown, ArrowUpCircle, ArrowDownCircle, UserX, UserCheck,
  Loader2, Info,
} from 'lucide-react';

import { functions } from '../firebase';
import { ROLES, ROLE_LABELS } from '../constants';
import { can } from '../permissions';
import { useUsers } from '../data/useUsers';
import { useRouteContext } from './guards';

const ADMIN_TIER = [ROLES.ADMIN, ROLES.SUPER_ADMIN];

// Head Admin badge is indigo-700, distinct from admin's slate — CLAUDE.md 2.6.
const ROLE_BADGE = {
  [ROLES.SUPER_ADMIN]: 'bg-indigo-700 text-white',
  [ROLES.ADMIN]: 'bg-slate-200 text-slate-700',
};

const STATUS_BADGE = {
  approved: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-amber-100 text-amber-700',
  invited: 'bg-sky-100 text-sky-700',
  pending: 'bg-slate-100 text-slate-600',
  blocked: 'bg-red-100 text-red-700',
};

const ACTION_CONFIG = {
  promote: {
    title: 'Promote to Head Admin',
    confirmLabel: 'Promote',
    danger: false,
    body: (name) =>
      `Give ${name} full Head Admin access? They will be able to edit school settings, manage the admin tier, and read the complete audit log.`,
  },
  demote: {
    title: 'Demote to Admin',
    confirmLabel: 'Demote',
    danger: true,
    body: (name) =>
      `Demote ${name} to Admin? They will lose access to school settings, admin management, and the full audit log.`,
  },
  suspend: {
    title: 'Suspend Account',
    confirmLabel: 'Suspend',
    danger: true,
    body: (name) => `Suspend ${name}? They will be signed out and unable to access the platform until reactivated.`,
  },
  reactivate: {
    title: 'Reactivate Account',
    confirmLabel: 'Reactivate',
    danger: false,
    body: (name) => `Reactivate ${name}? They will regain access with their current role.`,
  },
};

const LAST_HEAD_ADMIN_HINT =
  'This is the only active Head Admin. Promote another Head Admin first — the system must always keep at least one.';

export default function AdminManagementRoute() {
  const { actor } = useRouteContext();
  const { data: users = [], isLoading } = useUsers(actor);

  const [confirmTarget, setConfirmTarget] = React.useState(null); // { user, type } | null
  const [actionLoading, setActionLoading] = React.useState(null); // uid | null
  const [actionError, setActionError] = React.useState(null);

  const adminTier = users
    .filter((u) => ADMIN_TIER.includes(u.role))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === ROLES.SUPER_ADMIN ? -1 : 1;
      return (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '');
    });

  const activeHeadAdmins = adminTier.filter(
    (u) => u.role === ROLES.SUPER_ADMIN && u.status === 'approved',
  );
  // Last-Head-Admin guard (mirrored server-side): never allow the system to
  // be left with zero active super_admins.
  const isLastHeadAdmin = (u) =>
    u.role === ROLES.SUPER_ADMIN && u.status === 'approved' && activeHeadAdmins.length === 1;

  const openConfirm = (user, type) => {
    setActionError(null);
    setConfirmTarget({ user, type });
  };

  const runAction = async () => {
    if (!confirmTarget) return;
    const { user: target, type } = confirmTarget;
    setActionLoading(target.uid);
    setActionError(null);
    try {
      if (type === 'promote' || type === 'demote') {
        const call = httpsCallable(functions, 'updateUserRole');
        await call({ uid: target.uid, role: type === 'promote' ? ROLES.SUPER_ADMIN : ROLES.ADMIN });
      } else {
        const call = httpsCallable(functions, 'updateUserStatus');
        await call({ uid: target.uid, status: type === 'suspend' ? 'suspended' : 'approved' });
      }
      setConfirmTarget(null);
      // No refetch needed — the useUsers subscription pushes the change in.
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const config = confirmTarget ? ACTION_CONFIG[confirmTarget.type] : null;
  const confirmName = confirmTarget
    ? confirmTarget.user.displayName || confirmTarget.user.email || 'this user'
    : '';

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Admin Management</h1>
        <p className="text-slate-500 mt-1">Promote, demote, suspend, or reactivate the admin tier.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
      ) : adminTier.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <ShieldCheck size={48} className="text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-700">No admins found</p>
          <p className="text-sm text-slate-500 mt-1">Invite an admin from the HR module to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {adminTier.map((u) => {
            const name = u.displayName || u.email?.split('@')[0] || u.uid;
            const lastGuard = isLastHeadAdmin(u);
            const busy = actionLoading === u.uid;
            const canActOnRole = can(actor, 'user.edit.role', { type: 'user', data: { uid: u.uid, role: u.role } });
            const canActOnStatus = can(actor, 'user.edit.status', { type: 'user', data: { uid: u.uid, role: u.role } });

            return (
              <div key={u.uid} className="p-4 md:p-5 flex flex-wrap items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                    ROLE_BADGE[u.role] || 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {u.role === ROLES.SUPER_ADMIN ? <Crown size={18} /> : name[0]?.toUpperCase()}
                </div>

                <div className="flex-1 min-w-[180px]">
                  <p className="font-bold text-slate-900 truncate">{name}</p>
                  <p className="text-sm text-slate-500 truncate">{u.email}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      ROLE_BADGE[u.role] || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize ${
                      STATUS_BADGE[u.status] || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {u.status}
                  </span>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {busy ? (
                    <Loader2 size={18} className="animate-spin text-indigo-500" />
                  ) : (
                    <>
                      {canActOnRole && u.role === ROLES.ADMIN && (
                        <button
                          type="button"
                          onClick={() => openConfirm(u, 'promote')}
                          className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-1"
                        >
                          <ArrowUpCircle size={14} /> Promote to Head Admin
                        </button>
                      )}
                      {canActOnRole && u.role === ROLES.SUPER_ADMIN && (
                        <button
                          type="button"
                          onClick={() => openConfirm(u, 'demote')}
                          disabled={lastGuard}
                          title={lastGuard ? LAST_HEAD_ADMIN_HINT : undefined}
                          className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ArrowDownCircle size={14} /> Demote to Admin
                        </button>
                      )}
                      {canActOnStatus && (u.status === 'approved' ? (
                        <button
                          type="button"
                          onClick={() => openConfirm(u, 'suspend')}
                          disabled={lastGuard}
                          title={lastGuard ? LAST_HEAD_ADMIN_HINT : undefined}
                          className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <UserX size={14} /> Suspend
                        </button>
                      ) : u.status === 'suspended' ? (
                        <button
                          type="button"
                          onClick={() => openConfirm(u, 'reactivate')}
                          className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1"
                        >
                          <UserCheck size={14} /> Reactivate
                        </button>
                      ) : null)}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-sm text-slate-500 flex items-center gap-2">
        <Info size={15} className="shrink-0" />
        New admins are invited from the HR module&apos;s Add Employee flow with the Admin role.
      </p>

      {confirmTarget && config && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">{config.title}</h3>
            <p className="text-sm text-slate-600">{config.body(confirmName)}</p>
            {actionError && (
              <p className="mt-3 text-sm font-medium text-red-600">Action failed: {actionError}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={actionLoading === confirmTarget.user.uid}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runAction}
                disabled={actionLoading === confirmTarget.user.uid}
                className={`px-4 py-2 text-sm font-bold text-white rounded-lg flex items-center gap-2 disabled:opacity-50 ${
                  config.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {actionLoading === confirmTarget.user.uid && <Loader2 size={14} className="animate-spin" />}
                {config.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
