import React from 'react';
import UserProfile from '../UserProfile';
import { useRouteContext } from './guards';

export default function ProfileRoute() {
  const { user, userData } = useRouteContext();

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">My Profile</h1>
        <p className="text-slate-500 mt-1">View and update your personal information.</p>
      </div>
      <UserProfile userData={userData} user={user} />
    </>
  );
}
