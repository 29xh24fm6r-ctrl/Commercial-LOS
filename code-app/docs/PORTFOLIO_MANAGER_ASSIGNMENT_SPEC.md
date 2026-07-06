# Portfolio Manager Assignment (PM-1) — As-Built Spec

**Status:** Implemented (Piece 1 of the "Portfolio Manager Assignment + Governed Live Index Rates" spec).
**Scope:** App-side wiring only. No Dataverse schema mutation.

## Problem

The **Exposure by manager** card (`src/portfolio/portfolioBookSnapshot.ts`) buckets on
`row.portfolioManager`, which is derived from the Dataverse user lookup `cr664_PortfolioManager`
(read via its formatted value in `src/portfolioBoarding/boardedLoansList.ts`).

The manual boarding form previously captured **Assigned portfolio manager** as free text in the
`OWNERSHIP_FIELDS` list. That free text was never even written (it was not mapped in `buildInput`),
so it never reached the lookup — the card kept showing every manually-boarded loan as **Unassigned**.

## Decision — Option B (real lookup, not free text)

Portfolio manager is an accountability field on the bank's portfolio. It must be a real Dataverse
`systemuser` lookup so it can support assignment, permissions, review queues, and audit — not a
display-only string. Free text is not the target design.

## What changed

### 1. Assignable-user loader — `src/portfolioBoarding/portfolioManagerOptions.ts` (new)
- `loadPortfolioManagerOptions()` reads `systemusers` via the generated `SystemusersService.getAll`.
- Select: `systemuserid, fullname, internalemailaddress, isdisabled, applicationid`.
- Filter: `isdisabled eq false and applicationid eq null` (enabled, interactive users; excludes
  disabled users and application/service-principal users). A defensive client-side re-filter drops
  any disabled/app rows that slip past the server filter.
- Pure over an injected `SystemUserReader` (SDK-free static graph) + a live default that dynamic-imports
  the generated service. **Fails closed** — a non-success read throws; the caller shows an honest
  "could not load managers" state and boards without a manager. No fabrication.
- Returns `PortfolioManagerOption { id, name, email }`, sorted by name.

### 2. Boarding form — `src/portfolioBoarding/ExistingPortfolioLoansPanel.tsx`
- Removed the free-text **Assigned portfolio manager** entry from `OWNERSHIP_FIELDS`.
- Added a real user-picker `<select>` (`data-xl-manager`) populated from `loadManagers` (injectable;
  defaults to `loadPortfolioManagerOptions`). Loaded lazily on first form-open, once per open
  (a `useRef` guard prevents the loading→ready re-render from self-cancelling the in-flight read).
- Honest states: `Loading managers…`, `Managers unavailable` (+ `data-xl-manager-error` note), or the
  `Unassigned` placeholder plus the user list. On load failure the operator can still board.
- `buildInput()` passes the selected `systemuserid` as `portfolioManagerId` (omitted when unset).

### 3. Adapter — `src/portfolioBoarding/existingLoanEntryAdapter.ts` (already present from PE-WIRE-2 WI-2)
- Optional `ExistingLoanInput.portfolioManagerId` writes `cr664_PortfolioManager@odata.bind =
  /systemusers(<id>)` (exact casing matches the entity's lookup navigation property). Omitted when no id.

### 4. Snapshot / card — `src/portfolio/portfolioBookSnapshot.ts` (unchanged)
- Already reads `row.portfolioManager`. Once the lookup is bound on boarding, the card populates with
  the formatted manager name. `Unassigned` now appears only when no real lookup value exists.

## Legacy handling
- Any pre-existing `extendedAttributes.assignedPortfolioManager` free text on old rows is left intact
  for backward compatibility but is **not** authoritative. The card continues reading the lookup value.
  Going forward the lookup is the single source of manager accountability.

## Tests
- `portfolioManagerOptions.test.ts` — mapping (id/name/email fallbacks; drops disabled/app/no-id rows),
  sort, fail-closed throw, filter shape.
- `ExistingPortfolioLoansForm.test.tsx` — selecting a manager boards with `portfolioManagerId`; no
  selection fabricates no bind; a failed manager read shows the honest error and still allows boarding.
- `existingLoanEntryAdapter.test.ts` — `portfolioManagerId` writes/omits the `@odata.bind` (from WI-2).
- `boardedLoansList.test.ts` / `portfolioBookSnapshot.test.ts` — formatted manager value maps to
  `row.portfolioManager` and buckets under that name (from PE-WIRE-2).

## Guardrails honored
- No new manager schema field. No user scraping/inference. Free text is not the accountable path.
- No live Dataverse rows written in tests. No unrelated portfolio analytics touched.
- Reuses the existing governed adapter write flag; no new persistence gate.

## Definition of Done — met
- A boarded loan assigned to a manager writes `cr664_PortfolioManager@odata.bind`.
- **Exposure by manager** shows that manager; `Unassigned` only when no lookup exists.
- Tests cover bind-writing and snapshot grouping. No schema mutation introduced.

## Follow-ups (not in this phase)
- A typeahead (vs. plain `<select>`) if the user list grows large.
- Back-fill: existing manually-boarded loans need to be edited to set a manager (no auto back-fill).
- Reuse the picker for a future "reassign manager" action on the portfolio record.
