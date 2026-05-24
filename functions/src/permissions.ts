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

/** Only HR, admin, and super_admin can invite new users. */
export function canInvite(actor: ActorDoc | null): boolean {
  if (!actor) return false;
  if (actor.status === "blocked" || actor.status === "suspended") return false;
  return isAdminEquivalent(actor) || actor.role === "hr";
}

/**
 * Role-assignment matrix:
 *   - super_admin: any role (incl. another super_admin)
 *   - admin: any role EXCEPT super_admin (only Head Admin promotes Head Admins)
 *   - hr: anything except admin / super_admin
 *   - others: nothing
 */
export function canAssignRole(actor: ActorDoc | null, targetRole: Role): boolean {
  if (!actor) return false;
  if (actor.role === "super_admin") return true;
  if (actor.role === "admin" || actor.viewAll === true) {
    return targetRole !== "super_admin";
  }
  if (actor.role === "hr") return targetRole !== "admin" && targetRole !== "super_admin";
  return false;
}

/**
 * Can `actor` change `target`'s role or status?
 * - admin: yes (anyone, any value)
 * - HR: only if target is NOT an admin
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
    // Regular admin cannot edit another super_admin.
    return target.role !== "super_admin";
  }
  if (actor.role === "hr") return target.role !== "admin" && target.role !== "super_admin";
  return false;
}

/** admin and super_admin can delete users. Self-delete is blocked. */
export function canDeleteUser(
  actor: ActorDoc | null,
  target: { uid: string; role?: Role } | null,
): boolean {
  if (!actor || !target) return false;
  if (actor.uid === target.uid) return false;
  if (actor.role === "super_admin") return true;
  if (actor.role === "admin" || actor.viewAll === true) {
    // Regular admin cannot delete a super_admin.
    return target.role !== "super_admin";
  }
  return false;
}
