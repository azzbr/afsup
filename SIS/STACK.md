# SIS — Detected Stack & Discovery Notes

This file records the stack the Student System (SIS) module must conform to, and
the decisions taken at the start of Phase 0. The SIS spec originally assumed a SQL
database + Python/pandas backend; the real application does **not** use either, so
the data model and ingestion are translated to the actual stack below.

## Detected stack (verified from source)

| Concern | Technology | Evidence |
|---|---|---|
| Frontend | React 19 | `school-ops/package.json` |
| Build | Vite 7 | `school-ops/package.json`, `vite.config.js` |
| Routing | React Router 7 (`createBrowserRouter`) | `school-ops/src/router.tsx` |
| Styling | Tailwind CSS 4, `lucide-react` icons | `school-ops/src/*.jsx` |
| Language | TypeScript (incremental, `allowJs: true`) | `school-ops/tsconfig.json` |
| Database | **Firestore (NoSQL)** — no SQL, no migrations | `school-ops/src/firebase.js`, `firestore.rules` |
| Auth / RBAC | Firebase Auth + `src/permissions.ts` (`can()`, `canSeeRoleView()`), mirrored in `firestore.rules` | `school-ops/src/permissions.ts` |
| Backend | Firebase Cloud Functions (Node 22, TypeScript) | `functions/` |
| State / data | `@tanstack/react-query` hooks under `src/data/` | `school-ops/src/data/` |

### Commands (run from `school-ops/`)

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Tests | `npm run test` |
| Build | `npm run build` |

## Decisions (confirmed)

1. **RBAC — admin tier only.** The Student System module and all student data are
   visible to **`admin` and `super_admin` (Head Admin) only**. `hr`,
   `maintenance`, `staff`, and anonymous users are excluded. This holds for both
   the UI (nav/route gate via `canSeeRoleView(actor, "student")`) and the data
   layer (`firestore.rules`: `read: if isAdmin()`, `write: if false`). Phase-1
   import uses the same admin-tier set.

2. **Ingestion — recorded as intent only (Phase 1).** The plan is to port the
   spreadsheet parser + metrics to TypeScript (SheetJS) running in a Node/TS Cloud
   Function; an admin drag-drops an `.xlsx` workbook in-app and the function writes
   the `sis_*` collections via the Admin SDK. No new infrastructure.
   **Oracle:** the reference parser/metrics implementation is
   [`SIS/sis_engine.py`](sis_engine.py) (Python, **in the repo**), validated against
   the real workbook — see `SIS/CLAUDE.md` §9 for the exact expected numbers. The
   TS port must be re-validated against it before Phase 1 ships. Phase 0 builds no
   ingestion. (The real workbook itself is git-ignored — children's PII.)

## Divergence from the original SIS spec

The original SIS docs (`SIS/CLAUDE.md` §3/§4 as drafted) assumed SQL tables with
`UNIQUE(...)` constraints and a pandas backend. Per the project's golden rule
("conform to the existing stack; do not introduce a new framework or data layer"),
those tables are mapped to Firestore collections with **deterministic document
ids** standing in for `UNIQUE(...)` constraints (idempotent upsert). See
`SIS/CLAUDE.md` for the canonical Firestore-native data model.
