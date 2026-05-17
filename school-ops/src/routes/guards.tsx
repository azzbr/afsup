// Route guards. Keep these tiny and declarative — all real permission logic
// lives in src/permissions.ts. If you need a new guard, add a helper there.

import { Navigate, useOutletContext } from "react-router-dom";
import type { ReactNode } from "react";
import { canSeeRoleView } from "../permissions";
import type { Actor } from "../permissions";

export interface RouteContext {
  user: { uid: string; isAnonymous: boolean; email?: string | null; displayName?: string | null } | null;
  userData: Record<string, unknown> | null;
  actor: Actor | null;
  onLoginClick: () => void;
  onSignOut: () => void;
}

export function useRouteContext(): RouteContext {
  return useOutletContext<RouteContext>();
}

interface RequireCanProps {
  view: "staff" | "maintenance" | "hr" | "admin";
  children: ReactNode;
}

/**
 * Renders children only if the current actor can see the requested role view.
 * Otherwise redirects to `/`. Use for tab-style permission gates.
 */
export function RequireCan({ view, children }: RequireCanProps) {
  const { actor } = useRouteContext();
  if (!canSeeRoleView(actor, view)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

interface RequireAuthProps {
  children: ReactNode;
}

/** Renders children only for non-anonymous (real) users. */
export function RequireAuth({ children }: RequireAuthProps) {
  const { user } = useRouteContext();
  const isReal = Boolean(user && !user.isAnonymous);
  if (!isReal) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
