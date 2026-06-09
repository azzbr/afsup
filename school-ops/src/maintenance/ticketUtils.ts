// Pure ticket/maintenance helpers (Phase 2.8). No Firestore imports — all
// date fields are JS Dates (or ISO strings for legacy scheduled-task
// startDate) because the data layer converts Timestamps at the read boundary.

import { CATEGORY_GROUPS, type CategoryGroupKey } from "../constants";

// ============================================================================
// CATEGORY GROUPS
// ============================================================================

// item string -> group key, built once at module scope.
const ITEM_TO_GROUP = new Map<string, CategoryGroupKey>();
for (const group of CATEGORY_GROUPS) {
  for (const item of group.items) {
    ITEM_TO_GROUP.set(item, group.key);
  }
}

/** Group key containing the given category item; legacy/unknown -> 'other'. */
export function groupForCategory(category: string): CategoryGroupKey {
  return ITEM_TO_GROUP.get(category) ?? "other";
}

/** Display label for a group key, fallback 'Other'. */
export function categoryGroupLabel(key: string): string {
  const group = CATEGORY_GROUPS.find((g) => g.key === key);
  return group ? group.label : "Other";
}

// ============================================================================
// BUILDINGS
// ============================================================================

export type BuildingKey = "B3" | "B4" | "B5" | "Admin" | "Other";

const ADMIN_LOCATIONS = new Set([
  "B1 Admin Hall Ground",
  "B1 Admin Hall Up",
  "Principal Office",
  "Academics Office",
  "HR Office",
  "HOA Office",
  "Accounting Office",
  "Consulor Office",
  "Registration Office",
  "Registration Waiting Area",
]);

/**
 * Building bucket for a location string. Prefix match covers variants like
 * "B4- G4A" (no space after B4); the admin set covers B1 + office rooms.
 */
export function buildingOf(location: string): BuildingKey {
  if (ADMIN_LOCATIONS.has(location)) return "Admin";
  if (/^B3/.test(location)) return "B3";
  if (/^B4/.test(location)) return "B4";
  if (/^B5/.test(location)) return "B5";
  return "Other";
}

export const BUILDING_LABELS: Record<BuildingKey, string> = {
  B3: "Building 3 (KG)",
  B4: "Building 4 (G4-G5)",
  B5: "Building 5 (G1-G3)",
  Admin: "Admin & Offices",
  Other: "Other Areas",
};

// ============================================================================
// TIME / SLA
// ============================================================================

/**
 * Time-open badge for a ticket. Under 24h emerald, 24-48h amber, over 48h
 * red + urgent. Text like "5h" or "2d 3h".
 */
export function getTimeOpen(createdAt: Date | null | undefined): {
  text: string;
  color: string;
  urgent: boolean;
} {
  if (!createdAt) return { text: "N/A", color: "text-slate-400", urgent: false };
  const diffMs = Date.now() - createdAt.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  const text = diffDays > 0 ? `${diffDays}d ${diffHours % 24}h` : `${diffHours}h`;

  if (diffHours < 24) return { text, color: "text-emerald-600 bg-emerald-50", urgent: false };
  if (diffHours < 48) return { text, color: "text-amber-600 bg-amber-50", urgent: false };
  return { text, color: "text-red-600 bg-red-50", urgent: true };
}

/** Short human-readable ticket reference, e.g. '#A1B2C3'. */
export function shortRef(id: string): string {
  return "#" + id.slice(-6).toUpperCase();
}

// ============================================================================
// DUPLICATE GROUPING
// ============================================================================

interface DuplicatableTicket {
  category?: string;
  location?: string;
  createdAt?: Date | null;
}

// Missing createdAt is treated as newest (so it never becomes the primary).
function createdMillisOrInfinity(t: DuplicatableTicket): number {
  return t.createdAt instanceof Date ? t.createdAt.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Collapse active tickets sharing category + location into one entry.
 * Primary = oldest createdAt in the group; the rest become duplicates in
 * input order. Output preserves the input order of primaries.
 */
export function groupDuplicateTickets<T extends DuplicatableTicket>(
  tickets: T[],
): { primary: T; duplicates: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const ticket of tickets) {
    const key = `${ticket.category ?? ""}||${ticket.location ?? ""}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(ticket);
    else groups.set(key, [ticket]);
  }

  const result: { primary: T; duplicates: T[]; order: number }[] = [];
  for (const bucket of groups.values()) {
    let primary = bucket[0];
    for (const t of bucket) {
      if (createdMillisOrInfinity(t) < createdMillisOrInfinity(primary)) primary = t;
    }
    result.push({
      primary,
      duplicates: bucket.filter((t) => t !== primary),
      order: tickets.indexOf(primary),
    });
  }

  result.sort((a, b) => a.order - b.order);
  return result.map(({ primary, duplicates }) => ({ primary, duplicates }));
}

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

function asDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Next due date for a scheduled task: nextRun, else lastRun + frequencyDays,
 * else startDate (legacy docs store it as an ISO string), else null.
 */
export function computeScheduleDue(task: {
  nextRun?: Date | string | null;
  lastRun?: Date | string | null;
  startDate?: Date | string | null;
  frequencyDays?: number;
}): Date | null {
  const nextRun = asDate(task.nextRun);
  if (nextRun) return nextRun;

  const lastRun = asDate(task.lastRun);
  if (lastRun) {
    const days = typeof task.frequencyDays === "number" ? task.frequencyDays : 0;
    return new Date(lastRun.getTime() + days * 24 * 60 * 60 * 1000);
  }

  return asDate(task.startDate);
}

// ============================================================================
// SORTING
// ============================================================================

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

interface SortableTicket {
  priority?: string;
  createdAt?: Date | null;
}

function createdMillis(t: SortableTicket): number {
  return t.createdAt instanceof Date ? t.createdAt.getTime() : 0;
}

export const ticketSorters = {
  /** Priority rank (critical first), then oldest first within a rank. */
  urgent: (a: SortableTicket, b: SortableTicket): number => {
    const rankDiff =
      (PRIORITY_RANK[a.priority ?? ""] ?? 4) - (PRIORITY_RANK[b.priority ?? ""] ?? 4);
    if (rankDiff !== 0) return rankDiff;
    return createdMillis(a) - createdMillis(b);
  },
  newest: (a: SortableTicket, b: SortableTicket): number => createdMillis(b) - createdMillis(a),
  oldest: (a: SortableTicket, b: SortableTicket): number => createdMillis(a) - createdMillis(b),
};
