# Engineering Operating Rules

Standing execution constraints for this codebase. Phase briefs may add
constraints but should not need to restate the ones below. When a brief
is silent on a question, the rules in this file are the answer.

This file is short on purpose. If a rule needs three paragraphs of
qualification, it belongs in [STAGE_GOVERNANCE.md](STAGE_GOVERNANCE.md),
[STABILIZATION_CHECKLIST.md](STABILIZATION_CHECKLIST.md), or a phase
brief — not here.

---

## 1. Stability comes first

- No production behavior drift inside a stabilization phase. If a refactor
  cannot preserve outward behavior exactly, raise it before editing.
- Prefer **derivation refactors** (move inline logic behind a canonical
  source) over **behavioral rewrites**.
- **Centralize before extending.** If two modules duplicate a constant,
  the next phase that touches them collapses the duplication; it does
  not extend both copies.

## 2. Governance discipline

- Every shipped capability is **test-pinned** somewhere. If a behavior
  is not pinned, it is not shipped — it is incidental.
- Blocked capabilities are **modeled explicitly** (see
  [platformInventory.ts](../src/shared/governance/platformInventory.ts)).
  Never imply a roadmap promise in code or copy.
- "Not wired" must state the concrete reason. No `coming soon`, no `tbd`.
- Local-only flows must explicitly state "no Dataverse write" in their
  inventory entry and in any user-facing banner.

## 3. Writes

- No new write surface ships without a `GOVERNED_WRITES` entry,
  discriminated outcome union, correlation id, and audit emission.
- Deal-domain writes also emit a timeline event.
- Role-gated to bankers unless the brief explicitly says otherwise.
  Manager / team / executive / admin surfaces render `readOnly=true`
  for the same card.
- Never introduce an optimistic write. The outcome union is the contract.

## 4. Refactors

- Remove inline constants when a canonical source exists or can be
  introduced cheaply.
- Eliminate duplicate ordering / classification arrays. The canonical
  source is named in [CANONICAL_SOURCES.md](CANONICAL_SOURCES.md).
- Preserve outward behavior **exactly** unless the brief explicitly
  authorizes a change. "Exactly" includes copy strings, regex
  semantics, severity-ladder order, and error-render text.

## 5. Tests

- Every governance rule gets regression protection (positive AND
  negative case).
- Pin **negative capabilities** — what the system deliberately does
  not do is as important as what it does.
- Prefer structural assertions over snapshot tests. Snapshots rot;
  structural assertions describe the invariant.
- Mocks at the module boundary (`vi.mock` + `vi.hoisted`). Do not
  mock internals.

## 6. Architecture

- Shared contracts live under [src/shared/](../src/shared/). Role
  modules (admin / banker / manager / executive / team / deals) are
  sealed — they import from `src/shared/` and from each other only
  through the `deals` route boundary.
- UI derives from canonical metadata, not from inline literals.
- **Permission checks precede queries.** Never query Dataverse and
  then decide whether the caller was allowed.
- **No silent fallbacks.** Selectors that don't find a record return
  `undefined`; callers handle it explicitly.

## 7. Phase discipline

- Respect explicit non-goals. The `NOT_WIRED` and
  `DELIBERATELY_BLOCKED` entries in
  [platformInventory.ts](../src/shared/governance/platformInventory.ts)
  are standing non-goals until a brief authorizes flipping one.
- Do not opportunistically add roadmap features. A phase scope is the
  ceiling, not the floor.
- Do not enable a blocked system early — even if the blocker looks
  trivial. Schema gaps stay blocked until the schema work lands.

---

## 8. Decision defaults

When the brief is silent and two paths are defensible, take the one
on the right.

| If uncertain between …            | Default to …                       |
| --------------------------------- | ---------------------------------- |
| explicit vs. implicit             | explicit                           |
| blocked vs. partially enabled     | blocked                            |
| metadata vs. inline constant      | metadata                           |
| derivation vs. duplication        | derivation                         |
| additive test vs. snapshot test   | additive structural test           |
| behavior change vs. no change     | no change                          |
| new abstraction vs. inline 3x     | inline 3x (abstract on the 4th)    |
| conservative copy vs. assertive   | conservative ("may be…", not "is") |
| new file vs. extend existing      | extend existing                    |

If the right column is wrong for a specific situation, the brief must
say so.

---

## 9. Refactor permissions

### Allowed without asking

- Moving constants into shared modules under `src/shared/`.
- Adding tests (including for previously untested code).
- Adding governance metadata entries (`NOT_WIRED`,
  `DELIBERATELY_BLOCKED`, `LOCAL_ONLY_FLOWS`, etc.).
- Removing inline ordering / classification arrays whose canonical
  source already exists.
- Tightening TypeScript types (narrower readonly, narrower unions,
  removing `any`).
- Centralizing selectors / predicates that were duplicated.
- Renaming local variables for clarity.
- Adding JSDoc that documents existing behavior.

### Must ask first

- UX or copy changes visible to users.
- Any new write surface, or expansion of an existing one.
- Permission boundary changes (role gates, route dispatch, deal
  access mode).
- Enabling a blocked or not-wired capability.
- Schema migrations or any change to `src/generated/`.
- API / outcome-union contract changes.
- Adding feature flags.
- Adding new third-party dependencies.
- Removing tests (even ones that look redundant — they pin
  something).

### Default when in doubt

If a refactor sits between the two lists, treat it as **must ask
first**. The cost of a clarifying question is far below the cost of
re-doing a phase that quietly changed behavior.

---

## 10. Permission to assume

Within the bounds of §9, make the conservative architectural call and
proceed. Specifically:

- If an invariant-preserving path exists, take it without asking.
- If a brief is silent on naming, follow the closest existing
  convention.
- If two test placements are defensible, co-locate with the module
  under test.
- If a doc reference would be useful and is short, write it; if it
  would be long enough to need its own file, ask first.

The goal is **fewer interruptions, not more autonomy**. Conservative
assumption + a clearly-flagged note in the AAR is preferred over a
clarification round-trip.
