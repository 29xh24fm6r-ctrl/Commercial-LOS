# Phase 170K — Controlled New Deal create smoke (operator/admin-gated)

## Purpose

Phase 170J reconciled the New Deal readiness truth: the Stage/Status resolver
is **Ready (TEST)**, but `+ New Deal` stays disabled pending production
reference approval and a governed, audited create adapter. Phase 170K adds the
**first controlled proof** that a `cr664_loandeal` create payload — including
the Stage/Status `@odata.bind` values — actually works end to end.

It does this as an **operator script mode**, not an in-app button: the script
creates **exactly one TEST-labeled deal**, and only when the operator
intentionally passes both the mode flag and the explicit commit flag. Default
is dry-run. This is the Phase 170J checklist step 8 ("single-record controlled
create smoke") — it is **not** step 9 (enable `+ New Deal`), which stays
disabled.

## What this is NOT

- It does **not** enable the public `+ New Deal` button
  (`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED` stays `false`;
  `new-deal-create` stays in `NOT_WIRED`).
- It does **not** approve any TEST reference row for production.
- It does **not** create a client/borrower row (client is optional and, if
  supplied, an **existing** client only).
- It does **not** touch Advance Stage / stage-progression ordering — a
  separate blocker on a different table (`cr664_stagereferences`), named here
  only to keep the distinction explicit.
- It does **not** widen or bypass permissions, and writes no Dataverse schema.

## Exact commands

Dry-run (default — resolves Stage/Status/banker, prints the masked payload,
writes nothing):

```
node scripts/phase122-lookup-repair.mjs --smoke-create-new-deal \
  --deal-name "Acme Working Capital" \
  --assigned-banker-upn mpaller@oldglorybank.com
```

Commit (creates exactly one TEST-labeled deal):

```
node scripts/phase122-lookup-repair.mjs --smoke-create-new-deal \
  --deal-name "Acme Working Capital" \
  --assigned-banker-upn mpaller@oldglorybank.com \
  --commit-smoke-create-new-deal
```

Optional inputs:

- `--amount <number>` — non-negative; sets `cr664_amount`. Omitted if absent.
- `--assigned-banker-email <email>` — synonym for `--assigned-banker-upn`.
- `--client-name "<existing client>"` — binds an **existing**
  `cr664_clientrelationship` resolved by name (exactly one). Zero/multiple
  matches fail closed; **no client is ever created**. Omit to skip Client.

## Required inputs / payload discipline

The required `cr664_loandeal` create fields are taken from the generated typed
model (`src/generated/models/Cr664_loandealsModel.ts`, which mirrors live
schema). The non-optional business fields are:

- `cr664_dealname` (required) — from `--deal-name`, prefixed with the TEST
  marker `[SMOKE TEST - PHASE 170K - DO NOT USE] `.
- `cr664_AssignedBanker@odata.bind` (required) — resolved from the banker UPN.
- `cr664_StageReference@odata.bind` (required) — resolved by active code.
- `cr664_StatusReference@odata.bind` (required) — resolved by active code.
- `cr664_stageentrydate` (required date) — set to the run timestamp.

Optional: `cr664_amount`, `cr664_Client@odata.bind`.

The POST body is restricted to a fixed allow-list
(`SMOKE_NEW_DEAL_ALLOWED_FIELDS`); the create helper refuses to POST if any
key falls outside it, so no stray/guessed column can be written.
`ownerid` / `owneridtype` / `statecode` / `statuscode` are **deliberately
omitted** — Dataverse defaults the owner to the calling user and the state to
Active on create. No Dataverse record GUID is hardcoded anywhere.

## Stage/Status resolver behavior (fail-closed)

Stage and Status are resolved by stable **active code** against the two
reference entity sets confirmed in Phase 170D:

- Stage: `cr664_dealstagereferences`, code `PHASE121_STAGE`.
- Status: `cr664_dealstatusreferences`, code `PHASE121_STATUS`.

Resolution returns a typed outcome union and **fails closed** on every
non-ready branch — zero matches (`missing`), more than one (`duplicate`), an
inactive row (`inactive`), or a service error (`serviceError`). No row is ever
chosen by GUID, and a deal is never created with an unresolved reference.

## TEST-only warning

The active `PHASE121_*` rows are **TEST-environment labels, not
production-approved**. Every created smoke deal name carries the
`[SMOKE TEST - PHASE 170K - DO NOT USE]` marker so the row is unmistakably a
test artifact. Do not run the commit path against a production reference set,
and do not treat a successful smoke as production readiness.

## Audit behavior / audit gap (honest)

This script writes **no** `cr664_auditevent` row. A governed, audited in-app
create adapter (write-entitlement check + `cr664_auditevent` + typed outcome
union + payload-discipline tests) is the **separate Phase 170J checklist step
7** and is intentionally not built here. Fabricating a partial audit row would
require guessing the audit table's required enum values (`cr664_eventtype`,
`cr664_eventcategory`, `cr664_outcomestatus`, `cr664_ChangedBy`, …), so the
script does not. The audit trail for the smoke is Dataverse's own
`createdon` / `createdby` system columns plus the script's verify-by-reread
output.

## Verification steps

On commit, the script re-reads the created deal with formatted-value
annotations and prints:

- `cr664_loandealid` (deal id)
- `cr664_dealname` (carries the TEST marker)
- Stage formatted value
- Status formatted value
- Assigned banker formatted value
- Client / amount (when present)

## Rollback / delete guidance

The script does **not** auto-delete (no cleanup mode exists). To remove a TEST
smoke deal, run an authorized manual delete against the printed id, e.g.:

```
DELETE /api/data/v9.2/cr664_loandeals(<cr664_loandealid>)
```

(via an authenticated Web API client / `pac` / the maker portal). Deletion is
a deliberate, separate operator action.

## Why public + New Deal remains disabled

A successful payload smoke proves the create shape and Stage/Status binds — it
does **not** satisfy the remaining enablement gates: production-approved
reference rows, a governed/audited create adapter, and the broad-enablement
decision. Until those land, `+ New Deal` stays disabled and `new-deal-create`
stays in `NOT_WIRED`.

## Validation results

- `git status --short` — only Phase 170K files changed.
- `npm test -- phase122 NewDeal Admin admin releaseCandidateSnapshot` — green.
- `npm test` — full suite green.
- `npm run build` — green.

## No deploy / tag / permission change

This phase adds an **operator script mode + tests + docs** only. No app UI
changed, so there is **no `pac code push` deploy**. No git tag was created or
moved. No permission was widened or bypassed. No Dataverse schema or record
was changed by this commit (a live deal is created only if an operator
explicitly runs the commit path).
