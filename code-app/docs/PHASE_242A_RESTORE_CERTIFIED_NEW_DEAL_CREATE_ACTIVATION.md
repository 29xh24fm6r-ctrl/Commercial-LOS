# Phase 242A — Restore Certified Production New Deal Create Activation

## Outcome

**New Deal create is restored to live. `enabledCount = 1 / 6`. `fullLaunchAchieved = false`.**

Only New Deal create is activated. The other five live-write domains (CRM writeback,
borrower send, stage advancement, portfolio boarding, document checklist) remain
blocked and fail-closed.

## Why New Deal create is restored

Recorded production smoke evidence already certifies banker New Deal create as live:

- **docs/PHASE_227_V1_PRODUCTION_RELEASE_SMOKE.md** — Stage production-approved row
  `INTAKE / Intake`, Status production-approved row `OPEN / Open`, smoke deal id
  `36a6da41-386f-f111-ab0d-70a8a59be491`, result **PASSED**, Banker Workspace
  visibility confirmed.
- **docs/PHASE_228A_PRODUCTION_CORE_ORIGINATION_DEPLOYMENT_SMOKE.md** — New Deal create
  adapter enabled, Banker New Deal create enabled, task generation enabled, smoke deal
  id `22d40fa1-3d6f-f111-ab0d-70a8a59be491`, result **PASSED**, UI state CREATE ENABLED.

## How it is restored — governance-preserving (no global gate flip)

The codebase already enables banker create through the **approved pilot switch**
(Phase 182B), which supplies the create gate values directly to the rollout instead
of flipping the global governance constants:

- [bankerCreatePilotConfig.ts](../src/deals/bankerCreatePilotConfig.ts) —
  `BANKER_CREATE_PILOT_ENABLED = true` supplies `{ banker: true, adapter: true, intake: true }`.
- [bankerNewDealCreateRollout.ts](../src/deals/bankerNewDealCreateRollout.ts) — with an
  authorized banker + approved production references, `evaluateBankerCreateRollout(...)`
  returns `live_controlled`. This is the path Phase 227/228A smoked as PASSED.

The three global create-gate constants stay **false** on purpose, so the public/intake
create surface and every downstream automation remain provably off:

| Constant | File | State | Reason |
| --- | --- | --- | --- |
| `BANKER_NEW_DEAL_CREATE_ENABLED` | src/deals/dealOriginationFeatureFlags.ts | false | public/global gate stays off; create is pilot-scoped |
| `NEW_DEAL_CREATE_ADAPTER_ENABLED` | src/deals/newDealCreateFeatureFlags.ts | false | public/global gate stays off; create is pilot-scoped |
| `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED` | src/admin/adminNewDealIntakeModel.ts | false | public/intake create surface stays disabled |

Flipping those constants would break the pilot-architecture governance tests
([bankerCreatePilotConfig.test.ts](../src/deals/bankerCreatePilotConfig.test.ts),
[dealOriginationFeatureFlags.test.ts](../src/deals/dealOriginationFeatureFlags.test.ts))
and widen the public create surface — a route-widening regression. It is not done.

## Exactly what changed

1. **src/admin/productionEnvironmentVerification.ts**
   - `PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate` set to `true` — operator
     certification backed by the recorded Phase 227/228A smoke evidence. The other
     five toggles stay `false`.
   - `readLiveGateFlags().newDealCreate` now reads the pilot create gate values
     (`bankerCreatePilotGateValues()`), the actual build-time enablement path, instead
     of the global constants that are intentionally false.
2. **src/admin/fullActivationLaunchCertificationModel.ts**
   - `new-deal-create` reclassified `CERTIFIABLE_NOW`, evidence/blockers/unblock-actions
     updated to describe the live pilot + recorded smoke + one-line rollback. The model
     derives `enabledCount = 1`, `fullLaunchAchieved = false` from the verification.

No feature flag constant was flipped. The pilot switch was already `true`.

## Domains that remain blocked

CRM writeback, document checklist generation, borrower communication send, stage
advancement, portfolio boarding live persistence — all `certified = false`,
`gateFlagOn = false`, `enabled = false`. Their operator environment work is not done
(see docs/PHASE_241_PRODUCTION_ENVIRONMENT_WIRING_AND_LIVE_CUTOVER.md for the exact
remaining steps per domain).

## Runtime safety (unchanged, fail-closed)

- Production create still requires `new_productionapproved=true` Stage/Status
  references; TEST rows resolve to `ready-test` and never authorize a production create.
- Runtime authorization, approved-production references, and audit are still enforced
  fail-closed at submit by the governed adapter.
- No downstream automation is activated (CRM, borrower send, stage advance, portfolio
  side effects, duplicate merge apply all stay false). Duplicate detection stays on as
  a warning only; merge apply stays off.

## Rollback plan

One line: set `BANKER_CREATE_PILOT_ENABLED = false` in
[src/deals/bankerCreatePilotConfig.ts](../src/deals/bankerCreatePilotConfig.ts). That
fully disables banker create (the rollout falls back to the global constants, all
false → `disabled`). To also revert the dashboard, set
`PRODUCTION_ENVIRONMENT_CERTIFICATION.newDealCreate = false`. Re-run `npm run build`
and `npm test -- --run`; the model returns to `0/6`.

## Gates

- `npm run build` — green.
- `npm test -- --run` — full suite green.
