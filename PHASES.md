# PHASES.md — Completion Roadmap

The companion to [CLAUDE.md](CLAUDE.md). `CLAUDE.md` is **architecture and conventions** (what the system is). `PHASES.md` is **execution plan** (how we finish it, in what order, with what done-criteria).

Each phase here lists:
- **Goal** — the user-visible outcome
- **Done when** — observable, testable criteria
- **Scope** — concrete deliverables
- **Out of scope** — things that look related but aren't included
- **Risks** — what could derail it
- **Effort** — rough sizing (S = ≤1 week, M = 2–3 weeks, L = ≥1 month) for one developer

---

## Definition of "project complete"

The project is finished — i.e. ready to stop adding scope and shift to maintenance — when **all of the following are true**:

1. **Every employee uses the app daily** (not just maintenance and HR). Adoption ≥ 90% of staff in a given week.
2. **No spreadsheet workarounds remain** for: leave tracking, document expiry, contract renewals, payroll inputs, or maintenance scheduling. Everything is in the app.
3. **One source of truth.** No HR data lives in Google Drive, no ticket lives in WhatsApp, no schedule lives in someone's notebook.
4. **Self-service for staff.** Employees can: see their own leave balance, submit leave, see ticket status, see their compliance alerts, upload documents, view payslips (if/when implemented).
5. **Automation runs unattended.** Compliance scans, schedule runners, SLA escalations, leave-balance adjustments, and email notifications happen without a human pressing a button.
6. **Reporting closes the loop with the government.** GOSI submission, WPS SIF export, MOE staff lists, and LMRA renewals can be produced in <5 minutes each.
7. **Principal-level controls exist.** The Head Admin can manage admins, change school-wide settings, and review everything that happened without asking a developer.
8. **It works offline-tolerant on mobile.** Maintenance staff can draft a ticket on the playground with no signal and have it sync when they're back inside.

Phases 2.6 → 5 below take us there.

---

## Status snapshot (2026-05)

| Phase | Status | Notes |
|---|---|---|
| 1 — Foundation | ◐ Partial | TypeScript + Router + React Query + permissions.ts done. Cleanup tasks (audit fields everywhere, mobile menu) outstanding. |
| 2 — Backend & invite flow | ✅ Done | Cloud Functions + invite flow + accept-invite live. Migration tasks remain. |
| 2.5 — HR Domain Extension | ✅ Done | All schema + UI in production. Reports tab moved to 2.6. |
| 2.6 — Head Admin role | ◕ Mostly done (2026-06-10) | Settings page, Admin Management, last-Head-Admin guard, tightened matrix on all 3 surfaces, updateSchoolSettings CF all live. Remaining: emulator rules tests, audit-log reader UI, impersonation. |
| 2.6.1 — Audit hotfixes | ✅ Done (2026-06-10) | Every critical/high/medium item shipped — see checklist below. |
| 2.7 — Multi-type leave | ◐ Started | Constants + balance lib exist; `decideLeaveRequest` CF (delivered with 2.6.1) already debits per-type balances. Remaining: per-type submission UI polish, annual reset CF, tier preview. |
| 2.8 — Maintenance V2 | ✅ Done (2026-06-10) | Form V2, Queue V2, schedules fix, status-change CF, supervisor Insights, `cancelled` status, notes thread all shipped. |
| 2.9 — HR Manager Toolkit | ✅ Done (2026-06-11) | Reports Center (12 reports, previews, print views, salary gate), `/audit-log` reader with `targetAdminTier` scoping, HR doc upload on employee profiles, all leftover low-severity fixes. 98 tests passing. |
| 3 — Unification & polish | ⏳ Queued | Profile-merged-with-tickets view, PWA, Sentry. |
| 4 — Automation | ◐ Started | dailyComplianceScan + runScheduledTasks exist. SLA escalation + event notifications remain. |
| 5+ — Differentiators | 🆕 Planning | Sharpened by competitor research (see §Appendix A). |

---

## Phase 2.6 — Head Admin role

**Goal:** Introduce a `super_admin` tier above `admin` so the principal (and only the principal) can manage admins themselves, change school-wide settings, and audit every action — without granting that power to admin assistants.

**Status (2026-06-10): mostly done.** Shipped: tightened matrix on all three surfaces (client `can()`, functions, firestore.rules — plain admin can no longer view/edit/delete the admin tier), `/settings` School Settings page (writes via the whitelist-validated `updateSchoolSettings` CF), `/admin-management` promote/demote view, last-Head-Admin guard in `updateUserRole`/`updateUserStatus`/`deleteUser`, `inviteUser` accepts `super_admin`, "Head Admin" indigo badge everywhere, expanded permissions unit tests (77 passing). The `school_settings/current` doc is created lazily on first Settings save; until then `effectiveSettings()` serves the CLAUDE.md defaults. **Remaining:** Firestore emulator rules test suite, audit-log reader UI with the HR/admin vs super_admin filter, impersonation ("log in as").

**Done when:**
- One promoted Head Admin can edit `school_settings/current` and see it reflected on dashboards
- A regular `admin` who tries to change another admin's role gets `permission-denied` from Firestore rules (not just hidden UI)
- The principal can promote a new Head Admin and demote one — but the system refuses to demote the *last* one
- The audit log shows promote/demote/settings-change events with full `before`/`after` diffs
- Permissions module has unit tests covering every cell in the §6 matrix; Firestore emulator tests cover every role × write combination

**Scope:**

| Area | Concrete change |
|---|---|
| Constants | `ROLES.SUPER_ADMIN = 'super_admin'`; UI label "Head Admin"; indigo-700 badge |
| `permissions.ts` | New `isSuperAdmin` flag; new actions `settings.read/edit`, `audit.readAll`, `user.impersonate`; tighten admin-on-admin actions |
| `firestore.rules` | `isSuperAdmin()` helper; rules for `school_settings/{singleton}`; deny role/status changes targeting admin/super_admin unless caller is super_admin |
| New collection | `school_settings/current` doc, schema in [CLAUDE.md §5](CLAUDE.md#5-data-model-canonical) |
| Cloud Functions | `bootstrapSuperAdmin(email)` — one-time principal promotion; `updateUserRole(uid, newRole)` — server-side role changes with audit + last-one guard |
| New UI page | `/settings` — School Settings form (Head Admin only): academic year, working days, holidays, GOSI/WPS, notification recipients |
| New UI page | `/admin-management` — list of admins/super_admins with promote/demote and impersonate actions |
| Existing UI | Render `super_admin` everywhere as **"Head Admin"**. Update `InviteEmployeeModal` role dropdown via `assignableRoles()` |
| Audit log | HR/admin queries filter out actions where `targetType=='user'` and target's role is `admin`/`super_admin`; super_admin sees all |
| Tests | `permissions.test.ts` covers all 22 matrix rows; emulator test suite under `tests/rules/` |

**Out of scope:**
- Permission delegation (e.g. "grant admin X the ability to do Y just this week") — too complex, principle of least surprise broken
- Per-department admin scoping ("admin for academic dept only") — needs a totally different model, separate phase
- Audit log redaction / privacy controls — Phase 4 ships it as-is, redaction is a Phase 5 concern

**Risks:**
- **Locking yourself out.** A bug in `assignableRoles()` or the Firestore rules could leave zero super_admins. Mitigation: last-one guard at both client and server; emergency `bootstrapSuperAdmin` accepts the seed email as escape hatch (removed after first use).
- **Existing admins losing capabilities.** Today's admins are de-facto principals. After this phase, they can't promote other admins. Communicate clearly; the principal must be promoted *before* deploy.
- **UI/rules drift.** The matrix is now 22 rows × 5 roles = 110 cells. Without the test suite, drift is inevitable. The test suite is non-negotiable.

**Effort:** M (2–3 weeks: 1 week schema + functions + rules, 1 week UI, 0.5 week tests + migration playbook)

---

## Phase 2.6.1 — Audit hotfixes (June 2026 full-code audit)

A line-by-line read of every source file found bugs that block real users today. These are **fix-first** — they outrank all new features. Full evidence in the audit conversation; summary here so the list survives.

### Critical (broken for users right now)

- [x] ~~**HR role cannot use the HR module.**~~ — **done 2026-06-10**: `useUsers` now issues role-scoped list queries (`role in [...]` per actor role) that firestore.rules can prove; `leave_requests` rules grant HR read + non-status update; decisions go through the `decideLeaveRequest` CF. Plain-admin list queries are scoped too (admins can no longer stream Head Admin docs).
- [x] ~~**EmployeeDetailView wipes dates on save.**~~ — **done 2026-06-10**: JS-Date-safe `toInputDate`, diff-only save payload (untouched fields omitted), `auditUpdate` stamps.
- [x] ~~**EmployeeDetailView "Admin Actions" are all dead.**~~ — **done 2026-06-10**: wired to `updateUserRole`/`updateUserStatus`/`deleteUser` CFs, `terminated` removed, statuses from `USER_STATUSES`, gated by target-aware `can()`.
- [x] ~~**Same `.toDate` bug class in HR UI**~~ — **done 2026-06-10**: zero `.toDate` left in HRsys; compliance alerts/tenure/Joined column all render from JS Dates via shared `hr/compliance.ts`.

### High

- [x] ~~**Move leave approval server-side**~~ — **done 2026-06-10**: `decideLeaveRequest` CF (transaction, per-type balance debit, audit entry, employee notification, self-approval denied); AdminView + HRSystem both call it; client balance math deleted; `leave_requests.status` immutable from the client.
- [x] ~~**super_admin invisible in HR UI**~~ — **done 2026-06-10**: role-string checks replaced with `can()`; `ROLE_LABELS` renders Head Admin (indigo-700) everywhere incl. HRDirectory RoleBadge.
- [x] ~~**Invite modal offers Head Admin but server rejects it**~~ — **done 2026-06-10**: `inviteUser` accepts `super_admin`, gated by `canAssignRole`.
- [x] ~~**Self-edit field security gap**~~ — **done 2026-06-10**: firestore.rules `restrictedSelfFields()` guard on the own-profile branch PLUS a branch-wide never-self `salaryTierFields()` guard (closes the HR/super_admin self-salary hole); UserProfile save payload is now an explicit allowlist (no leave scratch fields, restricted inputs read-only "Set by HR"); client `can()` denies self-targeted `user.edit.salary`/`leaveBalance`.
- [x] ~~**GOSI report uses pre-2024 rates and omits expats**~~ — **done 2026-06-10**: rates from `school_settings` via `effectiveSettings` (defaults 17%/8% Bahraini, 3%/1% expat), expats included; WPS reframed as LMRA CSV approximation.
- [x] ~~**dailyComplianceScan emails are wrong**~~ — **done 2026-06-10**: dedicated `sendComplianceAlertEmail` template; base URL centralized in `functions/src/config.ts` (`APP_BASE_URL` param). **ACTION NEEDED: set `APP_BASE_URL` to the production Netlify URL via functions env — default is still the stale web.app placeholder.**

### Medium

- [x] ~~Ticket status changes skip `updatedAt`/`updatedBy` and never notify the reporter~~ — **done 2026-06-10**: all ticket mutations stamp audit fields; new `onTicketStatusChange` Cloud Function writes audit_log entries for every transition and notifies the reporter on start/resolve/reopen.
- [x] ~~"by b4bijuv" in the queue~~ — **done 2026-06-10**: displayName resolution everywhere; tickets now carry `assignedToUid`/`assignedToName`/`resolvedByUid` alongside legacy fields.
- [x] ~~MaintenanceView's in-card sort dropdown is dead; resolved history sorts by created not resolved date~~ — **done 2026-06-10**: shared `ticketSorters` (urgent default = priority then oldest); resolved history sorts by `resolvedAt`.
- [x] ~~Scheduler: "Start Immediately" doesn't~~ — **done 2026-06-10**: creation writes `nextRun = now` (or startDate), `lastRun = null`, `nextDue` junk field removed; UI shows `computeScheduleDue()` everywhere instead of "N/A".
- [x] ~~ReportForm anonymous first-submit stale closure~~ — **done 2026-06-10**: captured returned user from `signInAsAnonymous()` into a local const.
- [x] ~~Dead buttons~~ — **done 2026-06-10**: HRDirectory Export → real CSV download; "HR Settings" → `/settings` (gated by `settings.read`); EmployeeDetailView "Print" → `window.print()`; no-op refresh buttons wired to query invalidation or removed.
- [x] ~~Blocked/suspended admins bypass RootLayout's sign-out gate~~ — **done 2026-06-10**: blocked/suspended users always signed out regardless of role.
- [x] ~~`queryClient` cache survives sign-out~~ — **done 2026-06-10**: `queryClient.clear()` on sign-out.
- [x] ~~Leave submission: hand-typed days, no overlap check, client clock~~ — **done 2026-06-10**: `daysRequestedBetween` computes the days read-only from the range; `findOverlap` blocks conflicting pending/approved requests; `submittedAt` is `serverTimestamp()`; `auditCreate` stamps.
- [x] ~~EmployeeDetailView Leave tab placeholder~~ — **done 2026-06-10**: real history via `useLeaveRequestsFor(uid)` + balance card from `resolveBalances` with sick-tier breakdown.
- [x] ~~Compliance logic lives in 4 places~~ — **done 2026-06-10**: single shared `src/hr/compliance.ts` consumed by AdminView, HRSystem, EmployeeDetailView, HRDirectory (the CF keeps its own copy until Phase 4 makes it the single source).

---

## Phase 2.8 — Maintenance System V2

**Goal:** turn the maintenance module from an admin-flavored list into a tool the maintenance *team* actually runs their day from, and make the Submit form smart enough that the queue stays clean (no more five duplicate "Dirty or unclean areas — B5 G2B" tickets).

**Why now:** the queue screenshot from production shows the failure modes plainly — duplicates flooding the list, everything "medium" priority, no assignment (one tech "b4bijuv" holding 9 jobs), no aging indicators, schedules showing "Next Due N/A", and a flat 26-item category dropdown.

### 2.8a — Submit Request form V2

| Change | Detail |
|---|---|
| **Two-level categories** | Replace the flat 26-item list with groups → subcategories: Climate (AC not cooling / leak / noise / thermostat), Electrical (lights / sockets / wiring hazard / fans), Plumbing & Water (leak / toilet / cooler / drainage), Furniture (chair / table / shelf / bench / blinds), Building (paint / ceiling / door & lock / window / flooring), Technology (smartboard / projector / PC / network / clock / PA), Cleaning & Hygiene (dirty / odor / pests / waste), Grounds (grass / trees / canopy / fence), Safety Hazard, Other. Keep a type-to-search box that matches across all subcategories so frequent reporters skip the tree entirely. Store both `categoryGroup` and `category` for analytics. |
| **Duplicate guard** | On select of category+location, query open tickets with same pair; if any exist show "There are N open reports for this — add a photo/comment to the existing one instead?" with one-tap "+1 / add info" (increments a `reportCount` and appends note) or "Mine is different" to proceed. Kills the #1 queue-pollution problem. |
| **Priority handled by triage, not reporter** | Reporters tap a severity hint ("Safety risk / Blocks teaching / Annoying / Cosmetic") which maps to a default priority; Safety auto-escalates. Maintenance/admin keep the real priority control. Today every reporter picks medium and the field is meaningless. |
| **Location picker by building** | Group LOCATIONS by B3/B4/B5/Admin/Other with recent-first; sets up the V2 queue's "walk order" grouping. |
| **Photo-first on mobile** | `capture="environment"` camera input, photos before description; description becomes optional when a photo + subcategory are present (most reports need no prose). |
| **Confirmation with ticket number** | Show short ticket ref (last 6 of doc id) + link "track my reports" instead of `alert()`. Signed-in staff get a "My Reports" list (query exists already in useTickets own-scope). Fix the anonymous stale-closure bug as part of this. |

### 2.8b — Maintenance Queue V2 (technician-first)

| Change | Detail |
|---|---|
| **Three tabs: My Jobs / Unassigned / All** | "My Jobs" = assigned to me, in progress first. "Unassigned" = open pool with a one-tap **Claim** button. Today a tech has no view of "what am I doing"; everything is one long list. |
| **Group duplicates** | Open tickets sharing category+location collapse into one card with a count chip ("×4") and a Merge action (`status: 'duplicate'`, `duplicateOf: <id>` on the children). Queue of 34 becomes ~20 real jobs. |
| **Walk-order grouping** | Toggle: group by building (B3 / B4 / B5 / Admin / Outdoor) so a tech clears one building per trip instead of zig-zagging. Building derives from the location prefix. |
| **Aging & SLA chips on every card** | Reuse AdminView's `getTimeOpen` (green <24h / amber 24–48h / red >48h + ⚠). Default sort: priority desc, then **oldest first** — a work queue surfaces what's been waiting longest, not what just arrived. Fix the dead sort dropdown while at it. |
| **Real status flow** | `open → assigned → in_progress → resolved`, plus `duplicate` and `cancelled`. "Start" sets assignedToUid/assignedToName(displayName)/startedAt; "Mark Done" no longer asks the signed-in tech to type their own name. Reporter gets a notification on resolve (§7b promise, finally honored). Reopen-within-7-days button on resolved tickets. |
| **Ticket timeline** | Detail modal shows created → claimed → started → resolved with timestamps, photos, and a notes thread (array of `{byUid, byName, text, at}`) replacing the single overwritten `adminNotes` string. |
| **Schedules that work** | Fix Start-Immediately (write `nextRun = now`); show computed next due everywhere; "creates N tickets across M locations" preview before saving; per-schedule history (last 5 runs from audit_log). |
| **Supervisor mini-dashboard** | For maintenance lead/admin: open-by-building heatmap, repeat-offender locations (B5 G2B appearing 5× this week is a signal to deep-clean, not 5 jobs), avg resolution time by category, jobs per technician this week. All computable client-side from existing data. |
| **Identity cleanup** | Every ticket mutation stamps `updatedAt/updatedBy` + `{uid, displayName}`; technician names render from user docs, never email prefixes. |

### Build order

1. [x] Hotfixes from 2.6.1 that overlap (sort bug, name bug, audit stamps, resolve notification) — **shipped 2026-06-10**
2. [x] Submit form V2 (search-or-type issue picker, browse-by-group, duplicate guard, impact chips, camera capture, photo-optional description, in-page confirmation with ticket ref, My Reports list on the staff page) — **shipped 2026-06-10**
3. [x] Queue V2 (My Jobs / Open Pool / All Active tabs, clickable stat cards, reporter name + description preview + building + aging chips on cards, duplicate grouping with per-row Mark-duplicate, walk-order grouping, claim with auto displayName, no more typed technician name, 7-day Reopen, detail-modal timeline, scheduled-tasks card via hook with computed due dates) — **shipped 2026-06-10**
4. [x] Schedules fix — **shipped 2026-06-10**.
5. [x] Supervisor mini-dashboard — **shipped 2026-06-10**: "Insights" tab in MaintenanceView (open-by-building bars, repeat-offender locations with root-cause flag, avg resolution time by category group, resolved-this-week by technician), computed client-side from the existing subscription.
6. [x] `cancelled` status — **shipped 2026-06-10**: admin-only Cancel action (reason required) in the detail modal; excluded from active lists/stats like `duplicate`; `isActiveTicket()` helper centralizes the exclusion.
7. [x] Notes thread — **shipped 2026-06-10**: `notesThread` array (`{byUid, byName, text, at}`) with add-note input in the detail modal; legacy `adminNotes` rendered as the first entry.

**Deviations from the original spec (conscious):**
- No separate `assigned` status — Claim = Start (`open → in_progress`); a small team doesn't need the extra state. Revisit if the team grows.

**Out of scope for V2:** asset register/QR codes (Phase 5 #8), offline PWA drafts (Phase 3), parts inventory, vendor management.

---

## Phase 2.9 — HR Manager Toolkit (2026-06-11) — ✅ shipped same day

**Goal:** give the HR manager every report and tool needed to run the month without spreadsheets, plus fix the leftover low-severity audit findings.

**Status:** everything below shipped 2026-06-11 (all 8 reports + Reports Center UI with previews/print/salary gate, `/audit-log` reader end-to-end incl. rules + composite index, HR upload-on-behalf, all 5 carried-over fixes). Adversarial review applied 3 further fixes: `acceptInvite` audit entries now flag admin-tier targets, `audit.read` excludes legacy `viewAll` actors (matching rules), and on-screen previews render en-GB dates while CSVs keep ISO. Note: the audit-log reader needs the new composite index — deploy `firestore:indexes` together with rules/functions.

### 2.9a — Reports Center (HRReports tab revamp)

Existing reports stay (GOSI, WPS LMRA, Expiry Watchlist, EOSG). New generators in `hr/reports.ts`, each with a `*Rows()` (header + rows, for on-screen preview/print) and a `*Report()` (CSV download) export:

| Report | What it answers | Notes |
|---|---|---|
| **Staff Master** | "Give me everything about everyone" | All identity/contact/employment/teacher fields; salary columns only when the actor passes `user.edit.salary` (toggle in UI) |
| **Headcount & Demographics** | Monthly management report | Counts by department, role, nationality (+ **Bahrainization %** for LMRA quota), gender, contract type, age bands, average tenure |
| **Leave Balances & Utilization** | "Who has leave left?" | Per employee per type: entitled / used / remaining from `resolveBalances`; flags exhausted balances |
| **Payroll Summary** | Monthly payroll cost | Basic + allowances = gross, GOSI employee deduction, net pay, employer GOSI, total cost; grand totals |
| **MOE Teacher Roster** | MOE inspection one-click answer (Phase 5 #7 delivered early) | EN+AR names, CPR, subjects, grades, MOE approval + expiry, license, experience; printable |
| **Data Completeness** | "Whose file is missing what?" | Missing IBAN / Arabic name / CPR / passport / RP / emergency contact / DOB / contract fields / documents, completeness % sorted worst-first |
| **Joiners & Leavers** | GOSI/LMRA monthly reconciliation | Date-range filter; joined (dateOfJoining) and separated (separationDate + reason) |
| **Emergency Contact Sheet** | Crisis preparedness | Per staff: local emergency contact + home-country contact for expats; printable |

UI: categorized sections (Government & Compliance / People / Money / Movements & Leave), per-card row-count stats, **Preview** (first 10 rows in a modal), CSV download, **Print view** for MOE Roster + Emergency Sheet (`@media print`), salary-columns toggle gated by `can()`.

### 2.9b — Audit log reader

- `audit_log` entries gain `targetAdminTier: boolean` (always written; true when the entry's target user is admin/super_admin). `targetType` union gains `school_settings`.
- Rules: super_admin reads all; HR/admin read only `targetAdminTier == false` (matrix §6). Old entries lack the field → visible to super_admin only (safe default).
- Composite index `(targetAdminTier ASC, at DESC)`; `useAuditLog(actor)` hook; `/audit-log` route (RequireAction `audit.read`) with action/targetType filters, expandable before/after diff, load-more; nav entries desktop + mobile.

### 2.9c — HR tools & fixes

- **HR document upload on behalf of an employee** in EmployeeDetailView's Documents tab (storage rules already allow HR/admin writes to any `hr-documents/{uid}/` folder; there was just no UI).
- Leftover low-severity fixes from the 2026-06-10 review: Settings holiday row with blank label poisons the save; RootLayout role-string literal + super_admin pending/invited inversion; `updateUserStatus` last-Head-Admin guard fires on any transition away from `approved`; dead `ticket.note.add` permission action removed; `handleDocUpload` audit stamps.

---

## Phase 2.7 — Multi-type leave management

**Goal:** Replace "annual + sick" with all 8 Bahrain Labour Law leave types (`LEAVE_TYPES` constant already lists them) so HR can track maternity, paternity, hajj, bereavement, study, and unpaid leave without spreadsheets.

**Done when:**
- An employee selecting "Maternity Leave" gets the right entitlement (60 days paid + 15 unpaid per Bahrain Labour Law 2012)
- HR can see per-type balances on the leave dashboard
- Sick leave deductions follow the 15/20/20 tier ladder automatically (currently `SICK_LEAVE_TIERS` exists but the deduction logic is partial)
- A Cloud Function rebalances on Jan 1 (annual leave reset)
- Each leave decision writes an audit_log entry

**Scope:**
- Add `leaveType` field to `leave_requests/{id}` (default: 'annual' for back-compat)
- Per-type entitlement table on `users/{uid}` or computed from a policy doc in `school_settings`
- `LeaveRequestModal` — type dropdown, dynamic balance display
- Cloud Function `decideLeaveRequest(requestId, decision)` — atomically updates request status + appropriate balance + writes audit + sends notification
- Cloud Function `annualLeaveReset` — scheduled Jan 1, resets annual balance per contract type
- HR dashboard widget: balance summary by type
- Sick leave tier indicator: shows "Day 12 of 15 full-pay" on submission preview

**Out of scope:**
- Half-day leave (granularity stays at full day; revisit if requested)
- Leave-in-lieu / TOIL (different problem, depends on time tracking)
- Approval routing (manager → HR → principal) — Phase 3 (org chart) prerequisite

**Risks:**
- **Bahrain Labour Law specifics.** Maternity, paternity, hajj, study leave each have different conditions (years of service, religion, etc.). Encode rules conservatively, surface gotchas in the UI as warnings rather than blocking.

**Effort:** M (2 weeks)

---

## Phase 3 — Unification & polish

**Goal:** Stop showing employees three different "your stuff" screens. Merge profile + tickets + leave + compliance into one place per person and per location.

**Done when:**
- Click an employee anywhere → opens `/employees/:uid` showing profile, ticket history (reported + assigned), leave history, compliance flags
- Click a location anywhere → opens `/locations/:name` showing ticket history + scheduled tasks
- A single `/notifications` route replaces the three separate alert dropdowns
- The app installs as a PWA (manifest, service worker)
- A draft ticket survives a network drop and posts when reconnected
- Sentry catches client errors

**Scope:**
- New routes: `/employees/:uid`, `/locations/:name`, `/notifications`
- React Query hooks: `useEmployeeOverview(uid)`, `useLocationOverview(name)`, `useNotifications()`
- Notification center: list, mark-read, mark-all-read, filter by type
- Vite PWA plugin: manifest with school logo, offline shell, offline ticket draft (IndexedDB cache → sync queue)
- Sentry: client SDK + Cloud Functions SDK, source maps in CI
- Org chart visualisation (uses `reportingManagerUid` from Phase 2.5)

**Out of scope:**
- Mobile native app — Phase 5
- Real-time chat / messaging — Phase 5

**Effort:** L (4–6 weeks)

---

## Phase 4 — Automation

**Goal:** Stop relying on humans (or page loads) to trigger time-sensitive checks. Move every periodic task to scheduled Cloud Functions.

**Done when:**
- `dailyComplianceScan` runs at 02:00 Bahrain time, writes notifications, emails critical items (already exists ✅)
- `hourlyScheduleRunner` creates maintenance tickets from `scheduled_tasks` when due (does not exist today)
- `ticketSlaEscalation` runs every 4h, bumps critical tickets >48h old to admin attention
- `annualLeaveReset` runs Jan 1 (overlap with Phase 2.7)
- `cleanupExpiredInvitations` runs weekly, removes consumed/expired tokens
- Bulk CSV import for September hiring waves (Cloud Function + admin UI)
- Email templates for: invite, leave decision, compliance critical, ticket assigned, ticket resolved

**Scope:**
- 5 new scheduled Cloud Functions (see above)
- 1 callable Cloud Function `importEmployeesCsv` with strict Zod validation per row
- React component `<CsvImportWizard />` with dry-run preview
- Email template library (Resend or current provider) — move inline HTML out of `email.ts`
- Function observability: structured logs, alert on failure (Sentry or Cloud Monitoring)

**Out of scope:**
- WhatsApp / SMS notifications — Phase 5 (needs paid provider, separate compliance review)
- Calendar (.ics) integration — Phase 5

**Effort:** M (3 weeks)

---

## Phase 5 — Differentiation & maturity (ranked)

This list is now **prioritized** from the competitor research in [Appendix A](#appendix-a--competitor-research). Each item is tagged **[TS]** = table stakes (we'd be embarrassed without it) or **[DIFF]** = differentiator (gives us a unique edge in the GCC market). Build top-down; the bottom rows are deferred until requested by the school.

### Ranked priority list

| # | Feature | Tag | Effort | Why it's at this rank |
|---|---|---|---|---|
| 1 | **Audit log + unified notification feed** | TS | M | Already on roadmap (P1+P3). Everything downstream — performance reviews, salary changes, leave approvals — needs an auditable trail to be trustworthy. The unified feed completes the "Events" vision pillar. |
| 2 | **Bahrain WPS LMRA CSV exporter + GOSI monthly export** | DIFF | M | Mandatory under WPS 2.0 (live since Feb 2026). No Western HRIS provides this. **Verify current GOSI rates with payroll provider first** — CLAUDE.md numbers were stale before this update. |
| 3 | **super_admin role + ClassReach-style 4-level granularity** | TS | M | Phase 2.6 — the principal needs visibility above HR/admin. Consider extending each action with a 4-level scope (None / View / View+Edit / Super) per category like ClassReach does. Must ship before more roles get added. |
| 4 | **Cloud Function: scheduled compliance scan + email notifier** | TS | S | Already Phase 4. Move client-side compliance loop to a daily Cloud Function so alerts fire even when no HR user is logged in. Pairs with Resend (already integrated). |
| 5 | **Org chart + reporting hierarchy view** | TS | S | We already store `reportingManagerUid`. Visual tree + "my team" filter is small effort, high perceived value, and unlocks manager-first leave approval routing. |
| 6 | **Performance reviews module (annual + probation-end)** | TS | L | Schools run on annual appraisals; probation reviews are legally required in Bahrain. The biggest "BambooHR has it, you don't" gap. `performance_reviews` collection: cycle, reviewer, reviewee, KRA scores, comments, signoff. |
| 7 | **MOE inspection-ready teacher roster report** | DIFF | S | One-click PDF: every teacher with English+Arabic name, CPR, qualifications, subjects, grades, MOE approval status + expiry. Exactly what MOE inspectors ask for. Massive principal-facing win. |
| 8 | **Asset register + QR code scanning for maintenance** | DIFF | M | New `assets` collection (id, type, location, purchase date, warranty, cost). Print QR → technician scans → opens asset's ticket history. Pulls us level with Limble inside the maintenance side. Completes the "Places" vision pillar. |
| 9 | **Bulk CSV employee import (September hiring wave)** | TS | S | Already Phase 4. Schools onboard 20–50 employees in a single August/September week. Manual invites don't scale. Dry-run CSV upload → bulk inviteUser calls. |
| 10 | **Native mobile PWA (installable, offline ticket draft)** | TS | M | Already Phase 3. Maintenance technicians work in remote parts of the building with no signal. Draft offline → sync on reconnect. PWA is the right call — React Native is overkill at our scale. |

### Honorable mentions (build after the top 10)

| Feature | Tag | Effort | Note |
|---|---|---|---|
| **Arabic / RTL UI** | DIFF | M | Strong differentiator for selling to other GCC schools, but no urgent staff demand (English is the working language at AFS). Build when multi-tenant becomes real. |
| **M365 SSO + auto-provisioning** | TS | M | High value, but current Firebase auth works. Schedule alongside the super_admin work since both touch identity. |
| **Substitute teacher booking** | DIFF | M | Schools love this, but it overlaps with Phase 2.7 leave management. Build as a leave-request side effect: "when teacher requests sick day, auto-post sub job to qualified bench." |
| **Room / resource booking** | TS | S | Natural fit for "Places" pillar; small follow-on to asset register. |
| **Principal KPI dashboard** | TS | S | Easy once audit log + reviews exist. Final polish on the super_admin tier. |
| **Training & PD tracking** | DIFF | M | MOE-required CPD hours per teacher per year. `training_courses` + `training_completions` collections; certificate uploads. Lower priority because schools currently track this on paper anyway. |
| **Time & attendance (biometric)** | TS | L | ZKTeco devices are common in Bahrain. Integration is real engineering work — only if/when the school decides to drop the existing fingerprint system. |
| **E-signature** | DIFF | M | Sign contracts, policies, attendance sheets in-app. Real Bahrain legal acceptance is unclear — research separately before committing. |
| **Vendor management** | TS | M | Track maintenance vendors, contact info, contracts. Layer on top of asset register. |
| **Internal announcements** | TS | S | Pinned broadcast notifications. After the unified notification feed, this is mostly a "pinning" toggle. |

### Explicitly NOT recommended (per research)

- **Workday-style multi-org hierarchies** — overkill for one campus.
- **Custom report builder UI** — premature. Hand-code the 6 reports HR actually needs first.
- **OKR module** — schools talk about it, never use it. Skip until requested twice.
- **Internal chat / messaging** — Teams and WhatsApp already solve this. Don't compete.
- **Budget tracking** — finance lives in QuickBooks/Tally already. Out of scope.
- **Survey / feedback module** — Google Forms exists. Not worth the build.
- **Multi-tenant SaaS** — only revisit if we decide to sell to other GCC schools. That's a different business, not a feature.

---

## Cross-cutting concerns (every phase touches these)

1. **Audit log.** Every state-changing Cloud Function MUST `writeAudit({...})`. Phase 2.6 introduces `audit.readAll`; honor it.
2. **Notifications.** Every workflow that affects a person MUST drop a notification in their feed. Avoid emails-only or in-app-only — both, or neither.
3. **Permissions.** Every new action MUST go through `can()` in client and Firestore rules. No exceptions, no role-string comparisons in components.
4. **Tests.** Every permission change needs a unit test (permissions.ts) AND an emulator test (Firestore rules). One without the other is half-built.
5. **Bahrain-first.** Field validation, date formats (`en-GB`), currency (BHD), and labels assume Bahrain unless explicitly multi-tenant. When we go multi-tenant, those become `school_settings`.

---

## Definition-of-done checklist (per phase deliverable)

Before marking any phase deliverable "done":

- [ ] Code merged to `main`
- [ ] CLAUDE.md updated (schema / matrix / workflows reflect the change)
- [ ] PHASES.md status snapshot updated
- [ ] Unit tests pass (`npm test` in `school-ops/`)
- [ ] Firestore emulator tests pass (`firebase emulators:exec`)
- [ ] Manually verified by the developer in production
- [ ] Audit log shows the new action(s) firing
- [ ] If user-facing: a 1-paragraph "what's new" written for the principal

---

## Appendix A — Competitor research

Compiled 2026-05-24 from a broad sweep of K-12 SIS, HRIS, and CMMS platforms plus Bahrain regulatory sources. The full source list is at the end of this appendix.

### A.1 Headline findings

1. **No competitor combines all three pillars** (HRIS + maintenance + Bahrain-government compliance). Western SIS platforms have shallow HR; Western HRIS platforms have no facilities ticketing and no GCC compliance; GCC ERPs are SIS-first with weak staff lifecycle. **Our fusion is the wedge.**
2. **K-12 SIS platforms are universally weak on HR** — PowerSchool sells "Talent" as a separate product, Blackbaud + FACTS push you to QuickBooks/Cornerstone integrations. We're already deeper inside one app than any of them.
3. **HRIS platforms are universally weak on Bahrain compliance** — none of BambooHR, Workday, Rippling, Personio, Zoho People, or Gusto natively handle GOSI/WPS/MOE/LMRA. Workday can be configured for it (six-figure annual + consulting).
4. **CMMS platforms are universally school-blind** — SchoolDude/Brightly is the school-tuned option but it's only maintenance, never HR.
5. **The Arabic/RTL gap is real** — virtually no Western platform has production-grade Arabic UI. Genuine differentiator for selling to other GCC schools later.

### A.2 Critical corrections to existing assumptions

| Item | What we said | What's actually true | Source |
|---|---|---|---|
| GOSI rates | 5% / 12% in CLAUDE.md (now corrected) | **Bahraini: 17% employer + 8% employee. Expat: 3% employer + 1% employee.** Rates may shift again; verify with payroll provider before building exports. | [PwC Bahrain Tax Summary](https://taxsummaries.pwc.com/bahrain/individual/other-taxes), [PayrollMiddleEast](https://payrollmiddleeast.com/gosi-calculation-in-bahrain/), [Artify360](https://www.artify360.com/bahrain-gosi-calculation/) |
| WPS file format | "WPS-compliant SIF file" (mentioned in CLAUDE.md §10, now corrected) | **Bahrain WPS 2.0 uses LMRA CSV templates uploaded via LMRA EMS portal.** SIF is the UAE MOHRE format. Different country, different file. | [LMRA WPS 2.0 page](https://www.lmra.gov.bh/en/page/show/633), [LMRA WPS User Manual](https://www.lmra.gov.bh/files/cms/shared/wps-user-manual-eng.pdf), [ZenHR GCC comparison](https://blog.zenhr.com/en/wps-salary-transfers-in-the-gcc-ksa-uea-bahrain-qatar) |
| MOE teacher approval cadence | Tracked as `moeApprovalExpiry`, alert at 60d | Correct. **Non-Bahraini teachers must renew every 2 years.** 60d alert window is appropriate. | [MOE Private Education Law](https://www.moe.gov.bh/laws/private2.aspx?lan=en) |

### A.3 Permission-model patterns worth borrowing

- **Veracross** — primary + supplemental roles (additive). Privacy nuance: staff see birthdays but NOT birth years. Worth copying for our org chart view.
- **ClassReach** — best-in-class **4-level scope per category**: None / View / View+Edit / Super Admin. Applied per category (User, Teacher, School Settings, Course, Billing, Financial). **This is the right shape for the next iteration of our `super_admin` work** if we want delegation later.
- **Rippling** — modular permissions scoped by **module × employee group × action type (view/edit/approve/manage)**. The most granular model in the market. Overkill for now but the conceptual template if we ever go multi-tenant.
- **Workday** — multiple parallel org hierarchies (supervisory, legal entity, cost center, geographic, matrix, custom). Security tied to org structure. Genuinely overkill for one school; included only as the "ceiling" for reference.

### A.4 Gap matrix (us vs. major competitors)

Legend: ✓ = built, ~ = partial, ✗ = missing, n/a = not applicable. Numbers are an honest self-audit, not aspirational.

| Feature | Us | BambooHR | Workday | Rippling | PowerSchool | Veracross | Skyward | Brightly | Limble |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Maintenance ticketing | ✓ | ✗ | ✗ | ✗ | ✗ | ~ | ~ | ✓ | ✓ |
| HR profile / doc vault | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✗ | ✗ |
| Bahrain GOSI calc | ~ | ✗ | ~ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Bahrain WPS CSV export | ✗ | ✗ | ~ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| LMRA expat tracking | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| MOE teacher approval tracking | ✓ | ✗ | ✗ | ✗ | ~ | ~ | ✗ | ✗ | ✗ |
| Org chart / reporting hierarchy | ✗ (manager_uid stored) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | n/a |
| Performance reviews / KRA | ✗ | ✓ | ✓ | ✓ | ~ | ~ | ~ | n/a | n/a |
| Training / PD tracking | ✗ | ~ | ✓ | ✓ | ✓ (Talent add-on) | ✗ | ~ | ✗ | ✗ |
| Asset register (cost/warranty) | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ | ~ | ✓ | ✓ |
| Multi-campus | ✗ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Native mobile app | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Self-service portal | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| M365/Google SSO + provisioning | ✗ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ | ~ |
| Offline mode | ✗ | ✓ | ~ | ~ | ~ | ✗ | ~ | ✓ | ✓ |
| Arabic / RTL UI | ✗ | ✗ | ~ | ~ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Bulk CSV import | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| E-signature | ✗ | ✓ | ✓ | ✓ | ~ | ~ | ~ | ✗ | ✗ |
| Audit log | ~ (planned) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Super-admin tier | ✗ (Phase 2.6) | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ |
| Unified notification feed | ✗ (Phase 3) | ✓ | ✓ | ✓ | ~ | ~ | ✓ | ~ | ~ |
| Workflow automation | ✗ | ~ | ✓ | ✓ | ~ | ~ | ~ | ✓ | ✓ |

### A.5 HRIS pricing benchmarks (~200 employees)

For comparison if anyone ever asks "why are we building this instead of buying it":

| Platform | Per-employee/month | Annual cost @ 200 staff |
|---|---|---|
| Zoho People | $1–$3 | $2.4k–$7.2k |
| Gusto | ~$6 + base | ~$15k |
| Rippling | $8+ | $19k+ |
| BambooHR | $10–$25 | $24k–$60k |
| Workday | $34–$100 | $80k–$240k+ (six-figure annual typical) |

**Plus:** none of the above include Bahrain WPS/GOSI/MOE/LMRA. Add ~$20k–$50k of implementation consulting to make any of them work locally. **Building it ourselves at marginal-zero license cost is cheaper over 3 years even paying full developer salaries**, *provided* we keep scope disciplined (this document).

### A.6 Sources

**SIS / school platforms:**
- [PowerSchool — Staff Setup](https://ps-compliance.powerschool-docs.com/pssis-in/latest/staff-setup)
- [PowerSchool — Managing Roles](https://support.powerschool.com/help/sms/800/districtuser/Content/Topics/Managing_roles.htm)
- [PowerSchool — Staff Permissions](https://support.powerschool.com/help/sms/770/districtuser/Content/Topics/Appendices/Staff_permissions.htm)
- [PowerSchool — HR & Talent](https://www.powerschool.com/blog/hr-in-education/)
- [Veracross — Employment Module](https://community.veracross.com/s/article/Employment-Module-Overview)
- [Veracross — Security Roles](https://community.veracross.com/s/article/Security-Roles-Academics-Student-Life)
- [Skyward — HRIS for Schools](https://www.skyward.com/products/school-erp/human-resources)
- [Skyward — Employee Access](https://www.skyward.com/products/school-erp/employee-portal/employee-access)
- [Alma SIS overview](https://www.softwareadvice.com/product/264800-Alma/)
- [Gibbon Features](https://gibbonedu.org/features/)
- [Blackbaud SIS](https://www.blackbaud.com/products/student-information-system)
- [ClassReach Admin Permissions](https://support.classreach.com/documentation/admin-permissions-overview/)
- [Schoology Roles & Permissions guide](https://api.dadeschools.net/WMSFiles/267/FAQ/73430_Schoology_Roles_and_Permissions_Administrators_Guide.pdf)

**HRIS:**
- [BambooHR Pricing](https://www.bamboohr.com/pricing/)
- [Outsail BambooHR breakdown](https://www.outsail.co/post/how-much-does-bamboohr-cost)
- [Truto — Workday vs Gusto vs Rippling](https://truto.one/blog/best-unified-api-for-hris-in-2026-workday-gusto-and-rippling-compared/)
- [Rippling Permissions Platform](https://www.rippling.com/platform/permissions)
- [Rippling Role-Based Permissions blog](https://www.rippling.com/blog/introducing-role-based-permissions-get-complete-control-over-the-data-and-apps-that-your-team-can-manage)
- [Fabric — 15 Best HRIS](https://www.fabrichq.ai/blogs/15-best-hris-systems-compare-features-pricing-and-reviews)

**Facilities / CMMS:**
- [Brightly — Best Asset Management for Schools](https://www.brightlysoftware.com/blog/best-asset-management-software-schools)
- [SchoolDude WorkCenter docs](https://help.brightlysoftware.com/Content/Documentation/Maintenance/WorkCenter/SchoolDude%20WorkCenter.htm)
- [UpKeep vs Limble](https://upkeep.com/blog/upkeep-vs-limble/)
- [Limble — Capterra](https://www.capterra.com/p/162600/Limble-CMMS/)

**Bahrain / GCC:**
- [Bahrain MOE — Private Education](https://moe.gov.bh/en/private-education)
- [Bahrain MOE — Private Education Law](https://www.moe.gov.bh/laws/private2.aspx?lan=en)
- [Bahrain LMRA](https://lmra.gov.bh/en/home)
- [LMRA WPS 2.0](https://www.lmra.gov.bh/en/page/show/633)
- [LMRA WPS User Manual](https://www.lmra.gov.bh/files/cms/shared/wps-user-manual-eng.pdf)
- [Cercli — Bahrain Enhanced WPS Guide](https://www.cercli.com/resources/bahrain-enhanced-wps-implementation-guide-february-2026-mandatory-deadline-for-wage-protection-system-compliance)
- [ZenHR — WPS GCC Comparison](https://blog.zenhr.com/en/wps-salary-transfers-in-the-gcc-ksa-uae-bahrain-qatar)
- [PwC — Bahrain GOSI](https://taxsummaries.pwc.com/bahrain/individual/other-taxes)
- [PayrollMiddleEast — Bahrain GOSI](https://payrollmiddleeast.com/gosi-calculation-in-bahrain/)
- [Artify 360 — Bahrain GOSI](https://www.artify360.com/bahrain-gosi-calculation/)
- [Edunation](https://www.edu-nation.net/)

---

## Appendix B — How to update this document

Same rules as CLAUDE.md:

- **Update before code, not after.** If a phase scope changes mid-flight, edit here, then write the code.
- **Status snapshot is the dashboard.** Keep the table at the top accurate — it's how anyone (you, future-you, a teammate) sees where we are.
- **Move done items to the snapshot.** Don't leave checked boxes scattered; consolidate.
- **Mark assumptions visibly.** Anything based on "we'll see" or "TBD by research" should say so in italics, not pretend to be a plan.
