// Bridges Firestore real-time `onSnapshot` subscriptions to React Query's cache.
//
// Why this pattern?
// - `useQuery` already gives us caching, dedup, loading/error state, devtools.
// - But Firestore's idiomatic read API is push-based (`onSnapshot`), not poll.
// - The bridge: open ONE subscription per cache key, write incoming snapshots
//   into React Query via `queryClient.setQueryData`. Multiple components asking
//   for the same key share one network subscription.

import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  onSnapshot,
  type Query,
  type DocumentReference,
  type DocumentData,
  type FirestoreError,
} from "firebase/firestore";

import { queryClient } from "./queryClient";

// Track active subscriptions per JSON-stringified key so we open exactly one.
const activeSubscriptions = new Map<string, { count: number; unsubscribe: () => void }>();

function keyOf(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

/**
 * Subscribe to a Firestore Query (collection or query) and expose the data
 * via React Query. The `convert` function transforms each document into the
 * shape your hook returns; this is where Firestore Timestamps become Dates.
 */
export function useFirestoreQuery<T>(
  queryKey: QueryKey,
  buildQuery: () => Query<DocumentData> | null,
  convert: (id: string, data: DocumentData) => T,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const q = buildQuery();
    if (!q) return;

    const k = keyOf(queryKey);
    const existing = activeSubscriptions.get(k);
    if (existing) {
      existing.count += 1;
      return () => {
        existing.count -= 1;
        if (existing.count <= 0) {
          existing.unsubscribe();
          activeSubscriptions.delete(k);
        }
      };
    }

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => convert(d.id, d.data()));
        qc.setQueryData<T[]>(queryKey, data);
      },
      (error: FirestoreError) => {
        qc.setQueryData(queryKey, () => {
          throw error;
        });
      },
    );

    activeSubscriptions.set(k, { count: 1, unsubscribe });
    return () => {
      const entry = activeSubscriptions.get(k);
      if (!entry) return;
      entry.count -= 1;
      if (entry.count <= 0) {
        entry.unsubscribe();
        activeSubscriptions.delete(k);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, keyOf(queryKey)]);

  return useQuery<T[]>({
    queryKey,
    // We never actually need to fetch: the subscription pushes data in.
    // queryFn is only called if the subscription is disabled.
    queryFn: () => [],
    enabled,
    // Don't expire: subscription will replace it when data changes.
    staleTime: Infinity,
  });
}

/**
 * Subscribe to a single Firestore document.
 */
export function useFirestoreDoc<T>(
  queryKey: QueryKey,
  buildRef: () => DocumentReference<DocumentData> | null,
  convert: (id: string, data: DocumentData) => T,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const ref = buildRef();
    if (!ref) return;

    const k = keyOf(queryKey);
    const existing = activeSubscriptions.get(k);
    if (existing) {
      existing.count += 1;
      return () => {
        existing.count -= 1;
        if (existing.count <= 0) {
          existing.unsubscribe();
          activeSubscriptions.delete(k);
        }
      };
    }

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          qc.setQueryData<T | null>(queryKey, convert(snap.id, snap.data()!));
        } else {
          qc.setQueryData<T | null>(queryKey, null);
        }
      },
      (error: FirestoreError) => {
        qc.setQueryData(queryKey, () => {
          throw error;
        });
      },
    );

    activeSubscriptions.set(k, { count: 1, unsubscribe });
    return () => {
      const entry = activeSubscriptions.get(k);
      if (!entry) return;
      entry.count -= 1;
      if (entry.count <= 0) {
        entry.unsubscribe();
        activeSubscriptions.delete(k);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, keyOf(queryKey)]);

  return useQuery<T | null>({
    queryKey,
    queryFn: () => null,
    enabled,
    staleTime: Infinity,
  });
}

/** Convert a Firestore Timestamp (or anything with `.toDate()`) to a JS Date. */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const fn = (value as { toDate: () => Date }).toDate;
    if (typeof fn === "function") return fn.call(value);
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Re-export the shared client for callers that want imperative access.
export { queryClient };
