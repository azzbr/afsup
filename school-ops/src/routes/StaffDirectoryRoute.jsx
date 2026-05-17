// HR System opened directly to the directory view (used by the "Staff
// Directory" link in the sidebar).

import React from 'react';
import HRSystem from '../HRsys/HRSystem';
import { useRouteContext } from './guards';

export default function StaffDirectoryRoute() {
  const { user, userData } = useRouteContext();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">User Information</h1>
        <p className="text-slate-500 mt-1">Staff directory and contact information.</p>
      </div>
      <HRSystem user={user} userData={userData} initialView="directory" />
    </>
  );
}
