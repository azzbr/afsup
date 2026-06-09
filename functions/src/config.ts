// Shared deploy-time configuration for Cloud Functions.
//
// APP_BASE_URL is the public URL of the client app, used wherever a function
// composes a link for an email (invites, compliance alerts).
//
// IMPORTANT: the app is actually hosted on NETLIFY (see netlify.toml at the
// repo root), NOT Firebase Hosting. The default below is a known-stale
// placeholder that only exists so builds and emulators work unconfigured.
// Before relying on emailed links in production, set this param to the real
// Netlify/custom-domain URL via the functions env config, e.g. in
// functions/.env:
//   APP_BASE_URL=https://<your-site>.netlify.app
// (or supply it at deploy time when the CLI prompts for params).

import { defineString } from "firebase-functions/params";

export const APP_BASE_URL = defineString("APP_BASE_URL", {
  default: "https://afsup-3ff9b.web.app",
  description: "Public base URL of the client app (Netlify production URL).",
});

/** Base URL of the client app, without a trailing slash. */
export function appBaseUrl(): string {
  return APP_BASE_URL.value().replace(/\/+$/, "");
}
