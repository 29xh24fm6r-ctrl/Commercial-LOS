# Phase 241 — Production Environment Wiring and Verified Live Cutover

## Outcome (honest status)

**Full launch is NOT achieved. `enabledCount = 0 / 6`. `fullLaunchAchieved = false`.**

This phase built the production-environment **verification wiring** and connected all six
live-write domains to it. It did **not** flip any feature gate, because the required external
production environment evidence is **not available** to this repository. Flipping a gate
without that evidence would either fake success (the runtime gates fail closed) or risk an
unsafe live write. Per the phase stop condition, no gate was flipped and the exact missing
operator actions are recorded below.

## What was built

1. **`src/admin/productionEnvironmentVerification.ts`** — the operator-owned certification
   artifact. It exposes:
   - `PRODUCTION_ENVIRONMENT_CERTIFICATION` — six operator-owned toggles, **all `false`**.
     A toggle asserts the operator has completed AND verified that domain's external steps.
     It is **not** a runtime probe and must never be set true to "make the dashboard green".
   - `ENVIRONMENT_VERIFICATION_STEPS` — the exact external evidence/commands required per
     domain before its toggle may be set true.
   - `readLiveGateFlags()` — reads the underlying feature gate flags live from source.
   - `deriveProductionEnvironmentVerification()` — resolves each domain `enabled` **only when
     `certified && gateFlagOn`**, and `fullLaunchReady` **only when all six resolve enabled**.

2. **`src/admin/fullActivationLaunchCertificationModel.ts`** — wired to the verification
   artifact. Each domain `status` becomes `'enabled'` only when its verification resolution is
   enabled (certified **and** flagged); `enabledCount` and `fullLaunchAchieved` derive from it.
   Defaults remain `0 / 6` and `false`.

3. **`src/admin/FullSystemActivationLaunchPanel.tsx`** — read-only; reads the model and
   auto-reflects `0/6 · Full launch not achieved`.

## Exact operator verification evidence used

**None.** No domain's certification toggle was set true because no external production
evidence was produced or supplied. Every toggle ships `false`.

## Exact flags flipped

**None.** All six feature gates remain `false`:

| Domain | Gate flag(s) | State |
| --- | --- | --- |
| New Deal create | `NEW_DEAL_CREATE_ADAPTER_ENABLED` && `BANKER_NEW_DEAL_CREATE_ENABLED` | false |
| CRM writeback | `CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED` | false |
| Document checklist | `DOCUMENT_CHECKLIST_GENERATION_ENABLED` | false |
| Borrower send | `BORROWER_MESSAGING_ENABLED` && `BORROWER_EMAIL_TRANSPORT_ENABLED` | false |
| Stage advancement | `AUTO_STAGE_ADVANCE_ENABLED` | false |
| Portfolio boarding | `PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` | false |

## Exact commands run

- `git pull` → already up to date
- `npm run build` → green (`built in 651ms`)
- `npx vitest run src/admin/productionEnvironmentVerification.test.ts src/admin/fullActivationLaunchCertificationModel.test.ts` → 16 passed
- Full `npx vitest run` → green (recorded in the commit)

No Dataverse mutation, connector registration, SDK regeneration, or deployment env change
was run — those are operator/portal actions outside this repository.

## Exact missing operator command / portal action per domain

A domain becomes live only after BOTH (a) its external steps below are completed AND verified,
then its `PRODUCTION_ENVIRONMENT_CERTIFICATION` toggle is set true, AND (b) its feature gate
flag is flipped true.

- **New Deal create** — Seed one active Stage and one active Status row with
  `new_productionapproved=true` in `cr664_dealstagereferences` / `cr664_dealstatusreferences`
  (Maker Portal / Dataverse data op); re-run Phase 225 reference verification to
  ready-production and record a single-record create smoke with rollback evidence.
- **CRM writeback** — Verify the live CRM Dataverse schema against
  `src/crm/crmDataverseSchemaPlan`, capture a `VerifiedCrmSchemaState`, wire the live Dataverse
  transport into `crmWriteback`, and pass `crmRuntimeSchemaGate`.
- **Document checklist** — Sign off the approved checklist rule set and inject the live
  checklist write transport via `createChecklistWriteDependency`.
- **Borrower send** — Register the Office 365 Outlook connector in the Power Platform
  environment; regenerate the SDK so the LIVE adapter binds
  `Office365OutlookService.SendEmailV2`; deploy with `VITE_EMAIL_MODE=LIVE`; certify the
  explicit banker-action, audited send path (connector acceptance is not delivery).
- **Stage advancement** — Inject live stage transport + audit + timeline sinks into
  `advanceWorkflowStage` (via `AdvanceWorkflowStageButton`); certify success / blocked /
  update-failed paths.
- **Portfolio boarding** — Verify the live boarding Dataverse schema against
  `src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan`, inject a
  `VerifiedBoardingSchemaState`, enable the boarding route with an authorized operator, and
  certify single-record boarding.

## Rollback plan

Nothing live changed, so there is nothing to roll back operationally. If a future operator
sets a certification toggle and flips a gate using this wiring:

1. Set the domain's `PRODUCTION_ENVIRONMENT_CERTIFICATION` toggle back to `false`.
2. Flip the matching feature gate flag back to `false`.
3. Re-run `npm run build` and `npx vitest run` — the model returns to `0/6` and the
   fail-closed governance suite stays green.

The runtime adapters are default-OFF and fail closed; with flags false they perform no write,
so reverting the two booleans fully disables the domain.

## Governance

`src/shared/governance/phase241ProductionEnvironmentWiring.test.ts` asserts the verification
artifact ships every certification toggle false, performs no fetch / SDK / mutation, requires
`certified && gateFlagOn` to resolve enabled, widens no route or permission, and adds no
uncontrolled borrower auto-send.
