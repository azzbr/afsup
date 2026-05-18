// Server-side mirror of the client permissions matrix.
//
// KEEP IN SYNC with school-ops/src/permissions.ts and firestore.rules.
// When you change the matrix, update all three. The client uses can() for UI
// gating; functions use it as defense-in-depth on top of firestore.rules.

export type Role = "staff" | "maintenance" | "hr" | "admin";

export interface ActorDoc {
  uid: string;
  role: Role;
  status: string;
  viewAll?: boolean;
}

/** Only HR and admin can invite new users. */
export function canInvite(actor: ActorDoc | null): boolean {
  if (!actor) return false;
  if (actor.status === "blocked" || actor.status === "suspended") return false;
  return actor.role === "admin" || actor.viewAll === true || actor.role === "hr";
}

/** HR can assign any role except admin. Admin can assign anything. */
export function canAssignRole(actor: ActorDoc | null, targetRole: Role): boolean {
  if (!actor) return false;
  const isAdmin = actor.role === "admin" || actor.viewAll === true;
  if (isAdmin) return true;
  if (actor.role === "hr") return targetRole !== "admin";
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
  const isAdmin = actor.role === "admin" || actor.viewAll === true;
  if (isAdmin) return true;
  if (actor.role === "hr") return target.role !== "admin";
  return false;
}

/** Only admin can delete users. Self-delete is blocked. */
export function canDeleteUser(
  actor: ActorDoc | null,
  target: { uid: string } | null,
): boolean {
  if (!actor || !target) return false;
  if (actor.uid === target.uid) return false;
  return actor.role === "admin" || actor.viewAll === true;
}
