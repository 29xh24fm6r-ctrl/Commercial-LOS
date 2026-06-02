# Phase 123B — BankerDealWorkspace pilot wiring to the shared Deal Intelligence view-model

## 1. Goal

Wire the BankerDealWorkspace as the **first consumer** of the Phase 123A
`dealIntelligenceViewModel` without changing any existing surface
behavior. This proves the shared deriver works end-to-end against the
real banker cockpit before Phase 123C/D/E propagate the pattern to the
Manager / Team / Executive / Portfolio surfaces.

Phase 123B is intentionally **non-invasive**: no child card was
refactored; no DealHeader / DealMetricDeck / DealAutopilotPanel
internal computation was replaced. The pilot lands a context-level
provider, an observable beacon, and tests pinning the contract.

## 2. What ships in Phase 123B

### 2.1 `src/shared/dealIntelligenceContext.tsx`

A thin React context layer that:

- Reads `useDealData()` (already exposed by `DealDataProvider`, which
  the BankerDealWorkspace mounts after `loadDealForBanker` has
  authorized the deal).
- Projects each `AsyncResult` slot (tasks / documents / creditMemo /
  activity): `kind: 'ready'` → typed data; `loading` / `failed` →
  `undefined`. The Phase 125D cockpit-metrics deriver and the Phase 16
  blocker deriver already tolerate `undefined` inputs, so the
  view-model is meaningful at every load stage without inventing fake
  values.
- Calls `deriveDealCockpitMetrics(...)` (Phase 125D, source of truth
  for completeness / counts / freshness), then `deriveBlockers(...)`
  (Phase 16, source of truth for blocker classification), then
  `deriveDealIntelligenceViewModel(...)` (Phase 123A) to project both
  onto the shared view-model.
- Memoizes the VM on `[deal, tasks, documents, creditMemo, activity]`
  so VM identity is stable across irrelevant re-renders.
- Exposes:
  - `<DealIntelligenceProvider>` — wraps children once per cockpit
  - `useDealIntelligence()` — throws outside the provider
  - `useOptionalDealIntelligence()` — returns `undefined` outside the
    provider; lets shared cards opt in during phased Phase 123C+
    propagation without forcing every surface to mount the provider
    on the same commit
  - `DealIntelligenceContext` — exported so tests can mount cards
    against a hand-built VM without the data-provider tree

### 2.2 `src/shared/DealIntelligenceBeacon.tsx`

A hidden DOM beacon that pins the shared VM into the cockpit as
`data-vm-*` attributes:

- Always-present structural attributes (one per cockpit):
  - `data-deal-intelligence-beacon="banker-cockpit"`
  - `data-vm-deal-id`
  - `data-vm-closure` (`open` / `closed`)
  - `data-vm-completeness-pct`
  - `data-vm-open-task-count`
  - `data-vm-overdue-task-count`
  - `data-vm-outstanding-document-count`
  - `data-vm-last-activity-state` (`unknown` / `none` / `has-events`)
- Optional Phase-122 hydrated attributes (rendered only when the
  source value is defined; omitted otherwise):
  - `data-vm-client-name`
  - `data-vm-banker-name`
  - `data-vm-stage`
  - `data-vm-status`
  - `data-vm-product-type`
  - `data-vm-loan-structure`
  - `data-vm-pricing-type`
  - `data-vm-blocker-status`
  - `data-vm-next-best-action-id`

**Honest absence at the attribute boundary.** When a VM field is
`undefined`, the corresponding `data-vm-*` attribute is omitted from
the DOM entirely — never rendered as `"undefined"`, `"Not set"`,
`"N/A"`, `"TBD"`, `"Unknown"`, `"—"`, or an empty string. Tests
assert presence-vs-absence, matching the deriver's discipline.

**Not visible.** The beacon renders a `hidden` `<div>` with
`aria-hidden="true"`. It has zero visual impact on the cockpit
layout and is invisible to screen readers. It exists purely as an
observable contract surface for integration tests and future
surfaces.

### 2.3 BankerDealWorkspace wiring

[BankerDealWorkspace.tsx](../src/deals/BankerDealWorkspace.tsx) gains
exactly three modifications:

1. New imports for `DealIntelligenceProvider` and
   `DealIntelligenceBeacon` from `../shared/dealIntelligenceContext`
   and `../shared/DealIntelligenceBeacon`.
2. Children of `<DealDataProvider>` wrapped in
   `<DealIntelligenceProvider>` so every descendant has access to
   the VM via `useDealIntelligence()` / `useOptionalDealIntelligence()`.
3. `<DealIntelligenceBeacon />` rendered once at the top of the
   cockpit tree.

No existing child component prop was touched. No existing render path
was rerouted. Every Phase 80 / 96 `data-deal-card` anchor still exists
in its previous position; the pre-existing `BankerDealWorkspace.test.tsx`
suite still passes verbatim.

## 3. What does NOT change in Phase 123B

- `DealHeader` continues to read `useDealData()` directly. Its Phase
  122 honest-missing UI (`"Not set"` / `"Not assigned"`) is an
  intentional empty-state label at the rendering edge, not a fake
  fallback — unchanged.
- `DealMetricDeck` continues to compute its own profile-completeness
  presentation from `useDealData()` + cockpit metrics. Phase 123C will
  switch it to consume the shared VM once the visual snapshot is
  pinned.
- `DealAutopilotPanel` continues to compute its own next-best-action
  signal. The shared VM's `nextBestAction` is a strict subset of the
  autopilot panel's classification today; consolidating them is
  scheduled for Phase 123D once the priority order is reconciled.
- No Manager / Team / Executive / Portfolio surface is touched. They
  remain on their current per-screen derivation. Each will adopt
  `<DealIntelligenceProvider>` + the beacon in its own phase.
- No React Router behavior change. No `App.tsx` change. No new
  Dataverse schema. No Phase 122 mapping change. No script / seed
  mode change.

## 4. Why the beacon and not a direct UI label swap

The user's hard rule for this phase: "Existing Banker workspace
visual behavior should remain equivalent unless explicitly improving
labels from the shared view-model." A first-pass UI label swap (e.g.
replacing `DealHeader`'s `deal.clientName` with `vm.clientName`) is
visually a no-op today because Phase 122 hydration is the same shared
loader output either way. So it would give us zero observable signal
that the VM is wired correctly.

A hidden beacon gives Phase 123B:

- **An observable contract.** Tests can assert on
  `data-vm-product-type="SBA 7(a)"` and prove the VM ran and projected
  the loader value into the cockpit, end-to-end.
- **Honest-absence enforcement.** Tests assert `hasAttribute("data-vm-product-type") === false`
  for sparse deals and prove no fake fallback string leaked into the
  cockpit via the VM path.
- **A pattern future surfaces can copy.** Manager / Team / Executive /
  Portfolio will each mount the same provider + beacon; the contract
  scales without re-litigating the integration shape.
- **Zero UI risk.** The cockpit looks identical to before. No
  customer-visible regression is possible from this commit.

UI label sourcing from the VM will happen in Phase 123C, gated by
the beacon contract (existing label render + VM-sourced attribute can
be compared head-to-head before the swap).

## 5. Tests landed in Phase 123B

- [src/shared/dealIntelligenceContext.test.tsx](../src/shared/dealIntelligenceContext.test.tsx) (8 tests)
  - Provider projects deal + Phase-122 hydration into the VM
  - Loading / failed `AsyncResult` → undefined inputs preserved
  - Blocker status + signals pass through
  - Closed deal → `closure: 'closed'`, blockers clear, no nextBestAction
  - `useDealIntelligence` throws outside the provider
  - `useOptionalDealIntelligence` returns `undefined` outside the
    provider and the VM inside it
  - Provider renders children unchanged

- [src/deals/BankerDealWorkspace.intelligence.test.tsx](../src/deals/BankerDealWorkspace.intelligence.test.tsx) (8 tests)
  - Beacon present in the cockpit DOM (proves VM wired)
  - Hydrated Client / Banker / Stage / Status flow through the beacon
  - Hydrated Product Type / Loan Structure / Pricing Type flow through
    the beacon
  - Navy hero still renders hydrated identity values (Phase 122
    mapping preserved end-to-end)
  - Sparse deal → identity attributes OMITTED from the beacon
  - Sparse deal → no fake fallback (`"Not set"` / `"N/A"` / `"TBD"` /
    `"Unknown"` / `"undefined"` / `""`) appears in any `data-vm-*`
    attribute
  - Sparse deal → structural attributes (`data-vm-deal-id`,
    `data-vm-closure`, count attributes) still present
  - Closed deal → `closure="closed"` AND `data-vm-next-best-action-id`
    omitted

The pre-existing [BankerDealWorkspace.test.tsx](../src/deals/BankerDealWorkspace.test.tsx)
suite (10 tests) continues to pass unchanged.

## 6. Phase 123C preview

The next phase will start sourcing visible cockpit labels from the
shared VM, one child at a time, using the beacon contract as the
side-by-side verification surface:

1. **`DealMetricDeck`** — switch its profile-completeness display to
   consume `useDealIntelligence().completeness` instead of recomputing.
   Visual snapshot pinned by existing tests.
2. **`DealBlockers`** — switch its blocker-card status pill to
   consume `useDealIntelligence().blockerStatus`. Same blockers
   pipeline runs in both places today; the swap is a no-op in
   appearance.
3. **`DealAutopilotPanel`** — once the VM nextBestAction ladder is
   reconciled with the autopilot panel's own priority order, switch
   the panel's empty-state branch to consume
   `useDealIntelligence().nextBestAction`. This is the largest
   reconciliation and is deferred until the contract is stable.

Each Phase 123C step is independently shippable, protected by the
existing per-card contract tests, and verifiable against the beacon
attributes.

## 7. Acceptance criteria

- [x] BankerDealWorkspace mounts `<DealIntelligenceProvider>` inside
      `<DealDataProvider>`
- [x] `<DealIntelligenceBeacon />` rendered once in the cockpit
- [x] No existing child card prop changed
- [x] No Phase 122 mapping change
- [x] No Dataverse schema / seed / script change
- [x] No route behavior change; `App.tsx` untouched
- [x] No Manager / Team / Executive / Portfolio surface refactored
- [x] No fake / mock / sample data injected at any rendering edge
- [x] Sparse deal: VM-derived attributes omitted, not faked
- [x] Hydrated deal: Product Type / Loan Structure / Pricing Type /
      Client / Banker / Stage / Status surface through the VM
- [x] Pre-existing BankerDealWorkspace.test.tsx still green
- [x] Phase 123A view-model + registry tests still green
- [x] `npm test -- --run` green (except the 6 pre-existing
      DealAutopilotPanel date-dependent failures noted in Phase 123A)
- [x] `npm run build` green
