// Direct-link employee detail: /employees/:uid

import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import HRSystem from '../HRsys/HRSystem';
import { useRouteContext } from './guards';

export default function EmployeeRoute() {
  const { uid } = useParams();
  const { user, userData } = useRouteContext();

  if (!uid) return <Navigate to="/staff-directory" replace />;

  return <HRSystem user={user} userData={userData} initialView="directory" initialEmployeeUid={uid} />;
}
