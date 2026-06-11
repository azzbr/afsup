// Promote a user (by email) to Head Admin (super_admin).
//
// Why this exists as a one-purpose function rather than a flag on
// `updateUserRole`:
//   1. The first super_admin has no existing super_admin to promote them,
//      so we need a bootstrap escape hatch that updateUserRole's strict
//      "caller must be admin AND target != self" rules would refuse.
//   2. We want a separately auditable action ("user.promotedToSuperAdmin")
//      that future reviews can grep for.
//   3. Phase 2.6 will tighten / replace this once the role is mainstream.
//
// Permission model (any of):
//   (a) Caller is already a super_admin or admin (regular promotion path).
//   (b) Caller email matches BOOTSTRAP_EMAIL AND target email == caller email.
//       This is the one-time self-bootstrap path for the very first
//       Head Admin. After at least one super_admin exists, regular
//       promotion via (a) is always sufficient.
//
// Idempotent: if the target is already super_admin, returns success without
// re-writing.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";

import { db, adminAuth } from "./admin";
import { writeAudit } from "./audit";

interface BootstrapRequest {
  email: string;
}

interface BootstrapResponse {
  ok: true;
  uid: string;
  role: "super_admin";
  changed: boolean;
  message: string;
}

/** Designated principal email. Hardcoded — there is exactly one of these
 * at this school. Other Head Admins are created from the principal later. */
const BOOTSTRAP_EMAIL = "azizbr@gmail.com";

export const bootstrapSuperAdmin = onCall<BootstrapRequest, Promise<BootstrapResponse>>(
  { region: "us-central1" },
  async (req) => {
    // -------------------------------------------------------------- authn
    const callerUid = req.auth?.uid;
    const callerEmail = String(req.auth?.token?.email ?? "").toLowerCase();
    if (!callerUid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    // -------------------------------------------------------------- input
    const targetEmail = String(req.data?.email ?? "").trim().toLowerCase();
    if (!targetEmail) {
      throw new HttpsError("invalid-argument", "email is required.");
    }

    // -------------------------------------------------------------- authz
    // Path (a) — caller is currently admin/super_admin.
    const callerSnap = await db.collection("users").doc(callerUid).get();
    const callerData = callerSnap.data() ?? {};
    const callerRole = String(callerData.role ?? "");
    const isAdminCaller =
      callerRole === "admin" ||
      callerRole === "super_admin" ||
      callerData.viewAll === true;

    // Path (b) — designated principal bootstrapping themselves.
    const isBootstrapSelf =
      callerEmail === BOOTSTRAP_EMAIL.toLowerCase() &&
      targetEmail === callerEmail;

    if (!isAdminCaller && !isBootstrapSelf) {
      throw new HttpsError(
        "permission-denied",
        "Only an existing admin/super_admin can promote others, or the designated principal can promote themselves.",
      );
    }

    // ------------------------------------------------- resolve target uid
    let targetUid: string;
    try {
      const authUser = await adminAuth.getUserByEmail(targetEmail);
      targetUid = authUser.uid;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/user-not-found") {
        throw new HttpsError("not-found", `No auth account for ${targetEmail}.`);
      }
      logger.error("auth lookup failed", err);
      throw new HttpsError("internal", "Failed to look up target user.");
    }

    const targetSnap = await db.collection("users").doc(targetUid).get();
    if (!targetSnap.exists) {
      throw new HttpsError(
        "not-found",
        `Auth account exists for ${targetEmail} but there is no Firestore user record.`,
      );
    }
    const beforeRole = String(targetSnap.data()?.role ?? "");

    // Idempotent fast path.
    if (beforeRole === "super_admin") {
      return {
        ok: true,
        uid: targetUid,
        role: "super_admin",
        changed: false,
        message: `${targetEmail} is already a Head Admin.`,
      };
    }

    // ----------------------------------------------------- perform update
    await db.collection("users").doc(targetUid).update({
      role: "super_admin",
      // viewAll mirrors the legacy back-door admin flag. Setting it true here
      // means any code path that still checks `viewAll` (rather than role)
      // also recognises the new super_admin until Phase 2.6 finishes the
      // refactor.
      viewAll: true,
      // Make sure the user can actually log in if they were left as pending.
      status: "approved",
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: callerUid,
    });

    // ---------------------------------------------------------- audit log
    await writeAudit({
      actorUid: callerUid,
      action: "user.promotedToSuperAdmin",
      targetType: "user",
      targetId: targetUid,
      // The target becomes super_admin — always admin-tier.
      targetAdminTier: true,
      before: { role: beforeRole },
      after: { role: "super_admin" },
      metadata: {
        targetEmail,
        callerEmail,
        path: isAdminCaller ? "admin_promote" : "self_bootstrap",
      },
    });

    logger.info(
      `bootstrapSuperAdmin: ${callerEmail} promoted ${targetEmail} (${targetUid}) from '${beforeRole}' to 'super_admin'`,
    );

    return {
      ok: true,
      uid: targetUid,
      role: "super_admin",
      changed: true,
      message: `Promoted ${targetEmail} to Head Admin.`,
    };
  },
);
