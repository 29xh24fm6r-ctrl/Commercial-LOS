# PR 142 (Phase 11) — Governed test/production classification field (N-17)

## Problem statement

N-17 (flagged as out-of-scope future work in `PR133_CANONICAL_ACTIVE_DEAL_POPULATION.md`'s own
"Remaining limitations" section) is the one concretely evidence-backed item left after Phase 10:
"a single governed test/production classification field replacing name-substring matching."

No repository artifact defines a "Phase 11" scope beyond this single reference — the full original
audit finding list is not preserved verbatim anywhere in this repo (the same gap noted in earlier
phases' own docs). Rather than invent new findings, this phase re-derives and closes the one
concretely-flagged item on record.

## Root cause / Investigation

`src/shared/deals/testDealClassification.ts` is the single, pure choke point every operational
surface routes through to exclude supervised smoke/QA test deals from normal counts. Its sole
classification mechanism was — and, as a fallback, remains — regex matching against the deal
NAME (bracketed tags like `[SMOKE TEST]`/`[QA]`, or phrases like "test deal", "DO NOT USE"). There
was no dedicated Dataverse column; `PipelineDeal.isTestRecord` (the one place this looked like a
governed field) was actually computed fresh from the name on every read, not persisted or
settable independently of the name.

Ten files ultimately route through this one module (`banker/dealQueries.ts`,
`manager/managerQueries.ts`, `team/teamQueries.ts`, `executive/operationalFallbackQueries.ts`,
`admin/adminTestDataQueries.ts`, plus downstream consumers of the resulting flag/partition). Because
they all call the same `operationalDeals`/`isTestOrSmokeDeal` functions, fixing the classification
logic in this one module benefits every consumer without requiring each call site to change.

## Files changed

- `src/shared/deals/testDealClassification.ts` — `NamedDealLike` gained an optional
  `isTestRecord?: boolean | null` field. `isTestOrSmokeDeal` now checks it first: an explicit
  `true`/`false` is authoritative (an admin's classification always wins, in either direction, over
  the name heuristic); `undefined`/`null` (unset — the default for every existing deal, and for any
  read path not yet wired to the new column) falls through to the pre-existing name-convention match
  unchanged. `operationalDeals`/`partitionDealsByTestClassification` inherit this automatically since
  they both call `isTestOrSmokeDeal` internally — no changes needed there.
- `src/shared/deals/testDealClassification.test.ts` — 5 new tests covering the governed field
  winning both directions, unset falling back to name matching, and mixed per-record behavior
  across a list.
- `src/banker/dealQueries.ts` — `toPipelineDeal` now reads the new `cr664_istestrecord` raw column
  (not yet declared on the generated model — same convention as other raw-only fields already read
  off this record, e.g. the formatted-value annotations) and passes it into `isTestOrSmokeDeal`
  alongside the name, so `PipelineDeal.isTestRecord` reflects the governed field once provisioned,
  falling back to name matching until then. This is the one consumer wired in this PR — it already
  publicly exposed `isTestRecord`, so no shape change was needed.
- `src/banker/dealQueries.hydration.test.ts` — 3 new tests: an ordinary name explicitly flagged
  `true` is excluded and labeled; a test-convention name explicitly flagged `false` is treated as
  real; an unset field on every pre-migration deal still falls back to name matching unchanged.
- `scripts/schema-migrations/pr142-test-record-field/` (NEW) — `columns.mjs`, `create-columns.mjs`,
  `verify-columns.mjs`, `rollback-columns.mjs`, following the exact idiom of
  `scripts/schema-migrations/pr106-risk-rating/`. Defines `cr664_istestrecord` as an additive,
  optional Boolean (`RequiredLevel: 'None'`, no default value) on `cr664_loandeal`.

## Schema impact

Additive only: one new optional Boolean column, `cr664_istestrecord`, on `cr664_loandeal`. No
existing column, entity, or relationship is modified. Unset on every existing deal until an
operator runs the migration AND an admin explicitly classifies a record — until then, every deal
continues to be classified exactly as before (by name).

## Runtime behavior before/after

- **Before:** the only way to classify a deal as test/production was its name matching a specific
  convention. A real deal that happened to be misnamed, or a smoke deal that didn't follow the
  convention, had no correction mechanism short of renaming the record.
- **After:** on the banker pipeline surface, an admin can set the governed field explicitly (once
  the column is provisioned) to override the name-based inference in either direction — a real deal
  incorrectly caught by the name pattern can be marked `false`; a test deal that doesn't match any
  name pattern can be marked `true`. Every other surface (Manager, Team, Executive dashboards,
  admin test-data view) is unaffected by this PR and continues on name-only classification exactly
  as before — see Remaining limitations.

## Tests added

- `src/shared/deals/testDealClassification.test.ts` — 5 new tests (10 total, all pass).
- `src/banker/dealQueries.hydration.test.ts` — 3 new tests (18 total, all pass).
- Existing coverage re-run and confirmed passing unchanged: `newDealVisibility.test.ts` (7),
  `workQueueQueries.test.ts` (2), `PersonalPipeline.test.tsx` (24).

## Validation results

- `npx tsc -b` — 0 errors.
- `npx vitest run` (full suite) — 914 test files passed, 13,395 tests passed, 2 skipped, 0 failed.
- `npm run build` — succeeded.
- `npm run audit:reachability` — 0 unexpected orphans.
- `git diff --check` — clean.

## Operator steps

1. Run `create-columns.mjs` (or apply the equivalent change via Maker Portal) against the target
   Dataverse environment, with `DATAVERSE_URL` and `DATAVERSE_ACCESS_TOKEN` (System Customizer or
   System Administrator role) set.
2. Publish customizations in the Maker Portal.
3. Run `verify-columns.mjs` to confirm the column is present with the expected type.
4. No SDK regeneration is required for this PR's read path (the raw-key read pattern doesn't depend
   on the generated model declaring the field), but a future phase wiring additional consumers
   through the strongly-typed model would need it.
5. Until an admin explicitly sets `cr664_istestrecord` on a given deal, that deal's classification
   is unchanged (name-based) — this migration alone changes nothing observable.

## Rollback considerations

`rollback-columns.mjs` (dry-run by default; `--confirm` to actually delete) removes the column.
Safe at any point: no live code depends on the column existing — its absence is the same as it
being unset, and classification falls back to name matching either way. No data-loss risk beyond
the classification values themselves, which were never the record's only identity signal.

## Remaining limitations

- Only `banker/dealQueries.ts` (`loadBankerPipeline` / `PipelineDeal.isTestRecord`) is wired to the
  new governed field in this PR. `manager/managerQueries.ts`, `team/teamQueries.ts`,
  `executive/operationalFallbackQueries.ts`, and `admin/adminTestDataQueries.ts` all still classify
  purely by name — they are unaffected by this change (not broken, simply not yet upgraded). Because
  they already route through the same `operationalDeals`/`isTestOrSmokeDeal` choke point, wiring each
  one to also pass through its own raw `cr664_istestrecord` read is a small, mechanical, per-file
  follow-up once this column is live and proven on the banker surface — deliberately deferred to
  keep this PR narrow, per the established one-narrow-PR-per-phase discipline.
- No UI is added in this PR for an admin to actually SET `cr664_istestrecord` on a deal (e.g. from
  the admin Test Data view or a deal edit surface) — this PR provisions the column and wires the
  read path; a write surface is separate, additional scope.
- As documented in prior phases, the full original N-01–N-36+ audit finding list is not preserved
  verbatim as a single document anywhere in this repository. If further phases are wanted beyond
  this one, the finding list needs to be recovered from outside this repo (a prior session, an
  external tracker) rather than re-derived from code alone — re-deriving from code risks inventing
  findings the mission's own rules explicitly forbid.
