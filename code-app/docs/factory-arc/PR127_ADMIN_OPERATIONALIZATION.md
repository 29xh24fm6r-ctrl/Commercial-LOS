# PR127 — Factory Arc Phase 15: Admin Operationalization

## Scoping this phase

No dedicated planning doc defines "admin operationalization" as a deliverable. Investigated the Admin
workspace and Platform Operations console for genuine gaps vs. already-complete work, using the one
concrete lead available: `docs/PHASE_129A_MICROSOFT_VIBE_SCOPE_AUDIT.md`'s completion matrix cites
"Edit affordances for system settings / KPI thresholds" as missing/deferred for the Admin workspace.

**Investigated but not a gap**: `kpiBaselineResolution.ts`'s ambiguous-`KPI_BASELINE_DATE` handling is
explicitly designed as an **operator-runbook remediation** ("Operator-owned remediation (runbook):
dedupe the rows to one approved baseline value") — the system deliberately never auto-resolves an
ambiguous config value in-app. Building an in-app "edit KPI threshold" write action would be a new
governance decision (should system settings ever be editable from the app at all?) that this phase did
not have standing to make unilaterally, so it was not attempted. Confirmed the audit doc's citation is
accurate as stated, but reads more like an open design question than a ready-to-build gap.

**Genuine gaps found (same-file stale-claim pattern, matching Phases 8/9):**

### 1. `adminOperationsConsoleModel.ts` and `AdminOperationsConsole.tsx` headers contradicted their own data

Both files' Phase 169A header comments still claimed "every module reports `liveWriteEnabledHere:
false`" / "every action is a disabled placeholder. No writes, no Dataverse calls." But
`ADMIN_CONSOLE_MODULES` in the SAME file already had 4 of 5 modules (`user-access`, `new-deal-intake`,
`portfolio-boarding`, `crm-onboarding`) at `status: 'active'`, `liveWriteEnabledHere: true` — wired by a
later Phase 257 (the `manage` field on each module, documented inline). Verified this against the
actual panels: `UserAccessManagementPanel.tsx` genuinely contains a governed, audited workspace-
entitlement write; `PortfolioBoardingAdminPanel.tsx`'s "active through governed Dataverse persistence"
claim is accurate too (it correctly refers to `existingLoanEntryAdapter.ts`'s real write path for
closed/legacy loans — a different, unflagged capability from `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`,
which gates a separate auto-boarding flow and stays off; confirmed no contradiction). Corrected both
headers to describe the current, accurate state.

### 2. `task-generation`'s verified `sourceProcess` prefix was missing, not absent

`platformOperationsLiveDeps.ts`'s `VERIFIED_SOURCE_PROCESS_PREFIXES` had only 4 of the console's 12
capabilities correlated to real write evidence (`new-deal-create`, `stage-progression`,
`checklist-generation`, `document-upload`) — the other 8 report "not yet correlated" rather than risk a
wrong-capability match, per the module's own discipline. Traced `task-generation`'s actual write
adapter (`createDealTaskAction.ts` / `dealTaskActions.ts`, per `platformOperationsCapabilitySpecs.ts`'s
own `diState` citation) and confirmed both set
`cr664_sourcescreensourceprocess: 'DealWorkspace/DealTasks/create'` /
`'DealWorkspace/DealTasks/complete'` — a genuinely verifiable, distinct prefix that was simply never
added. Added `'task-generation': 'DealWorkspace/DealTasks/'`.

**Investigated but not fixed this phase**: `borrower-communication`'s two live adapters
(`sendBorrowerUpdateEmail.ts`, `sendDocumentRequestEmail.ts`) use two DIFFERENT prefixes
(`'DealWorkspace/BorrowerCommunication/'` and `'DealWorkspace/DealDocuments/'`) that share only the
too-broad `'DealWorkspace/'` parent — which would wrongly also match `task-generation`'s events.
Correlating a capability against multiple distinct prefixes needs `VERIFIED_SOURCE_PROCESS_PREFIXES`'s
type to change from `string` to `string | readonly string[]` (and `loadWriteEvidence` to query each and
merge), a small but real structural change this phase did not attempt in the time remaining — flagged
as a well-scoped near-term follow-up rather than rushed.

## What changed

- `src/admin/adminOperationsConsoleModel.ts` / `src/admin/AdminOperationsConsole.tsx` — corrected both
  Phase 169A header comments to accurately describe the current live-write state.
- `src/admin/platformOperationsLiveDeps.ts` — added the verified `task-generation` prefix.
- `src/admin/platformOperationsLiveDeps.test.ts` — moved `task-generation` from the "not yet
  correlated" test group into the "verified-prefix" group (5, not 4).

## What did NOT change

- No new write action, no in-app "edit KPI threshold" UI — that needs its own governance decision,
  flagged rather than assumed.
- No change to `VERIFIED_SOURCE_PROCESS_PREFIXES`'s type to support multi-prefix capabilities
  (`borrower-communication` and others stay correctly "not yet correlated").
- No schema, no generated SDK file touched.

## Test plan

- `npx tsc -b` — 0 errors.
- `npx vitest run src/admin/platformOperationsLiveDeps.test.ts src/admin/AdminOperationsConsole.test.tsx src/admin/adminOperationsConsoleModel.test.ts src/admin/platformOperationsCapabilitySpecs.test.ts`
  — 37 passed, 0 failed.
- Full `vitest run` / `npm run build` / `npm run audit:reachability` deferred to a later batched
  checkpoint per the current speed-up directive.
