// Deterministic Firestore document ids for the sis_* collections — shared by the
// import Cloud Function (writes) and the client read hooks so both sides agree.
// A stable id turns a re-import into an idempotent upsert (overwrite in place)
// instead of an append. Tokens are URL/doc-id safe: numeric ids, "YYYY-YYYY"
// years, UPPER_SNAKE subjects, "1"/"2"/"annual" terms.

import type { StudentId } from "./types";

function termToken(term: number): string {
  return term === 0 ? "annual" : String(term);
}

function transitionToken(transition: string): string {
  // "2023-2024 → 2024-2025" -> "2023-2024_to_2024-2025"
  return transition.replace(/\s*→\s*/g, "_to_");
}

export function studentDocId(studentId: StudentId): string {
  return String(studentId);
}

export function enrollmentDocId(studentId: StudentId, year: string): string {
  return `${studentId}_${year}`;
}

export function academicRecordDocId(studentId: StudentId, year: string, subject: string, term: number): string {
  return `${studentId}_${year}_${subject}_${termToken(term)}`;
}

export function attendanceDocId(studentId: StudentId, year: string, term: number): string {
  return `${studentId}_${year}_${termToken(term)}`;
}

export function studentYearMetricsDocId(studentId: StudentId, year: string): string {
  return `${studentId}_${year}`;
}

export function progressMetricsDocId(studentId: StudentId, transition: string): string {
  return `${studentId}_${transitionToken(transition)}`;
}

export function riskFlagDocId(studentId: StudentId, year: string): string {
  return `${studentId}_${year}`;
}
