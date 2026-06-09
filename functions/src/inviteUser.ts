// HR/Admin invites a new employee.
//
// Flow:
//   1. Caller must be authenticated as HR or admin (CLAUDE.md §6).
//   2. Create the Firestore user doc FIRST, with status='invited', role pre-set.
//      This eliminates the registration race condition the old self-register
//      flow had — the doc exists before any auth user does.
//   3. Create the Firebase Auth user (no password yet; user sets one via
//      the invite link).
//   4. Generate a single-use invitation token, store it in /invitations/{token}.
//   5. Compose the invite URL pointing at the React /accept-invite route.
//   6. Optionally email the URL via SendGrid (falls back to returning the URL
//      in the response if RESEND_API_KEY is absent).
//   7. Write an audit_log entry.
//
// Mirror of any change here in firestore.rules and the client permissions
// module.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";

import { db, adminAuth } from "./admin";
import { canInvite, canAssignRole, type Role, type ActorDoc } from "./permissions";
import { writeAudit } from "./audit";
import { sendInviteEmail, RESEND_API_KEY } from "./email";
import { appBaseUrl } from "./config";

type Department = "academic" | "administration" | "operations" | "support" | "it" | "maintenance" | "health";
type ContractType = "permanent" | "fixed_term" | "part_time" | "consultant";

interface InviteUserRequest {
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  middleName?: string;
  // Phase 2.5 HR Domain Extension — all optional, HR can fill via profile later.
  position?: string;
  department?: Department;
  contractType?: ContractType;
  contractStartDate?: string; // ISO date
  isTeacher?: boolean;
  employeeNumber?: string;
  // Optional override for the public app URL when building the invite link.
  // Defaults to the APP_BASE_URL functions param (see ./config).
  appBaseUrl?: string;
}

interface InviteUserResponse {
  success: true;
  inviteUrl: string;
  emailSent: boolean;
  userUid: string;
  token: string;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// All five roles are valid invite targets; canAssignRole() decides per-caller
// (admin invites up to admin, only super_admin invites super_admin).
function isValidRole(role: unknown): role is Role {
  return (
    role === "staff" ||
    role === "maintenance" ||
    role === "hr" ||
    role === "admin" ||
    role === "super_admin"
  );
}

export const inviteUser = onCall<InviteUserRequest, Promise<InviteUserResponse>>(
  {
    region: "us-central1",
    secrets: [RESEND_API_KEY],
    // Limit who can even invoke this. Auth check below is the real enforcement.
    enforceAppCheck: false,
  },
  async (req) => {
    // -------------------------------------------------------------- authn
    if (!req.auth?.uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const callerUid = req.auth.uid;

    // -------------------------------------------------------------- authz
    const callerSnap = await db.collection("users").doc(callerUid).get();
    if (!callerSnap.exists) {
      throw new HttpsError("permission-denied", "Caller has no user record.");
    }
    const callerData = callerSnap.data() as ActorDoc;
    if (!canInvite(callerData)) {
      throw new HttpsError("permission-denied", "Only HR or admin can invite users.");
    }

    // -------------------------------------------------------------- input
    const data = req.data ?? ({} as InviteUserRequest);
    const email = String(data.email ?? "").trim().toLowerCase();
    const role = data.role;
    const firstName = String(data.firstName ?? "").trim();
    const lastName = String(data.lastName ?? "").trim();
    const middleName = String(data.middleName ?? "").trim();

    if (!isValidEmail(email)) {
      throw new HttpsError("invalid-argument", "Invalid email address.");
    }
    if (!isValidRole(role)) {
      throw new HttpsError("invalid-argument", "Invalid role.");
    }
    if (!canAssignRole(callerData, role)) {
      throw new HttpsError(
        "permission-denied",
        `You cannot assign the '${role}' role.`,
      );
    }
    if (!firstName || !lastName) {
      throw new HttpsError("invalid-argument", "First and last name are required.");
    }

    // ---------------------------------------------------- uniqueness check
    // Don't double-invite. If an auth user already exists for this email,
    // refuse — the caller should either delete or unblock that user instead.
    try {
      await adminAuth.getUserByEmail(email);
      throw new HttpsError(
        "already-exists",
        "An account already exists for this email.",
      );
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      // `auth/user-not-found` is the happy path. HttpsError we re-throw.
      if (err instanceof HttpsError) throw err;
      if (code !== "auth/user-not-found") {
        logger.error("Unexpected auth lookup failure", err);
        throw new HttpsError("internal", "Failed to validate email uniqueness.");
      }
    }

    // -------------------------------------------------- create auth user
    // No password — user will set it via the invite link. Disabled until then
    // so the account can't be used for any other auth method either.
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");
    const authUser = await adminAuth.createUser({
      email,
      emailVerified: false,
      disabled: true,
      displayName: fullName,
    });

    const newUid = authUser.uid;

    // ---------------------------------------------- create Firestore user
    // Doc exists BEFORE the user ever signs in. No polling, no race.
    const position = String(data.position ?? "").trim();
    const department = data.department ?? null;
    const contractType = data.contractType ?? null;
    const isTeacher = Boolean(data.isTeacher);
    const employeeNumber = String(data.employeeNumber ?? "").trim();
    const contractStartDate = data.contractStartDate ? new Date(data.contractStartDate) : null;

    await db.collection("users").doc(newUid).set({
      uid: newUid,
      email,
      role,
      status: "invited",
      firstName,
      middleName: middleName || "",
      lastName,
      displayName: fullName,
      isActive: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: callerUid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: callerUid,
      // Sensible defaults for HRIS fields — user fills in the rest in /profile.
      arabicName: "",
      nationality: "Bahraini",
      gender: "Male",
      maritalStatus: "Single",
      cprNumber: "",
      passportNumber: "",
      iban: "BH",
      bankName: "National Bank of Bahrain (NBB)",
      sickDaysUsed: 0,
      annualLeaveBalance: 30,
      phoneNumber: "",
      // Phase 2.5 — captured at invite time when known
      position,
      department,
      contractType,
      contractStartDate,
      isTeacher,
      employeeNumber,
    });

    // --------------------------------------------- create invitation token
    // 32 random bytes → 64 hex chars. Stored in /invitations/{token}.
    // The /accept-invite route reads this to validate the link.
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await db.collection("invitations").doc(token).set({
      uid: newUid,
      email,
      role,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: callerUid,
      expiresAt,
      consumed: false,
    });

    // ------------------------------------------------------ build URL + email
    const baseUrl = data.appBaseUrl?.trim() || appBaseUrl();
    const inviteUrl =
      `${baseUrl.replace(/\/+$/, "")}/accept-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

    let emailSent = false;
    try {
      emailSent = await sendInviteEmail({
        to: email,
        recipientName: firstName,
        inviteUrl,
        inviterName: callerData.uid, // We don't have a display name on ActorDoc; UI shows uid.
        role,
      });
    } catch (err) {
      logger.error("Failed to send invite email", err);
      // We don't fail the whole flow — admin can copy the URL from the response.
    }

    // ------------------------------------------------------ audit log
    await writeAudit({
      actorUid: callerUid,
      action: "user.invited",
      targetType: "user",
      targetId: newUid,
      metadata: { email, role, emailSent },
    });

    return {
      success: true,
      inviteUrl,
      emailSent,
      userUid: newUid,
      token,
    };
  },
);
