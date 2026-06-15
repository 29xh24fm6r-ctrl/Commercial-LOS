# Phase 170J — Reconcile New Deal readiness truth (and Admin shell parity)

## Why this phase exists

After Phase 170I repaired the runtime `dataSourcesInfo` manifest, a live
Admin smoke confirmed the New Deal Stage/Status resolver is **READY (TEST)**:

- Stage: `PHASE121_STAGE` / `TEST - Stage Phase 121` — one active match.
- Status: `PHASE121_STATUS` / `TEST — Status Phase 121` — one active match.
- "TEST reference rows — not production-approved."
- "Create remains disabled."

But several New Deal admin surfaces still rendered the **stale** claim that
"Stage/Status data source registration is missing." That copy was true before
Phase 170D–170I and is now false. Phase 170J reconciles every New Deal admin
readiness surface to one accurate truth model — without enabling anything,
without loosening any guardrail, and without conflating the New-Deal-create
blocker with the separate Advance-Stage / stage-progression blocker.

## The reconciled truth model

| Dimension | State | Done |
| --- | --- | --- |
| Stage/Status resolver readiness | **Ready (TEST)** | ✅ |
| Production reference approval | Pending | ☐ |
| Governed create adapter | Not wired | ☐ |
| Public + New Deal | Disabled | ☐ |

Source of truth: [src/admin/adminNewDealIntakeModel.ts](../src/admin/adminNewDealIntakeModel.ts)
(`NEW_DEAL_RESOLVER_READY_IN_TEST = true`,
`NEW_DEAL_PRODUCTION_REFERENCES_APPROVED = false`,
`NEW_DEAL_GOVERNED_CREATE_ADAPTER_WIRED = false`,
`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false`, `NEW_DEAL_READINESS_TRUTH`).

### What is now true (and proven)

- `cr664_dealstagereferences` / `cr664_dealstatusreferences` are registered as
  native app data sources (`power.config.json` `databaseReferences."default.cds"`)
  with typed generated services under `src/generated/` (Phase 170F2).
- The runtime `dataSourcesInfo` manifest binds them (repaired idempotently via
  `scripts/sync-datasourcesinfo.mjs`, Phase 170I).
- The fail-closed resolver `resolveNewDealReferences` reads exactly **one active
  Stage + one active Status** at runtime, failing closed on
  zero/multiple/inactive/service-error. No hardcoded GUIDs.
- The Admin readiness card shows **Ready (TEST)** in the deployed app.

### Why + New Deal stays disabled (accurate reasons only)

1. The only active reference rows are **TEST-environment labels**, not
   production-approved.
2. No **governed, audited create adapter** is wired (no write entitlement
   check, no `cr664_AuditEvent`, no typed outcome union, no payload-discipline
   tests yet).
3. The public **+ New Deal** control is intentionally disabled until both are
   done — proven by a single-record controlled create smoke first.

## New Deal create vs Advance Stage — a deliberate, separate distinction

These are two different blockers on two different tables and **must not be
conflated**:

- **New Deal create** depends on `cr664_dealstagereferences` /
  `cr664_dealstatusreferences` (the deal Stage/Status *reference* lookups).
  These are now registered and resolve in TEST.
- **Advance Stage / stage-progression ordering** depends on
  `cr664_stagereferences` plus a stage *ordering / sequence* contract — still
  unregistered and unordered. Tracked separately in `NOT_WIRED`
  (`stage-reference-data-source`, `stage-ordering-contract`,
  `stage-progression-advance`) and left untouched by this phase.

The reconciled copy in every surface states this distinction explicitly so an
operator never reads "Stage/Status resolves" as "stage progression works."

## Surfaces reconciled in this phase

- [src/admin/adminNewDealIntakeModel.ts](../src/admin/adminNewDealIntakeModel.ts)
  — truth constants, `NEW_DEAL_READINESS_TRUTH`, reconciled `NEW_DEAL_INTAKE_BLOCKER`,
  Stage/Status fields no longer `blockedByReference`, 9-step enablement checklist
  (steps 1–5 done, 6–9 pending).
- [src/admin/NewDealIntakePanel.tsx](../src/admin/NewDealIntakePanel.tsx)
  — "Create disabled" badge, reconciled subtitle, readiness-truth table,
  "Status:" note, updated targets note + footnote. + New Deal create button
  stays disabled.
- [src/admin/adminOperationsConsoleModel.ts](../src/admin/adminOperationsConsoleModel.ts)
  — `new-deal-intake` module statusLine / blocker / nextStep reconciled
  (status stays `blocked`).
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts)
  — `new-deal-create` reason reconciled (Ready in TEST + pending reasons +
  Advance-Stage distinction); `blockerKind` stays `schema`; entry stays in
  `NOT_WIRED`.

## Next phase (not done here)

Controlled create-adapter enablement: approve/seed production Stage/Status
reference rows, add a governed audited create adapter (write entitlement +
two resolved binds + `cr664_AuditEvent` + typed outcome union + payload tests),
run a **single-record** controlled create smoke, then enable + New Deal.

## Admin shell / LendingOSLayout parity — deferred

The Admin workspace ([src/workspaces/AdminWorkspace.tsx](../src/workspaces/AdminWorkspace.tsx))
still renders a plain "Admin Diagnostics" shell rather than `LendingOSLayout`.
Adopting the shared layout carries provider / nav-context risk that is out of
scope for a readiness-truth reconciliation. It is **deferred to a separate
phase** intentionally; this phase changes copy/state truth only.

## Guardrails honored (nothing enabled or loosened)

- + New Deal NOT enabled; no deal created.
- No Dataverse record created / patched / deleted.
- No TEST reference rows approved for production.
- Stage progression logic unchanged; its blockers untouched.
- No true blocker hidden; no production-readiness claim made.
- No tag created or moved.
- No permissions widened; admin route access unchanged.
- No CRM / portfolio write enablement touched.

## Validation

- `git status --short`
- `npm test -- NewDeal Admin admin releaseCandidateSnapshot`
- `npm test`
- `npm run build`
- Deploy `pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d`
  only because UI copy changed; EOL-only `power.config.json` noise restored
  afterward.
