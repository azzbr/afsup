// Student System workbook import — Head Admin (super_admin) ONLY.
//
// The admin uploads an .xlsx to sis-imports/{uid}/... in Storage, then calls this
// with { storagePath }. We download it, parse with the oracle-validated TS parser,
// compute every metric, and write the sis_* collections via the Admin SDK (the
// only write path — firestore.rules deny all client writes to sis_*). The temp
// upload is deleted afterwards so children's PII is never left at rest.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { db } from "./admin";
import { writeAudit } from "./audit";
import { canImportStudents } from "./permissions";
import { loadActor } from "./userMutations";
import { loadWorkbookTidy } from "./sis/parser";
import { runPipeline } from "./sis/metrics";
import { persistImport } from "./sisWrites";

export const importStudentWorkbook = onCall<{ storagePath?: string }>(
  { region: "us-central1", memory: "1GiB", timeoutSeconds: 540, maxInstances: 2 },
  async (req) => {
    const callerUid = req.auth?.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Sign in required.");

    const actor = await loadActor(callerUid);
    if (!canImportStudents(actor)) {
      throw new HttpsError("permission-denied", "Only the Head Admin can import student data.");
    }

    const storagePath = req.data?.storagePath;
    if (!storagePath || typeof storagePath !== "string") {
      throw new HttpsError("invalid-argument", "storagePath is required.");
    }
    // Only files the caller uploaded to their own admin-only import folder.
    if (!storagePath.startsWith(`sis-imports/${callerUid}/`)) {
      throw new HttpsError("permission-denied", "Import path must be under your sis-imports folder.");
    }

    const batchRef = db.collection("sis_import_batches").doc();
    const batchId = batchRef.id;
    const fileName = storagePath.split("/").pop() ?? storagePath;

    // Record the attempt BEFORE the heavy work so a crash leaves a visible record.
    await batchRef.set({
      status: "processing",
      storagePath,
      fileName,
      importedBy: callerUid,
      createdAt: FieldValue.serverTimestamp(),
    });

    const file = getStorage().bucket().file(storagePath);
    try {
      const [buffer] = await file.download();
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
    } finally {
      // Delete the uploaded workbook (children's PII) whatever happens.
      await file.delete({ ignoreNotFound: true }).catch((e) => logger.warn(`temp cleanup failed: ${e}`));
    }
  },
);
