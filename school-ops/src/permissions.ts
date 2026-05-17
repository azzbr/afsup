// Single source of truth for role-based access decisions.
//
// EVERY role check in the UI MUST go through `can()`. Do not compare role
// strings directly in components. The permissions matrix here MUST match
// firestore.rules — see CLAUDE.md section 6.
//
// When you change this file, you must also update firestore.rules and add
// or update tests in src/__tests__/permissions.test.ts.

import type { Role, UserStatus } from "./constants";
import type { User, Ticket, LeaveRequest } from "./types";

// ============================================================================
// ACTOR — the minimum we need to know about the requester
// ============================================================================

export interface Actor {
  uid: string;
  role: Role;
  status: UserStatus;
  /** Special flag historically used to give admin-equivalent UI access. */
  viewAll?: boolean;
}

/** Build an Actor from a User document, or null if user is missing/blocked. */
export function actorFrom(user: Pick<User, "uid" | "role" | "status" | "viewAll"> | null | undefined): Actor | null {
  if (!user || !user.uid || !user.role) return null;
  if (user.status === "blocked" || user.status === "suspended") return null;
  return {
    uid: user.uid,
    role: user.role,
    status: user.status,
    viewAll: user.viewAll,
  };
}

// ============================================================================
// ACTIONS — every permission-checked operation in the system
// ============================================================================

export type Action =
  // Tickets
  | "ticket.create"
  | "ticket.view.own"
  | "ticket.view.all"
  | "ticket.update.status"
  | "ticket.escalate"
  | "ticket.delete"
  | "ticket.note.add"
  // Users / Profiles
  | "user.view.own"
  | "user.view.profile"
  | "user.edit.ownProfile"
  | "user.edit.role"
  | "user.edit.status"
  | "user.edit.salary"
  | "user.edit.leaveBalance"
  | "user.invite"
  | "user.delete"
  // Schedules
  | "schedule.create"
  | "schedule.update"
  | "schedule.delete"
  // Leave requests
  | "leave.submit"
  | "leave.approve"
  | "leave.view.own"
  | "leave.view.all"
  // Audit / Notifications
  | "audit.read"
  | "notification.read.broadcast";

// Target shapes passed alongside the action when a check needs context.
export type Target =
  | { type: "user"; data: Pick<User, "uid" | "role"> }
  | { type: "ticket"; data: Pick<Ticket, "reportedBy" | "status"> }
  | { type: "leaveRequest"; data: Pick<LeaveRequest, "userId" | "status"> }
  | { type: "self" }
  | undefined;

// ============================================================================
// can() — the only entry point
// ============================================================================

/**
 * Returns true if `actor` is permitted to perform `action` on `target`.
 * Returns false defensively when actor is null/undefined.
 *
 * Mirror any change here in firestore.rules.
 */
export function can(actor: Actor | null | undefined, action: Action, target?: Target): boolean {
  if (!actor) return false;

  const role = actor.role;
  const isAdmin = role === "admin" || actor.viewAll === true;
  const isHR = role === "hr";
  const isMaintenance = role === "maintenance";
  const isStaff = role === "staff";
  const isAnyManager = isAdmin || isHR;

  switch (action) {
    // ------------------------------------------------------------------ tickets
    case "ticket.create":
      // Any authenticated user, including anonymous ones, can create tickets.
      return true;

    case "ticket.view.own":
      return true;

    case "ticket.view.all":
      return isAdmin || isHR || isMaintenance;

    case "ticket.update.status":
      return isAdmin || isMaintenance;

    case "ticket.escalate":
      return isAdmin || isHR;

    case "ticket.delete":
      return isAdmin;

    case "ticket.note.add":
      return isAdmin || isHR;

    // -------------------------------------------------------------------- users
    case "user.view.own":
      return true;

    case "user.view.profile": {
      if (isAdmin) return true;
      if (target?.type !== "user") return false;
      const targetRole = target.data.role;
      if (target.data.uid === actor.uid) return true; // own profile
      if (isHR) return targetRole !== "admin";
      if (isMaintenance) return targetRole === "staff" || targetRole === "maintenance";
      if (isStaff) return targetRole === "staff";
      return false;
    }

    case "user.edit.ownProfile":
      return true; // restricted fields are enforced separately by edit.role / edit.salary / etc.

    case "user.edit.role":
    case "user.edit.status": {
      if (isAdmin) return true;
      if (!isHR) return false;
      // HR can edit role/status of non-admins only.
      if (target?.type !== "user") return false;
      return target.data.role !== "admin";
    }

    case "user.edit.salary":
    case "user.edit.leaveBalance":
      // Only HR and admin can write salary or leave balance — never the user themselves.
      return isAnyManager;

    case "user.invite":
      return isAnyManager;

    case "user.delete":
      return isAdmin;

    // ---------------------------------------------------------------- schedules
    case "schedule.create":
    case "schedule.update":
    case "schedule.delete":
      return isAdmin;

    // ----------------------------------------------------------------- leave
    case "leave.submit":
      return true;

    case "leave.approve":
      return isAnyManager;

    case "leave.view.own":
      return true;

    case "leave.view.all":
      return isAnyManager;

    // ----------------------------------------------------------- audit / notif
    case "audit.read":
      return isAnyManager;

    case "notification.read.broadcast":
      return isAnyManager;

    default: {
      // Exhaustiveness check — TypeScript ensures we handled every Action.
      const _exhaustive: never = action;
      void _exhaustive;
      return false;
    }
  }
}

// ============================================================================
// Helper: which navigation tabs should this actor see?
// ============================================================================

/**
 * Used by Layout/nav to decide which role-scoped views to render in the
 * sidebar. Different from `can()` actions because tabs are about visibility,
 * not authority — admins generally see HR too.
 */
export function canSeeRoleView(
  actor: Actor | null | undefined,
  view: "staff" | "maintenance" | "hr" | "admin",
): boolean {
  if (!actor) return false;
  const isAdmin = actor.role === "admin" || actor.viewAll === true;
  switch (view) {
    case "staff":
      // The Staff "Submit New Ticket" tab is available to every authenticated user.
      return true;
    case "maintenance":
      return isAdmin || actor.role === "hr" || actor.role === "maintenance";
    case "hr":
      return isAdmin || actor.role === "hr";
    case "admin":
      return isAdmin;
    default: {
      const _exhaustive: never = view;
      void _exhaustive;
      return false;
    }
  }
}

// ============================================================================
// Helper: which roles should this actor see in role-management UIs?
// ============================================================================

export function assignableRoles(actor: Actor | null | undefined): Role[] {
  if (!actor) return [];
  if (actor.role === "admin" || actor.viewAll) {
    return ["staff", "maintenance", "hr", "admin"];
  }
  if (actor.role === "hr") {
    // HR can promote/demote among non-admin roles only.
    return ["staff", "maintenance", "hr"];
  }
  return [];
}
