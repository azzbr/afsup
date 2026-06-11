// Server-side mirror of the client permissions matrix.
//
// KEEP IN SYNC with school-ops/src/permissions.ts and firestore.rules.
// When you change the matrix, update all three. The client uses can() for UI
// gating; functions use it as defense-in-depth on top of firestore.rules.

export type Role = "staff" | "maintenance" | "hr" | "admin" | "super_admin";

export interface ActorDoc {
  uid: string;
  role: Role;
  status: string;
  viewAll?: boolean;
}

/** True if actor has admin-equivalent powers (admin OR super_admin OR viewAll). */
function isAdminEquivalent(actor: ActorDoc): boolean {
  return actor.role === "admin" || actor.role === "super_admin" || actor.viewAll === true;
}

/** Only HR, admin, and super_admin can invite new users. Which ROLES they may
 * invite is decided per-caller by canAssignRole(). */
export function canInvite(actor: ActorDoc | null): boolean {
  if (!actor) return false;
  if (actor.status === "blocked" || actor.status === "suspended") return false;
  return isAdminEquivalent(actor) || actor.role === "hr";
}

/**
 * Role-assignment matrix (Phase 2.9.1 — hr and admin are disjoint peers):
 *   - super_admin: any role (incl. another super_admin)
 *   - admin: staff and maintenance ONLY (operations lifecycle; no hr-role
 *     users, no admin tier)
 *   - hr: staff, maintenance, and hr (people data owner; no admin tier)
 *   - others: nothing
 */
export function canAssignRole(actor: ActorDoc | null, targetRole: Role): boolean {
  if (!actor) return false;
  if (actor.role === "super_admin") return true;
  if (actor.role === "admin" || actor.viewAll === true) {
    return targetRole === "staff" || targetRole === "maintenance";
  }
  if (actor.role === "hr") return targetRole !== "admin" && targetRole !== "super_admin";
  return false;
}

/**
 * Can `actor` change `target`'s role or status?
 * - super_admin: anyone (any value)
 * - admin: ONLY staff/maintenance targets (matrix: admin owns the
 *   staff/maintenance lifecycle; hr-role users and the admin tier are
 *   off-limits)
 * - HR: staff/maintenance/hr targets (never the admin tier)
 * - others: never
 *
 * Self-edits are blocked here as a safety rail — even an admin shouldn't
 * be able to demote themselves accidentally via this surface.
 */
export function canEditUserRoleOrStatus(
  actor: ActorDoc | null,
  target: { uid: string; role: Role } | null,
): boolean {
  if (!actor || !target) return false;
  if (actor.uid === target.uid) return false;
  if (actor.role === "super_admin") return true;
  if (actor.role === "admin" || actor.viewAll === true) {
    // Plain admin can only touch staff/maintenance — not hr, not the tier.
    return target.role === "staff" || target.role === "maintenance";
  }
  if (actor.role === "hr") return target.role !== "admin" && target.role !== "super_admin";
  return false;
}

/**
 * Deletion matrix: super_admin deletes anyone (self excluded; last-one guard
 * applies upstream); admin deletes staff/maintenance ONLY (matrix: "Delete
 * hr users" and "Delete admin or super_admin" are super_admin-only); HR
 * deletes no one.
 */
export function canDeleteUser(
  actor: ActorDoc | null,
  target: { uid: string; role?: Role } | null,
): boolean {
  if (!actor || !target) return false;
  if (actor.uid === target.uid) return false;
  if (actor.role === "super_admin") return true;
  if (actor.role === "admin" || actor.viewAll === true) {
    return target.role === "staff" || target.role === "maintenance";
  }
  return false;
}
