// Audit-field helpers. Every Firestore write MUST go through one of these,
// otherwise `createdBy` / `updatedBy` / timestamps drift — see CLAUDE.md rule #5.

import { serverTimestamp, type FieldValue } from "firebase/firestore";

export interface AuditCreate {
  createdAt: FieldValue;
  createdBy: string;
  updatedAt: FieldValue;
  updatedBy: string;
}

export interface AuditUpdate {
  updatedAt: FieldValue;
  updatedBy: string;
}

/** Stamp fields for an `addDoc` or initial `setDoc`. */
export function auditCreate(actorUid: string): AuditCreate {
  return {
    createdAt: serverTimestamp(),
    createdBy: actorUid,
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

/** Stamp fields for an `updateDoc` or merging `setDoc`. */
export function auditUpdate(actorUid: string): AuditUpdate {
  return {
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };
}

/** Convenience: merge audit fields into the payload you're writing. */
export function withCreate<T extends object>(actorUid: string, payload: T): T & AuditCreate {
  return { ...payload, ...auditCreate(actorUid) };
}

export function withUpdate<T extends object>(actorUid: string, payload: T): T & AuditUpdate {
  return { ...payload, ...auditUpdate(actorUid) };
}
