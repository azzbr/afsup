// Public landing — submit a new maintenance ticket. Available to everyone,
// authenticated or anonymous.

import React from 'react';
import ReportForm from '../components/ReportForm';
import { useRouteContext } from './guards';

export default function StaffRoute() {
  const { user } = useRouteContext();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-900">Submit New Request</h2>
          <p className="text-sm text-slate-500">Please describe the issue.</p>
        </div>
        <div className="p-6">
          <ReportForm user={user} onSuccess={() => alert('Report Submitted!')} />
        </div>
      </div>
    </div>
  );
}
