// Email sending with graceful fallback.
//
// If SENDGRID_API_KEY is set, we send via SendGrid.
// If not, we log the message and return the inviteUrl so the admin can copy/send
// manually — this keeps the function usable during development.

import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";

export const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

const FROM_ADDRESS = "noreply@afs.edu.bh";
const FROM_NAME = "Al Fajer School Operations";

export interface InviteEmailParams {
  to: string;
  recipientName: string;
  inviteUrl: string;
  inviterName: string;
  role: string;
}

/**
 * Returns true if email was actually sent, false if it was logged for manual
 * delivery (SENDGRID_API_KEY not configured).
 */
export async function sendInviteEmail(params: InviteEmailParams): Promise<boolean> {
  const apiKey = SENDGRID_API_KEY.value();
  if (!apiKey) {
    logger.warn(
      "SENDGRID_API_KEY not configured — invite email NOT sent. " +
        "Admin should manually share this URL with the user.",
      { to: params.to, inviteUrl: params.inviteUrl },
    );
    return false;
  }

  // Lazy import to avoid loading SendGrid SDK when not in use.
  const sgMail = (await import("@sendgrid/mail")).default;
  sgMail.setApiKey(apiKey);

  const subject = `You've been invited to ${FROM_NAME}`;
  const text = [
    `Hi ${params.recipientName},`,
    "",
    `${params.inviterName} has invited you to join the Al Fajer School operations platform as a ${params.role}.`,
    "",
    "Click the link below to set your password and activate your account:",
    params.inviteUrl,
    "",
    "If you weren't expecting this invitation, you can safely ignore this email.",
    "",
    "— Al Fajer School IT",
  ].join("\n");

  await sgMail.send({
    to: params.to,
    from: { email: FROM_ADDRESS, name: FROM_NAME },
    subject,
    text,
  });
  return true;
}
