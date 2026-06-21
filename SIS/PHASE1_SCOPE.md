# SIS Phase 1 — Implementation Scope: Student System Ingestion

> Produced 2026-06-22 (scoping pass; decisions locked 2026-06-22). Phase 0
> (admin-only module shell + `sis_*` Firestore boundary) is shipped on `main`.
> Phase 1 ports the Python oracle (`SIS/sis_engine.py`) to TS/SheetJS, builds a
> Head-Admin-only Import flow, idempotently writes the `sis_*` collections **gated
> on matching the §9 oracle numbers**, AND builds the full dashboard (Overview /
> Students / Cohort Analysis / Early Warning). This is a SCOPE, not code.
>
> **Locked decisions:** (1) import = **super_admin only**; view = admin tier.
> (2) `functions/` consumes the parser via a **build-time copy** (one source of
> truth; `scripts/copy-sis.mjs` → git-ignored `functions/src/sis/`). (3) file
> transport = **Cloud Storage upload**. (4) audit display = **both** current run +
> persisted history. (5) Phase 1 ships the **full dashboards**.
>
> **Status:** 1a–1d done & on a branch (parser/metrics/CF built; oracle 6/6).
> 1e/1f (permissions + Import UI) next; 1g–1j (dashboards) after.

---

## 1. Recommended architecture

**Parse server-side; deliver the file via Cloud Storage upload, not base64.**

- **Why server-side parse:** `SIS/CLAUDE.md §2` forbids student names/scores ever
  reaching the browser. Client parsing would pull the full roster + scores into
  browser memory and risk console/log leakage. The header-fingerprinting /
  null-vs-zero / score-precision logic is also the oracle-validated authoritative
  path and must live on the trusted surface.
- **Why Storage upload over base64-in-callable:** callable requests cap near ~10MB
  and base64 inflates ~33%; encoded string + decoded buffer + SheetJS workbook
  triples peak memory. Storage upload survives large files, keeps binary out of the
  request payload, and leaves a replayable artifact.

**End-to-end data flow:**

```
Admin picks .xlsx in Import tab
   → client uploads to  sis-imports/{uid}/{ts}-{name}.xlsx   (admin-only Storage path)
   → client calls  importStudentWorkbook({ storagePath })    (httpsCallable, us-central1)
       → CF: auth + admin-tier gate
       → CF: write sis_import_batches doc  status:'processing'  (counts/metadata only)
       → CF: download bytes via Admin SDK → XLSX.read(buffer)
       → CF: loadWorkbookTidy()  → tidy { scores[], attendance[], students[], audit }
       → CF: runPipeline(tidy)   → derived metrics (pure module)
       → CF: BulkWriter upsert base collections (deterministic ids)
       → CF: delete-and-rewrite the 3 derived collections; generation-sweep base orphans
       → CF: flip batch doc → 'completed' (+ per-sheet audit, counts); writeAudit('sis.imported')
       → CF: delete the temp Storage object (finally)
       → returns { ok, audit, counts }
   → UI renders per-sheet audit; sis_* read hooks (onSnapshot) refresh Overview
```

---

## 2. Work breakdown — sub-phases (ordered, each independently verifiable)

| Sub-phase | Deliverable | Verifiable by |
|---|---|---|
| **1a** | Shared lib (`sis/lib`): parse helpers + numeric primitives (`nanMean`, `sampleStd` ddof=1, `olsSlopeIntercept`, `pearsonR`, `quantileLinear`, `cutBand`) | Vitest unit tests on each primitive — no Firestore, no SheetJS |
| **1b** | Pure metrics module (`subjectYear`…`riskRegister`, `runPipeline`) over tidy arrays | Vitest against synthetic JSON fixtures asserting §9-shaped invariants |
| **1c** | Parser (`loadWorkbookTidy`, SheetJS-only) → tidy arrays + audit | Vitest on tiny synthetic `.xlsx` fixtures (messy-header quirks); manual oracle run on the real local-only workbook |
| **1d** | `importStudentWorkbook` Cloud Function (gate, parse→metrics→BulkWriter→audit), Storage rules, permissions mirror | Emulator/manual import; verify deterministic ids + re-import idempotency |
| **1e** | Client permissions (`student.view`/`student.import`) + tests; firestore.rules note | `npm test`, build passes (exhaustiveness) |
| **1f** | Import tab UI (picker → upload → call → audit screen) + read hooks (`useStudents`, `useImportBatches`) | Manual: run import, see per-sheet audit, download CSV log |
| **1g** | **Overview tab** — 4 live KPI cards + cohort-trajectory line + biggest-bottlenecks + top-movers-by-Progress-Index summaries | KPI cards + summaries show real post-import data |
| **1h** | **Students tab** — searchable/filterable table (id, name, grade, section, overall, Progress Index badge, attendance) + student-profile drawer (per-subject multi-year trajectory, term pattern, tier) | Table filters; drawer opens with per-student detail |
| **1i** | **Cohort Analysis tab** — subject×grade heatmap, section-equity table (flagged gaps), term-slump bars, top improvers/decliners **by Progress Index** | Views render from `sis_*`; lists sort by Progress Index, never raw delta |
| **1j** | **Early Warning tab** — risk register, tier filter, signals, Export CSV (the leadership page) | Filter by tier; CSV export works |

**Critical path:** 1a → 1b (parallel 1c) → 1d → 1e → 1f → then the dashboard tabs
1g–1j (parallelizable once the read hooks exist). Ship 1a–1c as a tested pure-TS
bundle first — **the oracle gate is met before any Firestore write path exists.**

> Scope note: decision #5 = **full dashboards in Phase 1**, so 1g–1j are in-scope
> (not deferred). This is the bulk of the UI work; consider shipping import (1a–1f)
> as one PR and the dashboards (1g–1j) as a second PR on the same branch series.

---

## 3. File-by-file plan

### Shared / client pure modules — `school-ops/src/sis/` (all new)
Pure TS, no Firestore coupling (parser is the only SheetJS consumer); imported by
both Vitest and the Cloud Function.

- `sis/lib/parse.ts` — `normHeader`, `SUBJECT_ALIASES` (ordered), `matchSubject`, `classifyColumn`, `findHeaderRow`, `parseSection`, `toScore`, `toAttendanceNumber`, `yearStart`, `yearClean`
- `sis/lib/numeric.ts` — `nanMean`, `sampleStd`, `olsSlopeIntercept`, `pearsonR`, `quantileLinear`, `cutBand`
- `sis/metrics.ts` — the pure metric functions + `runPipeline`
- `sis/parser.ts` — `loadWorkbookTidy(buffer)` (only SheetJS consumer)
- `sis/docIds.ts` — deterministic id builders + token sanitizers (shared client/CF)
- `sis/__tests__/{numeric,metrics,parser}.test.ts` + `__tests__/fixtures/` (committable, fake data only)

### Cloud Functions — `functions/src/`
- `importStudentWorkbook.ts` **(new)** — `onCall({region:'us-central1', memory:'1GiB', timeoutSeconds:540, maxInstances:2})`
- `sisWrites.ts` **(new)** — BulkWriter upserts, derived delete-and-rewrite, generation-sweep, audit fields
- `index.ts` **(edit)** — export the new callable
- `permissions.ts` **(edit)** — add+export `isAdminTierRole`, `canImportStudents` (mirror client; **do not** reuse the private `isAdminEquivalent` viewAll back-door)
- `audit.ts` **(edit)** — extend `targetType` union with `'student'`/`'sis_import'`
- `package.json` **(edit)** — add pinned `xlsx`

### Client UI + data — `school-ops/src/`
- `student/StudentSystem.jsx` **(edit)** — accept `({user,userData,actor})`; switch tab content; render `<ImportTab/>` for the `import` tab
- `student/ImportTab.jsx` **(new)** — `.xlsx` picker (reuse UserProfile DocumentUpload markup), upload→call flow, gated on `can(actor,'student.import')`
- `student/ImportAuditPanel.jsx` **(new)** — per-sheet stat cards + table + "Download log CSV" (reuse `hr/reports.ts` `toCSV`/`downloadReport`)
- `student/OverviewTab.jsx` **(new, 1g)** — 4 live KPI cards (reuse Phase-0 card markup) + cohort-trajectory line + bottleneck/top-mover summaries
- `student/StudentsTab.jsx` **(new, 1h)** — searchable/filterable table (reuse AdminView/HRDirectory table + badge patterns)
- `student/StudentProfileDrawer.jsx` **(new, 1h)** — per-student multi-year trajectory, overall, Progress Index, term pattern, attendance, tier
- `student/CohortAnalysisTab.jsx` **(new, 1i)** — subject×grade heatmap (color-coded table), section-equity table, term-slump bars, top improvers/decliners by Progress Index
- `student/EarlyWarningTab.jsx` **(new, 1j)** — risk register table, tier filter, signals, Export CSV
- `student/RiskBadge.jsx` **(new)** — maps `STUDENT_RISK_TIERS` → existing badge color classes
- `data/useStudents.ts` **(new)** — model on `useUsers.ts`, admin-scoped read of `sis_students`/`sis_enrollments`
- `data/useStudentMetrics.ts` **(new)** — read `sis_student_year_metrics` + `sis_progress_metrics` (tables / Overview / Cohort)
- `data/useRiskFlags.ts` **(new)** — read `sis_risk_flags` (Early Warning + At-Risk KPI)
- `data/useImportBatches.ts` **(new)** — model on `useAuditLog.ts`, `sis_import_batches` ordered desc
- `permissions.ts` **(edit)** — add `student.view`/`student.import` Actions + cases
- `__tests__/permissions.test.ts` **(edit)** — `describe('can() — student')`
- `types.ts` **(edit)** — refine the 8 SIS interfaces in place

### Config / rules / docs
- `firebase.storage.rules` **(edit)** — admin-only `match /sis-imports/{uid}/{file}` with its own ~15MB + xlsx contentType guard (not the 5MB image helper)
- `firestore.rules` **(note)** — `sis_*` already `read:isAdmin / write:false`; confirm `sis_import_batches` read
- `CLAUDE.md` (root §12) + `SIS/CLAUDE.md`/`PLAN.md` **(edit FIRST, per rule #12)** — document collection schemas + import workflow + `sis-imports/` path before coding

---

## 4. TS port mapping (`sis_engine.py` → TS) — the tricky math

| Python | TS target | Callout |
|---|---|---|
| `_progress_index` (289) **crown jewel** | `metrics.ts` → `progressIndex` | guard n<5; `olsSlopeIntercept` closed form (= polyfit deg1); `sd = sampleStd(resid, ddof=1) \|\| 1.0`; **ddof=1 is the #1 port bug**; flag on `progress_index`, never `raw_delta` |
| `risk_register` (421) | `riskRegister` | `low_cut = quantileLinear(overalls, 0.25)` (type-7 linear); priority short-circuit; null pi never slip/gem; null absent never absnt |
| `attendance_impact` (383) | `attendanceImpact` | `olsSlopeIntercept` slope; `pearsonR` (≈−0.41); `cutBand([-1,0,3,7,14,9999])` |
| `curriculum_bottleneck` (352) | `curriculumBottleneck` | sort grade cols ascending, consecutive diffs, `idxmin` = destination grade (English→G4 ≈−5) |
| `subject_year`/`student_year` (249/262) | `subjectYear`/`studentYear` | nan-skipping means; `score_year = nanMean([t1,t2])`; `overall = nanMean(score_year)` |
| `classify_column`/`_match_subject` (60/54) | `classifyColumn`/`matchSubject` | attendance checked before subjects; ordered alias array + two-pass; raw vs normalized header checks replicated exactly |
| `load_workbook_tidy` (167) | `loadWorkbookTidy` | `sheet_to_json(ws,{header:1,defval:null,raw:true})`; blank-NAME fallback (letterFrac>0.6 & numFrac<0.3); id `Math.trunc(parseFloat(sid))` (**not** round) |

**Five primitives to unit-test in isolation first (1a):** `sampleStd` (ddof=1),
`olsSlopeIntercept`, `quantileLinear` (type-7), `nanMean` (null≠0), `cutBand`
(half-open-left). Getting `ddof` or the quantile method wrong silently rescales
every Progress Index and breaks the ±1.0σ slip/gem flags + risk tiers.

---

## 5. Idempotency + recompute

**Deterministic doc IDs** (in `sis/docIds.ts`, identical client/CF):
`sis_students/{id}`, `sis_enrollments/{id}_{year}`,
`sis_academic_records/{id}_{year}_{subject}_{term}`,
`sis_attendance/{id}_{year}_{term}` (term 0→`annual`),
`sis_student_year_metrics/{id}_{year}`, `sis_progress_metrics/{id}_{transition}`,
`sis_risk_flags/{id}_{year}`. `studentId` = identical `Math.trunc(parseFloat(sid))`
so re-imports upsert in place and cross-year cohort joins stay stable.

- **Writes:** firebase-admin **BulkWriter** (auto-batch, flow control, retries) for
  base (~9–13k docs) + derived. **Register `onWriteError`** so partial failures
  surface and flip the batch doc to `failed` (BulkWriter otherwise swallows them).
- **Recompute = full, same invocation.** Progress Index / risk percentiles /
  bottleneck pooling all depend on the whole cohort — incremental is mathematically
  wrong.
- **Stale cleanup:** derived collections (≤~700 docs) **delete-and-rewrite** each
  run; base docs carry a `generation`/`importBatchId` and a post-write **sweep**
  deletes orphans for the imported year(s) (handles a shrunk roster).
- **Batch doc:** `processing` before heavy work → `completed`/`failed` after; store
  counts + column metadata only, **never names/scores**; delete the temp Storage
  object in `finally`.

---

## 6. Permissions (three-layer mirror + tests)

- **Client `permissions.ts`:** add `"student.view"` / `"student.import"` to the
  Action union + switch cases (the `never` exhaustiveness check forces it).
  `student.view` → **admin tier** (`isAdmin`, matches `sis_*` read rules).
  `student.import` → **super_admin only** (`isSuperAdmin`) — locked decision #1;
  a destructive bulk overwrite, treated like `settings.edit`.
- **Functions `permissions.ts`:** add+export `isAdminTierRole(role)` (for read
  scoping) and `canImportStudents(actor)` = **super_admin only**; **exclude the
  legacy `viewAll` back-door** (consistent with the Phase-2.9.1 HR-data functions).
- **firestore.rules:** no client-write changes (`sis_*` already `write:false`);
  confirm `sis_import_batches` read = `isAdmin()`.
- **permissions.test.ts:** new `describe('can() — student')` matrix.

---

## 7. Validation plan (oracle gate WITHOUT the real PII workbook)

**Track A — committable synthetic fixtures (CI, always):**
- JSON tidy fixtures with hand-derived known answers locking the primitives + metric
  wiring (e.g. `sampleStd([2,4,4,4,5,5,7,9]) = 2.138…`, `nanMean([90,null,80]) = 85`,
  quantile/cutBand boundaries).
- Tiny synthetic `.xlsx` fixtures reproducing the messy-header quirks (header row 2,
  blank NAME in sheet 2, `SECTION,NO,NAME` order, `SOC.STU`, `LF SKL`, trailing-space
  `PE-T1 (2) `, `MATH-T2(4)`, `ISLAM`/`ISL`, `G1A`, `N/A`/`%` cells) asserting the
  shape invariants the §9 numbers are special cases of (header=2, 12 subjects, NAME
  recovered, `N/A`→null, `G4B`→(4,'B')).
- A two-year fixture asserting `cohortProgress` inner-join size == planted overlap.

**Track B — one-time manual oracle check (local/dev only, never CI):**
A git-ignored / env-guarded script that loads the **real** workbook from a local
path and asserts the exact §9 numbers (200/173 students, 12 subjects, matched
cohort 133, English ≈91.7/91.6, attendance r≈−0.41, English→Grade-4 ≈−5). Run once
before "Phase 1 done"; assert numbers only, never log names/scores.

---

## 8. Risks & mitigations (top items)

- **ddof / quantile / NaN handling** — highest-likelihood silent bugs; isolate each
  primitive with hand-computed unit tests (1a) before any wiring.
- **Alias-map ordering & pd.cut direction** — covered by targeted synthetic fixtures.
- **`student_id` coercion drift** (round vs trunc) breaks joins + idempotent ids —
  shared `docIds.ts`, cohort-size fixture test.
- **BulkWriter swallows failures** — register `onWriteError`, flip batch to `failed`.
- **PII leakage / temp object at rest** — counts-only batch doc, scrub `HttpsError`,
  delete Storage object in `finally` + a lifecycle rule on `sis-imports/`.
- **`xlsx` advisories** — pin a current version; confirm it handles the quirks.
- **functions ↔ school-ops code sharing** — resolve Decision #2 before 1d.

---

## 9. Decisions (locked 2026-06-22)

1. **Who can run an import → super_admin (Head Admin) only.** `student.import` =
   `isSuperAdmin` on both client + functions; excludes the legacy `viewAll`
   back-door. `student.view` stays admin-tier (admin + super_admin).
2. **`functions/` consumes the parser/metrics → build-time copy** (implemented):
   `functions/scripts/copy-sis.mjs` copies `school-ops/src/sis/*` (minus tests)
   into the git-ignored `functions/src/sis/` before `tsc`. Keeps one source of
   truth while leaving the existing functions' compiled layout untouched — a
   relative TS import would force a `rootDir` change altering every function's
   output path (riskier to do without a deploy to verify).
3. **File transport → Cloud Storage upload** to an admin-only `sis-imports/{uid}/…`
   path; callable receives `{storagePath}`.
4. **Audit display → both** the just-completed run (`res.data`) and persisted
   history (`useImportBatches` over `sis_import_batches`).
5. **Phase 1 scope → full dashboards.** 1g–1j (Overview / Students / Cohort
   Analysis / Early Warning) are in-scope, in addition to import (1a–1f).
