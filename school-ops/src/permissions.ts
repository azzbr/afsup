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

/**
 * True for roles in the admin tier (admin + super_admin). Use this instead
 * of comparing role strings in components — e.g. RootLayout's sign-out gate
 * exempts the whole admin tier from the legacy invited/pending sign-out.
 * Accepts raw Firestore role strings, so missing/unknown values return false.
 */
export function isAdminTierRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
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
  | "ticket.cancel"
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
  | "user.manageAdmins"
  // Schedules
  | "schedule.create"
  | "schedule.update"
  | "schedule.delete"
  // Leave requests
  | "leave.submit"
  | "leave.approve"
  | "leave.view.own"
  | "leave.view.all"
  // Audit / Notifications / Settings
  | "audit.read"
  | "audit.readAll"
  | "notification.read.broadcast"
  | "settings.read"
  | "settings.edit";

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
  // super_admin (Head Admin) inherits every admin power, PLUS the
  // principal-only capabilities: school_settings edits, full audit log,
  // and managing the admin/super_admin tier itself.
  //
  // The legacy `viewAll` flag grants admin-EQUIVALENT access only. It must
  // never grant the super-admin-only actions (settings.edit, audit.readAll,
  // user.manageAdmins) or bypass the admin-tier target checks below.
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin" || isSuperAdmin || actor.viewAll === true;
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

    case "ticket.cancel":
      return isAdmin;

    // -------------------------------------------------------------------- users
    case "user.view.own":
      return true;

    case "user.view.profile": {
      if (isSuperAdmin) return true;
      if (target?.type !== "user") return isAdmin; // capability probe
      const targetRole = target.data.role;
      if (target.data.uid === actor.uid) return true; // own profile
      // Plain admin sees everyone except Head Admins.
      if (isAdmin) return targetRole !== "super_admin";
      // HR is blind to the whole admin tier.
      if (isHR) return targetRole !== "admin" && targetRole !== "super_admin";
      if (isMaintenance) return targetRole === "staff" || targetRole === "maintenance";
      if (isStaff) return targetRole === "staff";
      return false;
    }

    case "user.edit.ownProfile":
      return true; // restricted fields are enforced separately by edit.role / edit.salary / etc.

    case "user.edit.role":
    case "user.edit.status": {
      // No target = capability probe ("does this actor manage anyone?").
      if (target?.type !== "user") return isAnyManager;
      if (isSuperAdmin) return true;
      // Only Head Admin manages the admin tier — plain admin and HR are
      // both restricted to non-admin targets.
      const targetRole = target.data.role;
      return isAnyManager && targetRole !== "admin" && targetRole !== "super_admin";
    }

    case "user.edit.salary":
    case "user.edit.leaveBalance": {
      // Never the user themselves — not even Head Admin (firestore.rules
      // mirrors this with a salaryTierFields() self-write guard).
      // Admin-tier targets are Head Admin only.
      if (target?.type === "user") {
        if (target.data.uid === actor.uid) return false;
        const targetRole = target.data.role;
        if (targetRole === "admin" || targetRole === "super_admin") return isSuperAdmin;
      }
      return isAnyManager;
    }

    case "user.invite":
      return isAnyManager;

    case "user.delete": {
      // Deleting an admin or Head Admin is Head Admin only (last-one guard
      // is enforced separately, server-side).
      if (target?.type === "user") {
        const targetRole = target.data.role;
        if (targetRole === "admin" || targetRole === "super_admin") return isSuperAdmin;
      }
      return isAdmin;
    }

    case "user.manageAdmins":
      // Promote/demote/list the admin + super_admin tier. Head Admin only;
      // viewAll must never grant this.
      return isSuperAdmin;

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

    // ------------------------------------------- audit / notif / settings
    case "audit.read":
      // Entries about non-admins only — see audit.readAll for the full log.
      // Real hr/admin roles only — firestore.rules audit_log read has no
      // viewAll concept (and useAuditLog scopes by raw role), so granting
      // it here would promise a read the rules refuse.
      return isHR || role === "admin" || isSuperAdmin;

    case "audit.readAll":
      // Every entry, including those about admins and super_admins.
      return isSuperAdmin;

    case "notification.read.broadcast":
      return isAnyManager;

    case "settings.read":
      // Real hr/admin roles only — firestore.rules school_settings read has
      // no viewAll concept, so granting it here would promise a read the
      // rules refuse (permission-denied snapshot on /settings).
      return isHR || role === "admin" || isSuperAdmin;

    case "settings.edit":
      // School-wide knobs are principal-only; viewAll must never grant this.
      return isSuperAdmin;

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
  const isAdmin = actor.role === "admin" || actor.role === "super_admin" || actor.viewAll === true;
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
  if (actor.role === "super_admin") {
    // Head Admin can assign every role, including another super_admin.
    return ["staff", "maintenance", "hr", "admin", "super_admin"];
  }
  if (actor.role === "admin" || actor.viewAll) {
    // Regular admin can assign up to admin, but NOT super_admin —
    // only Head Admin promotes Head Admins (Phase 2.6 enforcement).
    return ["staff", "maintenance", "hr", "admin"];
  }
  if (actor.role === "hr") {
    // HR can promote/demote among non-admin roles only.
    return ["staff", "maintenance", "hr"];
  }
  return [];
}
