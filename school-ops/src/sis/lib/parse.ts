// Column / header parsing helpers ported 1:1 from SIS/sis_engine.py (the SIS
// oracle). These fingerprint a messy grade-workbook by MEANING, not exact header
// text, so the parser survives year-to-year header drift. Pure string/array
// logic — the SheetJS workbook reading lives in parser.ts (Phase 1c).

/** Normalize a header: lowercase, strip every non-alphanumeric char. */
export function normHeader(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Canonical subject -> ordered alias substrings. ORDER MATTERS: matchSubject
 * checks subjects (and their keys) in this order, so more specific tokens must
 * precede looser ones. Mirrors SUBJECT_ALIASES in sis_engine.py.
 */
export const SUBJECT_ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["ENGLISH", ["english", "eng"]],
  ["MATH", ["maths", "math"]],
  ["SCIENCE", ["science", "sci"]],
  ["ARABIC", ["arabic", "arab", "ara"]],
  ["ISLAMIC", ["islamic", "islam", "isl"]],
  ["SOCIAL_STUDIES", ["socialstudies", "socstudies", "socstud", "socstu", "social", "soc", "ss"]],
  ["CIT", ["cit"]],
  ["LIFE_SKILLS", ["lifeskills", "lifeskill", "lifeskl", "lfskl", "life", "lf"]],
  ["COMPUTER", ["computer", "computing", "comp", "ict"]],
  ["FRENCH", ["french", "fr"]],
  ["ART", ["art"]],
  ["PE", ["physicaleducation", "pe"]],
];

/**
 * Match a normalized token to a canonical subject. Two passes, mirroring
 * _match_subject: (1) startsWith/equals across all subjects in order, then
 * (2) a looser "contains" pass only if the first found nothing.
 */
export function matchSubject(tokenNorm: string): string | null {
  for (const [canon, keys] of SUBJECT_ALIASES) {
    for (const k of keys) {
      if (tokenNorm.startsWith(k) || tokenNorm === k) return canon;
    }
  }
  for (const [canon, keys] of SUBJECT_ALIASES) {
    if (keys.some((k) => tokenNorm.includes(k))) return canon;
  }
  return null;
}

export type ColumnKind = "id" | "name" | "section" | "grade" | "subject" | "att" | "ignore";
export type AttendanceMetric = "days_school" | "days_present" | "days_absent" | "days_tardy";

export interface ColumnInfo {
  kind: ColumnKind;
  subject?: string;
  /** Term: 1, 2, or 0 for an annual / un-termed column. */
  term?: number;
  metric?: AttendanceMetric;
}

const ID_HEADERS = new Set(["no", "studentno", "studentid", "idno", "id", "rollno"]);
const NAME_HEADERS = new Set(["name", "studentname", "fullname"]);
const SECTION_HEADERS = new Set(["section", "class", "sectionclass", "grsec", "gradesection"]);
const GRADE_HEADERS = new Set(["grade", "gradelevel", "yearlevel", "level"]);

/**
 * Classify a raw header cell by meaning. Mirrors classify_column in
 * sis_engine.py — attendance is checked BEFORE subjects, and term detection
 * reads both the normalized form and the raw header (for "-1"/"-2").
 */
export function classifyColumn(rawHeader: unknown): ColumnInfo {
  const n = normHeader(rawHeader);
  const raw = String(rawHeader ?? "");

  if (ID_HEADERS.has(n)) return { kind: "id" };
  if (NAME_HEADERS.has(n) || n.startsWith("unnamed")) return { kind: "name" };
  if (SECTION_HEADERS.has(n)) return { kind: "section" };
  if (GRADE_HEADERS.has(n)) return { kind: "grade" };

  let metric: AttendanceMetric | null = null;
  if (n.includes("schday") || n.includes("schooldays") || (n.includes("sch") && n.includes("day"))) {
    metric = "days_school";
  } else if (n.includes("present") || n.includes("dayspres") || n.includes("pres")) {
    metric = "days_present";
  } else if (n.includes("absent") || n.includes("daysabs") || n.includes("abs")) {
    metric = "days_absent";
  } else if (n.includes("tardy") || n.includes("tard") || n.includes("late")) {
    metric = "days_tardy";
  }
  if (metric) {
    let term =
      n.includes("t2") || n.endsWith("2") || raw.includes("-2")
        ? 2
        : n.includes("t1") || n.endsWith("1") || raw.includes("-1")
          ? 1
          : 0;
    // A bare "TARDY" (no term marker) is an annual figure.
    if (metric === "days_tardy" && !/[12]$/.test(n) && !n.includes("t1") && !n.includes("t2")) {
      term = 0;
    }
    return { kind: "att", metric, term };
  }

  const m = /t\s*([12])/.exec(n);
  if (m) {
    const term = Number(m[1]);
    const token = n.split(/t[12]/)[0];
    const subj = matchSubject(token);
    if (subj) return { kind: "subject", subject: subj, term };
  }
  return { kind: "ignore" };
}

/**
 * Pick the row most like a header (the most recognizable columns) within the
 * first `scan` rows. Mirrors find_header_row — strict ">" keeps the first row on
 * ties, and a "grade" column does NOT count toward the score.
 */
export function findHeaderRow(rows: readonly (readonly unknown[])[], scan = 8): number {
  let bestIdx = 0;
  let bestScore = -1;
  const limit = Math.min(scan, rows.length);
  for (let i = 0; i < limit; i++) {
    let score = 0;
    for (const cell of rows[i]) {
      const kind = classifyColumn(cell).kind;
      if (kind === "id" || kind === "name" || kind === "section" || kind === "subject" || kind === "att") {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestIdx = i;
      bestScore = score;
    }
  }
  return bestIdx;
}

/** Parse a section cell like "G4B" -> { grade: 4, section: "B" }. Mirrors parse_section. */
export function parseSection(value: unknown): { grade: number | null; section: string | null } {
  if (value === null || value === undefined || (typeof value === "number" && Number.isNaN(value))) {
    return { grade: null, section: null };
  }
  const m = /(\d+)\s*([A-Za-z]?)/.exec(String(value));
  if (!m) return { grade: null, section: null };
  return { grade: Number.parseInt(m[1], 10), section: (m[2] || "").toUpperCase() || null };
}

const NULL_SCORE_TOKENS = new Set(["N/A", "NA", "NULL", "-", ""]);

/**
 * Coerce a score cell to a number or null. "N/A"/"NA"/"NULL"/"-"/"" -> null
 * (NEVER 0 — nulls must be excluded from averages, never counted as zero).
 * Strips "%". Keeps full precision. Mirrors _to_score.
 */
export function toScore(x: unknown): number | null {
  if (x === null || x === undefined || (typeof x === "number" && Number.isNaN(x))) return null;
  const s = String(x).trim();
  if (NULL_SCORE_TOKENS.has(s.toUpperCase())) return null;
  const v = Number(s.replace(/%/g, ""));
  return Number.isFinite(v) ? v : null;
}

/** Coerce an attendance cell to a number or null (pd.to_numeric(errors="coerce")). */
export function toAttendanceNumber(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  const s = String(x).trim();
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** First 4-digit run in a label as an int, else 0. Universal sort key for years. */
export function yearStart(label: unknown): number {
  const m = /(\d{4})/.exec(String(label ?? ""));
  return m ? Number.parseInt(m[1], 10) : 0;
}

/** Canonical academic-year string: first two 4-digit runs as "YYYY-YYYY", else the label. */
export function yearClean(label: unknown): string {
  const s = String(label ?? "");
  const m = s.match(/\d{4}/g);
  if (m && m.length >= 2) return `${m[0]}-${m[1]}`;
  return s;
}
