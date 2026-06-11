// Direct-link employee detail: /employees/:uid

import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Loader2, UserX } from 'lucide-react';
import HRSystem from '../HRsys/HRSystem';
import { can } from '../permissions';
import { useUsers } from '../data/useUsers';
import { useRouteContext } from './guards';

export default function EmployeeRoute() {
  const { uid } = useParams();
  const { user, userData, actor } = useRouteContext();

  // Same role-scoped subscription HRSystem uses (shared cache entry, no extra
  // listener). Docs outside the actor's read scope — e.g. hr-role profiles
  // for an operations admin — never arrive, so "loaded but absent" means
  // not-found / no-access rather than leaving HRSystem on an unselected
  // directory forever.
  const { data: users = [], isLoading } = useUsers(actor, Boolean(userData));

  if (!uid) return <Navigate to="/staff-directory" replace />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  const match = users.find(u => u.uid === uid);
  const canView = match && can(actor, 'user.view.profile', {
    type: 'user',
    data: { uid: match.uid, role: match.role || 'staff' },
  });

  if (!canView) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
        <UserX size={48} className="text-slate-300 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-slate-800">Employee not found</h2>
        <p className="text-sm text-slate-500 mt-1">
          This profile does not exist or you do not have access to it.
        </p>
        <Link
          to="/staff-directory"
          className="inline-block mt-6 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
        >
          Back to Staff Directory
        </Link>
      </div>
    );
  }

  return <HRSystem user={user} userData={userData} initialView="directory" initialEmployeeUid={uid} />;
}
