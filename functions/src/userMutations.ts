// User lifecycle mutations: delete, role change, status change.
//
// All three live on the server because:
//   - delete needs admin SDK to remove the Firebase Auth user (client SDK
//     cannot — that's why the old "delete from Firestore only" approach
//     left auth orphans and broke re-invite).
//   - role/status changes must write audit_log, which firestore.rules
//     restricts to the server (cloud functions bypass rules).
//
// firestore.rules still allows admin/HR to write profile fields directly
// from the client. Only these three operations are forced through the
// server.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";

import { db, adminAuth } from "./admin";
import { writeAudit } from "./audit";
import {
  canAssignRole,
  canDeleteUser,
  canEditUserRoleOrStatus,
  type ActorDoc,
  type Role,
} from "./permissions";

// ============================================================================
// Helpers
// ============================================================================

async function loadActor(uid: string | undefined): Promise<ActorDoc | null> {
  if (!uid) return null;
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<ActorDoc>;
  if (!data.role) return null;
  return {
    uid,
    role: data.role,
    status: String(data.status ?? "approved"),
    viewAll: Boolean(data.viewAll),
  };
}

async function loadTargetUser(uid: string): Promise<{ uid: string; role: Role; email?: string } | null> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as { role?: Role; email?: string };
  if (!data.role) return null;
  return { uid, role: data.role, email: data.email };
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new HttpsError("invalid-argument", `Missing or invalid field: ${field}`);
  }
  return v.trim();
}

// ============================================================================
// deleteUser — hard-delete an account (auth + Firestore)
// ============================================================================

export const deleteUser = onCall<{ uid: string }>(
  { region: "us-central1" },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required.");

    const targetUid = requireString(req.data?.uid, "uid");

    const [actor, target] = await Promise.all([
      loadActor(callerUid),
      loadTargetUser(targetUid),
    ]);

    if (!target) {
      throw new HttpsError("not-found", "User does not exist.");
    }
    if (!canDeleteUser(actor, target)) {
      throw new HttpsError(
        "permission-denied",
        actor?.uid === target.uid
          ? "You cannot delete your own account."
          : "Only admins can delete users.",
      );
    }

    logger.info(`deleteUser: ${callerUid} deleting ${targetUid}`);

    // Order: capture "before" snapshot for audit → delete Firestore →
    // delete Auth. If Auth delete fails, we still have audit context.
    const before = (await db.collection("users").doc(targetUid).get()).data() || null;

    try {
      await db.collection("users").doc(targetUid).delete();
    } catch (err) {
      logger.error("Firestore delete failed", err);
      throw new HttpsError("internal", "Failed to delete user record.");
    }

    try {
      await adminAuth.deleteUser(targetUid);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/user-not-found") {
        // No auth record (was never created or already deleted). Fine.
        logger.warn(`deleteUser: auth user ${targetUid} did not exist`);
      } else {
        // Firestore is gone but auth isn't. Log loudly. Manual cleanup needed.
        logger.error("Auth delete failed — auth orphan possible", err);
        throw new HttpsError(
          "internal",
          "Profile removed but auth account could not be deleted. Contact IT.",
        );
      }
    }

    await writeAudit({
      actorUid: callerUid,
      action: "user.deleted",
      targetType: "user",
      targetId: targetUid,
      before,
      after: null,
    });

    return { ok: true, uid: targetUid };
  },
);

// ============================================================================
// updateUserRole — change a user's role
// ============================================================================

const VALID_ROLES: Role[] = ["staff", "maintenance", "hr", "admin", "super_admin"];

export const updateUserRole = onCall<{ uid: string; role: Role }>(
  { region: "us-central1" },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required.");

    const targetUid = requireString(req.data?.uid, "uid");
    const newRole = requireString(req.data?.role, "role") as Role;
    if (!VALID_ROLES.includes(newRole)) {
      throw new HttpsError("invalid-argument", `Invalid role: ${newRole}`);
    }

    const [actor, target] = await Promise.all([
      loadActor(callerUid),
      loadTargetUser(targetUid),
    ]);

    if (!target) throw new HttpsError("not-found", "User does not exist.");

    if (!canEditUserRoleOrStatus(actor, target)) {
      throw new HttpsError(
        "permission-denied",
        actor?.uid === target.uid
          ? "You cannot change your own role."
          : "You do not have permission to change this user's role.",
      );
    }

    if (!canAssignRole(actor, newRole)) {
      throw new HttpsError(
        "permission-denied",
        `You cannot assign the role "${newRole}".`,
      );
    }

    if (target.role === newRole) {
      return { ok: true, uid: targetUid, role: newRole, changed: false };
    }

    const before = { role: target.role };
    await db.collection("users").doc(targetUid).update({
      role: newRole,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: callerUid,
    });

    await writeAudit({
      actorUid: callerUid,
      action: "user.roleChanged",
      targetType: "user",
      targetId: targetUid,
      before,
      after: { role: newRole },
    });

    logger.info(`updateUserRole: ${callerUid} changed ${targetUid} role: ${target.role} → ${newRole}`);
    return { ok: true, uid: targetUid, role: newRole, changed: true };
  },
);

// ============================================================================
// updateUserStatus — change a user's status (approve / block / suspend / etc.)
// ============================================================================

type Status = "invited" | "pending" | "approved" | "suspended" | "blocked";
const VALID_STATUSES: Status[] = ["invited", "pending", "approved", "suspended", "blocked"];

export const updateUserStatus = onCall<{ uid: string; status: Status }>(
  { region: "us-central1" },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required.");

    const targetUid = requireString(req.data?.uid, "uid");
    const newStatus = requireString(req.data?.status, "status") as Status;
    if (!VALID_STATUSES.includes(newStatus)) {
      throw new HttpsError("invalid-argument", `Invalid status: ${newStatus}`);
    }

    const [actor, target] = await Promise.all([
      loadActor(callerUid),
      loadTargetUser(targetUid),
    ]);

    if (!target) throw new HttpsError("not-found", "User does not exist.");

    if (!canEditUserRoleOrStatus(actor, target)) {
      throw new HttpsError(
        "permission-denied",
        actor?.uid === target.uid
          ? "You cannot change your own status."
          : "You do not have permission to change this user's status.",
      );
    }

    const targetSnap = await db.collection("users").doc(targetUid).get();
    const beforeStatus = targetSnap.data()?.status as Status | undefined;

    if (beforeStatus === newStatus) {
      return { ok: true, uid: targetUid, status: newStatus, changed: false };
    }

    const updates: Record<string, unknown> = {
      status: newStatus,
      isActive: newStatus === "approved",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: callerUid,
    };
    // Convenience timestamp so existing UIs that look for `approvedAt` etc. still work
    updates[`${newStatus}At`] = FieldValue.serverTimestamp();

    // Also mirror to Firebase Auth disabled flag so blocked users can't log in
    try {
      await adminAuth.updateUser(targetUid, {
        disabled: newStatus === "blocked" || newStatus === "suspended",
      });
    } catch (err) {
      logger.warn("Could not update auth disabled flag (continuing)", err);
    }

    await db.collection("users").doc(targetUid).update(updates);

    await writeAudit({
      actorUid: callerUid,
      action: "user.statusChanged",
      targetType: "user",
      targetId: targetUid,
      before: { status: beforeStatus ?? null },
      after: { status: newStatus },
    });

    logger.info(
      `updateUserStatus: ${callerUid} changed ${targetUid} status: ${beforeStatus} → ${newStatus}`,
    );
    return { ok: true, uid: targetUid, status: newStatus, changed: true };
  },
);
