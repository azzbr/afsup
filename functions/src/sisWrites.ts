// SIS Firestore write layer (Phase 1d). Persists a computed import into the sis_*
// collections via BulkWriter using DETERMINISTIC document ids (so a re-import is
// an idempotent upsert, not an append), then sweeps any document not refreshed by
// this import (handles a shrunk roster). Admin SDK only — bypasses firestore.rules
// (which deny all client writes to sis_*).
//
// `./sis/*` is a build-time copy of school-ops/src/sis (see scripts/copy-sis.mjs)
// so the oracle-validated parser/metrics are the single source of truth.

import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { db } from "./admin";
import type { PipelineResult } from "./sis/metrics";
import type { Tidy } from "./sis/types";
import {
  studentDocId,
  enrollmentDocId,
  academicRecordDocId,
  attendanceDocId,
  studentYearMetricsDocId,
  progressMetricsDocId,
  riskFlagDocId,
} from "./sis/docIds";

const C = {
  students: "sis_students",
  enrollments: "sis_enrollments",
  academic: "sis_academic_records",
  attendance: "sis_attendance",
  yearMetrics: "sis_student_year_metrics",
  progress: "sis_progress_metrics",
  risk: "sis_risk_flags",
} as const;

// Singleton holding workbook-level aggregates for the Overview/Cohort views.
const ANALYTICS_DOC = "sis_analytics/current";

// Collections that are per-student and get the generation-sweep on re-import.
const SWEPT = Object.values(C);

export interface ImportCounts {
  students: number;
  enrollments: number;
  academicRecords: number;
  attendance: number;
  studentYearMetrics: number;
  progressMetrics: number;
  riskFlags: number;
  swept: number;
}

function buildAnalytics(result: PipelineResult, batchId: string, actorUid: string) {
  const latest = result.latestYear;
  const latestStudents = result.studentYear.filter((s) => s.year === latest);
  const overalls = latestStudents.map((s) => s.overall);
  const avgAttainment = overalls.length ? overalls.reduce((a, b) => a + b, 0) / overalls.length : null;
  const trackedCohort = result.progressSummary.find((s) => latest != null && s.transition.endsWith(latest))?.n ?? 0;
  const atRisk = result.risk.filter((r) => r.tier === "critical" || r.tier === "attendance_risk").length;

  return {
    latestYear: latest,
    years: [...new Set(result.studentYear.map((s) => s.year))].sort(),
    kpis: {
      totalStudents: latestStudents.length,
      trackedCohort,
      atRisk,
      avgAttainment,
    },
    cohortTrajectory: result.progressSummary, // mean overall per transition
    bottleneckGrid: result.bottleneckGrid,
    bottleneckDrops: result.bottleneckDrops,
    sectionSpread: result.sectionSpread,
    termSlump: result.termSlump,
    termSlumpOverall: result.termSlumpOverall,
    attendanceSummary: result.attendanceSummary,
    attendanceBands: result.attendanceBands,
    subjectProgress: result.subjectProgress,
    importBatchId: batchId,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorUid,
  };
}

/** Delete every doc in `coll` whose importBatchId is not the current batch. */
async function sweepStale(coll: string, batchId: string): Promise<number> {
  const snap = await db.collection(coll).where("importBatchId", "!=", batchId).get();
  if (snap.empty) return 0;
  const writer = db.bulkWriter();
  snap.docs.forEach((d) => void writer.delete(d.ref));
  await writer.close();
  return snap.size;
}

/**
 * Write a full computed import. All per-student docs are stamped with
 * `importBatchId` then stale docs are swept. Throws if any write ultimately fails.
 */
export async function persistImport(
  result: PipelineResult,
  tidy: Tidy,
  batchId: string,
  actorUid: string,
): Promise<ImportCounts> {
  const writer = db.bulkWriter();
  const failures: Error[] = [];
  writer.onWriteError((err) => {
    if (err.failedAttempts < 5) return true; // retry transient errors
    failures.push(err);
    return false;
  });

  // Every import-written doc carries this stamp (no createdAt: docs are fully
  // regenerated each import, so "updated" is the meaningful timestamp).
  const stamp = { importBatchId: batchId, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorUid };
  const counts: ImportCounts = {
    students: 0,
    enrollments: 0,
    academicRecords: 0,
    attendance: 0,
    studentYearMetrics: 0,
    progressMetrics: 0,
    riskFlags: 0,
    swept: 0,
  };

  // students
  for (const s of tidy.students) {
    void writer.set(
      db.collection(C.students).doc(studentDocId(s.studentId)),
      { studentId: s.studentId, name: s.name, ...stamp },
      { merge: true },
    );
    counts.students++;
  }

  // enrollments + per-year metrics (overall + attendance rollup for KPIs)
  const attByYear = new Map(result.attendanceYear.map((a) => [`${a.studentId}|${a.year}`, a]));
  for (const sy of result.studentYear) {
    void writer.set(
      db.collection(C.enrollments).doc(enrollmentDocId(sy.studentId, sy.year)),
      { studentId: sy.studentId, year: sy.year, yearStart: sy.yearStart, grade: sy.grade, section: sy.section, ...stamp },
      { merge: true },
    );
    counts.enrollments++;

    const a = attByYear.get(`${sy.studentId}|${sy.year}`) ?? null;
    void writer.set(
      db.collection(C.yearMetrics).doc(studentYearMetricsDocId(sy.studentId, sy.year)),
      {
        studentId: sy.studentId,
        year: sy.year,
        yearStart: sy.yearStart,
        grade: sy.grade,
        section: sy.section,
        overall: sy.overall,
        subjectsTaken: sy.subjectsTaken,
        daysSchool: a?.daysSchool ?? null,
        daysAbsent: a?.daysAbsent ?? null,
        absenceRate: a?.absenceRate ?? null,
        ...stamp,
      },
      { merge: true },
    );
    counts.studentYearMetrics++;
  }

  // raw academic records (per student/year/subject/term, score nullable)
  for (const r of tidy.scores) {
    void writer.set(
      db.collection(C.academic).doc(academicRecordDocId(r.studentId, r.year, r.subject, r.term)),
      {
        studentId: r.studentId,
        year: r.year,
        yearStart: r.yearStart,
        subject: r.subject,
        term: r.term,
        grade: r.grade,
        section: r.section,
        score: r.score,
        ...stamp,
      },
      { merge: true },
    );
    counts.academicRecords++;
  }

  // attendance pivoted to one doc per (student, year, term)
  const attTerm = new Map<
    string,
    { studentId: Tidy["attendance"][number]["studentId"]; year: string; yearStart: number; term: number; daysSchool: number; daysPresent: number; daysAbsent: number; daysTardy: number }
  >();
  for (const a of tidy.attendance) {
    if (a.value === null || a.value === undefined || !Number.isFinite(a.value)) continue;
    const key = `${a.studentId}|${a.year}|${a.term}`;
    let doc = attTerm.get(key);
    if (!doc) {
      doc = { studentId: a.studentId, year: a.year, yearStart: a.yearStart, term: a.term, daysSchool: 0, daysPresent: 0, daysAbsent: 0, daysTardy: 0 };
      attTerm.set(key, doc);
    }
    if (a.metric === "days_school") doc.daysSchool += a.value;
    else if (a.metric === "days_present") doc.daysPresent += a.value;
    else if (a.metric === "days_absent") doc.daysAbsent += a.value;
    else if (a.metric === "days_tardy") doc.daysTardy += a.value;
  }
  for (const doc of attTerm.values()) {
    void writer.set(
      db.collection(C.attendance).doc(attendanceDocId(doc.studentId, doc.year, doc.term)),
      { ...doc, ...stamp },
      { merge: true },
    );
    counts.attendance++;
  }

  // progress metrics (per student per transition)
  for (const d of result.progressDetail) {
    void writer.set(
      db.collection(C.progress).doc(progressMetricsDocId(d.studentId, d.transition)),
      {
        studentId: d.studentId,
        transition: d.transition,
        prev: d.prev,
        curr: d.curr,
        gradePrev: d.gradePrev,
        gradeCurr: d.gradeCurr,
        rawDelta: d.rawDelta,
        expected: d.expected,
        progressIndex: d.progressIndex,
        ...stamp,
      },
      { merge: true },
    );
    counts.progressMetrics++;
  }

  // risk flags (latest year). Name is NOT denormalized here — the UI joins to
  // sis_students — to avoid duplicating PII across collections.
  for (const r of result.risk) {
    void writer.set(
      db.collection(C.risk).doc(riskFlagDocId(r.studentId, r.year)),
      {
        studentId: r.studentId,
        year: r.year,
        grade: r.grade,
        section: r.section,
        overall: r.overall,
        progressIndex: r.progressIndex,
        rawDelta: r.rawDelta,
        expected: r.expected,
        daysAbsent: r.daysAbsent,
        absenceRate: r.absenceRate,
        tier: r.tier,
        signals: r.signals,
        ...stamp,
      },
      { merge: true },
    );
    counts.riskFlags++;
  }

  // workbook-level aggregates singleton (Overview + Cohort Analysis)
  void writer.set(db.doc(ANALYTICS_DOC), buildAnalytics(result, batchId, actorUid), { merge: false });

  await writer.close();
  if (failures.length > 0) {
    throw new Error(`SIS import write failed for ${failures.length} document(s): ${failures[0].message}`);
  }

  for (const coll of SWEPT) {
    counts.swept += await sweepStale(coll, batchId);
  }
  logger.info(`persistImport batch=${batchId} wrote ${JSON.stringify(counts)}`);
  return counts;
}
