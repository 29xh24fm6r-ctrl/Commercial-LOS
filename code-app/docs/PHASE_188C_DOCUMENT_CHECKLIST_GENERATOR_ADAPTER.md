# Phase 188C — Document checklist generator runtime adapter + audit (disabled by default)

- **Date:** 2026-06-17
- **Branch:** `phase188-document-checklist-pilot`.
- **Builds on:** [188A audit](./PHASE_188A_DOCUMENT_CHECKLIST_WRITE_PATH_AUDIT.md),
  [188B readiness inspector](./PHASE_188B_DOCUMENT_CHECKLIST_READINESS_INSPECTOR.md).

## Goal

Upgrade the Phase 176A `newDealChecklistGenerationAdapter` from a pure row-writer
into a **runtime-capable, audited, fail-closed** checklist generator — while
keeping generation **disabled by default**, exposing no UI, never auto-running,
and never contacting a borrower. No deploy.

## What changed

### `src/deals/newDealChecklistGenerationAdapter.ts` (pure, SDK-free)

- **Preserved** the existing `runNewDealChecklistGeneration` (the orchestrator's
  disabled path) unchanged.
- **Added** `generateAuditedDocumentChecklist(input, deps)` — the runtime-capable
  generator. Injected IO (`AuditedChecklistDeps`):
  `listExistingChecklistRows(dealId)`, `createChecklistRow(payload)`,
  `emitChecklistGenerationAudit(event)`, optional `correlationId()`.
  - **Disabled by default**: returns `disabled` unless
    `isDocumentChecklistEnabled(config)` (gate constant is `false`) or a test-only
    `enabledOverride`.
  - **Idempotent**: reads existing rows, de-dupes the requested template, and
    creates only names not already present — comparison is **trim +
    case-insensitive** (the same normalization 188B pins). Duplicate requested
    names never create duplicate rows. The stored name is trimmed clean.
  - **Allow-listed payload only**: `cr664_documentname`, `cr664_Deal@odata.bind`.
    (Phase 188G removed `cr664_correlationid` — it is **not** a column on
    `cr664_documentchecklists`; the correlation id is recorded on the audit event
    only.) No `cr664_documenttype`, no stage/status/portfolio/CRM field, no
    borrower/contact field.
  - **Fail-closed**: a read error, any create failure (first → `failed`, later →
    `partial_success`), or an audit failure (`audit_failed_partial`) never
    reports clean success and never emits a success audit for partial work.
- **Added** `createChecklistGenerationAuditEmitter(deps)` — resolves the actor
  email to `/cr664_users(<CoreUser>)`, **hard-asserts** the bind with the shared
  `assertChangedByCoreUserBind` (throws on `/systemusers` or any non-cr664_users
  target), builds the canonical audit payload (reusing the certified New Deal
  `buildNewDealAuditPayload` + verified option-set values — **no second audit
  system**), and POSTs it. Fails closed (no POST) when the actor can't resolve;
  surfaces a failed POST honestly.

### `src/deals/newDealChecklistGenerationLiveDeps.ts` (new, SDK-bound)

Live wiring kept **separate** so the adapter's pure core stays SDK-free:
`listExistingChecklistRows` over `Cr664_documentchecklistsService.getAll`
(filtered by `_cr664_deal_value`), `createChecklistRow` over
`Cr664_documentchecklistsService.create`, and the live audit emitter
(`createActorChangedByResolver()` + `Cr664_auditeventsService.create`).
`buildLiveAuditedChecklistDeps()` exists for a **future gated** surface
(188D/188E) — **nothing calls it yet** (no UI, no orchestrator wiring, no
auto-run). Importing it runs no IO.

## Audit detail recorded

`Document Checklist Generated` audit event carries: deal id (`cr664_LoanDeal`
bind + `cr664_entityid`), created document names + skipped-existing names (notes
+ before/after state), correlation id, and the actor `cr664_ChangedBy =
/cr664_users(<CoreUser>)` bind. Emitted **only** after every intended row is
created.

## Safety / scope (verified)

- `DOCUMENT_CHECKLIST_GENERATION_ENABLED` stays **`false`**; nothing flips it.
- **No borrower comms**: neither the adapter nor the live deps import
  `sendDocumentRequestEmail`, `prepareDocumentRequestHandoff`, or any
  Outlook/email/SMS/handoff/mailto module (static governance test pins this).
- Audit binds **`/cr664_users`**, never `/systemusers` (the guard rejects it).
- No UI file touched; no New-Deal auto-run wired; no stage/status/portfolio/CRM
  write; no script commit mode; no Dataverse write except the gated/injected
  checklist-row create path; no deploy; no route-count change.

## Tests

- [newDealChecklistGenerationAdapter.test.ts](../src/deals/newDealChecklistGenerationAdapter.test.ts)
  (16): disabled gate; idempotency (skip existing, create missing, trim +
  case-insensitive, dedup requested); payload allow-list (only the two keys —
  no correlationid/documenttype/stage/status/portfolio/CRM/borrower); audit emits only after
  all creates succeed with created/skipped + correlation id; fail-closed on
  read/first-create/later-create/throw/audit failures; the emitter binds
  `/cr664_users`, fails closed on unresolved actor, **rejects `/systemusers`**,
  and surfaces a failed POST.
- [phase188CChecklistAdapterContract.test.ts](../src/shared/governance/phase188CChecklistAdapterContract.test.ts)
  (15): static pins for the comms boundary, gate-false, allow-list, audit
  resolver+guard, `/cr664_users`-never-`/systemusers`, and the no-UI /
  no-auto-run / no-extra-service runtime boundary.

## What 188D / 188E do next

188D adds a banker-only, **pilot-disabled** UI surface (honest not-ready unless
graph READY and the pilot flag is on; never auto-runs). 188E enables the pilot
flag for exactly one proof against deal `1a10a165-756a-f111-ab0c-70a8a59be491`,
after deploy and a READY graph. Borrower messaging, email/SMS, auto-run on New
Deal create, and CRM/portfolio/stage automation remain prohibited.
