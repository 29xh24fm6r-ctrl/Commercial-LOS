# Phase 170M — Governed in-app New Deal create adapter (disabled by default)

## Proof chain (170K → 170L → 170M)

- **Phase 170K** proved the minimal `cr664_loandeal` create payload works with
  resolved Stage/Status `@odata.bind` values (operator script smoke; one TEST
  deal created).
- **Phase 170L** brought the Banker read models to formatted-value parity so a
  deal created via `cr664_StageReference` / `cr664_StatusReference` displays its
  Stage/Status correctly (no more "Stage not set").
- **Phase 170M** (this phase) ships the production-grade **in-app** governed
  create adapter and its tests — but keeps every enablement **off by default**.
  No public + New Deal button, no UI wiring, no live write.

## Adapter design

[`src/deals/newDealCreateAdapter.ts`](../src/deals/newDealCreateAdapter.ts) —
`createGovernedNewDeal(input, deps)` returns a typed outcome union and performs
IO only through injected dependencies, so tests exercise the full logic with
mocks and never create a Dataverse record.

Inputs (`GovernedNewDealCreateInput`): `dealName`, `assignedBankerId`
(cr664_bankers id for the `cr664_AssignedBanker` bind), `actorSystemUserId`
(authorized actor's Dataverse systemuser — the authorization proof), optional
`amount`, optional `existingClientId` (an **existing** client only — never
created).

Ordered, fail-closed checks:

1. `disabled` — when `deps.enabled` is false (the default). No work, no IO.
2. `validation_error` — blank `dealName` (and invalid `amount`, blank
   `assignedBankerId`, or a stray payload key).
3. `unauthorized` — no `actorSystemUserId` (no write-entitled identity).
4. `resolver_not_ready` — the Stage/Status resolver did not return `ready`.
5. build the allow-listed payload from the **resolver-provided binds**.
6. `create_failed` — the deal create IO failed (best-effort Failed audit).
7. `audit_failed_partial` — the deal was created but the audit write failed
   (CRITICAL: do not retry the create; only the audit row is reattempted).
8. `success` — deal created and the governed audit event emitted.

## Feature flag default disabled

[`src/deals/newDealCreateFeatureFlags.ts`](../src/deals/newDealCreateFeatureFlags.ts)
— `NEW_DEAL_CREATE_ADAPTER_ENABLED = false` (hard constant this phase).
`isNewDealCreateAdapterEnabled(config)` fails closed: it returns `true` only
when the constant is `true` **and** every prerequisite
(`adapterEnabled`, `productionReferencesApproved`, `auditWired`) is exactly
`true`. Because the constant is hard `false`, it always returns `false` for the
app default. `buildLiveNewDealCreateDeps()` wires the live services but sets
`enabled` to that constant, so `createGovernedNewDeal` always returns
`disabled` and the live IO is never reached.

## Authorization requirements

The adapter requires a resolved `actorSystemUserId` (a banker/admin identity
provisioned as a Dataverse systemuser, resolved upstream via
`resolveCurrentSystemUserId`). Absent identity → `unauthorized`. The adapter
does not widen or bypass any permission; the caller must establish write
entitlement before invoking it. No UI surface calls the adapter in this phase.

## Payload allow-list

The create body is restricted to `NEW_DEAL_CREATE_ALLOWED_FIELDS`:

- `cr664_dealname`
- `cr664_StageReference@odata.bind` (resolver-provided)
- `cr664_StatusReference@odata.bind` (resolver-provided)
- `cr664_AssignedBanker@odata.bind`
- `cr664_stageentrydate`
- `cr664_amount` (optional)
- `cr664_Client@odata.bind` (optional, existing client)

A stray key fails closed (`validation_error`). `ownerid` / `statecode` are
deliberately omitted — Dataverse defaults them on create. **No Stage/Status
GUID is hardcoded** — the binds come from the fail-closed resolver's verified
active rows.

## Stage/Status resolver dependency

The adapter resolves Stage/Status via the existing fail-closed resolver
([`newDealReferenceResolver`](../src/deals/newDealReferenceResolver.ts) over
[`newDealReferenceReader`](../src/deals/newDealReferenceReader.ts)) by stable
code/name — never by GUID. Anything other than `ready` (notConfigured /
missing / duplicate / inactive / serviceError) → `resolver_not_ready`, and no
deal is created.

## Audit status — WIRED (in code, behind the disabled gate)

Audit is wired in the **same coordination pattern** as the existing governed
writes (`dealTaskActions` / `documentActions`): after a successful create the
adapter emits a `cr664_AuditEvent` via `Cr664_auditeventsService.create` with a
correlation id and **verified** option-set values —
`cr664_eventcategory = Lifecycle (788190002)`,
`cr664_eventtype = AssignmentChange (788190002)` (the same value the existing
create-task governed write uses for a record creation),
`cr664_entitytype = LoanDeal (788190000)`,
`cr664_outcomestatus = Succeeded/Failed`,
`cr664_ChangedBy@odata.bind = /cr664_users(<resolved cr664_userid>)` —
`cr664_ChangedBy` is a REQUIRED lookup to the custom `cr664_user` table, so the
actor's email is resolved fail-closed to a `cr664_user` id via the registered
`cr664_platformusers` bridge; a systemuser id is never bound there. No enum is
guessed and no audit is faked: a created-deal-with-failed-audit (including an
unresolvable actor) honestly returns `audit_failed_partial`. Because the adapter
is disabled by default, no audit row is written in this phase.

## Why public + New Deal remains disabled

`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED` stays `false` and `new-deal-create`
stays in `NOT_WIRED`. Shipping the adapter code does not enable it: the
feature gate is hard `false`, no UI button is wired, and the outstanding
production gates (below) are not met.

## Next steps for production approval and public enablement

1. Seed/approve **production** Stage/Status reference rows (replace the TEST
   `PHASE121_*` labels).
2. Certify the audit path end to end (single-record controlled create smoke
   through the adapter against the production references).
3. Flip `NEW_DEAL_CREATE_ADAPTER_ENABLED` (+ the config prerequisites) and wire
   an explicit, permission-gated admin control — still gated, audited, and
   separate from the public + New Deal button.
4. Only then remove `new-deal-create` from `NOT_WIRED` and consider public
   enablement.

This is separate from Advance Stage / stage-progression, which remains its own
blocker and is untouched here.

## Validation results

- `git status --short` — only Phase 170M files changed.
- `npm test -- NewDeal Admin Banker governed releaseCandidateSnapshot` — green.
- `npm test` — full suite green.
- `npm run build` — green.

## Deploy / tag / write statement

This phase adds runtime adapter code that is **disabled by default and called
by no UI**. No Dataverse record was created, patched, or deleted; no schema
changed; no TEST reference row was approved for production; no git tag was
created or moved; no permission was widened. Deploy status is recorded in the
commit/report (the disabled adapter is inert at runtime).
