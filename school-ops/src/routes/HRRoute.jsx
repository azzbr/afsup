import React from 'react';
import HRSystem from '../HRsys/HRSystem';
import { useRouteContext } from './guards';

export default function HRRoute() {
  const { user, userData } = useRouteContext();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">HR Management</h1>
        <p className="text-slate-500 mt-1">Staff records, leave, and compliance.</p>
      </div>
      <HRSystem user={user} userData={userData} />
    </>
  );
}
