# CLAUDE.md — Student Information System (SIS) + Analytics Module

> This file is loaded into context every Claude Code session. Keep it current.
> It defines **what we are building, the rules, the data model, and the exact
> analytics math.** Read it fully before writing code.
>
> **Stack note (reconciled 2026-06-21).** This module runs on the app's **actual**
> stack — React 19 + Vite + Firestore + Node/TS Cloud Functions (see
> [STACK.md](STACK.md)). The original draft assumed a SQL DB + Python/pandas; that
> framing is superseded. The SQL data model (§4) is translated to **Firestore
> collections**, and the Python engine [sis_engine.py](sis_engine.py) — **present
> in this folder** — is the **spec / test oracle**, to be ported to TypeScript (§3).

---

## 1. Mission

Add a **Student System** module to the existing **Al Fajer School** web app (the
same app that already has "Support & Maintenance", "HR System", and "Admin
System"). It ingests the school's yearly grade workbooks, normalizes the messy
data, and produces longitudinal analytics for **Grade 1–5**:

- how each student is progressing over multiple years,
- where the curriculum gets hard (subject × grade),
- how attendance affects attainment,
- and an automatic **early-warning** list of at-risk students.

It must look and feel **native** to the existing app — reuse the existing
sidebar, cards, tabs, tables, and badges. It is a new module, not a new app.

Currently there are **2 academic years** of data. The system **must scale to N
years** (Year 3 = 2025-2026 will be added later).

---

## 2. Golden rules (read first, these override convenience)

1. **Conform to the existing codebase.** Match how the existing **Maintenance /
   HR / Admin** modules are structured (routing, styling, data layer, auth — see
   [STACK.md](STACK.md)). Do **not** introduce a new framework, UI kit, state
   library, design language, database, or backend.
2. **Student data is children's PII.** Access is **`admin` + `super_admin` (Head
   Admin) only** (see Access below) — `hr`, `maintenance`, `staff`, and anonymous
   users are excluded at both the UI (nav/route) and the data layer (rules). Never
   log student names or scores; never send PII to the browser console or to any
   third party. **All student writes are server-side** (the import Cloud Function
   via the Admin SDK); clients only read. **Never commit the real workbook** (it
   is git-ignored — see §11).
3. **Measure progress correctly.** NEVER rank students by raw year-over-year
   point change. Use the **Progress Index** defined in §6. This is the single
   most important correctness requirement in this project.
4. **Data-drive the subjects.** Do not hardcode a fixed subject list in the UI.
   Subjects come from the imported data (via the alias map in §5). The app must
   not break when a subject is added/removed.
5. **Match by student ID only.** Students change section and grade between years.
   Cohort matching, joins, and history use the `NO` (student id) column —
   never row position, name, or section.
6. **Idempotent imports.** Re-importing the same workbook must not create
   duplicates. Upsert on `(student_id, academic_year, subject, term)` — in
   Firestore this is encoded as a **deterministic document id** (§4), so a
   re-import overwrites in place rather than appending.
7. **Verify against the oracle** in §9 after the importer is built.

### Access (RBAC) — admin tier only

| Layer | Enforcement |
|---|---|
| Nav + route | `canSeeRoleView(actor, "student")` → admin tier (`admin`, `super_admin`, or legacy `viewAll`) — `school-ops/src/permissions.ts`, `school-ops/src/routes/guards.tsx` |
| Firestore read | `allow read: if isAdmin()` on every `sis_*` collection — `firestore.rules` (`isAdmin()` = admin OR super_admin) |
| Firestore write | `allow write: if false` — clients never write; the import Cloud Function writes via the Admin SDK (bypasses rules), so grades/risk flags can't be tampered with from the browser |

---

## 3. Tech stack — detected & conformed

The stack was detected at the start of Phase 0 and recorded in
[STACK.md](STACK.md). Summary: **React 19 + Vite 7 + React Router 7 + Tailwind 4
+ TypeScript (`allowJs`)**, data via **`@tanstack/react-query`** over Firestore
`onSnapshot` (`school-ops/src/data/`), **Firestore (NoSQL)** — *no SQL DB, no
migration tool* — and **Firebase Cloud Functions (Node 22, TS)** for the backend.
RBAC is centralized in `school-ops/src/permissions.ts` (`can()`,
`canSeeRoleView()`) and mirrored in `firestore.rules`.

### Reference implementation (the oracle) → port to TypeScript
The Python engine [sis_engine.py](sis_engine.py) (**in this folder**) ingests this
exact workbook and computes every metric below. Treat it as the **specification
and test oracle.**

**Decision (confirmed): port it to TypeScript.** Re-implement the parser + metrics
in a Node/TS Cloud Function using **SheetJS** for `.xlsx` parsing; an admin
drag-drops the workbook in-app and the function writes the `sis_*` collections via
the Admin SDK. No new infrastructure. The parser + metrics are small (the math is
plain linear algebra); the TS port **must be re-validated against the §9 oracle**
before Phase 1 ships. The Python engine stays in the repo as the reference and can
also be run as a local ETL while porting:
`python SIS/sis_engine.py "SIS/SUMMARY OF GRADES-AY2023-2026.xlsx" out/`.

---

## 4. Data model (Firestore-native, normalized / "long")

Store **long**, not wide. One logical record per (student, year, subject, term).
This kills the "horizontal scroll" problem and never breaks when subjects/years
are added. The original spec's SQL tables map to `sis_`-namespaced **collections**;
a SQL `UNIQUE(...)` constraint becomes a **deterministic document id** (idempotent
upsert — re-importing a corrected workbook overwrites in place).

| Entity (was SQL table) | Collection | Document id (idempotent key) |
|---|---|---|
| `students` | `sis_students` | `${studentId}` |
| `enrollments` (per student per year; tracks section/grade moves) | `sis_enrollments` | `${studentId}_${year}` |
| `academic_records` (score NULLable) | `sis_academic_records` | `${studentId}_${year}_${subject}_${term}` |
| `attendance_records` | `sis_attendance` | `${studentId}_${year}_${term}` |
| `import_batches` (filename, importedAt/By, sheet, rows, audit) | `sis_import_batches` | auto-id |
| `student_year_metrics` (overall, subjects_taken) — derived | `sis_student_year_metrics` | `${studentId}_${year}` |
| `progress_metrics` (prev, curr, expected, raw_delta, progress_index) — derived | `sis_progress_metrics` | `${studentId}_${transition}` |
| `risk_flags` (tier, signals) — derived | `sis_risk_flags` | `${studentId}_${year}` |
| analytics singleton — Overview KPIs + Cohort aggregates (bottleneck grid, section spread, term slump, attendance impact, cohort trajectory) — derived | `sis_analytics` | `current` |

`academic_year` is a string like `"2023-2024"`. Keep a sortable `year_start` int
(`2023`) for ordering transitions. The derived collections + the analytics
singleton are recomputed in full on every import (§6); per-student docs carry an
`importBatchId` + `updatedAt`/`updatedBy`, and a post-write **generation sweep**
deletes any doc not refreshed by the latest import (handles a shrunk roster).

TypeScript interfaces live in `school-ops/src/types.ts` (`Student`, `Enrollment`,
`AcademicRecord`, `AttendanceRecord`, `StudentYearMetrics`, `ProgressMetric`,
`RiskFlag`, `ImportBatch`). `firestore.rules` gates every `sis_*` collection
(read: admin tier; write: false). **Composite indexes** are added when the real
queries land — Firestore reports the exact index needed at query time.

**Code sharing.** The parser + metrics are the single source of truth in
`school-ops/src/sis/` (oracle-validated, pure TS). The import Cloud Function
compiles the SAME modules: a build step (`functions/scripts/copy-sis.mjs`) copies
`school-ops/src/sis/*` (minus tests) into `functions/src/sis/` (git-ignored)
before `tsc`. Deterministic doc-id builders live in `school-ops/src/sis/docIds.ts`
(shared by the writer and the client read hooks).

---

## 5. Ingestion spec — the workbook is MESSY (real quirks below)

Source: `SUMMARY OF GRADES-AY2023-2026.xlsx`. One **sheet per year**. The parser
(TypeScript/SheetJS, ported from [sis_engine.py](sis_engine.py)) must be defensive
and **fingerprint columns by meaning, not exact text**.

**Known real-world quirks (must all be handled):**
- Row 1 is a **title row**; the **header is on row 2**. Auto-detect the header
  row (the row containing `NO` / `SECTION` / subject-like headers).
- Column order is **SECTION, NO, NAME** (not NO first).
- In sheet 2 the **NAME header is blank** → detect the name column as the
  left-most mostly-text column that isn't ID/section.
- Subject headers carry weights and drift between years. Map via this **alias
  map** (normalize header = lowercase, strip non-alphanumeric, then match):

  | Canonical        | Seen as (any of)                              |
  |------------------|-----------------------------------------------|
  | ENGLISH          | `ENGLISH-T1 (6)`, `ENGLISH-T2`                |
  | MATH             | `MATH-T1 (4)`, `MATH-T2(4)` (no space)        |
  | SCIENCE          | `SCIENCE-T1 (3)`, `SCIENCE-T2`                |
  | SOCIAL_STUDIES   | `SOC.STU-T1 (1)`, `SOC.STU-T2`                |
  | ARABIC           | `ARABIC-T1 (6)`, `ARABIC-T2`                  |
  | ISLAMIC          | `ISLAM-T1 (1)` (Y1) / `ISL-T1 (1)` (Y2)       |
  | CIT              | `CIT-T1 (1)`, `CIT-T2`                         |
  | LIFE_SKILLS      | `LF SKL-T1 (1)`, `LF SKL-T2`                  |
  | COMPUTER         | `COMP-T1 (1)`, `COMP-T2`                       |
  | FRENCH           | `FRE-T1 (1)`, `FRE-T2`                         |
  | ART              | `ART-T1 (2)`, `ART-T2 (2)`                    |
  | PE               | `PE-T1 (2) ` (trailing space), `PE-T2`        |

- Parse each subject header into **(subject, term)** by finding `T1`/`T2`; the
  text before the term marker is the subject token → match via alias map.
- **Attendance columns also drift:**
  - Y1: `#T1 SchDays1, T1 DaysPres1, T1 DaysAbs1, T1 TARDY, T2 #SchDays2, T2 DaysPres2, T2 DaysAbs2, T2 DaysTard2`
  - Y2: `#SchDays1, DaysPres1, DaysAbs1, TARDY, #SchDays2, DaysPres2, DaysAbs2, DaysTard2`
  - Classify by keyword: `schday`→school, `pres`→present, `abs`→absent,
    `tard`→tardy. Term from a trailing `1`/`2` or `T1`/`T2` (a bare `TARDY`
    with no term = annual).
- `SECTION` like `G1A` → `grade_level = 1`, `section = "A"`.
- Cells may be `"N/A"` or blank → store **NULL** (do not coerce to 0; nulls must
  be excluded from averages, never counted as zero).
- Scores are long floats (e.g. `98.9166…`). Store full precision; **round only
  for display** (1 decimal).

**Import flow (implemented, Head Admin only):**
1. Admin picks an `.xlsx` in the Import tab → the client sends its bytes as base64
   in the `importStudentWorkbook({ fileBase64, fileName })` callable. (No Cloud
   Storage hop — the workbook is small, and this avoids a Storage-rules/bucket
   surface that proved flaky; PII is parsed in memory, never written as a file.)
2. The Cloud Function (super_admin gate) writes a `sis_import_batches` doc with
   `status:'processing'`, decodes the bytes, parses them (`loadWorkbookTidy`), runs
   `runPipeline`, then upserts every `sis_*` collection via BulkWriter with
   deterministic ids + a generation sweep.
3. It flips the batch doc to `completed` (per-sheet audit: header row, #students,
   subjects detected, attendance detected, name column; + counts) and writes an
   `audit_log` entry (counts only — no names/scores).
4. The client renders the per-sheet audit; the `sis_*` read hooks refresh the views.

(The `sis-imports/` Storage path + rule are now unused but left in place for a
possible future large-workbook path.)

Re-importing the same (or a corrected) workbook is idempotent — deterministic ids
overwrite in place and the sweep removes anything no longer present.

---

## 6. Analytics spec — EXACT definitions (the crown jewels)

All averages **ignore NULLs**. Compute on import; store in the derived collections.

**Annual subject score** = mean of that subject's available terms (T1, T2).
**Overall (attainment)** = mean of a student's annual subject scores for that year.
**Attendance/year** = sum of each metric across terms;
`absence_rate = days_absent / days_school`.

**Matched cohort** = students present in two consecutive years (by `student_id`).

### Progress Index (conditional growth) — DO THIS, not raw deltas
For each consecutive transition (Yprev → Ycurr), over the matched cohort `M`
using each student's **overall**:
```
x = prev overall,  y = curr overall   (vectors over M)
slope b  = Σ((xᵢ−x̄)(yᵢ−ȳ)) / Σ((xᵢ−x̄)²)
intercept a = ȳ − b·x̄
expectedᵢ   = a + b·xᵢ           # what a peer who started at xᵢ typically reaches
residᵢ      = yᵢ − expectedᵢ
sd          = sample stdev of resid over M
progress_indexᵢ = residᵢ / sd
```
Interpretation: **+1.0σ = clearly beat expectation for their starting level;
−1.0σ = clearly fell behind.** This removes the **ceiling effect** (top students
mechanically "drop") and **regression to the mean** (weak students mechanically
"jump") that make raw % change misleading. Also store `raw_delta = curr − prev`
for display, but **never sort or flag on it.**

### Curriculum bottleneck
Mean annual subject score by **(subject, grade)** pooled across years. For each
subject, the grade with the largest negative step is the "wall". (On the real
data: English drops hardest into **Grade 4 (≈ −5 points)** — the headline.)

### Section equity
Within each (year, grade, subject), `gap = max_section_mean − min_section_mean`.
Flag gaps ≥ 4 points. Caveat in UI: section composition differs; this is a
prompt to investigate, not proof.

### Attendance impact
Regress overall on `days_absent` → slope = **points lost per day absent**;
report Pearson r. Also a banded table (`0, 1–3, 4–7, 8–14, 15+` absences →
mean overall) — this reveals the "tipping point". (Real data: r ≈ −0.41.)

### Term-2 slump
Mean (T2 − T1) per subject. Negative = second-term decline.

### Risk tiers (early-warning), computed for the latest year
```
low    = overall ≤ 25th percentile of latest-year overall
slip   = progress_index ≤ −1.0
gem    = progress_index ≥ +1.0
absent = days_absent (latest year) ≥ 12        # tunable in School Settings
tier (priority order):
  🔴 Critical          if low AND (slip OR absent)
  🟠 Attendance Risk   else if absent
  🟡 Slipping          else if slip
  🟢 Hidden Gem        else if gem
  ⚪ On Track          otherwise
```
Store the contributing `signals` string (e.g. "progress −1.4σ; 18 absences;
avg 71.3") for the register. Tier vocabulary is in
`school-ops/src/constants.ts` (`STUDENT_RISK_TIERS` / `STUDENT_RISK_LABELS`); the
**thresholds** above belong to the Phase-1 metrics port + its oracle, not the UI.

---

## 7. UI / UX — make it native to the app

**Sidebar:** one item right after "Admin System", labelled **"Student System"**
(`school-ops/src/Layout.jsx`, gated by `canSeeRoleView(actor, "student")`). It
opens a **"Student Overview"** page (`school-ops/src/student/StudentSystem.jsx`,
routed via `school-ops/src/routes/StudentRoute.jsx`) mirroring **"Admin Overview"**:

- Page title + gray subtitle ("Track student performance and growth across years").
- **4 KPI stat cards** reusing the existing pastel card style:
  `Total Students` (latest year) · `Tracked Cohort` (matched across years) ·
  `At-Risk` (Critical + Attendance Risk) · `Avg Attainment %` (latest year).
- **Tabs** in the existing tab style: `Overview` · `Students` ·
  `Cohort Analysis` · `Early Warning` · `Import`.
- An **academic-year selector** (top-right) since data is multi-year.
- Reuse the existing **card + table + "Export CSV"** pattern for all tables, and
  the existing **badge** style for risk tiers (map colors to the existing
  LOW/MEDIUM/HIGH badge styles).

> **Status:** Phase 0 ships the empty, native **shell** of the above (placeholder
> KPIs, switchable tabs, year selector, empty states). The tab content below is
> the Phase 2+ target.

**Tab content (Phase 2+):**
- **Overview** — KPI cards + a compact "cohort trajectory" line (mean overall by
  year) + "biggest bottlenecks" and "top movers by Progress Index" summaries.
- **Students** — searchable, filterable table (id, name, grade, section,
  overall, Progress Index badge, attendance). Row click → **student profile**
  panel/drawer: per-subject 2-year trajectory, overall, Progress Index, term
  pattern, attendance, current tier.
- **Cohort Analysis** — subject × grade heatmap (color-coded table is fine),
  section-equity table (flagged gaps), term-slump mini-bars, top improvers /
  decliners **by Progress Index** (not raw delta).
- **Early Warning** — the risk register: filter by tier, show signals, Export
  CSV. This is the page leadership will live in.
- **Import** — drag-drop `.xlsx`, run parser, show the per-sheet audit, confirm,
  persist. Admin-only.

Always implement **loading, empty, and error** states (e.g. "No data yet —
import a workbook").

---

## 8. Commands

App scripts (run from `school-ops/`): `npm run dev` · `npm run build` ·
`npm run lint` · `npm run typecheck` · `npm run test`. Run lint + typecheck +
tests before declaring a phase done (also recorded in [STACK.md](STACK.md)).

Reference engine (Python oracle, from repo root):
`python SIS/sis_engine.py "SIS/SUMMARY OF GRADES-AY2023-2026.xlsx" out/`.

---

## 9. Validation oracle (use to verify the importer + metrics)

After importing `SUMMARY OF GRADES-AY2023-2026.xlsx`, these MUST hold:

- Year `2023-2024`: **200** students. Year `2024-2025`: **173** students.
- **Subjects detected each year: 12** (English, Math, Science, Social Studies,
  Arabic, Islamic, CIT, Life Skills, Computer, French, Art, PE).
- **Matched cohort (both years): 133.**
- English cohort annual average ≈ **91.7%** (Y1) and **91.6%** (Y2).
- Attendance vs overall correlation ≈ **−0.41**.
- Biggest bottleneck: **English into Grade 4 ≈ −5 points.**

If your numbers differ materially, the parser or a metric is wrong — fix before
proceeding. (The Python reference [sis_engine.py](sis_engine.py) produces all of
these; the TS port must match it.)

---

## 10. Definition of done (per feature)

- Matches the existing visual design (cards/tabs/table/badges/sidebar).
- Import is idempotent; oracle (§9) passes.
- Analytics match the Python reference within rounding.
- RBAC enforced (admin tier only); no PII in logs or client errors.
- Loading / empty / error states present; responsive; keyboard-accessible.
- Lint, typecheck, and tests pass.

## 11. Out of scope / do NOT
- Do not rank or flag students by raw % change (use Progress Index).
- Do not build a new design system or pull in a new UI kit.
- Do not hardcode the 12 subjects in the UI (data-drive via the alias map).
- Do not expose student PII to the browser console, logs, or third parties.
- Do not break the existing Maintenance / HR / Admin modules.
- Do not commit the real student workbook or any secrets to the repo (the
  workbook + transient artifacts are git-ignored via `SIS/.gitignore`).
