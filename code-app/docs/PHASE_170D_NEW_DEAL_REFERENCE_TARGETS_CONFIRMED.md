# Phase 170D -- New Deal Stage/Status Reference Targets Confirmed (Live Metadata)

Date: 2026-06-15
HEAD at start: 574224a (Phase 170B)

## Case Outcome: CASE B (unchanged) -- targets now identified, create still blocked

Phase 163 / 169C / 170C resolved to Case B: the deal-create SDK exists
(`Cr664_loandealsService.create`), but the Stage/Status lookup target
reference table(s) were not registered and could not be named from anything
in the repo, so no safe default could be resolved and `+ New Deal` stayed
disabled.

Phase 170D runs the Phase 170C inspect-only operator command and **records
the live target metadata it returned**. This closes registration-checklist
step 1 (identify the live target tables). It is still Case B: registration,
SDK regeneration, and a fail-closed resolver remain, so **no create was
enabled and `+ New Deal` stays disabled**.

## Live Metadata Used (read-only)

Command (Web API metadata GET only; no record read or written):

```
node scripts/phase122-lookup-repair.mjs --inspect-new-deal-references
```

Confirmed output (metadata names only -- no record GUIDs):

| Lookup (`cr664_loandeal`) | Schema name | Target table | Entity set | Primary id | Primary name | Selector fields |
| --- | --- | --- | --- | --- | --- | --- |
| `cr664_stagereference` | `cr664_StageReference` | `cr664_dealstagereference` | `cr664_dealstagereferences` | `cr664_dealstagereferenceid` | `cr664_name` | `cr664_code`, `cr664_activeflag` |
| `cr664_statusreference` | `cr664_StatusReference` | `cr664_dealstatusreference` | `cr664_dealstatusreferences` | `cr664_dealstatusreferenceid` | `cr664_name` | `cr664_code`, `cr664_activeflag` |

Both lookups are `ApplicationRequired` and each resolves to a single custom
target table. Required-for-create fields on each target table:
`cr664_activeflag` (Boolean), `cr664_code` (String), `cr664_name` (String),
the primary id (system), and `ownerid` / `owneridtype` (system). The
`cr664_activeflag` + `cr664_code` pair is the stable, least-privilege
selector a future fail-closed resolver would use to pick exactly one
default Stage and one default Status.

## What This Phase Changed

- Added the canonical, frozen, GUID-free, metadata-only manifest of the
  two confirmed targets, plus posture flags (`IDENTIFIED = true`,
  `REGISTERED = false`, `RESOLVER_AVAILABLE = false`). Phase 170D-R moved
  this single source of truth to `src/deals/newDealReferenceTargets.ts`
  so both the admin New Deal panel and the fail-closed resolver
  (`src/deals/newDealReferenceResolver.ts`) consume one module; the
  earlier `src/admin/newDealReferenceTargets.ts` copy was removed.
- Surfaced a "Confirmed live reference targets (Phase 170D)" table in the
  Admin New Deal Intake panel, with an honest "not yet registered, no
  resolver, no create" note.
- Marked registration-checklist step 1 (`adminNewDealIntakeModel.ts`) done;
  steps 2-5 remain pending. Relaxed the `done` field type to `boolean`.
- Extended the intake blocker copy to record the confirmed targets while
  still stating create is blocked.
- Added/updated tests (`newDealReferenceTargets.test.ts`,
  `adminNewDealIntakeModel.test.ts`, `NewDealIntakePanel.test.tsx`).

## Exact Remaining Blockers (steps 2-5)

1. **Register the data sources.** Add `cr664_dealstagereference` and
   `cr664_dealstatusreference` to `power.config.json` database references
   and to `.power/schemas/appschemas/dataSourcesInfo.ts`, with their
   `.power/schemas/dataverse/<table>.Schema.json`.
2. **Regenerate the SDK** so typed `Cr664_dealstagereferencesService` /
   `Cr664_dealstatusreferencesService` and models exist under
   `src/generated/`.
3. **Add a fail-closed resolver** that reads only registered services,
   selects exactly one active default per reference by `cr664_activeflag` +
   `cr664_code`, and bails (returns a typed blocked/ambiguous/missing
   outcome) on zero or multiple matches. No hardcoded GUIDs.
4. **Add a governed, audited create adapter** (admin/banker write
   entitlement, the two resolved `@odata.bind` values, a `cr664_AuditEvent`,
   typed outcomes, payload-discipline tests). Only then enable `+ New Deal`.

Steps 1-2 are environment/schema/SDK-regeneration work outside this app's
allowed V1.0 delta and were deliberately NOT performed here.

## Why No Create Was Enabled

Knowing the target entity set and primary id is necessary but not
sufficient. A create payload still needs a concrete record id for each
`@odata.bind`, which can only come from a registered, typed reference
service plus a fail-closed default resolver -- neither of which exists yet.
Supplying a bind today would require a registered service we do not have or
a hardcoded GUID, which is prohibited. `new-deal-create` therefore remains
in `NOT_WIRED` and `+ New Deal` stays disabled.

## Guarantees

- No hardcoded GUIDs (metadata logical/entity-set names only).
- No fabricated Stage or Status default values.
- No deal create. No loan-deal patch. No Stage/Status record create.
- No data-source registration, no SDK regeneration, no schema/migration.
- No permission widening; no workspace access widening.
- No external HTTP / fetch / Graph connector introduced in app runtime.
  (The inspect command is an existing read-only operator script; it was run
  from the terminal, not wired into the app.)
- No CRM, portfolio, or admin write enablement changed.
- No deploy. No tag moved. No Dataverse record written.
- Governance inventory counts unchanged (`NOT_WIRED` still 9;
  `new-deal-create` still blocked, `blockerKind: 'schema'`).
- Route delta: 0.

## Validation

- `node scripts/phase122-lookup-repair.mjs --inspect-new-deal-references`:
  read-only metadata inspection succeeded; output recorded above.
- `npm test -- Admin admin NewDeal newDealReferenceTargets releaseCandidateSnapshot`:
  see commit message / report for the result.
- Full `npm test` and `npm run build`: see report.
- `git status --short` before and after: see report.
