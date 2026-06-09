// Route definitions — see CLAUDE.md section 7 for the route map.

import { createBrowserRouter, Navigate } from "react-router-dom";

import RootLayout from "./routes/RootLayout";
import StaffRoute from "./routes/StaffRoute";
import MaintenanceRoute from "./routes/MaintenanceRoute";
import AdminRoute from "./routes/AdminRoute";
import HRRoute from "./routes/HRRoute";
import ProfileRoute from "./routes/ProfileRoute";
import StaffDirectoryRoute from "./routes/StaffDirectoryRoute";
import EmployeeRoute from "./routes/EmployeeRoute";
import AcceptInviteRoute from "./routes/AcceptInviteRoute";
import NotificationsRoute from "./routes/NotificationsRoute";
import SettingsRoute from "./routes/SettingsRoute";
import AdminManagementRoute from "./routes/AdminManagementRoute";
import { RequireAction, RequireAuth, RequireCan } from "./routes/guards";

export const router = createBrowserRouter([
  // /accept-invite lives OUTSIDE RootLayout: invitees aren't authenticated
  // yet, so they shouldn't go through the auth-loading shell.
  { path: "/accept-invite", element: <AcceptInviteRoute /> },
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <StaffRoute /> },
      {
        path: "maintenance",
        element: (
          <RequireCan view="maintenance">
            <MaintenanceRoute />
          </RequireCan>
        ),
      },
      {
        path: "admin",
        element: (
          <RequireCan view="admin">
            <AdminRoute />
          </RequireCan>
        ),
      },
      {
        path: "hr",
        element: (
          <RequireCan view="hr">
            <HRRoute />
          </RequireCan>
        ),
      },
      {
        path: "staff-directory",
        element: (
          <RequireCan view="maintenance">
            <StaffDirectoryRoute />
          </RequireCan>
        ),
      },
      {
        path: "employees/:uid",
        element: (
          <RequireCan view="maintenance">
            <EmployeeRoute />
          </RequireCan>
        ),
      },
      {
        path: "profile",
        element: (
          <RequireAuth>
            <ProfileRoute />
          </RequireAuth>
        ),
      },
      {
        path: "notifications",
        element: (
          <RequireAuth>
            <NotificationsRoute />
          </RequireAuth>
        ),
      },
      {
        path: "settings",
        element: (
          <RequireAction action="settings.read">
            <SettingsRoute />
          </RequireAction>
        ),
      },
      {
        path: "admin-management",
        element: (
          <RequireAction action="user.manageAdmins">
            <AdminManagementRoute />
          </RequireAction>
        ),
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
