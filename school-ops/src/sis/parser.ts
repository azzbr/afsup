// The ONLY SheetJS consumer in the SIS module. Reads a messy grade workbook into
// the tidy long shape (types.ts) using the meaning-based helpers from lib/parse.
// Ported from load_workbook_tidy in SIS/sis_engine.py. Works on the raw cell grid
// by POSITION (not header name) so duplicate/blank headers can't collide.
//
// Runs server-side only (the import Cloud Function, Phase 1d) and in tests —
// never in the browser bundle, so children's PII never reaches the client.

import * as XLSX from "xlsx";
import {
  classifyColumn,
  findHeaderRow,
  parseSection,
  toScore,
  toAttendanceNumber,
  yearStart,
  yearClean,
  type ColumnInfo,
} from "./lib/parse";
import type { AttendanceCellRow, ScoreRow, StudentId, StudentNameRow, Tidy } from "./types";

function notNa(v: unknown): boolean {
  return v !== null && v !== undefined && !(typeof v === "number" && Number.isNaN(v));
}

function rowAllEmpty(row: readonly unknown[]): boolean {
  return row.every((c) => c === null || c === undefined || (typeof c === "string" && c.trim() === ""));
}

/** Coerce a student id like the oracle: int(float(sid)) when numeric, else trimmed string. */
function coerceStudentId(raw: unknown): StudentId {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (Number.isFinite(n)) return Math.trunc(n);
  return String(raw).trim();
}

function compareStudentId(a: StudentId, b: StudentId): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Blank/unlabeled name column fallback: the first "ignore" column (not id/section/
 * grade) whose non-null values are mostly text (>60% contain a letter) and rarely
 * numeric (<30% numeric-coercible). Mirrors the fallback in load_workbook_tidy.
 */
function findNameColumn(
  colInfos: readonly ColumnInfo[],
  dataRows: readonly (readonly unknown[])[],
  idCol: number,
  secCol: number,
  grdCol: number,
): number {
  for (let i = 0; i < colInfos.length; i++) {
    if (colInfos[i].kind !== "ignore") continue;
    if (i === idCol || i === secCol || i === grdCol) continue;
    const full = dataRows.map((r) => r[i]);
    const nonNull = full.filter(notNa);
    if (nonNull.length === 0) continue;
    const letterFrac = nonNull.filter((v) => /[A-Za-z]/.test(String(v))).length / nonNull.length;
    const numericCount = full.filter((v) => notNa(v) && Number.isFinite(typeof v === "number" ? v : Number(String(v)))).length;
    const numericFrac = numericCount / full.length;
    if (letterFrac > 0.6 && numericFrac < 0.3) return i;
  }
  return -1;
}

/**
 * Parse an .xlsx workbook (one sheet per academic year) into tidy long rows.
 * `data` may be a Node Buffer, Uint8Array, or ArrayBuffer.
 */
export function loadWorkbookTidy(data: Uint8Array | ArrayBuffer): Tidy {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wb = XLSX.read(u8, { type: "array" });

  const scores: ScoreRow[] = [];
  const attendance: AttendanceCellRow[] = [];
  const names = new Map<string, StudentNameRow>();
  const audit: Tidy["audit"] = { sheets: {} };

  for (const sheetName of wb.SheetNames) {
    if (yearStart(sheetName) === 0) continue; // skip non-year sheets

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as unknown[][];
    if (rows.length === 0) continue;

    const hdr = findHeaderRow(rows);
    const headerCells = rows[hdr] ?? [];
    const dataRows = rows.slice(hdr + 1).filter((r) => !rowAllEmpty(r));

    const colInfos = headerCells.map((h) => classifyColumn(h));
    let idCol = colInfos.findIndex((c) => c.kind === "id");
    if (idCol < 0) idCol = 0; // fallback to the first column
    const secCol = colInfos.findIndex((c) => c.kind === "section");
    const grdCol = colInfos.findIndex((c) => c.kind === "grade");
    let nameCol = colInfos.findIndex((c) => c.kind === "name");
    if (nameCol < 0) nameCol = findNameColumn(colInfos, dataRows, idCol, secCol, grdCol);

    const yr = yearClean(sheetName);
    const ystr = yearStart(sheetName);
    const subjCols = colInfos.map((c, i) => ({ i, c })).filter((x) => x.c.kind === "subject");
    const attCols = colInfos.map((c, i) => ({ i, c })).filter((x) => x.c.kind === "att");

    audit.sheets[sheetName] = {
      headerRowExcel: hdr + 1,
      students: dataRows.filter((r) => notNa(r[idCol])).length,
      subjectsDetected: [...new Set(subjCols.map((x) => x.c.subject as string))].sort(),
      attendanceDetected: [...new Set(attCols.map((x) => x.c.metric as string))].sort(),
      nameColumn: nameCol >= 0 ? String(headerCells[nameCol] ?? "(unnamed)") : "None",
    };

    for (const r of dataRows) {
      const sidRaw = r[idCol];
      if (!notNa(sidRaw)) continue;
      const sid = coerceStudentId(sidRaw);

      let grade: number | null = null;
      let section: string | null = null;
      if (secCol >= 0) {
        const ps = parseSection(r[secCol]);
        grade = ps.grade;
        section = ps.section;
      }
      if (grade === null && grdCol >= 0 && notNa(r[grdCol])) {
        const g = Number(r[grdCol]);
        if (Number.isFinite(g)) grade = Math.trunc(g);
      }
      if (nameCol >= 0 && notNa(r[nameCol])) {
        names.set(String(sid), { studentId: sid, name: String(r[nameCol]).trim() });
      }

      for (const { i, c } of subjCols) {
        scores.push({
          studentId: sid,
          year: yr,
          yearStart: ystr,
          grade,
          section,
          subject: c.subject as string,
          term: c.term as number,
          score: toScore(r[i]),
        });
      }
      for (const { i, c } of attCols) {
        attendance.push({
          studentId: sid,
          year: yr,
          yearStart: ystr,
          grade,
          section,
          term: c.term as number,
          metric: c.metric as AttendanceCellRow["metric"],
          value: toAttendanceNumber(r[i]),
        });
      }
    }
  }

  const students = [...names.values()].sort((a, b) => compareStudentId(a.studentId, b.studentId));
  return { scores, attendance, students, audit };
}
