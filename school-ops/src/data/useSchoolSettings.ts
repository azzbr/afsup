// School-wide settings — singleton doc school_settings/current.
//
// The doc may not exist yet (Phase 2.6 bootstrap), so consumers should run
// the hook result through effectiveSettings() to fall back to the defaults
// below. Head Admin is the only editor; HR/admin read — see CLAUDE.md
// sections 5 and 6.

import { doc, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import type { SchoolSettings } from "../types";
import { useFirestoreDoc, toDate } from "./firestoreSubscription";

export const SCHOOL_SETTINGS_KEY = ["school_settings"] as const;

// Defaults mirror the previously hardcoded values — CLAUDE.md section 5.
export const DEFAULT_SCHOOL_SETTINGS = {
  schoolNameEn: "Al Fajer International School",
  schoolNameAr: "Al Fajer International School",
  domain: "afs.edu.bh",
  academicYearStart: null,
  academicYearEnd: null,
  workingDays: ["sun", "mon", "tue", "wed", "thu"],
  weeklyOffDays: ["fri", "sat"],
  publicHolidays: [],
  defaultAnnualLeaveDays: 30,
  sickLeaveTiers: { fullPay: 15, halfPay: 20, noPay: 20 },
  gosi: {
    bahraini: { employerRate: 0.17, employeeRate: 0.08 },
    expat: { employerRate: 0.03, employeeRate: 0.01 },
  },
  wps: { employerCR: "", bankRoutingCode: "" },
  notifyOnCriticalCompliance: ["principal@afs.edu.bh"],
  updatedAt: null,
  updatedBy: null,
} satisfies SchoolSettings;

function convertSettings(_id: string, data: DocumentData): SchoolSettings {
  const rawHolidays = Array.isArray(data.publicHolidays) ? data.publicHolidays : null;
  return {
    ...data,
    academicYearStart: toDate(data.academicYearStart),
    academicYearEnd: toDate(data.academicYearEnd),
    updatedAt: toDate(data.updatedAt),
    ...(rawHolidays
      ? {
          publicHolidays: rawHolidays.map((h: { date?: unknown; label?: unknown }) => ({
            date: toDate(h?.date),
            label: String(h?.label ?? ""),
          })),
        }
      : {}),
  } as SchoolSettings;
}

/** Subscribe to school_settings/current. Returns null until the doc exists. */
export function useSchoolSettings() {
  return useFirestoreDoc<SchoolSettings>(
    [...SCHOOL_SETTINGS_KEY, "current"],
    () => doc(db, "school_settings", "current"),
    convertSettings,
  );
}

/**
 * Deep-merge a possibly-null/partial settings doc over the defaults so every
 * consumer sees a fully populated object. Nested gosi/wps/sickLeaveTiers
 * merge field-by-field; everything else is a shallow override.
 */
export function effectiveSettings(partial: SchoolSettings | null | undefined): SchoolSettings {
  if (!partial) return DEFAULT_SCHOOL_SETTINGS;
  return {
    ...DEFAULT_SCHOOL_SETTINGS,
    ...partial,
    sickLeaveTiers: { ...DEFAULT_SCHOOL_SETTINGS.sickLeaveTiers, ...partial.sickLeaveTiers },
    gosi: {
      bahraini: { ...DEFAULT_SCHOOL_SETTINGS.gosi.bahraini, ...partial.gosi?.bahraini },
      expat: { ...DEFAULT_SCHOOL_SETTINGS.gosi.expat, ...partial.gosi?.expat },
    },
    wps: { ...DEFAULT_SCHOOL_SETTINGS.wps, ...partial.wps },
  };
}
