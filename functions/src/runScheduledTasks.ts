// Hourly scheduler — creates maintenance tickets from active scheduled_tasks
// when their next-run date has arrived.
//
// Before this existed, the "Scheduled Maintenance" feature in the admin UI
// was dead code: schedules sat in Firestore and nothing ever ran them.
//
// Idempotency: Cloud Scheduler is at-least-once. Each due task is processed
// inside a Firestore transaction that re-reads the task and checks the due
// date — so a retry that overlaps the previous invocation cannot create
// duplicate tickets.

import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "./admin";
import { writeAudit } from "./audit";

const DAY_MS = 24 * 60 * 60 * 1000;

interface ScheduledTaskDoc {
  category: string;
  locations: string[];
  priority: string;
  frequencyDays: number;
  startDate?: string;            // ISO from the create form
  isStartImmediately?: boolean;
  description: string;
  lastRun?: Timestamp | null;
  nextRun?: Timestamp | null;    // set by us after each run
  isActive?: boolean;
}

/**
 * Returns the timestamp at which this task should next produce tickets, or
 * null if we can't determine one (no startDate and never run).
 */
function computeDueDate(task: ScheduledTaskDoc): Date | null {
  if (task.nextRun) return task.nextRun.toDate();

  if (task.lastRun) {
    const last = task.lastRun.toDate();
    if (!task.frequencyDays || task.frequencyDays <= 0) return null;
    return new Date(last.getTime() + task.frequencyDays * DAY_MS);
  }

  // First-time run: respect startDate if present.
  if (task.startDate) {
    const start = new Date(task.startDate);
    return isNaN(start.getTime()) ? null : start;
  }
  return null;
}

export const runScheduledTasks = onSchedule(
  {
    schedule: "every 1 hours",
    region: "us-central1",
    timeZone: "Asia/Bahrain",
  },
  async () => {
    const now = new Date();
    const snap = await db.collection("scheduled_tasks").get();

    let processedSchedules = 0;
    let createdTickets = 0;

    for (const docSnap of snap.docs) {
      let ticketsCreatedForThisTask = 0;
      let didRun = false;

      try {
        await db.runTransaction(async (tx) => {
          const freshSnap = await tx.get(docSnap.ref);
          if (!freshSnap.exists) return;

          const task = freshSnap.data() as ScheduledTaskDoc;
          if (task.isActive === false) return;
          if (!task.locations || task.locations.length === 0) return;
          if (!task.frequencyDays || task.frequencyDays <= 0) return;

          const due = computeDueDate(task);
          if (!due || due > now) return;

          // Create one ticket per location
          for (const location of task.locations) {
            const ticketRef = db.collection("maintenance_tickets").doc();
            tx.set(ticketRef, {
              category: task.category,
              location,
              description: task.description,
              priority: task.priority || "medium",
              status: "open",
              reportedBy: null,
              reporterName: "Scheduled Maintenance",
              submittedBy: null,
              imageUrls: [],
              warnings: 0,
              notes: [],
              source: "scheduled_task",
              scheduledTaskId: docSnap.id,
              createdAt: FieldValue.serverTimestamp(),
              createdBy: "system",
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: "system",
            });
            ticketsCreatedForThisTask++;
          }

          // Advance lastRun + compute next nextRun forward from "now"
          const nextRunDate = new Date(now.getTime() + task.frequencyDays * DAY_MS);
          tx.update(docSnap.ref, {
            lastRun: Timestamp.fromDate(now),
            nextRun: Timestamp.fromDate(nextRunDate),
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: "system",
          });

          didRun = true;
        });
      } catch (err) {
        logger.error(`Failed to run scheduled task ${docSnap.id}`, err);
        continue;
      }

      if (didRun) {
        processedSchedules++;
        createdTickets += ticketsCreatedForThisTask;
        await writeAudit({
          actorUid: "system",
          action: "scheduledTask.ran",
          targetType: "scheduled_task",
          targetId: docSnap.id,
          metadata: {
            ticketsCreated: ticketsCreatedForThisTask,
            category: (docSnap.data() as ScheduledTaskDoc).category,
          },
        });
      }
    }

    logger.info(
      `Scheduler tick complete. Processed ${processedSchedules} schedules, created ${createdTickets} tickets.`,
    );
  },
);
