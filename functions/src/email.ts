// Email sending via Resend, with graceful fallback.
//
// If RESEND_API_KEY is set, we send via Resend.
// If not, we log the message and return false so callers can fall back to
// "show the URL in the modal for HR to copy and share manually".
//
// FROM_ADDRESS defaults to Resend's testing domain `onboarding@resend.dev`,
// which works the moment you have a valid API key — no DNS verification
// required. To send from your own domain (e.g. noreply@afsbh.edu.bh):
//   1. Add the domain in https://resend.com/domains
//   2. Add the DNS records Resend gives you (SPF, DKIM, DMARC)
//   3. Once it shows "Verified", update FROM_ADDRESS below and redeploy

import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";

export const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const FROM_ADDRESS = "Al Fajer School Operations <onboarding@resend.dev>";

export interface InviteEmailParams {
  to: string;
  recipientName: string;
  inviteUrl: string;
  inviterName: string;
  role: string;
}

/**
 * Returns true if email was actually sent, false if it was logged for manual
 * delivery (key not configured) or if the Resend API rejected it.
 */
export async function sendInviteEmail(params: InviteEmailParams): Promise<boolean> {
  const apiKey = RESEND_API_KEY.value();
  if (!apiKey || apiKey === "unset") {
    logger.warn(
      "RESEND_API_KEY not configured — invite email NOT sent. " +
        "Admin should manually share this URL with the user.",
      { to: params.to, inviteUrl: params.inviteUrl },
    );
    return false;
  }

  // Lazy import so the Resend SDK isn't loaded when not in use.
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const subject = `You've been invited to Al Fajer School Operations`;
  const text = [
    `Hi ${params.recipientName},`,
    "",
    `${params.inviterName} has invited you to join the Al Fajer School operations platform as ${params.role}.`,
    "",
    "Click the link below to set your password and activate your account:",
    params.inviteUrl,
    "",
    "If you weren't expecting this invitation, you can safely ignore this email.",
    "",
    "— Al Fajer School IT",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #1e293b;">
      <h2 style="color: #4f46e5; margin: 0 0 16px;">Welcome to Al Fajer School</h2>
      <p>Hi ${escapeHtml(params.recipientName)},</p>
      <p><strong>${escapeHtml(params.inviterName)}</strong> has invited you to join the Al Fajer School operations platform as <strong>${escapeHtml(params.role)}</strong>.</p>
      <p>Click the button below to set your password and activate your account.</p>
      <p style="margin: 24px 0;">
        <a href="${params.inviteUrl}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">Activate my account</a>
      </p>
      <p style="font-size: 12px; color: #64748b;">
        Or copy this link into your browser:<br>
        <a href="${params.inviteUrl}" style="color: #4f46e5; word-break: break-all;">${params.inviteUrl}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8;">
        If you weren't expecting this invitation, you can safely ignore this email.<br>
        — Al Fajer School IT
      </p>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject,
      text,
      html,
    });

    if (result.error) {
      logger.error("Resend rejected the email", { error: result.error, to: params.to });
      return false;
    }

    logger.info("Invite email sent via Resend", { id: result.data?.id, to: params.to });
    return true;
  } catch (err) {
    logger.error("Resend send threw", err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
