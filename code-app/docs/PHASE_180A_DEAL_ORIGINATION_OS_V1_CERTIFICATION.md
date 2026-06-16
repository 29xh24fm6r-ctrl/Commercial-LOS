# Phase 180A — Deal origination operating arc V1 certification

Certifies the full governed origination arc built across Phases 171–179. The
arc is implemented as one controlled orchestration pipeline
([src/deals/dealOriginationOrchestrator.ts](../src/deals/dealOriginationOrchestrator.ts)),
not scattered side-effect calls. Every domain is built, typed, audited-capable,
and **DISABLED by default**.

## Arc status summary

| Domain | Status |
| --- | --- |
| Banker New Deal Create | **WIRED_CONTROLLED_DISABLED** (built; pending production references + go-live) |
| Public New Deal Create | **DISABLED** |
| CRM Automation | **DISABLED** |
| Borrower Invite | **DISABLED** (prepare-only when enabled) |
| Auto-stage Advancement | **DISABLED** |
| Task Generation | **DISABLED** |
| Document Checklist | **DISABLED** |
| Portfolio Side Effects | **SKIPPED_NOT_NEEDED / DISABLED** |
| Borrower Messaging | **DISABLED** (prepare-only; no transport) |
| Duplicate Merge | **DETECT_AND_PREPARE_ONLY** |

## Final gate values

All hard constants are `false` this phase:
`BANKER_NEW_DEAL_CREATE_ENABLED`, `NEW_DEAL_CREATE_ADAPTER_ENABLED`,
`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED`, `CRM_AUTOMATION_ENABLED`,
`BORROWER_INVITE_AUTOMATION_ENABLED`, `AUTO_STAGE_ADVANCE_ENABLED`,
`TASK_GENERATION_ENABLED`, `DOCUMENT_CHECKLIST_GENERATION_ENABLED`,
`PORTFOLIO_SIDE_EFFECTS_ENABLED`, `BORROWER_MESSAGING_ENABLED`,
`BORROWER_EMAIL/SMS/TWILIO_TRANSPORT_ENABLED`, `DUPLICATE_DETECTION_ENABLED`,
`DUPLICATE_MERGE_APPLY_ENABLED`.

## Production Stage/Status references

Not approved. Only TEST rows (`PHASE121_STAGE` / `PHASE121_STATUS`) are active;
they are rejected for production. No production-approved references exist yet
(see [Phase 171A](PHASE_171A_NEW_DEAL_CREATE_REFERENCE_APPROVAL.md)). **No TEST
references are approved for production.** No Stage/Status GUID is hardcoded in
any New Deal create / origination source file (pinned by governance tests).

## Actor authorization model

The controlled path requires a resolved Dataverse `actorSystemUserId` AND
admin/dev (or banker) authorization. Ordinary public/unauthorized users cannot
create; manager/portfolio/team-only identities do not gain create by accident.

## Payload allow-list

Create uses `NEW_DEAL_CREATE_ALLOWED_FIELDS` only. Each downstream domain has
its own allow-list (CRM / task / checklist / portfolio). `ownerid` / `statecode`
are Dataverse-defaulted, not set in the create body.

## Audit behavior

Create emits a `cr664_AuditEvent` with verified, pinned option-set values and a
correlation id; a created deal whose audit fails returns `audit_failed_partial`
(never `success`), and in that case downstream automation does not run. No audit
is written while disabled; no fake audit success.

## Live create proof result

None performed. No live banker create proof was run in this arc (banker create
is not enabled and production references are not approved). No Dataverse record
was created, patched, or deleted; no schema changed.

## Per-domain status

- **CRM automation:** disabled; links only via an approved relationship/lookup;
  no CRM write while disabled.
- **Borrower invite:** disabled; prepare-only when enabled; no external send
  without an explicit transport gate; missing contact never fails create.
- **Auto-stage advancement:** disabled; advances only from an approved source to
  an approved target by code/name; refuses on stage mismatch / unmet readiness.
- **Task generation:** disabled; deterministic approved template; idempotent.
- **Document checklist:** disabled; approved template; idempotent; no borrower
  request sent.
- **Portfolio side effects:** skipped_not_needed by default (dashboards derive
  from the Loan Deal); explicit write only with an approved mapping.
- **Borrower messaging:** disabled; prepare-only; no transport; Twilio SMS is a
  documented, separately-gated future capability and is OFF.
- **Duplicate detection/merge:** detect-and-prepare-only; warn by default; merge
  is never auto-applied; no destructive write/delete/overwrite; no "merged"
  status.

## Correction process

No in-app duplicate/correction/super-user merge surface exists yet. A created
deal would be corrected by an authorized manual delete / maker-portal action; a
governed correction surface is a future phase (documented as not yet available).

## Rollback plan

This arc adds typed, disabled, injected-IO modules + tests + docs only; it is
imported by no UI/runtime entry point (tree-shaken from the bundle), so there is
no runtime behavior change. To revert, delete the new `src/deals/dealOrigination*`
and per-domain adapter modules. No Dataverse state exists to roll back.

## Known limitations

- Banker LIVE create is not enabled (no production references; no go-live).
- All downstream automations are disabled; their live IO is not wired.
- No live proof; no correction surface; no external transports.

## Production recommendation

**Certified disabled / controlled-built; not ready for broad production live
create.** The complete governed arc is built and fail-closed. Enabling banker
create for V1 requires: (1) seeding/approving production Stage/Status references
(Phase 171A blocker), (2) an explicit V1 rollout config + Matt's go-live
approval, and (3) a controlled live create proof. Downstream domains are each
certified DISABLED with the exact reason above and can be enabled later only
through their own gate, authorization, dependency readiness, and audit path.

## Not allowed for V1 without separate explicit approval

Public create live; broad unscoped banker create without authorization; TEST
references in production; hidden auto-stage advancement; hidden borrower
messages; hidden CRM/portfolio writes; automatic duplicate merge;
delete/overwrite merge behavior; external HTTP send; fake success.

## Tag / deploy status

No git tag was created or moved. No `pac code push` deploy (the arc is
imported by no runtime entry point, so the bundle is unchanged).
