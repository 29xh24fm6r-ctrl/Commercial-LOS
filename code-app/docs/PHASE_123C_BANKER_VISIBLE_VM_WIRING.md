# Phase 123C — Banker cockpit visible Deal Intelligence VM wiring

## 1. Goal

Start replacing duplicated local display / completeness derivation in
the Banker cockpit with the shared `dealIntelligenceViewModel`
(Phase 123A), one safe visible surface at a time. Phase 123B landed
the provider + hidden beacon contract; Phase 123C lifts two visible
surfaces to read from the shared VM through the same provider.

This phase is intentionally narrow. The deeper consolidation
(`DealAutopilotPanel`, `DealBlockers`, `DealStageProgressionCard`,
right-rail cards) is deferred to Phase 123D and later, behind the
same provider contract.

## 2. What ships in Phase 123C

### 2.1 `DealHeader` — prefers VM identity values

[DealHeader.tsx](../src/deals/DealHeader.tsx) now reads
`useOptionalDealIntelligence()` and prefers the VM when the
provider is mounted:

- `dealId` ← `vm?.dealId ?? deal.id`
- `dealName` ← `vm?.dealName ?? deal.name`
- `clientName` ← `vm?.clientName ?? deal.clientName`
- `bankerName` ← `vm?.bankerName ?? deal.bankerName`
- `stageName` ← `vm?.stageName ?? deal.stage`
- `statusName` ← `vm?.statusName ?? deal.status`
- `isClosed` ← `vm ? vm.closure === 'closed' : deal.isClosed`

When the provider is absent (e.g. existing per-card tests that mount
DealHeader standalone), every fallback evaluates to the deal record
and the component renders identically to before. Phase 122 hydration
makes the VM values byte-equivalent to `deal.*` today, so the swap
is structurally meaningful but visually a no-op.

Honest-absence behavior is preserved at the rendering edge: when both
the VM field AND the deal field are `undefined`, the header still
shows `"Not set"` / `"Not assigned"` exactly as before. The
Phase-122-loader's `undefined` propagates through the VM and out of
the header as the same empty-state copy.

### 2.2 `DealMetricDeck` — completeness sourced from VM

[DealMetricDeck.tsx](../src/deals/DealMetricDeck.tsx) now reads
`useOptionalDealIntelligence()` and prefers the VM completeness
fields when present:

- `populatedFieldCount` ← `vm?.completeness.populatedFieldCount ?? metrics.populatedFieldCount`
- `totalFieldCount` ← `vm?.completeness.totalFieldCount ?? metrics.totalFieldCount`
- `profileCompletenessPct` ← `vm?.completeness.completenessPct ?? metrics.profileCompletenessPct`
- `missingFieldLabels` ← `vm?.completeness.missingFieldLabels ?? metrics.missingFieldLabels`

These resolved values flow into:

- The `CompletenessRing` ("`<n>%`" + `"PROFILE · <p> of <t>"` caption
  + accessible label)
- The "Missing fields" `LargeMetricTile` (count value + sub copy)
- The footer "MISSING:" list / the "None — every tracked field is
  populated." empty-state line

The other tiles (Loan amount, Blockers, Tasks open, Documents, Target
close) and footer values (Last touched, Comms, Memo) continue to read
from the locally-derived cockpit metrics — Phase 123D scope.

When the provider is absent, every fallback evaluates to local
metrics and the deck renders identically to before. Standalone
mounting (e.g. the new
[DealMetricDeck.test.tsx](../src/deals/DealMetricDeck.test.tsx))
still works.

### 2.3 Hidden beacon contract preserved

The Phase 123B [`DealIntelligenceBeacon`](../src/shared/DealIntelligenceBeacon.tsx)
still mounts inside the BankerDealWorkspace cockpit, unchanged.
Its `data-vm-*` attribute surface is identical; Phase 123C does not
touch the beacon.

## 3. What does NOT change in Phase 123C

- `DealAutopilotPanel` — continues to compute its own next-best-action
  signal. The shared VM's `nextBestAction` ladder will be reconciled
  with the autopilot panel's own priority order before swapping.
- `DealBlockers` (Attention Console) — continues to compute its own
  blocker status / signals from `useDealData()` + the local blocker
  pipeline. Phase 123D will switch its header pill to the VM.
- `DealStageProgressionCard` (Stage Map) — untouched.
- `DealTasks` / `DealDocuments` / `CreditMemo` — untouched. These
  cards have their own per-card derivers; consolidation happens later.
- Manager / Team / Executive / Portfolio surfaces — not refactored.
  Each will adopt `<DealIntelligenceProvider>` + start consuming the
  VM in its own phase.
- No Dataverse schema change. No Phase 122 mapping change. No script /
  seed mode change. No route behavior change. `App.tsx` untouched.
- No visual redesign. No new UI affordance. No new copy.

## 4. Why fall back to local sources

Two reasons:

1. **Standalone mountability.** Per-card test files (e.g.
   [DealHeader.test.tsx](../src/deals/DealHeader.test.tsx) and the
   new [DealMetricDeck.test.tsx](../src/deals/DealMetricDeck.test.tsx))
   mount the card directly under a mocked `useDealData()` without
   a `DealIntelligenceProvider`. The fallback chain keeps those tests
   passing while still letting the BankerDealWorkspace integration
   route through the shared VM.
2. **Incremental wiring safety.** Phase 123B/C/D is a phased
   migration. Mounting any card under a real Phase-123-style provider
   becomes opt-in per surface; we never force every test to set up a
   provider mid-migration. `useOptionalDealIntelligence()` is the
   contract that makes this work.

The fallback values are byte-equivalent today (the VM consumes the
same loader output + the same cockpit-metrics deriver), so the swap
is structural — preparing the cockpit to be the single source for
all surfaces — rather than visual.

## 5. Tests landed in Phase 123C

- [src/deals/DealHeader.intelligence.test.tsx](../src/deals/DealHeader.intelligence.test.tsx) (10 tests)
  - VM-sourced dealName surfaces as the `<h1>`, overriding the deal
  - VM-sourced dealId surfaces in the id chip + aria-label
  - VM-sourced Client / Banker / Stage labels render in the identity
    slots; deal-sourced equivalents do NOT leak through
  - VM-sourced Status renders in the chip
  - `vm.closure === 'closed'` renders the Closed pill regardless of
    `deal.isClosed`
  - `vm.closure === 'open'` suppresses the Closed pill regardless of
    `deal.isClosed`
  - Undefined VM fields render `"Not set"` / `"Not assigned"` — no
    fake fallback through the VM path
  - Undefined VM field delegates to deal.* (the `??` fallback chain)
  - Without provider: deal-sourced labels render unchanged
  - Without provider: honest "Not set" / "Not assigned" copy still
    surfaces for missing deal fields

- [src/deals/DealMetricDeck.test.tsx](../src/deals/DealMetricDeck.test.tsx) (8 tests)
  - With provider + VM completeness 13/13: sparse deal still renders
    "13 of 13" + "Every tracked field populated" (proves the deck
    consumes the VM, not local metrics)
  - With provider + VM honest-zero completeness: hydrated deal still
    renders "0 of 13" + the VM-supplied missing list (proves the deck
    does NOT silently fall back to local when the VM is present)
  - With provider + intermediate completeness percentage: rendered
    unchanged
  - Without provider, hydrated deal: local metrics produce
    "PROFILE · 13 of 13" + "Every tracked field populated"
  - Without provider, sparse deal: local metrics produce
    "PROFILE · 0 of 13" + the joined missing-fields footer
  - Static-source pin: `useOptionalDealIntelligence` import present
  - Static-source pin: local `deriveDealCockpitMetrics` import still
    present (fallback preserved)
  - Static-source pin: no fake-fallback placeholder strings around
    the completeness numbers (`profileCompletenessPct ?? '…'`,
    `populatedFieldCount ?? '…'`, etc.)

- Existing tests still green:
  - [src/deals/DealHeader.test.tsx](../src/deals/DealHeader.test.tsx)
    (10 tests) — Phase 125E command-hero pins unchanged
  - [src/deals/BankerDealWorkspace.test.tsx](../src/deals/BankerDealWorkspace.test.tsx)
    (10 tests) — Phase 125B cockpit pins unchanged
  - [src/deals/BankerDealWorkspace.intelligence.test.tsx](../src/deals/BankerDealWorkspace.intelligence.test.tsx)
    (8 tests) — Phase 123B beacon contract unchanged
  - [src/shared/dealIntelligenceViewModel.test.ts](../src/shared/dealIntelligenceViewModel.test.ts)
    (39 tests) — Phase 123A view-model unchanged
  - [src/shared/dealIntelligenceContext.test.tsx](../src/shared/dealIntelligenceContext.test.tsx)
    (8 tests) — Phase 123B context unchanged
  - [src/navigation/workspaceScreens.test.ts](../src/navigation/workspaceScreens.test.ts)
    (24 tests) — Phase 123A registry unchanged

## 6. Phase 123D preview

The next phase will continue the cockpit-internal consolidation,
still inside BankerDealWorkspace only:

1. **`DealBlockers` (Attention Console).** Switch its header status
   pill ("blocked" / "at-risk" / "clear") to read from
   `useOptionalDealIntelligence().blockerStatus`. The list of
   signals continues to come from the existing pipeline until the
   VM exposes per-card signal grouping.
2. **`DealAutopilotPanel`.** Reconcile the panel's local priority
   ladder with `vm.nextBestAction`, then switch the empty-state
   branch to consume the VM. Larger reconciliation; sequenced after
   the blocker swap so the autopilot's local logic is verifiable
   against the shared VM signal-by-signal.

Manager / Team / Executive / Portfolio surfaces remain on their
current per-screen derivation. Each will mount
`<DealIntelligenceProvider>` and start consuming the VM in its own
phase, gated by the beacon contract introduced in Phase 123B.

## 7. Acceptance criteria

- [x] DealHeader wired to `useOptionalDealIntelligence()` with
      identity / banker / stage / status / closure preferring VM
- [x] DealMetricDeck wired to `useOptionalDealIntelligence()` with
      completeness numbers + missing-fields list preferring VM
- [x] Both cards still work standalone when no provider is mounted
- [x] No fake fallback strings injected anywhere
- [x] Hidden beacon contract from Phase 123B preserved
- [x] No DealAutopilotPanel / DealBlockers / DealStageProgressionCard /
      Documents / Tasks / CreditMemo refactor
- [x] No Manager / Team / Executive / Portfolio refactor
- [x] No Dataverse schema / Phase 122 mapping / route / App.tsx change
- [x] Existing DealHeader.test.tsx + BankerDealWorkspace.test.tsx +
      Phase 123A/B test suites still green
- [x] `npm run build` green
