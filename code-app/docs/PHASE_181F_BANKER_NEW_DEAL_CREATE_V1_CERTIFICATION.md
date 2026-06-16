# Phase 181F — Banker New Deal create V1 certification

## Certification state: STILL_BLOCKED

Authorized banker New Deal create is **built, controlled, and fail-closed** but
**not yet live**, because production-safe Stage/Status references do not exist
and the create gates remain hard-false. No fake readiness is claimed; the gates
remain closed.

## Final gate values

- `BANKER_NEW_DEAL_CREATE_ENABLED = false`
- `NEW_DEAL_CREATE_ADAPTER_ENABLED = false`
- `NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false`
- All downstream automation / transport flags `false`.

## Banker create status

WIRED_CONTROLLED_DISABLED → the single rollout gate
([evaluateBankerCreateRollout](../src/deals/bankerNewDealCreateRollout.ts))
reaches `live_controlled` only when all three hard gates are on, approved
production references are present, the approved-production resolver is Ready, the
actor systemuser resolves, and the actor is banker-authorized (production also
requires an explicit production rollout approval). Today it returns `disabled`.

## Public create status

DISABLED (unchanged; not part of the banker rollout gate).

## Approved Stage / Status references

Selection (code/name, no GUID): Stage `INTAKE` / `Intake`, Status `OPEN` /
`Open`. **Not present/approved in the environment yet** — only TEST `PHASE121_*`
rows are active, which are rejected for production. The production resolver
filters TEST/PHASE rows and fails closed until production rows are seeded
(Phase 181A runbook).

## Actor authorization model

A resolved Dataverse `actorSystemUserId` AND banker authorization are required.
Manager/team/portfolio-only identities cannot create unless also
banker-authorized. Unauthorized / unresolved actors are refused before any
resolver / create / audit call.

## Payload allow-list

`NEW_DEAL_CREATE_ALLOWED_FIELDS` only; `ownerid` / `statecode` are
Dataverse-defaulted. No broad payload.

## Audit behavior

The governed create emits a `cr664_AuditEvent` with verified pinned enums and a
correlation id; `audit_failed_partial` remains distinct from `success` (a
created deal whose audit fails never reports success and stops downstream). No
audit is written while disabled.

## Live proof result

Not performed (Phase 181E deferred — no production references, gates closed, no
Matt approval). No Dataverse record created; no audit record written.

## Downstream automation status

All disabled (CRM / borrower invite / auto-stage / task / document checklist /
portfolio / borrower messaging). Duplicate merge remains DETECT_AND_PREPARE_ONLY.

## Duplicate / correction process

Duplicate detection is detect-and-prepare-only (no auto-merge, no destructive
write). No in-app correction/super-user merge surface exists yet; a created deal
would be corrected by an authorized manual delete / maker-portal action
(documented as not yet available in-app).

## Rollback plan

This phase adds the production resolver profile, the rollout gate, a read-only
inspection mode, tests, and docs — imported by no runtime UI entry point
(tree-shaken), so there is no runtime behavior change and nothing to roll back.
To revert, delete the new `src/deals/bankerNewDealCreateRollout.ts`,
`src/deals/newDealReferenceProductionResolver.test.ts`, and the 181B production
additions. No Dataverse state exists to roll back.

## Known limitations

- No production references → banker create cannot go live.
- The banker-workspace create entry point (Phase 181D) is deferred until
  references exist, so the first banker-visible surface is functional rather than
  a dead disabled control.
- No live proof; no in-app correction surface; no external transports.

## Production recommendation

**STILL_BLOCKED — not ready for production live create.** The controlled path is
complete and fail-closed. The exact remaining operator action to unblock:

1. Seed/approve production Stage (`Intake`/`INTAKE`) and Status (`Open`/`OPEN`)
   reference rows with the guarded seed mode (dry-run, then
   `--seed-new-deal-create-references --commit-seed-new-deal-create-references`
   with Matt's approval); confirm via `--inspect-new-deal-create-references`.
2. Enable the three banker create gates through the single rollout config path
   for the approved environment only (public create stays disabled).
3. Mount the Banker workspace create entry point (Phase 181D).
4. Run one controlled live proof (Phase 181E) and then certify
   LIVE_CONTROLLED / PILOT_LIVE_CONTROLLED.

## Tag / deploy status

No git tag was created or moved. No `pac code push` deploy (the changes are
imported by no runtime entry point; the bundle is unchanged). No Dataverse
write, schema change, or permission change.
