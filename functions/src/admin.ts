// Shared Firebase Admin initialization. All functions import `db` and `auth`
// from here, never call `admin.initializeApp()` directly.

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
export const adminAuth = getAuth();
