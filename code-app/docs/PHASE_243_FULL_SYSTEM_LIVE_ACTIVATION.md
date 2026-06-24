# Phase 243 — Full System Live Activation (Production Cutover Evidence)

## Outcome

**Full launch is NOT achieved. `enabledCount = 1 / 6`. `fullLaunchAchieved = false`.**

The spec's target is all six domains live (6/6). The spec's own non-negotiable safety
rules forbid faking activation: a domain may only be marked enabled when its generated
service / live transport exists, its data source is registered, its smoke passes, and
operator evidence is recorded. A recorded read-only verification run
(`scripts/activation/collect-activation-evidence.ps1`, commit `641c0cc`,
2026-06-24T16:02:46-04:00) shows **four domains are not ready**, so they are NOT
activated. No gate was flipped and no PASS was fabricated.

| Domain | Environment evidence | Live now? |
| --- | --- | --- |
| New Deal create | PASS (Phase 227/228A smoke, pilot live) | **enabled** |
| Stage advancement | PASS (3/3 sinks present) | not yet — smoke + gate pending |
| Document checklist | UNKNOWN (lending-owner signoff pending) | blocked |
| Borrower communication send | UNKNOWN (Outlook connector not registered) | blocked |
| CRM writeback | BLOCKED (0/5 generated services, data source unregistered) | blocked |
| Portfolio boarding | BLOCKED (generated service missing, data source unregistered) | blocked |

Note: environment **PASS is a prerequisite, not activation**. Stage advancement's sinks
are present, but it is not enabled because its controlled production smokes and governed
gate flip are not yet recorded.

## Recorded environment evidence

Verbatim machine evidence lines from the recorded run (commit `641c0cc`):

```text
[242B][crm-schema]        STATUS=BLOCKED present=0/5 datasource=False
[242B][checklist-rules]   STATUS=UNKNOWN modules=3/3 datasource=True signoff=pending-operator
[242B][outlook-connector] STATUS=UNKNOWN service=True registered=False
[242B][stage-sinks]       STATUS=PASS sinks=3/3
[242B][portfolio-boarding] STATUS=BLOCKED service=False datasource=False child-groups=portal-review
```

These are transcribed into the read-only ledger
[src/admin/fullProductionLaunchEvidence.ts](../src/admin/fullProductionLaunchEvidence.ts),
which ties the launch decision to the fail-closed Phase 241 verification (the single
source of truth) and never overrides it.

## Why the four domains cannot be activated from the repository

All four blockers are operator/portal/environment actions that cannot be performed or
faked from source code:

- **CRM writeback** — the `cr664_crm*` spine tables do not exist, are not registered as
  app data sources, and the typed SDK has 0/5 generated services. Creating Dataverse
  tables, registering data sources, and regenerating the SDK are maker-portal + PAC
  operations.
- **Portfolio boarding** — the boarded-loan table/services are missing and unregistered;
  same portal + SDK regeneration requirement.
- **Borrower send** — the generated Office 365 Outlook service exists but the connector
  is not registered/authorized in the app manifest; connector registration is a portal
  action, and live delivery additionally requires `VITE_EMAIL_MODE=LIVE` at deploy.
- **Document checklist** — the generator modules and data source are present, but the
  rule-set requires a recorded Super-Admin / lending-owner signoff (a human approval).
  No such signoff record exists, and fabricating one would be faking activation.

## Exact operator actions per blocked domain

### CRM writeback (BLOCKED)
1. In the maker portal create the `cr664_crm*` spine tables (organization, person,
   relationship, role assignment, timeline event) with columns + relationships.
2. Register each as a data source: `pac code add-data-source -a dataverse -t cr664_crmorganizations`
   (repeat per table); regenerate the typed SDK and rebuild.
3. Re-run `scripts/activation/verify-crm-schema.ps1` until `STATUS: PASS`, then certify
   `CRM_LIVE_PERSISTENCE_ENABLED` with success / disallowed-field / rollback smokes.

### Portfolio boarding (BLOCKED)
1. In the portal verify the boarded-loan table + child group tables exist with required
   columns/relationships; register the boarded-loan table as a data source; regenerate
   the SDK.
2. Inject the `VerifiedBoardingSchemaState`, enable the route for an authorized operator,
   enable `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`, and record single-record
   boarding + failure smokes.
3. Re-run `scripts/activation/verify-portfolio-boarding-schema.ps1` until `STATUS: PASS`.

### Borrower communication send (UNKNOWN)
1. In the maker portal add/authorize the Office 365 Outlook connector for the app;
   register it as a data source; regenerate the SDK.
2. Deploy with `VITE_EMAIL_MODE=LIVE`; certify the explicit banker-action, audited send
   path (connector acceptance is not delivery). Borrower send stays explicit-action only —
   no auto-send, no background communications.
3. Re-run `scripts/activation/verify-outlook-connector.ps1` until `STATUS: PASS`.

### Document checklist generation (UNKNOWN)
1. A Super-Admin / lending owner reviews and signs off the active checklist rule-set
   (product/stage rules) and records the signoff (approver, date/time, scope, rollback).
2. Inject the live checklist write transport via `createChecklistWriteDependency`, then
   enable `DOCUMENT_CHECKLIST_GENERATION_ENABLED` + the UI action gate together.
3. Re-run `scripts/activation/verify-checklist-rules.ps1` until `STATUS: PASS`.

### Stage advancement (PASS environment — activation still pending)
1. Inject the live stage transport + audit + timeline sinks into
   `AdvanceWorkflowStageButton` via `advanceWorkflowStage`.
2. Record controlled single-record advancement + blocked-transition + update-failed
   smokes, then enable the governed explicit-advancement gate
   (`AUTO_STAGE_ADVANCE_ENABLED`). Production use is governed **explicit** advancement,
   never uncontrolled automatic movement.

## What changed in this commit

- Added [src/admin/fullProductionLaunchEvidence.ts](../src/admin/fullProductionLaunchEvidence.ts) —
  read-only evidence ledger that records the recorded environment statuses, the exact
  operator actions, and per-domain rollback, and derives `fullLaunchAchieved` strictly
  from the fail-closed verification.
- Added tests and this doc. **No feature gate was flipped. No certification toggle was
  set true except New Deal create (already certified by Phase 227/228A).**

## `pac code push`

**Not performed.** A deploy is only justified after a real cutover; there is no full
cutover to push (4/6 domains remain blocked). Deployment remains the operator's governed
step once all required evidence reads `STATUS: PASS`.

## Rollback plan

Each domain has a one-line disable:

- New Deal create — set `BANKER_CREATE_PILOT_ENABLED` to false.
- CRM writeback — set `CRM_LIVE_PERSISTENCE_ENABLED` to false.
- Document checklist — set `DOCUMENT_CHECKLIST_GENERATION_ENABLED` to false.
- Borrower send — set `BORROWER_MESSAGING_ENABLED` + `BORROWER_EMAIL_TRANSPORT_ENABLED`
  to false; deploy with `VITE_EMAIL_MODE=DRY_RUN`.
- Stage advancement — set `AUTO_STAGE_ADVANCE_ENABLED` to false.
- Portfolio boarding — set `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` + the route to false.

Emergency rollback of this commit: `git revert <commit>` then `npm run build` and
`npm test -- --run`. (This commit flips no live gate, so revert is a no-op operationally.)

## Definition of done

Full launch will be complete only when all six domains read `STATUS: PASS`, every
certification toggle and feature gate is true, all six production smokes are recorded,
`enabledCount = 6`, `fullLaunchAchieved = true`, and `pac code push` succeeds. Today,
`enabledCount = 1 / 6` and full launch is **NOT achieved**.
