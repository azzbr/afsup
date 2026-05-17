// Invitee redeems their invitation link.
//
// Called from the React /accept-invite page after the user enters the password
// they want to set. The function:
//   1. Validates the token: exists, not expired, not already consumed.
//   2. Confirms the email matches the invitation.
//   3. Sets the password on the Firebase Auth user (and enables it).
//   4. Marks the user doc as status='approved'.
//   5. Marks the invitation as consumed.
//   6. Writes audit_log.
//
// Returns a custom token the client uses to sign in immediately.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";

import { db, adminAuth } from "./admin";
import { writeAudit } from "./audit";

interface AcceptInviteRequest {
  token: string;
  email: string;
  password: string;
}

interface AcceptInviteResponse {
  success: true;
  /** Sign in with this on the client via signInWithCustomToken(). */
  customToken: string;
  uid: string;
}

function isStrongEnoughPassword(pw: string): boolean {
  return typeof pw === "string" && pw.length >= 8;
}

export const acceptInvite = onCall<AcceptInviteRequest, Promise<AcceptInviteResponse>>(
  { region: "us-central1" },
  async (req) => {
    const data = req.data ?? ({} as AcceptInviteRequest);
    const token = String(data.token ?? "").trim();
    const email = String(data.email ?? "").trim().toLowerCase();
    const password = String(data.password ?? "");

    if (!token || !email) {
      throw new HttpsError("invalid-argument", "Missing token or email.");
    }
    if (!isStrongEnoughPassword(password)) {
      throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
    }

    const inviteRef = db.collection("invitations").doc(token);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      throw new HttpsError("not-found", "Invitation not found or already used.");
    }

    const invite = inviteSnap.data() as {
      uid: string;
      email: string;
      role: string;
      expiresAt: { toDate(): Date } | Date;
      consumed: boolean;
    };

    if (invite.consumed) {
      throw new HttpsError("failed-precondition", "Invitation has already been used.");
    }
    if (invite.email !== email) {
      // Don't reveal which email is correct.
      throw new HttpsError("permission-denied", "Invitation does not match this email.");
    }

    const expiresAt =
      invite.expiresAt instanceof Date ? invite.expiresAt : invite.expiresAt.toDate();
    if (expiresAt.getTime() < Date.now()) {
      throw new HttpsError("deadline-exceeded", "Invitation has expired.");
    }

    // ---------------------------------------------------- set password + enable
    try {
      await adminAuth.updateUser(invite.uid, {
        password,
        disabled: false,
        emailVerified: true,
      });
    } catch (err) {
      logger.error("Failed to update auth user", err);
      throw new HttpsError("internal", "Failed to activate account.");
    }

    // ------------------------------------------------------ flip user status
    await db.collection("users").doc(invite.uid).update({
      status: "approved",
      isActive: true,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: invite.uid, // Self-approved via invite redemption.
    });

    // ------------------------------------------------------ consume invitation
    await inviteRef.update({
      consumed: true,
      consumedAt: FieldValue.serverTimestamp(),
    });

    // ------------------------------------------------------ audit
    await writeAudit({
      actorUid: invite.uid,
      action: "user.acceptedInvite",
      targetType: "user",
      targetId: invite.uid,
      metadata: { role: invite.role },
    });

    // ----------------------------------- mint custom token for instant sign-in
    const customToken = await adminAuth.createCustomToken(invite.uid);

    return {
      success: true,
      customToken,
      uid: invite.uid,
    };
  },
);
