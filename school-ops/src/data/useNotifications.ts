// Real-time notifications subscription.
//
// A user receives notifications addressed to their uid, plus any broadcasts
// addressed to "role:<their-role>". Firestore can't OR-query across fields
// in one call, so we run two parallel subscriptions and merge in the client.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { collection, query, where } from "firebase/firestore";

import { db } from "../firebase";
import type { Actor } from "../permissions";
import type { NotificationDoc } from "../types";
import { useFirestoreQuery, toDate } from "./firestoreSubscription";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

function convert(id: string, data: Record<string, unknown>): NotificationDoc {
  return {
    id,
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    readAt: toDate(data.readAt),
  } as NotificationDoc;
}

/**
 * Subscribe to the actor's personal notification feed (own + role broadcast).
 * Returns a list sorted newest-first, plus an `unread` count.
 */
export function useNotifications(actor: Actor | null) {
  const uid = actor?.uid ?? null;
  const role = actor?.role ?? null;

  const mineQuery = useFirestoreQuery<NotificationDoc>(
    [...NOTIFICATIONS_KEY, "mine", uid ?? "__none__"],
    () => (uid ? query(collection(db, "notifications"), where("targetUid", "==", uid)) : null),
    convert,
    { enabled: Boolean(uid) },
  );

  const roleQuery = useFirestoreQuery<NotificationDoc>(
    [...NOTIFICATIONS_KEY, "role", role ?? "__none__"],
    () => (role ? query(collection(db, "notifications"), where("targetUid", "==", `role:${role}`)) : null),
    convert,
    { enabled: Boolean(role) },
  );

  return useMemo(() => {
    const list = [...(mineQuery.data ?? []), ...(roleQuery.data ?? [])];
    list.sort((a, b) => {
      const at = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const bt = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return bt - at;
    });
    return {
      notifications: list,
      unread: list.filter((n) => !n.readAt).length,
      isLoading: mineQuery.isLoading || roleQuery.isLoading,
    };
  }, [mineQuery.data, mineQuery.isLoading, roleQuery.data, roleQuery.isLoading]);
}

/** Returns only the unread count — cheap, for the nav badge. */
export function useUnreadCount(actor: Actor | null): number {
  const { unread } = useNotifications(actor);
  return unread;
}

// Re-export for any direct cache invalidations (kept here so callers don't
// import from @tanstack/react-query in app code unnecessarily).
export { useQuery };
