# Phase 199 — Certified New Deal Create Pilot Enablement

## Purpose

Certify that the already-built, narrowly-scoped New Deal create **pilot** path is
enabled in a controlled, reversible, pilot-only way — and prove that every other
create surface remains gated / disabled / fail-closed.

## Enablement posture (no new broad rollout)

The certified pilot is enabled through the single operator-controlled switch
introduced in Phase 182B — **`BANKER_CREATE_PILOT_ENABLED`** in
`src/deals/bankerCreatePilotConfig.ts`. It supplies the rollout gate's explicit
gate values (`{ banker, adapter, intake }`) for the approved pilot context only.

Critically, this does **not** flip the three global create constants, which
remain `false` as defense-in-depth:

- `BANKER_NEW_DEAL_CREATE_ENABLED = false`
- `NEW_DEAL_CREATE_ADAPTER_ENABLED = false`
- `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false`

So `evaluateBankerCreateRollout()` returns `disabled` by default (no overrides),
and broad / public create stays disabled. Rollback is one line: set
`BANKER_CREATE_PILOT_ENABLED = false`.

## Pilot-only availability (certified)

`evaluateBankerCreateRollout()` returns `live_controlled` **only** when the pilot
switch is on **and** every certified precondition is satisfied:

- a resolved actor systemuser (no actorless create);
- banker authorization (no Dataverse writeDisabledReason);
- approved production references;
- a Ready Stage/Status resolver;
- explicit production rollout approval.

Any one missing yields a specific non-`live_controlled` state
(`disabled`, `unauthorized`, `environment_not_allowed`, `references_not_approved`,
`resolver_not_ready`) surfaced honestly with "No record has been created."

## Fail-closed behavior

- Missing banker identity → disabled / unauthorized.
- Missing workspace entitlement → no render (permission-before-render upstream).
- Non-pilot context (no pilot gate values) → `disabled` (falls back to the false
  globals).
- Invalid / missing config → disabled.
- Read-only / manager / team / executive / admin surfaces gain **no** create
  affordance.

## Operator verification

1. Confirm `BANKER_CREATE_PILOT_ENABLED === true` (pilot on) and the three global
   create constants remain `false`.
2. Sign in as the approved pilot banker (resolved systemuser + banker
   authorization). The New Deal create surface renders enabled only here.
3. Sign in as a non-pilot / unauthorized user: the create surface is disabled
   (honest "Create disabled" note), and no create path is reachable.
4. Confirm `evaluateBankerCreateRollout()` (no args) returns `disabled`.
5. To roll back: set `BANKER_CREATE_PILOT_ENABLED = false`; the surface returns to
   disabled immediately, non-destructively.

## Safety statement

This phase performs **no broad create enablement, no new create surface, no
borrower communications, no checklist generation, no CRM / nCino / Salesforce
writes, no workflow writes, no schema change, no migration, and no fake data**.
Banker identity, workspace entitlement, and fail-closed permission checks are
preserved. The launch readiness recommendation remains **CONDITIONAL_GO**.

## Verification commands

```bash
git diff --check
pnpm test -- create rollout banker create NewDeal phase199CertifiedNewDealCreatePilot FullSystemLaunchReadiness releaseCandidateSnapshot
pnpm test
npm run build
git status --short
```
