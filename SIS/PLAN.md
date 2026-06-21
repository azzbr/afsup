# PLAN.md — SIS Analytics Module Build Plan

A phased plan for adding the **Student System** module to the Al Fajer School
web app. Build **one phase at a time**; do not start a phase until the previous
one's acceptance criteria pass. Read `CLAUDE.md` for the rules, data model, and
exact analytics math, and `STACK.md` for the detected stack. Use the validation
oracle (CLAUDE.md §9) as the test.

Legend: **DoD** = definition of done / acceptance criteria.

> **Stack note.** This app uses **Firestore (NoSQL) + Node/TS Cloud Functions** —
> there is no SQL DB or migration tool. "DB migrations" below means **Firestore
> collections + `firestore.rules` + (later) composite indexes**. See `CLAUDE.md`
> §4 for the Firestore-native data model.

---

## Phase 0 — Discovery & Scaffold ✅ Done (2026-06-21)

**Goal:** understand the existing app and stand up an empty, native-looking
Student System page wired into the nav — no analytics yet.

- [x] Inspect the repo; detect framework, styling, routing, backend, DB, auth/RBAC.
      Recorded in `STACK.md`.
- [x] Study the **Maintenance / HR / Admin** modules and mirror their patterns
      (nav item → guarded route → route wrapper → view → data hook).
- [x] Add the **"Student System"** sidebar item right after "Admin System",
      reusing the existing nav/active styling, gated to the admin tier via
      `canSeeRoleView(actor, "student")` (desktop + mobile).
- [x] Create the **Student Overview** shell mirroring **Admin Overview**: title +
      subtitle, 4 KPI stat cards (placeholder `—`), the tab bar
      (`Overview / Students / Cohort Analysis / Early Warning / Import`), and an
      academic-year selector. Existing card/tab styles reused; empty states present.
- [x] "DB migrations" (Firestore-native): `sis_*` collections defined in
      `firestore.rules` (read: admin tier, write: false) + TS interfaces in
      `school-ops/src/types.ts` + risk-tier vocabulary in `constants.ts`.
- [x] Permissions test for the `student` view gate; lint + typecheck + tests pass.

**DoD (met):** the new nav item appears and routes to a page that visually matches
the existing modules; tabs switch; rules/types/collections exist; non-admins can't
see it and `/student` redirects to `/`; nothing else broken; lint + typecheck +
tests pass.

---

## Phase 1 — Ingestion (messy Excel → clean Firestore)

**Goal:** an admin can upload the workbook and get clean, normalized, idempotent
data, with an audit they can trust.

Tasks:
1. **Ingestion strategy (decided): port to TypeScript.** Re-implement the parser +
   metrics in a Node/TS Cloud Function using **SheetJS**; the existing Python
   engine `SIS/sis_engine.py` is the oracle (CLAUDE.md §3/§9), kept in the repo
   for validation and as a local ETL while porting.
2. Implement the **Import** tab: drag-drop `.xlsx`, admin-only.
3. Implement the parser per CLAUDE.md §5 — header-row auto-detect, the subject
   **alias map**, attendance keyword classification, blank-name-column fallback,
   `N/A` → NULL, `G1A` → (grade, section).
4. Persist via **idempotent upsert** using deterministic doc ids (CLAUDE.md §4).
   Write an `sis_import_batches` audit row.
5. Show the **per-sheet audit** after import (header row, #students, subjects
   detected, attendance detected, name column) for admin confirmation.
6. Add `student.view` / `student.import` `can()` Actions for fine-grained gating
   (Phase 0 used only the nav/route view gate).

**DoD (run the oracle, CLAUDE.md §9):** Y1 = 200, Y2 = 173, 12 subjects/year,
matched cohort = 133. Re-importing the same file creates **no duplicates**.
NULLs are preserved (not zeros). Audit screen renders. **TS port matches the
Python oracle within rounding.**

---

## Phase 2 — Analytics computation

**Goal:** all metrics computed on import and stored in derived collections, exposed
via the app's data layer (React Query hooks under `src/data/`).

Tasks:
1. Compute & store: `sis_student_year_metrics` (overall, subjects_taken),
   per-subject annual scores, attendance/year + absence_rate.
2. Compute & store `sis_progress_metrics` — the **Progress Index** exactly per
   CLAUDE.md §6 (OLS expected, standardized residual). Include `raw_delta` for
   display only.
3. Compute curriculum bottleneck (subject×grade), section equity, attendance
   impact (slope + bands), term slump.
4. Compute & store `sis_risk_flags` (tiers + signals) for the latest year.
5. Expose read hooks the UI needs (per student, per cohort, per transition, risk
   list). Recompute whenever an import completes. Add composite indexes as
   Firestore reports them.

**DoD:** computed values match the Python reference within rounding (spot-check
English Y1≈91.7, attendance r≈−0.41, English Grade-4 bottleneck ≈ −5).
Recompute is triggered automatically after import.

---

## Phase 3 — Dashboard views

**Goal:** the four data views, all reusing existing components.

Tasks:
1. **Overview** — wire real KPI cards (Total Students, Tracked Cohort, At-Risk,
   Avg Attainment); add a cohort-trajectory line and "top movers by Progress
   Index" + "biggest bottlenecks" summaries.
2. **Students** — searchable/filterable table; row → **student profile** drawer
   (per-subject multi-year trajectory, overall, Progress Index, term pattern,
   attendance, tier).
3. **Cohort Analysis** — subject×grade heatmap (color-coded table OK), section-
   equity table (flagged gaps), term-slump bars, top improvers/decliners **by
   Progress Index**.
4. **Early Warning** — risk register table with tier filter + signals + the
   existing **Export CSV** button. Map risk tiers to existing badge colors.
5. Year selector filters every view. Loading / empty / error states everywhere.

**DoD:** each view renders real data, matches the app's look, and is responsive;
Progress Index (not raw delta) drives all "improver/decliner" lists; CSV export
works.

---

## Phase 4 — Hardening & polish

**Goal:** production-ready, safe with children's data.

Tasks:
1. Re-confirm **RBAC** on every SIS route/hook/Cloud Function (admin tier only);
   confirm no PII leaks to logs or client errors.
2. Make the risk threshold (`days_absent ≥ 12`, percentile cut) configurable in
   **School Settings**.
3. Accessibility pass (keyboard, contrast, labels); empty/skeleton/error polish.
4. Tests: parser unit tests (incl. the messy headers), a metrics test asserting
   the oracle numbers, and a smoke test for each view.
5. Docs: short README for importing a new year (Year 3 = 2025-2026) and how the
   metrics are defined.

**DoD:** all tests pass; RBAC verified; oracle test in CI; adding a third year is
a documented, no-code-change import.

---

## Sequencing notes
- Keep PRs small and phase-scoped. After each phase, run lint + typecheck +
  tests and re-verify the oracle.
- The system is built for **N years**; only 2 exist today. Year 3 must drop in
  via the Import tab with zero code changes.
- If anything in the data contradicts these definitions, stop and surface it —
  don't silently "fix" by guessing.
