import { collection } from "firebase/firestore";
import { db } from "../firebase";
import type { ScheduledTask } from "../types";
import { useFirestoreQuery, toDate } from "./firestoreSubscription";

export const SCHEDULED_TASKS_KEY = ["scheduled_tasks"] as const;

function convert(id: string, data: Record<string, unknown>): ScheduledTask {
  return {
    id,
    ...data,
    lastRun: toDate(data.lastRun),
    nextRun: toDate(data.nextRun),
    nextDue: toDate(data.nextDue),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as ScheduledTask;
}

export function useScheduledTasks(enabled = true) {
  return useFirestoreQuery<ScheduledTask>(
    [...SCHEDULED_TASKS_KEY],
    () => collection(db, "scheduled_tasks"),
    convert,
    { enabled },
  );
}
