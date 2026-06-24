# Phase 237/238 — Full System Activation Certification

## Purpose

Move from the governed V1 read/operate posture toward **full live activation** for the
six previously gated live-write domains — but **only where a real certified live
path exists and tests prove safety**. Per the cardinal rule, feature flags are NOT
flipped blindly. Each domain was inspected in the repo and classified, with exact
blockers and operator unblock actions.

This certification is read-only. It enables no live write, flips no feature gate,
fabricates no live readiness, and does not claim full launch unless every domain is
genuinely enabled.

## Activation classification

| State | Meaning |
|---|---|
| `CERTIFIABLE_NOW` | Live path exists, schema mapping real, tests prove success + failure, no unsafe side effects — enable now. |
| `NEEDS_COMPLETION` | Real adapter/path exists but a prerequisite (schema verification, reference data, certified rule set) is not yet satisfied. |
| `NOT_SAFE_TO_ENABLE` | The live path requires a connector/SDK/data source that is not present; do not enable. |

## Discovery result

**Every one of the six domains already has a real governed adapter, payload
validation, audit metadata, and fail-closed handling in the repo.** The remaining
blocker for **all six** is operator-owned **environment** work that cannot be
performed or inferred from source: Dataverse schema verification (the gates require
an *injected* verified state and "never fake readiness"), production reference-data
seeding, Office 365 Outlook connector registration, or SDK regeneration.

**No domain is enable-able purely from the repo.** Therefore **zero** domains are
flipped on in this phase; all remain fail-closed. This is the honest outcome — not a
fake activation.

## Per-domain status and exact blockers

### 1. New Deal create — NEEDS_COMPLETION (blocked)
- Adapter: `src/deals/newDealCreateAdapter.ts` · Gate: `src/deals/newDealCreateEnablement.ts`
- Evidence: governed create adapter with required-field validation + duplicate
  detection; fail-closed enablement reader; Phase 226 `new_productionapproved` marker
  wired into the reference readers.
- Blocker: no active production-approved Stage/Status reference rows in Dataverse
  (`new_productionapproved=true`); no production rollout approval + smoke evidence.

### 2. CRM writeback / live persistence — NEEDS_COMPLETION (blocked)
- Adapter: `src/crm/crmLiveDataverseAdapter.ts` · Gate: `src/crm/crmRuntimeSchemaGate.ts`
- Evidence: live Dataverse CRM adapter with schema/payload mapping + failure
  handling; fail-closed schema gate; persistence resolver gated on schema + auth.
- Blocker: no injected `VerifiedCrmSchemaState` matching `crmDataverseSchemaPlan` with
  zero conflicts; the gate never probes Dataverse and never fakes readiness.

### 3. Document checklist generation — NEEDS_COMPLETION (blocked)
- Adapter/Gate: `src/deals/documentChecklistUiEnableReadiness.ts`
- Evidence: dual fail-closed gates (runtime + UI action), both default false;
  tightly-scoped write (`cr664_documentname` + `cr664_Deal@odata.bind` only).
- Blocker: the deterministic generation adapter + approved checklist rule set are not
  certified (success/failure/audit); both gates stay false until then.

### 4. Borrower communication send — NOT_SAFE_TO_ENABLE (blocked)
- Adapter/Gate: `src/deals/emailDelivery/emailMode.ts`
- Evidence: DRY_RUN/LIVE email mode with a clear "connector not yet registered"
  permanent failure in LIVE; recipient certification + borrower-safe content rules.
- Blocker: the Office 365 Outlook connector is not registered and the SDK is not
  regenerated with the typed connector call; live send is a permanent fail-closed. No
  auto-send is permitted without explicit, audited user action.

### 5. Stage advancement — NOT_SAFE_TO_ENABLE (blocked)
- Adapter/Gate: `src/activation/stageProgressionActivation.ts`
- Evidence: governed `advanceStage` seam with typed outcomes (resolver_not_ready /
  no_next_stage / stale_stage / audit + timeline partial-success); deterministic
  next-stage resolution.
- Blocker: the stage reference data source + deterministic order field are not
  registered/regenerated (ordering contract unproven); no injected transport/audit/
  timeline sinks.

### 6. Portfolio boarding live persistence — NEEDS_COMPLETION (blocked)
- Adapter: `src/portfolioBoarding/resolvePortfolioLoanBoardingPersistenceAdapter.ts` ·
  Gate: `src/portfolioBoarding/portfolioBoardingRuntimeSchemaGate.ts`
- Evidence: single-record boarding adapter with per-child-group written/skipped/failed
  reporting + audit; fail-closed schema gate.
- Blocker: no injected `VerifiedBoardingSchemaState` matching
  `portfolioLoanBoardingDataverseSchemaPlan` with zero conflicts; the gate never
  probes Dataverse and never fakes readiness.

## What is enabled

**None.** Zero of six live-write domains are enabled. Every domain remains
fail-closed at its source default.

## What remains blocked

**All six.** New Deal create, CRM writeback, document checklist generation, borrower
communication send, stage advancement, and portfolio boarding live persistence each
remain gated, for the exact reasons above.

## Operator unblock requirements (Phase 238 — environment-owned)

These are the precise environment steps that must be completed OUTSIDE the repo
before any domain can be safely certified and enabled. They cannot be inferred or
performed from source and constitute the Phase 238 stop condition.

1. **New Deal create** — seed exactly one active Stage and one active Status row with
   `new_productionapproved=true` in `cr664_dealstagereferences` /
   `cr664_dealstatusreferences`; re-run Phase 225 verification to `ready-production`;
   provide the approved production rollout config; record one single-record create
   smoke. Then enable `NEW_DEAL_CREATE_ADAPTER_ENABLED` + `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED`
   + `BANKER_NEW_DEAL_CREATE_ENABLED`.
2. **CRM writeback** — verify the live CRM Dataverse schema against
   `src/crm/crmDataverseSchemaPlan` and inject the `VerifiedCrmSchemaState`
   (tables/columns/relationships/conflicts); then enable `CRM_LIVE_PERSISTENCE_ENABLED`.
3. **Document checklist generation** — certify the deterministic generation adapter
   (preview = written items, duplicate prevention, audit) and the approved checklist
   rule set; then enable `DOCUMENT_CHECKLIST_GENERATION_ENABLED` +
   `DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED`.
4. **Borrower communication send** — register the Office 365 Outlook connector and
   regenerate the SDK so the LIVE adapter binds the typed connector call; certify the
   explicit user-confirmation, audited send path; then enable `BORROWER_MESSAGING_ENABLED`
   + `BORROWER_EMAIL_TRANSPORT_ENABLED`.
5. **Stage advancement** — register the stage reference data source with a
   deterministic order field, regenerate the SDK, and wire the advance-stage
   transport/audit/timeline sinks; certify success + stale + no-next-stage; then
   enable `AUTO_STAGE_ADVANCE_ENABLED`.
6. **Portfolio boarding** — verify the live boarding Dataverse schema against
   `src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan` and inject the
   `VerifiedBoardingSchemaState`; then enable `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED`
   + `PORTFOLIO_BOARDING_ROUTE_ENABLED`.

After each environment step, re-run `npm run build` and `npm test -- --run`, then flip
only that domain's gate and certify its success + failure tests. The admin Full System
Activation Launch panel will automatically reflect the flag once enabled.

## Is full launch achieved

**No.** Full launch is achieved only when all six live-write domains are genuinely
enabled with certified success + failure tests. Currently 0 of 6 are enabled; the
remaining blockers are operator-owned environment work, listed above. The repo does
not, and must not, pretend full activation is achieved while any live domain lacks a
safe path.

## No external vendor dependency

No external Salesforce or nCino dependency is implied or required. All CRM and lending
workflow capability is the internal OGB CRM and internal lending workflow.
