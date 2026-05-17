// Real-time subscription to the `users` collection.
//
// Replaces the duplicate getDocs(collection(db, 'users')) calls in
// HRSystem, AdminView, and HRDirectory — see CLAUDE.md section 3.

import { collection, doc } from "firebase/firestore";
import { db } from "../firebase";
import type { User } from "../types";
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

/** Subscribe to every user in the system. UI should still filter via `can()`. */
export function useUsers(enabled = true) {
  return useFirestoreQuery<User>(
    [...USERS_KEY],
    () => collection(db, "users"),
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
