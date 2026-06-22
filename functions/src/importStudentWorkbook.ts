// Student System workbook import — Head Admin (super_admin) ONLY.
//
// The admin's browser sends the .xlsx bytes as base64 directly in the callable
// request (the workbook is small). We parse with the oracle-validated TS parser,
// compute every metric, and write the sis_* collections via the Admin SDK (the
// only write path — firestore.rules deny all client writes to sis_*). No Cloud
// Storage hop: children's PII is parsed in memory and never persisted as a file.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";

import { db } from "./admin";
import { writeAudit } from "./audit";
import { canImportStudents } from "./permissions";
import { loadActor } from "./userMutations";
import { loadWorkbookTidy } from "./sis/parser";
import { runPipeline } from "./sis/metrics";
import { persistImport } from "./sisWrites";

const MAX_BYTES = 15 * 1024 * 1024;

export const importStudentWorkbook = onCall<{ fileBase64?: string; fileName?: string }>(
  { region: "us-central1", memory: "1GiB", timeoutSeconds: 540, maxInstances: 2 },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required.");

    const actor = await loadActor(callerUid);
    if (!canImportStudents(actor)) {
      throw new HttpsError("permission-denied", "Only the Head Admin can import student data.");
    }

    const fileBase64 = req.data?.fileBase64;
    const fileName = String(req.data?.fileName || "workbook.xlsx");
    if (!fileBase64 || typeof fileBase64 !== "string") {
      throw new HttpsError("invalid-argument", "fileBase64 is required.");
    }
    const buffer = Buffer.from(fileBase64, "base64");
    if (buffer.length === 0) throw new HttpsError("invalid-argument", "Uploaded file is empty.");
    if (buffer.length > MAX_BYTES) throw new HttpsError("invalid-argument", "Workbook exceeds the 15 MB limit.");

    const batchRef = db.collection("sis_import_batches").doc();
    const batchId = batchRef.id;

    // Record the attempt BEFORE the heavy work so a crash leaves a visible record.
    await batchRef.set({
      status: "processing",
      fileName,
      importedBy: callerUid,
      createdAt: FieldValue.serverTimestamp(),
    });

    try {
      const tidy = loadWorkbookTidy(buffer);
      const result = runPipeline(tidy);
      const counts = await persistImport(result, tidy, batchId, callerUid);

      // Per-sheet audit: header row, counts, detected columns — NO names/scores.
      const sheets = tidy.audit.sheets;
      await batchRef.set(
        { status: "completed", completedAt: FieldValue.serverTimestamp(), sheets, counts, latestYear: result.latestYear },
        { merge: true },
      );

      await writeAudit({
        actorUid: callerUid,
        action: "sis.imported",
        targetType: "student",
        targetId: batchId,
        targetAdminTier: false,
        metadata: { fileName, counts, sheets: Object.keys(sheets) },
      });

      logger.info(`importStudentWorkbook: ${callerUid} imported "${fileName}" batch=${batchId}`);
      return { ok: true, batchId, counts, sheets };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await batchRef
        .set({ status: "failed", failedAt: FieldValue.serverTimestamp(), error: message }, { merge: true })
        .catch(() => undefined);
      logger.error(`importStudentWorkbook failed batch=${batchId}: ${message}`);
      throw new HttpsError("internal", `Import failed: ${message}`);
    }
  },
);
