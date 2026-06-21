// Student System (SIS) route. Mirrors AdminRoute.jsx — renders the title block
// and the StudentSystem view shell. Admin-tier only (gated by RequireCan
// view="student" in router.tsx). No data hooks in Phase 0.

import React from 'react';
import StudentSystem from '../student/StudentSystem';
import { useRouteContext } from './guards';

export default function StudentRoute() {
  const { user, userData, actor } = useRouteContext();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Student Overview</h1>
        <p className="text-slate-500 mt-1">Track student performance and growth across years.</p>
      </div>

      <StudentSystem user={user} userData={userData} actor={actor} />
    </>
  );
}
