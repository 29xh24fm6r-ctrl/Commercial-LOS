# Phase 182E — Banker New Deal create V1 certification

## Certification: PILOT_LIVE_CONTROLLED (banker), pending the single operator proof

Authorized banker New Deal create is **deployed and LIVE** for the controlled
pilot, enabled through one narrowly-scoped switch. The formal governance
promotion of `new-deal-create` (out of `NOT_WIRED`) is held until the operator
completes the single live proof (Phase 182D).

## Banker create status

**PILOT_LIVE_CONTROLLED.** The Banker workspace "New Deal" panel (Active Deals
tab) is the single create surface. It reuses the governed orchestrator + adapter
(no forked create path). Submit is reachable only when the banker rollout gate
is `live_controlled`: pilot enabled + resolved actor systemuser + banker
authorization. The governed adapter resolves Stage/Status via the approved
PRODUCTION resolver and fails closed (resolver_not_ready) if they are not Ready.

## Public create status

**DISABLED.** No public create surface exists; the global
`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED` constant stays `false`.

## Enablement mechanism (single switch + rollback)

Banker create is enabled by `BANKER_CREATE_PILOT_ENABLED = true`
([bankerCreatePilotConfig.ts](../src/deals/bankerCreatePilotConfig.ts)), which
supplies the banker-only gate values to the rollout gate. The global governance
constants stay `false`, so public create and every downstream automation remain
provably disabled. **Rollback is one line**: set `BANKER_CREATE_PILOT_ENABLED =
false` and redeploy.

## Stage / Status references

- Stage: code `INTAKE`, name `Intake`, active, production-safe.
- Status: code `OPEN`, name `Open`, active, production-safe.
- Verified by the operator via `--inspect-new-deal-create-references`
  (`PRODUCTION_REFERENCES_APPROVED = true`). TEST/PHASE rows are filtered by the
  production resolver and can never back a production create. No Stage/Status
  GUID is hardcoded in source (pinned by governance tests).

## Gate values

- `BANKER_NEW_DEAL_CREATE_ENABLED = false` (global; pilot supplies the value)
- `NEW_DEAL_CREATE_ADAPTER_ENABLED = false` (global; pilot supplies the value)
- `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false` (public floor; untouched)
- `BANKER_CREATE_PILOT_ENABLED = true` (the pilot switch)
- All downstream automation / transport flags `false`.

## Actor / authorization model

A resolved Dataverse `actorSystemUserId` AND banker authorization (banker with a
systemuser and no write-disabled reason) are required. Manager/team/portfolio-only
identities cannot create unless also banker-authorized. Unauthorized / unresolved
actors see an honest disabled state and cannot submit.

## Payload allow-list

`NEW_DEAL_CREATE_ALLOWED_FIELDS` only (dealname, Stage bind, Status bind,
AssignedBanker bind, stageentrydate, optional amount, optional client).
`ownerid` / `statecode` are Dataverse-defaulted.

## Audit behavior

The governed create emits a `cr664_AuditEvent` with verified pinned enums + a
correlation id, `cr664_ChangedBy → /systemusers(<actor>)`. **audit_failed_partial
is distinct from success**: a created deal whose audit fails renders the distinct
partial warning (deal created, audit must be reattempted) and never a clean
success; downstream does not run in that case.

## Live proof result

Not yet run by CI — it is operator-run in the deployed app (Phase 182D). No
proof deal is created by this change. The created deal id shown by the UI comes
only from the real outcome (never faked).

## Downstream automation status

All disabled (CRM / borrower invite / auto-stage / task / document checklist /
portfolio / borrower messaging). The orchestrator is invoked with an empty
downstream config, so every module returns disabled/skipped. Duplicate merge
remains DETECT_AND_PREPARE_ONLY.

## Rollback / correction plan

- Disable: set `BANKER_CREATE_PILOT_ENABLED = false` and redeploy (one line).
- Correct a created deal: authorized manual delete / maker-portal action; a
  governed in-app correction surface is not yet available (documented limitation).

## Known limitations

- The live proof is operator-run and not yet completed at the time of this
  commit; the inventory promotion to PILOT_LIVE_CONTROLLED is held until it is.
- No in-app duplicate/correction surface; no external transports; downstream
  automations disabled.

## Production recommendation

**PILOT_LIVE_CONTROLLED — enable for the approved pilot banker(s) only; not broad
banker rollout.** Run the single Phase 182D proof, then promote the inventory and
consider widening. Public create stays disabled; downstream stays disabled.

## Tag / deploy status

Runtime bundle changed (the Banker workspace create surface + pilot enablement),
so this phase was deployed via `pac code push`. No git tag was created or moved.
No schema change. No Dataverse record was created by this change (the proof deal
is created later by the operator).
