# Stage Advancement (nCino-style workflow) — Run Log

Branch: `feature/stage-advancement-workflow` · Base: `completion/flag-truthup-20260629`
(the honest fail-closed baseline; `AUTO_STAGE_ADVANCE_ENABLED = false`).

Turns the deliberately-blocked stage-progression domain into a working, governed, nCino-style staged
loan-origination workflow — gated transitions, full audit trail, approval authority, fail-closed,
no auto-advance — buildable entirely in the current environment. **Branch only; not pushed.**

## Prime directives held

Fail-closed gates · no auto-advance (`AUTO_STAGE_ADVANCE_ENABLED` stays default-off) · every
transition is a governed write (authz → policy/gate → update → audit + timeline + correlation id →
typed outcome with honest partials) · no fabricated credit decision · deterministic + testable ·
additive, default-off, one commit per phase, full gate green, branch only. The stage definitions and
authority matrix are a **template, not OGB-ratified policy.**

## Phases

| # | Commit | What landed |
|---|--------|-------------|
| 1 | `03c653d` | `docs/STAGE_SCHEMA_SETUP.md` (maker steps: add `cr664_sequence` to `cr664_dealstagereferences`, seed 7 ordered stages + 5 statuses, regen SDK) + `scripts/seed-stage-references.mjs` (dry-run default, idempotent `--commit`, `--verify` read-smoke). The only Dataverse change; maker-owned. |
| 2 | `2abf4fc` | `stageOrderingContract.ts` — `resolveStageOrdering(rows)` sorts active canonical stages by `cr664_sequence`; `nextStage`/`priorStages`/`isTerminal`/`stageBySequence`; fail-closed (missing/duplicate/absent sequence → `unavailable`, never a guessed order). `stageProgressionAvailability.ts` made data-driven; no-arg forms stay honestly unavailable. |
| 3 | `07dbdd4` | `stageGateContract.ts` — per-stage exit gates as pure predicates over a `StageGateFacts` bag; `true`→met, `false`→outstanding, `undefined`→"not yet tracked" (fail-closed, never auto-passed). |
| 4 | `2244c0a` | `canonicalStageTransition.ts` — `evaluate`/`execute` for ADVANCE/RETURN/DECLINE/WITHDRAW; ordering + gate + reason + authorization; governed write (default-off, injected transport/audit/timeline, typed outcome with honest partials). DECLINE sets DECLINED + adverse-action-pending (no send, no fabricated decision). |
| 5 | `f1e6b5b` | `StageWorkflowControl.tsx` — banker control: stage + sequence, next stage, exit-gate checklist, four governed actions. Disabled-safe (unseeded → read-only banner; unauthorized → disabled; gate unsatisfied → Advance disabled with outstanding items; not-live → previews, writes nothing). |
| 6 | `50e9914` | `approvalAuthorityMatrix.ts` — editable **TEMPLATE** amount-band → authority config; `requiredAuthority`/`approvalSatisfies` (fail-closed); consumed by the CREDIT_APPROVAL gate via `approvalAuthoritySufficient`. |
| 7 | (this) | Governance truth-up + full gate (below). |

## Phase 7 — governance truth-up

- `platformInventory.ts`: `DELIBERATELY_BLOCKED.stage-progression-advance` reworded to **WIRED_DISABLED**
  (engine/contracts/UI/matrix built + tested; live write blocked pending maker seed + the default-off
  flag). The two stage `NOT_WIRED` reasons updated to reality: the ordering contract now exists in
  code; the remaining gap is the seeded `cr664_sequence` data; the separate `Cr664_stagereferences`
  table is **superseded** (ordering rides on the registered `cr664_dealstagereferences`).
- `STAGE_PROGRESSION_ENABLEMENT_MAP.md`: status header + §0 update recording the built artifacts and
  the superseded Phase-43 plan.
- `intentionallyUnrouted.ts`: the 4 new modules (control + engine + gate + matrix) registered as
  intentional orphans (WIRED_DISABLED — not hosted in a live workspace until seeded + armed), so
  reachability stays green and honest.

### Deliberate deviation from the spec's literal Phase 7 instruction

The spec says "add the new governed transition writes to `GOVERNED_WRITES`." I did **not**, on
purpose: the repo reserves `GOVERNED_WRITES` for **shipped/live** writes (its own test forbids
`stage-progression-advance` there), and the established precedent (`new-deal-create`) keeps a
built-but-default-off governed write in `NOT_WIRED`/`DELIBERATELY_BLOCKED` as **WIRED_DISABLED**.
The stage transition is doubly-gated (default-off flag + unseeded ordering), so listing it as a
shipped governed write would fabricate readiness — violating the spec's own prime directives (#1
fail-closed, #4 no fabricated readiness, #6 default-off) and its Phase-7 condition ("once the
ordering contract *loads*", which it does not at repo level). It moves to `GOVERNED_WRITES` only
when armed live with authentic evidence.

## Final gate

| gate | result |
|------|--------|
| `tsc -b` | 0 |
| full `vitest run` | **693 files · 10,482 passed · 2 skipped** |
| `npm run lint` | 0 (legacy baseline; every file this arc lints clean) |
| `npm run audit:reachability` | 0 |
| `npm run build` | 0 |
| `npm run verify:launch-evidence` | 1 — honest-red, by design (no authentic GO evidence) |

New tests this arc: ordering 9 · availability/diagnostics 13 + downstream · gate 13 · transition 20 ·
control 8 · matrix 8.

## Operator / maker runbook (environment-owned — NOT done in repo)

1. **Ratify** the stages, gate criteria, and the approval-authority matrix with OGB credit/compliance
   (edit §1 of the spec + `approvalAuthorityMatrix.ts`). Policy decision, not a code task.
2. **Seed** the schema (`docs/STAGE_SCHEMA_SETUP.md`): add `cr664_sequence`, seed the 7 ordered stage
   rows + status rows (or `node scripts/seed-stage-references.mjs --commit`), regenerate the SDK.
3. **Verify** ordering: `node scripts/seed-stage-references.mjs --verify` → `stageProgressionAvailability`
   flips to available; the diagnostics card goes ready.
4. **Certify + arm**: run one controlled transition on a test deal, confirm the audit + timeline rows,
   then arm `AUTO_STAGE_ADVANCE_ENABLED` deliberately with authentic evidence (real UPN, real record
   IDs) — moving the domain from WIRED_DISABLED → live, and the inventory row into `GOVERNED_WRITES`.

## Candidate schema follow-ups (gate facts not yet tracked)

The gate contract surfaces requirements honestly as "not yet tracked" where no backing field exists
(e.g. risk rating assigned, commitment/term-sheet issued, borrower acceptance, conditions
cleared/documented, collateral/insurance verified, docs executed, funds disbursed). These are
candidate Dataverse fields to add as the workflow is operationalized — none are fabricated; each
reads not-met until a real field backs it.
