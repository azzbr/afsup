// Edit school_settings/current — Head Admin (super_admin) only.
//
// firestore.rules denies ALL client writes to school_settings; this function
// is the single write path so every change is whitelist-validated and
// audit-logged. Per CLAUDE.md section 6, settings.edit is principal-only:
// role must be exactly "super_admin" — the legacy viewAll flag does NOT
// qualify here.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "./admin";
import { writeAudit, type AuditEntry } from "./audit";
import { loadActor } from "./userMutations";

const SETTINGS_DOC = "school_settings/current";

const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Top-level keys of the school_settings schema (CLAUDE.md section 5).
const ALLOWED_KEYS = new Set([
  "schoolNameEn",
  "schoolNameAr",
  "domain",
  "academicYearStart",
  "academicYearEnd",
  "workingDays",
  "weeklyOffDays",
  "publicHolidays",
  "defaultAnnualLeaveDays",
  "sickLeaveTiers",
  "gosi",
  "wps",
  "notifyOnCriticalCompliance",
]);

function bad(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function coerceString(v: unknown, key: string): string {
  if (typeof v !== "string") bad(`${key} must be a string.`);
  return v.trim();
}

function coerceNumber(v: unknown, key: string, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) bad(`${key} must be a number.`);
  if (n < min || n > max) bad(`${key} must be between ${min} and ${max}.`);
  return n;
}

function coerceTimestamp(v: unknown, key: string): Timestamp {
  if (typeof v !== "string") bad(`${key} must be an ISO date string.`);
  const d = new Date(v);
  if (isNaN(d.getTime())) bad(`${key} is not a valid date: ${v}`);
  return Timestamp.fromDate(d);
}

function coerceDayArray(v: unknown, key: string): string[] {
  if (!Array.isArray(v)) bad(`${key} must be an array of day codes.`);
  return v.map((item) => {
    const day = String(item).trim().toLowerCase();
    if (!DAY_CODES.includes(day)) bad(`${key} contains an invalid day code: ${item}`);
    return day;
  });
}

function coerceEmailArray(v: unknown, key: string): string[] {
  if (!Array.isArray(v)) bad(`${key} must be an array of email addresses.`);
  return v.map((item) => {
    const email = String(item).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) bad(`${key} contains an invalid email: ${item}`);
    return email;
  });
}

function coercePublicHolidays(v: unknown): { date: Timestamp; label: string }[] {
  if (!Array.isArray(v)) bad("publicHolidays must be an array.");
  return v.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) bad(`publicHolidays[${i}] must be an object.`);
    const { date, label } = entry as { date?: unknown; label?: unknown };
    if (typeof label !== "string" || !label.trim()) bad(`publicHolidays[${i}].label is required.`);
    return {
      date: coerceTimestamp(date, `publicHolidays[${i}].date`),
      label: label.trim(),
    };
  });
}

function coerceSickLeaveTiers(v: unknown): { fullPay: number; halfPay: number; noPay: number } {
  if (typeof v !== "object" || v === null) bad("sickLeaveTiers must be an object.");
  const tiers = v as Record<string, unknown>;
  for (const key of Object.keys(tiers)) {
    if (!["fullPay", "halfPay", "noPay"].includes(key)) bad(`sickLeaveTiers has unknown key: ${key}`);
  }
  return {
    fullPay: coerceNumber(tiers.fullPay, "sickLeaveTiers.fullPay", 0, 365),
    halfPay: coerceNumber(tiers.halfPay, "sickLeaveTiers.halfPay", 0, 365),
    noPay: coerceNumber(tiers.noPay, "sickLeaveTiers.noPay", 0, 365),
  };
}

// Partial nested updates are allowed (e.g. only gosi.expat); merge:true on
// the write preserves the untouched branch.
function coerceGosi(v: unknown): Record<string, { employerRate: number; employeeRate: number }> {
  if (typeof v !== "object" || v === null) bad("gosi must be an object.");
  const gosi = v as Record<string, unknown>;
  const out: Record<string, { employerRate: number; employeeRate: number }> = {};
  for (const group of Object.keys(gosi)) {
    if (group !== "bahraini" && group !== "expat") bad(`gosi has unknown key: ${group}`);
    const rates = gosi[group];
    if (typeof rates !== "object" || rates === null) bad(`gosi.${group} must be an object.`);
    const r = rates as Record<string, unknown>;
    for (const key of Object.keys(r)) {
      if (key !== "employerRate" && key !== "employeeRate") bad(`gosi.${group} has unknown key: ${key}`);
    }
    out[group] = {
      employerRate: coerceNumber(r.employerRate, `gosi.${group}.employerRate`, 0, 1),
      employeeRate: coerceNumber(r.employeeRate, `gosi.${group}.employeeRate`, 0, 1),
    };
  }
  return out;
}

function coerceWps(v: unknown): Record<string, string> {
  if (typeof v !== "object" || v === null) bad("wps must be an object.");
  const wps = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of Object.keys(wps)) {
    if (key !== "employerCR" && key !== "bankRoutingCode") bad(`wps has unknown key: ${key}`);
    out[key] = coerceString(wps[key], `wps.${key}`);
  }
  return out;
}

function coerceSettings(payload: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_KEYS.has(key)) bad(`Unknown settings key: ${key}`);
    switch (key) {
      case "schoolNameEn":
      case "schoolNameAr":
      case "domain":
        updates[key] = coerceString(value, key);
        break;
      case "academicYearStart":
      case "academicYearEnd":
        updates[key] = coerceTimestamp(value, key);
        break;
      case "workingDays":
      case "weeklyOffDays":
        updates[key] = coerceDayArray(value, key);
        break;
      case "publicHolidays":
        updates[key] = coercePublicHolidays(value);
        break;
      case "defaultAnnualLeaveDays":
        updates[key] = coerceNumber(value, key, 0, 365);
        break;
      case "sickLeaveTiers":
        updates[key] = coerceSickLeaveTiers(value);
        break;
      case "gosi":
        updates[key] = coerceGosi(value);
        break;
      case "wps":
        updates[key] = coerceWps(value);
        break;
      case "notifyOnCriticalCompliance":
        updates[key] = coerceEmailArray(value, key);
        break;
    }
  }
  return updates;
}

export const updateSchoolSettings = onCall<Record<string, unknown>>(
  { region: "us-central1" },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required.");

    const actor = await loadActor(callerUid);
    if (
      !actor ||
      actor.role !== "super_admin" ||
      actor.status === "blocked" ||
      actor.status === "suspended"
    ) {
      throw new HttpsError("permission-denied", "Only the Head Admin can edit school settings.");
    }

    const payload = req.data ?? {};
    if (typeof payload !== "object" || Array.isArray(payload)) {
      throw new HttpsError("invalid-argument", "Payload must be a settings object.");
    }

    const updates = coerceSettings(payload as Record<string, unknown>);
    if (Object.keys(updates).length === 0) {
      throw new HttpsError("invalid-argument", "No settings provided.");
    }

    const ref = db.doc(SETTINGS_DOC);
    const beforeSnap = await ref.get();
    const beforeData = beforeSnap.data() ?? {};
    const before: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      before[key] = beforeData[key] ?? null;
    }

    await ref.set(
      {
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: callerUid,
      },
      { merge: true },
    );

    await writeAudit({
      actorUid: callerUid,
      action: "settings.updated",
      // audit.ts's targetType union predates school_settings (CLAUDE.md
      // section 5 includes it); cast until the shared type catches up.
      targetType: "school_settings" as unknown as AuditEntry["targetType"],
      targetId: "current",
      before,
      after: updates,
    });

    logger.info(`updateSchoolSettings: ${callerUid} updated [${Object.keys(updates).join(", ")}]`);
    return { ok: true };
  },
);
