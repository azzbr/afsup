// Real-time subscription to maintenance_tickets, scoped by viewer permissions.

import { collection, doc, query, where } from "firebase/firestore";
import { db } from "../firebase";
import type { Ticket } from "../types";
import type { Actor } from "../permissions";
import { can } from "../permissions";
import { useFirestoreDoc, useFirestoreQuery, toDate } from "./firestoreSubscription";

export const TICKETS_KEY = ["tickets"] as const;

function convertTicket(id: string, data: Record<string, unknown>): Ticket {
  return {
    id,
    ...data,
    createdAt: toDate(data.createdAt),
    startedAt: toDate(data.startedAt),
    resolvedAt: toDate(data.resolvedAt),
    lastNoteAt: toDate(data.lastNoteAt),
    updatedAt: toDate(data.updatedAt),
  } as Ticket;
}

/**
 * Returns the tickets the given actor is allowed to see.
 * - actors with ticket.view.all: every ticket
 * - others: only tickets they reported
 * - null actor: empty
 */
export function useTickets(actor: Actor | null) {
  const seeAll = can(actor, "ticket.view.all");
  const uid = actor?.uid ?? null;

  const scope = seeAll ? "all" : uid ? `own:${uid}` : "none";

  return useFirestoreQuery<Ticket>(
    [...TICKETS_KEY, scope],
    () => {
      if (seeAll) return collection(db, "maintenance_tickets");
      if (uid) return query(collection(db, "maintenance_tickets"), where("reportedBy", "==", uid));
      return null;
    },
    convertTicket,
    { enabled: scope !== "none" },
  );
}

export function useTicket(id: string | null | undefined) {
  return useFirestoreDoc<Ticket>(
    [...TICKETS_KEY, "single", id ?? "__none__"],
    () => (id ? doc(db, "maintenance_tickets", id) : null),
    convertTicket,
    { enabled: Boolean(id) },
  );
}
