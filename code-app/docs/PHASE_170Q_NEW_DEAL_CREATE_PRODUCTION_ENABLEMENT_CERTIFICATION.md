# Phase 170Q — New Deal create production-enablement certification

Covers the controlled-enablement workstream 170M → 170N → 170O → 170P → 170Q.

## Current gate values

- `NEW_DEAL_CREATE_ADAPTER_ENABLED = false` (hard constant; src/deals/newDealCreateFeatureFlags.ts)
- `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false` (public intake hard floor)
- `new-deal-create` remains in `NOT_WIRED`, now marked **WIRED_DISABLED**.

## Runtime import status

- 170M adapter (`src/deals/newDealCreateAdapter.ts`) is now reachable from app
  runtime only through the **guarded controller boundary**
  (`src/deals/newDealCreateController.ts`), which imports the adapter as a TYPE
  only and loads its runtime via a **dynamic import inside the gated submit
  path**. So rendering the surface never pulls the generated services / SDK,
  and the adapter is reached only after every gate passes.
- `src/deals/NewDealCreatePanel.tsx` (admin surface) is mounted inside the
  admin New Deal intake panel. It renders the controller's pure view-state and
  a **disabled** submit control by default. This changes the runtime bundle (a
  disabled, honest admin surface + a lazily-loaded adapter chunk).

## Environment tested

No live environment enablement was performed. The controlled enablement reader
(`src/deals/newDealCreateEnablement.ts`) is unit-tested across all states:
`disabled`, `enabled_nonprod_only`, `unauthorized`, `config_invalid`,
`environment_not_allowed`, `resolver_not_ready`. The default (no inputs) is
`disabled`; production is blocked unless an explicit, **test-pinned** rollout
approval AND production-approved references are present.

## Actor / authorization tested

The controlled path requires `isAdminOrDev === true` AND a resolved
`actorSystemUserId`; otherwise the reader returns `unauthorized`. The adapter
additionally returns `unauthorized` when no actor systemuser is supplied. No
ordinary banker user can enable the path; no permission was widened.

## Resolver labels / ids verified (no hardcoded GUIDs)

Stage/Status binds are produced by the fail-closed resolver
(`newDealCreateAdapter` consumes `resolution.stageBind` / `resolution.statusBind`
from `resolveNewDealReferences`), selected by stable code/name
(`PHASE121_STAGE` / `PHASE121_STATUS`, TEST-environment labels). A Phase 170Q
governance test proves **no Dataverse record GUID is hardcoded** in any New
Deal create source file. Production references are NOT approved
(`REFERENCE_SELECTION_PRODUCTION_APPROVED = false`), and the reader refuses to
enable production with TEST-only references.

## Audit values verified

The governed create emits a `cr664_AuditEvent` after a successful create, with
a correlation id and verified, pinned option-set values —
`cr664_eventcategory = Lifecycle (788190002)`,
`cr664_eventtype = AssignmentChange (788190002)`,
`cr664_entitytype = LoanDeal (788190000)`,
`cr664_outcomestatus = Succeeded/Failed`,
`cr664_ChangedBy@odata.bind = /systemusers(<actor>)`. A created deal whose
audit fails returns `audit_failed_partial` (never `success`). No audit row is
written while the path is disabled.

## Created record evidence

None. No live proof was performed in this workstream; every test injects mock
IO and no Dataverse record was created, patched, or deleted.

## Failure-state evidence (tests)

- Adapter outcomes: `disabled`, `validation_error`, `unauthorized`,
  `resolver_not_ready`, `create_failed`, `audit_failed_partial`, `success`
  (`src/deals/newDealCreateAdapter.test.ts`).
- Controller gating: refuses before touching the adapter in every non-ready
  state; delegates and passes outcomes through only when fully gated
  (`src/deals/newDealCreateController.test.ts`).
- Enablement states (`src/deals/newDealCreateEnablement.test.ts`).
- UI honest states + disabled submit (`src/deals/NewDealCreatePanel.test.tsx`).
- Governance source pins (`phase170QNewDealCreateGovernance.test.ts`).

## Production blockers

1. Production Stage/Status reference rows are not seeded/approved (only TEST
   `PHASE121_*` labels exist).
2. No explicit production rollout config is committed
   (`productionRolloutApproved` defaults false).
3. The public intake floor (`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED`) and the
   adapter constant (`NEW_DEAL_CREATE_ADAPTER_ENABLED`) are both hard false.
4. No live create+audit proof has been run end to end.
5. Duplicate/deletion/correction operational process is **not yet available**
   in-app (a created deal would be corrected by an authorized manual delete /
   maker-portal action; a governed super-user correction surface is a future
   phase).

## Recommendation

**Certified disabled; pilot-enablement path built and fail-closed; not ready
for broad production live create.** The controlled mechanism can enable a
single approved non-production/pilot environment behind explicit, authorized
config, but production enablement requires resolving the blockers above and an
explicit Matt approval.

## Rollback instructions

This phase adds a disabled, honest admin surface and gating code only. To
revert, remove the `<NewDealCreatePanel />` mount from
`src/admin/NewDealIntakePanel.tsx` (and, if desired, delete the new
`src/deals/newDealCreate*` modules) and redeploy. No Dataverse state exists to
roll back (no record/schema change was made). If a future live proof creates a
TEST deal, roll it back with an authorized manual delete of that
`cr664_loandeals(<id>)` row.

## Tag / deploy status

No git tag was created or moved (pilot `v1.0.0-controlled-pilot` and rollout
`v1.0.1-admin-console-rollout` are unchanged). Deploy status is recorded in the
commit/report: the runtime bundle changed (the mounted disabled surface), so a
`pac code push` deploy of the disabled surface may be performed; no Dataverse
write, schema change, or permission change accompanies it.
