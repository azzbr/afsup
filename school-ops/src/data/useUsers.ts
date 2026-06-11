// Real-time subscription to the `users` collection.
//
// Replaces the duplicate getDocs(collection(db, 'users')) calls in
// HRSystem, AdminView, and HRDirectory — see CLAUDE.md section 3.

import { collection, doc, query, where } from "firebase/firestore";
import { db } from "../firebase";
import type { Role } from "../constants";
import type { User } from "../types";
import type { Actor } from "../permissions";
import { useFirestoreDoc, useFirestoreQuery, toDate } from "./firestoreSubscription";

export const USERS_KEY = ["users"] as const;

function convertUser(id: string, data: Record<string, unknown>): User {
  return {
    uid: id,
    ...data,
    // Phase 1 dates
    cprExpiry: toDate(data.cprExpiry),
    passportExpiry: toDate(data.passportExpiry),
    residencePermitExpiry: toDate(data.residencePermitExpiry),
    dateOfJoining: toDate(data.dateOfJoining),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    // Phase 2.5 dates
    dateOfBirth: toDate(data.dateOfBirth),
    contractStartDate: toDate(data.contractStartDate),
    contractEndDate: toDate(data.contractEndDate),
    probationEndDate: toDate(data.probationEndDate),
    separationDate: toDate(data.separationDate),
    moeApprovalExpiry: toDate(data.moeApprovalExpiry),
    teachingLicenseExpiry: toDate(data.teachingLicenseExpiry),
  } as User;
}

// Which target roles each actor role may LIST. A Firestore list grant must
// hold for EVERY doc the query could match, so the query carries an explicit
// `role in [...]` filter mirroring the firestore.rules read branches. Only
// super_admin (absent here) may subscribe to the whole collection.
// HR privacy lockdown (Phase 2.9.1): plain admin is operations only and
// lists staff/maintenance docs plus admin peers (matrix: "View admin
// profiles") — no hr-role docs, no super_admin docs.
const LIST_SCOPE: Partial<Record<Role, Role[]>> = {
  admin: ["staff", "maintenance", "admin"],
  hr: ["staff", "maintenance", "hr"],
  maintenance: ["staff", "maintenance"],
  staff: ["staff"],
};

/**
 * Subscribe to the users the actor may list. UI should still filter via `can()`.
 *
 * Scoping uses the actor's REAL role only — never the legacy `viewAll` flag.
 * firestore.rules has no viewAll concept, so a viewAll actor issuing an
 * unscoped query would get permission-denied at the subscription.
 */
export function useUsers(actor?: Partial<Pick<Actor, "role" | "viewAll">> | null, enabled = true) {
  const role = actor?.role;
  const scope = role ? LIST_SCOPE[role] : undefined;
  return useFirestoreQuery<User>(
    scope ? [...USERS_KEY, `scope:${role}`] : [...USERS_KEY],
    () =>
      scope
        ? query(collection(db, "users"), where("role", "in", scope))
        : collection(db, "users"),
    convertUser,
    { enabled },
  );
}

/** Subscribe to a single user by uid. */
export function useUser(uid: string | null | undefined) {
  return useFirestoreDoc<User>(
    [...USERS_KEY, uid ?? "__none__"],
    () => (uid ? doc(db, "users", uid) : null),
    convertUser,
    { enabled: Boolean(uid) },
  );
}
