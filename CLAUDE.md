# CLAUDE.md — Project Design & Conventions

This file is the source of truth for the architectural direction of the **Al Fajer School Operations Platform**. Read this before making non-trivial changes. Update this file *before* writing code, not after.

---

## 1. Project Snapshot

**Purpose:** Internal operations platform for Al Fajer International School (Bahrain), covering maintenance ticketing and HR/HRIS in one role-based React app backed by Firebase.

**Stack (as of 2026-05):**
- React 19 + Vite 7, Tailwind CSS 4, lucide-react
- Firebase: Firestore, Auth, Storage (project `afsup-3ff9b`)
- Hosting: Netlify (config in [netlify.toml](netlify.toml))
- App code lives under [school-ops/](school-ops/)

**Roles:** `staff`, `maintenance`, `hr`, `admin`, `super_admin` — see [Section 6](#6-permissions-matrix).

> **Naming note.** The role string `super_admin` is the **internal identifier** used in code, Firestore, and rules. The UI labels it **"Head Admin"** because that matches how the school distinguishes the principal from the admin assistants. Treat the two terms as interchangeable in this document.

---

## 2. Vision

A **unified operations platform** where every employee is one identity, every action is one event, and every notification flows through one feed — even though the underlying domains (HR, maintenance) stay separate at the data layer.

User-facing model:
- **People** — every employee profile shows HR data + maintenance activity + leave history
- **Places** — every room/location has a maintenance history and scheduled tasks
- **Events** — anything needing attention (compliance, SLA, leave) lands in one notification feed

---

## 3. Current State (honest audit)

**What works well (updated 2026-06-10):**
- Maintenance V2 is live end-to-end: search-or-type report form with duplicate guard, technician queue (My Jobs / Open Pool / All / Insights), claim + reopen + cancel + notes thread, working schedules, server-side audit + reporter notifications via `onTicketStatusChange`
- Firestore security rules ([firestore.rules](firestore.rules)) enforce the §6 matrix server-side, including field-level salary guards (never self-editable), admin-tier protection, and CF-only writes for role/status/leave decisions/settings
- Bahrain HRIS domain logic: sick-leave tiers 15/20/20, LMRA visa tracking, MOE teacher approval cycle; GOSI rates read from `school_settings` (defaults 17%/8% Bahraini + 3%/1% expat); WPS export is a pragmatic LMRA CSV approximation
- Data layer: React Query hooks with role-scoped real-time subscriptions; permissions centralized in `can()` and mirrored across client/functions/rules; mutations audited

**What's broken or smells:**
- **Registration race condition** patched with 500ms polling + a `REGISTRATION_IN_PROGRESS` localStorage flag (legacy self-register path) — delete once self-register is fully retired in favor of invites.
- **Hardcoded super-admin email** in [auth.js:58](school-ops/src/auth.js:58) — remove after the Head Admin bootstrap is confirmed (along with the one-shot banner in Layout.jsx).
- **`APP_BASE_URL` functions param still defaults to the stale `afsup-3ff9b.web.app`** — must be set to the production Netlify URL before email links are trustworthy ([functions/src/config.ts](functions/src/config.ts)).
- **`UserProfile.jsx` is still a ~1700-line manual form** — React Hook Form + Zod refactor pending (Phase 2 leftover).
- **No Firestore emulator tests for rules** — the permissions unit suite exists (98 tests) but rules changes are still verified by hand.

---

## 4. Target Architecture

```
┌─────────────────────────────────────────────────┐
│                  React SPA                      │
│  ┌───────────────────────────────────────────┐  │
│  │ React Router — every view has a URL       │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │ React Query — cached, real-time, typed    │  │
│  │  • useUsers()     • useTickets()          │  │
│  │  • useLeave()     • useNotifications()    │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │ Permissions module — single can(u, a, t)  │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │ Forms — React Hook Form + Zod schemas     │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌─────────┐   ┌──────────┐   ┌──────────┐
   │Firestore│   │ Auth     │   │ Storage  │
   └─────────┘   └──────────┘   └──────────┘
        │              │              │
        └──────────────┼──────────────┘
                       ▼
            ┌──────────────────────┐
            │  Cloud Functions     │
            │  • Invite handler    │
            │  • Daily compliance  │
            │  • Schedule runner   │
            │  • Email notifier    │
            └──────────────────────┘
```

The data model stays in separate Firestore collections. Unification happens at the **React Query hooks**, **permissions module**, and **UI routing** layers.

---

## 5. Data Model (canonical)

### `users/{uid}`

**Core fields (Phase 0/1):**

| Field | Type | Who may write |
|---|---|---|
| `uid`, `email`, `displayName` | string | invite handler / self |
| `firstName`, `middleName`, `lastName`, `arabicName` | string | self, HR, admin |
| `role` | `'staff' \| 'maintenance' \| 'hr' \| 'admin' \| 'super_admin'` | HR (non-admin only), admin (non-admin only), super_admin (any) |
| `status` | `'invited' \| 'approved' \| 'suspended' \| 'blocked'` | invite handler, HR, admin, super_admin |
| `nationality` | enum from [constants.ts](school-ops/src/constants.ts) | self |
| `gender`, `maritalStatus` | enum | self |
| `dateOfBirth` | Timestamp | self |
| `cprNumber`, `cprExpiry` | string (9 digits), Timestamp | self |
| `passportNumber`, `passportExpiry` | string, Timestamp | self |
| `residencePermitNumber`, `residencePermitExpiry`, `workPermitNumber` | non-Bahraini only | self |
| `iban`, `bankName` | string (BH-validated), enum | self |
| `basicSalary`, `housingAllowance`, `transportAllowance`, `phoneAllowance` | number | **HR/admin only** |
| `dateOfJoining` | Timestamp | HR/admin only |
| `sickDaysUsed`, `annualLeaveBalance` | number | **HR/admin only (NEVER self)** |
| `documents.{type}` | URL string | self |
| `createdBy`, `createdAt`, `updatedBy`, `updatedAt` | audit | every write |

**Employment fields (Phase 2.5):**

| Field | Type | Who may write |
|---|---|---|
| `employeeNumber` | string | HR/admin |
| `position` | string | HR/admin |
| `department` | enum from `DEPARTMENTS` | HR/admin |
| `reportingManagerUid` | string \| null | HR/admin |
| `contractType` | `'permanent' \| 'fixed_term' \| 'part_time' \| 'consultant'` | HR/admin |
| `contractStartDate`, `contractEndDate` | Timestamp | HR/admin |
| `probationEndDate` | Timestamp | HR/admin |
| `separationDate`, `separationReason` | Timestamp, string | HR/admin |

**Teacher fields (Phase 2.5 — only meaningful if `isTeacher === true`):**

| Field | Type | Who may write |
|---|---|---|
| `isTeacher` | boolean | self / HR |
| `subjects` | `Subject[]` (multi-select) | self / HR |
| `gradesTaught` | `Grade[]` (KG1–G12) | self / HR |
| `homeroomClass` | string | self / HR |
| `moeApprovalStatus` | enum from `MOE_APPROVAL_STATUSES` | HR/admin |
| `moeApprovalExpiry` | Timestamp | HR/admin |
| `teachingLicenseNumber`, `teachingLicenseExpiry` | string, Timestamp | self / HR |
| `yearsExperienceTotal`, `yearsAtAFS` | number | self / HR |

**Emergency contact (Phase 2.5):**

| Field | Type | Who may write |
|---|---|---|
| `emergencyContactName` | string | self |
| `emergencyContactRelationship` | string | self |
| `emergencyContactPhone`, `emergencyContactAltPhone` | string | self |

**Medical (Phase 2.5 — sensitive):**

| Field | Type | Who may write |
|---|---|---|
| `bloodType` | enum from `BLOOD_TYPES` | self |
| `allergies` | string (free text) | self |
| `medicalConditions` | string (free text) | self |
| `insuranceProvider`, `insurancePolicyNumber` | string | self |

### `maintenance_tickets/{id}`
Existing schema is fine — see [school-ops/README.md](school-ops/README.md). Add `updatedBy`/`updatedAt` audit fields on every status change. Phase 2.8 adds additive optional fields — `categoryGroup`, `impact`, `assignedToUid`/`assignedToName`, `resolvedByUid`, `duplicateOf`, reopen tracking (`reopenedAt`, `reopenCount`), the status values `'duplicate'` and `'cancelled'` (with `cancelReason`, `cancelledByUid`, `cancelledByName`), and a `notesThread` array of `{byUid, byName, text, at}` — which legacy tickets lack, so all readers must tolerate their absence.

### `leave_requests/{id}`
Existing schema is fine, plus `leaveType` (defaults `'annual'`) and `decisionReason`. `status` is **immutable from the client** — approve/reject goes through the `decideLeaveRequest` Cloud Function, which debits the balance transactionally, denies self-approval, writes `audit_log`, and notifies the employee (`leave_decision` notification).

### `scheduled_tasks/{id}`
Existing schema is fine — **but no code runs them yet.** Phase 4 adds a Cloud Function trigger.

### `notifications/{id}` (NEW)

| Field | Type |
|---|---|
| `type` | `'compliance' \| 'leave_request' \| 'ticket_sla' \| 'ticket_assigned' \| 'system'` |
| `priority` | `'critical' \| 'warning' \| 'info'` |
| `targetUid` | string (specific user) OR `'role:hr'` / `'role:admin'` for broadcast |
| `subject`, `body` | string |
| `link` | string (route to open when clicked) |
| `createdAt` | Timestamp |
| `readAt` | Timestamp \| null |

### `audit_log/{id}` (NEW)

| Field | Type |
|---|---|
| `actorUid` | string |
| `action` | `'user.approved'`, `'user.invited'`, `'ticket.escalated'`, `'salary.updated'`, `'settings.updated'`, `'role.promoted'`, etc. |
| `targetType` | `'user' \| 'ticket' \| 'leave_request' \| 'scheduled_task' \| 'school_settings' \| 'invitation'` |
| `targetId` | string |
| `before`, `after` | object (diff) |
| `at` | Timestamp |
| `targetAdminTier` | boolean — true when the entry concerns an admin/super_admin user. Always written (default false). HR/admin may only list entries where it is `false`; super_admin reads everything (§6). Entries from before 2026-06-11 lack the field and are therefore super_admin-only. |

### `school_settings/{singleton}` (Phase 2.6, Head Admin only — live 2026-06-10)

A single document (id `current`) holding school-wide knobs that used to be hardcoded. Head Admin is the only role that can edit; HR/admin can read so dashboards can show the current values. **All writes go through the `updateSchoolSettings` Cloud Function** (whitelist-validated, audit-logged); the client cannot write. The doc is created lazily on the first Settings save — until then `effectiveSettings()` in [useSchoolSettings.ts](school-ops/src/data/useSchoolSettings.ts) serves the defaults below.

| Field | Type | Default |
|---|---|---|
| `schoolNameEn`, `schoolNameAr` | string | "Al Fajer International School" |
| `domain` | string | "afs.edu.bh" |
| `academicYearStart`, `academicYearEnd` | Timestamp | Sept 1 → June 30 |
| `workingDays` | `Day[]` (Mon–Sun) | `['sun','mon','tue','wed','thu']` |
| `weeklyOffDays` | `Day[]` | `['fri','sat']` |
| `publicHolidays` | `{ date: Timestamp; label: string }[]` | seeded Bahrain national holidays |
| `defaultAnnualLeaveDays` | number | 30 |
| `sickLeaveTiers` | `{ fullPay: number; halfPay: number; noPay: number }` | `{15,20,20}` |
| `gosi.bahraini.employerRate`, `gosi.bahraini.employeeRate` | number | `0.17`, `0.08` (verify with payroll provider — see PHASES.md Appendix A) |
| `gosi.expat.employerRate`, `gosi.expat.employeeRate` | number | `0.03`, `0.01` |
| `wps.employerCR` | string | school CR number |
| `wps.bankRoutingCode` | string | bank code for LMRA CSV upload (Bahrain WPS 2.0 uses LMRA EMS, not the UAE SIF format) |
| `notifyOnCriticalCompliance` | `string[]` (emails) | `["principal@afs.edu.bh"]` |
| `updatedAt`, `updatedBy` | audit | — |

---

## 6. Permissions Matrix

**Single source of truth.** Both UI components and [firestore.rules](firestore.rules) MUST reflect this table.

The role hierarchy is **`super_admin` > `admin` ≈ `hr` > `maintenance` ≈ `staff`**. `super_admin` (Head Admin / Principal) holds every permission. **HR-privacy lockdown (2026-06-11):** `admin` is a pure *operations* role — maintenance, schedules, and staff/maintenance user lifecycle — with **no access to HR data** (salaries, leave, HR documents, the HR module, the audit log). People data belongs to `hr` and `super_admin` only; the two columns are disjoint by design, not nested.

| Action | staff | maintenance | hr | admin | super_admin |
|---|:---:|:---:|:---:|:---:|:---:|
| **Tickets** | | | | | |
| Create ticket | ✓ | ✓ | ✓ | ✓ | ✓ |
| View own tickets | ✓ | ✓ | ✓ | ✓ | ✓ |
| View all tickets | – | ✓ | ✓ | ✓ | ✓ |
| Update ticket status | – | ✓ | – | ✓ | ✓ |
| Escalate ticket priority | – | – | ✓ | ✓ | ✓ |
| Delete / cancel ticket | – | – | – | ✓ | ✓ |
| Create scheduled task | – | – | – | ✓ | ✓ |
| **Profiles** | | | | | |
| View own profile | ✓ | ✓ | ✓ | ✓ | ✓ |
| View staff/maintenance profiles | – | ✓ | ✓ | ✓ | ✓ |
| View HR-role profiles | – | – | ✓ | – | ✓ |
| View admin profiles | – | – | – | ✓ | ✓ |
| View super_admin profiles | – | – | – | – | ✓ |
| See HR module (dashboard / directory / reports) | – | – | ✓ | – | ✓ |
| Edit own non-restricted profile fields | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit other users' profile fields (client writes) | – | – | ✓ (non-admin tier) | – | ✓ |
| Edit role/status of staff/maintenance | – | – | ✓ | ✓ | ✓ |
| Edit role/status of hr users | – | – | ✓ | – | ✓ |
| Edit role/status of admins / super_admins | – | – | – | – | ✓ (with last-one guard) |
| Edit salary / leave balance / sick days (non-admin, never self) | – | – | ✓ | – | ✓ |
| Edit salary of admin or super_admin | – | – | – | – | ✓ |
| View / upload HR documents of others | – | – | ✓ | – | ✓ |
| Invite staff / maintenance | – | – | ✓ | ✓ | ✓ |
| Invite hr | – | – | ✓ | – | ✓ |
| Invite admin / super_admin | – | – | – | – | ✓ |
| Set salary fields at invite time | – | – | ✓ | – | ✓ |
| Delete staff / maintenance users | – | – | – | ✓ | ✓ |
| Delete hr users | – | – | – | – | ✓ |
| Delete admin or super_admin | – | – | – | – | ✓ (with last-one guard) |
| **Leave** | | | | | |
| Submit own leave request | ✓ | ✓ | ✓ | ✓ | ✓ |
| View all leave requests | – | – | ✓ | – | ✓ |
| Approve/reject leave request | – | – | ✓ | – | ✓ |
| Approve own leave request | – | – | – | – | – (always routes up) |
| **Audit & Settings** | | | | | |
| Read audit log (entries about non-admins) | – | – | ✓ | – | ✓ |
| Read audit log (all entries, incl. admins + super_admins) | – | – | – | – | ✓ |
| Read school_settings | – | – | ✓ | ✓ | ✓ |
| Edit school_settings | – | – | – | – | ✓ |
| Impersonate / "log in as" another user | – | – | – | – | ✓ (audit-logged) |

> **Ticket-read footnote.** At the data layer, `maintenance_tickets` reads are allowed for ALL authenticated users (including anonymous kiosk reporters) — required by the submit form's duplicate-report guard and the My Reports list. UI visibility of ticket lists still follows the Tickets rows above.

**Rules of thumb:**
- **hr** owns *people data*: profiles of non-admin-tier users, salaries, leave decisions, HR documents, HR reports, audit log (non-admin entries). No ticket administration, no schedules, no admin-tier anything.
- **admin** owns *operations*: tickets, schedules, and the staff/maintenance user lifecycle (invite, approve, role within staff/maintenance, delete). **Zero HR data** — cannot see the HR module, salaries, leave requests, HR documents, or the audit log. Cannot touch hr-role users or the admin tier.
- **super_admin** is the principal-level role: everything hr + admin can do, plus school-wide settings, the admin/super_admin tier itself, and the full audit log. The minimum number of active super_admins at any time is **1** — a "last super_admin" guard prevents the system from being left with zero.

> **Known limitation (read-level).** Compensation fields live flat on `users/{uid}`, and Firestore reads are doc-level — an `admin` who can read a staff doc technically receives the salary fields in the payload even though every UI hides them and every write path denies them. The complete fix is moving compensation to a `users/{uid}/private/*` subdocument (planned follow-up); until then the lockdown is enforced at the module, query-scope, write, storage, and audit layers.

**Implementation:** one `src/permissions.ts` exporting a single function:

```ts
type Action =
  | 'ticket.create' | 'ticket.update' | 'ticket.delete' | 'ticket.escalate'
  | 'user.invite' | 'user.editRole' | 'user.editSalary' | 'user.delete'
  | 'user.impersonate'
  | 'leave.approve' | 'leave.submit'
  | 'schedule.create'
  | 'settings.read' | 'settings.edit'
  | 'audit.read' | 'audit.readAll'
  // ...

function can(actor: User, action: Action, target?: { type: string; data?: any }): boolean
```

UI components import `can()`. [firestore.rules](firestore.rules) mirrors the same logic. A test suite under `tests/rules/` (Firebase emulator) verifies both layers agree.

**Migration plan** (Phase 2.6): one Cloud Function `bootstrapSuperAdmin` accepts a target email, requires the caller to be either (a) the hardcoded seed email from `auth.js:58` *or* (b) an existing super_admin, and flips that user's role from `admin` → `super_admin`. Run it ONCE for the principal. After that, the seed email override is removed.

---

## 7. Workflows

### 7a. Employee onboarding (target)

```
HR fills "Add Employee" form
        │
        ▼
Cloud Function: inviteUser({email, role, ...})
   • creates users/{newUid} with status='invited', role pre-set
   • generates one-time signup link (Firebase Admin SDK)
   • sends email via SendGrid
   • writes audit_log entry
        │
        ▼
User clicks email link → /accept-invite?token=…
        │
        ▼
User sets password → status flips to 'approved'
        │
        ▼
User logs in normally — NO approval queue, NO race condition
```

**Deletes:** the polling loop in [App.jsx:74-116](school-ops/src/App.jsx:74), the `REGISTRATION_IN_PROGRESS` flag, the entire "pending" status workflow, and the manual role-assignment step.

### 7b. Ticket lifecycle (mostly current, with audit)

```
open → in_progress (start) → resolved (photos + technician)
```

Each transition writes to `audit_log`. On `resolved`, a notification fires to the ticket reporter.

### 7c. Leave request

```
Employee submits → notification fires to role:hr + role:admin
        │
        ▼
HR/Admin approves → annualLeaveBalance decremented (server-side via Cloud Function)
                  → audit_log entry
                  → notification fires back to employee
        │
        OR rejects → notification fires with reason
```

**Implemented 2026-06-10** as the `decideLeaveRequest` callable: transactional debit (per-type via `leaveBalances`), self-approval denied, `leave_requests.status` immutable from the client. The submit side computes `daysRequested` from the date range, blocks overlapping requests, and stamps `submittedAt` with `serverTimestamp()`.

### 7d. Compliance alerts (move from client to Cloud Function)

- **Scheduled Cloud Function** runs daily at 02:00 Bahrain time
- For each user: checks CPR expiry, RP expiry (non-Bahrainis), IBAN format, Arabic name (Bahrainis)
- Writes `notifications` docs targeting HR + the affected employee
- Critical (expired) → also sends email to employee + HR

### 7e. Scheduled maintenance (currently dead code!)

- **Cloud Function** runs hourly
- For each `scheduled_tasks` where `nextRun <= now && isActive`:
  - Creates `maintenance_tickets` docs (one per location in the task)
  - Updates `lastRun`, computes `nextRun = now + frequencyDays`
- This logic exists nowhere in the codebase today — Phase 4 deliverable.

---

## 8. Tech Stack Plan

| Add | Why | Phase |
|---|---|---|
| TypeScript (incremental, `allowJs: true`) | Type-safe Firestore docs, role enums, kills typo bugs | 1 |
| React Router v7 | URL-driven views, bookmarking, back button | 1 |
| `@tanstack/react-query` + Firestore subscriptions | Caching, dedup, real-time, single fetch | 1 |
| Zod | Schema validation for Firestore writes + forms | 1 |
| React Hook Form | Replaces 850 lines of manual `setFormData` in [UserProfile.jsx](school-ops/src/UserProfile.jsx) | 2 |
| Firebase Cloud Functions (Node 22, TS) | Backend for invites, scheduled jobs, notifications | 2 |
| Vite PWA plugin | Installable, offline-capable | 3 |
| Vitest + `@firebase/rules-unit-testing` | Permissions + rules tests | ongoing |
| Sentry | Production error tracking | 3 |
| `react-i18next` + Arabic | Bilingual UI for Arabic-first staff | 5 (optional) |

**Already on latest:** React 19, Vite 7, Tailwind 4, Firebase 12, ESLint 9 — no version-chasing needed.

---

## 9. Coding Rules

These apply to **all new code**. Refactor existing code to match as Phase 1 progresses.

1. **No direct `getDocs` / `onSnapshot` in components.** Go through a React Query hook in `src/data/`.
2. **No role-string comparisons in components.** Use `can(user, action, target)` from `src/permissions.ts`.
3. **No `window.location.reload()`.** Refresh state via React Query invalidation.
4. **Every mutation writes an `audit_log` entry** if it changes user data, ticket status, leave status, or salary.
5. **Every Firestore write** sets `updatedAt` and `updatedBy`. Creates also set `createdAt` and `createdBy`.
6. **Forms use React Hook Form + Zod.** No more manual `setFormData({...formData, x: e.target.value})`.
7. **All routes live in one router config**, not as `activeRole` state branches.
8. **Permission changes ([firestore.rules](firestore.rules)) require a corresponding test** in `tests/rules/` using the Firebase emulator.
9. **No new features land before Phase 1 is done.** Refactors only until centralized data + permissions are in place.
10. **Cloud Functions code lives in `functions/`** (sibling to `school-ops/`), TypeScript, deployed via `firebase deploy --only functions`.
11. **Secrets** (SendGrid key, etc.) go in Firebase Functions config — `firebase functions:secrets:set` — never in client code or `.env`.
12. **Documentation:** any new collection or workflow updates this file FIRST, code follows.
13. **No emojis in source files** (UI strings can have them where the design calls for it; code/comments stay plain).

---

## 10. Phased Roadmap

### Phase 1 — Foundation (no new features)
- [ ] Add TypeScript with `allowJs: true`; convert `constants.js` → `constants.ts` first with role union types
- [ ] Add React Router v7; replace the `activeRole` state machine with real routes (`/staff`, `/maintenance`, `/admin`, `/hr`, `/profile`, `/employees/:uid`, `/tickets/:id`)
- [ ] Add `@tanstack/react-query`; create `src/data/` hooks: `useUsers`, `useTickets`, `useScheduledTasks`, `useLeaveRequests`
- [ ] Create `src/permissions.ts` with `can()` function
- [ ] Replace all role-string checks in [Layout.jsx](school-ops/src/Layout.jsx), [AdminView.jsx](school-ops/src/AdminView.jsx), [HRSystem.jsx](school-ops/src/HRsys/HRSystem.jsx) with `can()`
- [ ] Add `createdBy`, `updatedBy`, `updatedAt` to all writes
- [x] Fix [HRSystem.jsx](school-ops/src/HRsys/HRSystem.jsx) stub (`handleQuickApprove`) — wired to the `updateUserStatus` CF (2026-06-10)
- [ ] Fix mobile menu missing items in [Layout.jsx:240](school-ops/src/Layout.jsx:240)
- [ ] Add Vitest, test the permissions module

### Phase 2 — Backend & invitation flow ✅ Done
- [x] Scaffold `functions/` Firebase Cloud Functions project (TypeScript, Node 22)
- [x] Implement `inviteUser` callable function
- [x] Build "Add Employee" UI in HR module
- [x] Build `/accept-invite` route
- [ ] Delete the polling code in RootLayout — deferred until self-register is fully retired
- [ ] Migrate existing users (set all to `status: 'approved'`)
- [ ] React Hook Form + Zod refactor of [UserProfile.jsx](school-ops/src/UserProfile.jsx) — deferred to dedicated session
- [ ] Add Firebase emulator tests for [firestore.rules](firestore.rules)

### Phase 2.5 — HR Domain Extension ✅ Done
- [x] Schema: `employeeNumber`, `position`, `department`, `contractType`, `contractStartDate`, `contractEndDate`, `probationEndDate`
- [x] Schema (teacher): `isTeacher`, `subjects`, `gradesTaught`, `homeroomClass`, `moeApprovalStatus`, `moeApprovalExpiry`, `teachingLicenseNumber`, `teachingLicenseExpiry`, `yearsExperienceTotal`, `yearsAtAFS`
- [x] Schema (emergency + medical): `emergencyContactName/Relationship/Phone/AltPhone`, `bloodType`, `allergies`, `medicalConditions`, `insuranceProvider`, `insurancePolicyNumber`
- [x] Schema (personal): `dateOfBirth`
- [x] `useUsers` converter normalizes new Timestamps to Dates
- [x] UserProfile.jsx: Employment, Teacher (conditional), Emergency Contact, Medical sections
- [x] InviteEmployeeModal collapsible Employment Details
- [x] `inviteUser` Cloud Function accepts new fields at invite time
- [x] Compliance alerts extended: MOE expiry, contract expiry (60d), probation end (30d)
- [x] BirthdaysAnniversariesWidget on HR dashboard (looks ahead 30d)
- [x] Reports tab — GOSI submission (2026 rates incl. expats, rates from `school_settings`), WPS LMRA CSV approximation, Expiry Watchlist, EOSG Liability. [ ] Headcount + Leave Utilization reports still pending
- [ ] Move compliance scan from client to scheduled Cloud Function — Phase 4
- [ ] Multi-type leave management (maternity/paternity/hajj/etc.) — Phase 2.7
- [ ] Org chart / reporting hierarchy — Phase 3

### Phase 2.6 — Head Admin role (super_admin) — mostly done 2026-06-10
- [x] Add `super_admin` to the `Role` union in [constants.ts](school-ops/src/constants.ts) and the `ROLES` map (+ `ROLE_LABELS` with "Head Admin")
- [x] Update [permissions.ts](school-ops/src/permissions.ts):
  - [x] `isSuperAdmin` derived flag
  - [x] New actions: `settings.read`, `settings.edit`, `audit.readAll`, `user.manageAdmins`, `ticket.cancel` (`user.impersonate` deferred with the impersonation feature)
  - [x] Tightened `user.edit.role/status`, `user.edit.salary`, `user.delete` so admin → admin-tier is denied; salary/leave-balance never self-editable
  - [x] `assignableRoles()` returns all 5 for super_admin
- [x] Update [firestore.rules](firestore.rules):
  - [x] `isSuperAdmin()` + `isHR()` helpers
  - [x] Principal-only checks: super_admin docs writable only by super_admin; salary fields on admin docs super_admin-only
  - [x] Rules for `school_settings/{singleton}` (read HR/admin, write CF-only)
  - [x] `users` READ/UPDATE tightened: plain admin cannot read or write super_admin docs; role/status remain CF-only; self-edit field guards
- [x] `school_settings/current` — created lazily by the first Settings save; defaults served by `effectiveSettings()` until then
- [x] "School Settings" page (`/settings`) — academic year, working days, holidays, GOSI rates, WPS, leave defaults, notification recipients; saves via `updateSchoolSettings` CF
- [x] "Admin Management" view (`/admin-management`, Head Admin only) — promote/demote/suspend with last-Head-Admin guard
- [x] Cloud Function `bootstrapSuperAdmin(email)` — deployed; remove seed + banner after the principal's promotion is confirmed
- [x] Cloud Functions `updateUserRole`/`updateUserStatus`/`deleteUser` — server-side matrix enforcement
- [x] Last-super-admin guard in all three mutation CFs + client-side disable
- [x] UI label: `super_admin` renders as **"Head Admin"** (indigo-700) everywhere
- [x] Audit log reader UI + filter (`/audit-log`, 2026-06-11): HR/admin see entries about non-admins (`targetAdminTier == false`, rules-enforced + composite index); super_admin sees all
- [x] Tests: permissions module (98 passing). [ ] Emulator tests for role-elevation attempts — still open
- [ ] Impersonation ("log in as") — deferred, needs its own design pass

### Phase 3 — Unification & polish
- [ ] `/employees/:uid` view merging profile + tickets + leave history
- [ ] `/locations/:name` view with ticket history + scheduled tasks
- [ ] Unified notification center (`/notifications`) replacing the three separate alert UIs
- [ ] PWA setup (Vite PWA plugin, manifest, service worker, offline ticket draft)
- [ ] Sentry integration

### Phase 4 — Automation
- [ ] Cloud Function: daily compliance check → writes to `notifications` collection
- [ ] Cloud Function: hourly schedule runner → creates tickets from `scheduled_tasks`
- [ ] Cloud Function: ticket SLA escalation (>48h critical untouched)
- [ ] Email notifications via SendGrid (invite, leave decision, compliance, ticket assigned/resolved)
- [ ] CSV bulk import of employees for September hiring waves

### Phase 5 — Optional / future
- [ ] Arabic i18n (RTL layout, translations)
- [ ] Mobile app (React Native, reusing data + permissions layer)
- [ ] Analytics dashboard (Recharts) — ticket throughput, average resolution time, leave usage trends
- [ ] Payroll export (Bahrain LMRA WPS CSV — not UAE SIF — uploaded via LMRA EMS portal)
- [ ] Attendance integration (biometric devices, ID scanners)
- [ ] Multi-tenant readiness (sell to other schools)

---

## 11. Out of Scope

Do not pursue these without explicit re-discussion:

- Merging `users` + `maintenance_tickets` into one collection — different access patterns, keep separate
- Redux/MobX/Zustand — React Query + Context covers it
- Switching off Firebase to a different backend — that's a rewrite, not an upgrade
- Public-facing parent/student portal — different threat model, separate project if ever needed
- Custom auth implementation — Firebase Auth is sufficient
- Server-side rendering / Next.js — adds complexity without solving any current problem

---

## 12. References

- [school-ops/README.md](school-ops/README.md) — original feature overview (will go stale; **this file supersedes it** for architecture)
- [school-ops/DB%20Rules.md](school-ops/DB%20Rules.md) — Firestore rules history notes
- [school-ops/src/HRsys/HR_SYSTEM_DOCUMENTATION.md](school-ops/src/HRsys/HR_SYSTEM_DOCUMENTATION.md) — HR module notes
- [firestore.rules](firestore.rules) — server-side data security
- [firebase.storage.rules](firebase.storage.rules) — server-side file security
- [netlify.toml](netlify.toml) — deployment config

---

**This is a living document.** Update it BEFORE code changes, not after. When in doubt about a design choice, write it here first to force the thinking, then implement.
