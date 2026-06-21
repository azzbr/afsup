// Tidy ("long") row shapes the SIS parser (Phase 1c) emits and the metrics
// module (Phase 1b) consumes — one row per (student, year, subject, term) for
// scores and per (student, year, term, metric) for attendance. Mirrors the
// `Tidy` dataclass in SIS/sis_engine.py. These are INTERNAL pipeline shapes;
// the Firestore document interfaces live in school-ops/src/types.ts.

import type { AttendanceMetric } from "./lib/parse";

/** A student id as parsed from the workbook (numeric when coercible, else raw). */
export type StudentId = string | number;

/** One subject score for one student/year/term (score null when N/A/blank). */
export interface ScoreRow {
  studentId: StudentId;
  year: string;
  yearStart: number;
  grade: number | null;
  section: string | null;
  subject: string;
  term: number;
  score: number | null;
}

/** One attendance figure for one student/year/term (term 0 = annual). */
export interface AttendanceCellRow {
  studentId: StudentId;
  year: string;
  yearStart: number;
  grade: number | null;
  section: string | null;
  term: number;
  metric: AttendanceMetric;
  value: number | null;
}

/** Latest known display name per student id. */
export interface StudentNameRow {
  studentId: StudentId;
  name: string;
}

/** Per-sheet ingestion audit (header row, counts, detected columns). */
export interface SheetAudit {
  headerRowExcel: number;
  students: number;
  subjectsDetected: string[];
  attendanceDetected: string[];
  nameColumn: string;
}

export interface TidyAudit {
  sheets: Record<string, SheetAudit>;
}

/** The normalized workbook: long score/attendance rows + student names + audit. */
export interface Tidy {
  scores: ScoreRow[];
  attendance: AttendanceCellRow[];
  students: StudentNameRow[];
  audit: TidyAudit;
}
