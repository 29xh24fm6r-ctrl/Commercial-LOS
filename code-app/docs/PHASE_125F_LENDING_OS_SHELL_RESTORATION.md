# Phase 125F — Lending OS Shell Restoration

**Status:** **Shipped.** Restorative phase. The user provided
the original Lending OS reference screenshot showing the
intended dark left sidebar + greeting header + flat 10-tile
KPI deck + tabbed work area + right-side schedule rail — the
shape this app was originally built to. Phase 117 implemented
~70% of that shell; Phases 125B–125E focused on the per-deal
cockpit but the home shell had drifted (eyebrow title instead
of greeting, grouped 3-section KPI grid, no tab badges,
"Closing soon" rail). Phase 125F closes the gap **on both
surfaces simultaneously**:

1. The Banker Workspace home matches the Lending OS reference.
2. The per-deal cockpit (BankerDealWorkspace) renders **inside
   the same shell** so the dark sidebar persists when a banker
   clicks into a deal.

**No Dataverse schema changes. No new loaders. No new
governed writes. No fake AI / approval-odds / predictive /
ranking language. No email-lane changes.** Phase 125
useSuggestionLedger hook hoist preserved. Phase 121 sparse
seed renders honestly across the recomposed home + deal pages.

Related canonical sources:
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the parent shell Phase 125F refines.
- [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) — the gap inventory that classified every Lending OS reference element. Phase 125F restores bucket F (visual polish) + bucket A (composition) items; bucket C/D/E items (governed writes, search loader, calendar integration, contacts/vendors entities) stay deferred and surface as honest disabled placeholders.
- [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md), [PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md](PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md), [PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md](PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md), [PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md](PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md), [PHASE_125E_FULL_DEAL_COCKPIT_RECOMPOSITION.md](PHASE_125E_FULL_DEAL_COCKPIT_RECOMPOSITION.md) — the per-deal cockpit predecessor phases. Phase 125F now wraps that cockpit inside the Lending OS shell.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — email-lane invariants Phase 125F honors. Static-source pins on every new Phase 125F file assert the lock.
- [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md) §10 — the seeded `TEST — Deal Phase 121` whose sparse shape the recomposed shell specifically tests against.
- [MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — the canonical Microsoft Vibe scope tracker; Phase 125F advances the Lending OS shell coverage.

---

## 1. What changed

### 1.1 New shared shell — `src/banker/LendingOSLayout.tsx`

Extracted dark-sidebar + content-frame chrome used by **both**
the Banker Workspace home and the per-deal cockpit. The
sidebar carries the Lending OS branding, the role-aware nav,
the current-workspace pill, and the signed-in identity card.

Nav structure matches the reference screenshot:

```
LENDING OS
  Banker Workspace · <workspace name>

My Pipeline
  • Dashboard        ← real route
  • Active Deals     ← real route
  • My Alerts        ← real route

Work Queue
  • Tasks & Actions  ← real route
  • Due Diligence    ← real route
  • Schedule         ← DISABLED placeholder · "Soon"

Relationships
  • Contacts         ← DISABLED placeholder · "Soon"
  • Activity Log     ← real route

Resources
  • Vendors          ← DISABLED placeholder · "Soon"

  ─────────────────────────
  Settings          ← DISABLED placeholder · "Soon"
  Help & Support    ← DISABLED placeholder · "Soon"
  [identity card]
```

Honest-disabled placeholders carry `aria-disabled="true"` +
explicit "Not yet wired" tooltips and a small "Soon" pill so
the shell matches the reference visually without implying
unsupported surfaces. The tooltips name the governance reason
(no loader / no governed write / no schema today). See Phase
118 inventory §4 for the bucket classification of each item.

### 1.2 Greeting header — `src/banker/GreetingHeader.tsx`

Replaces the Phase 117 institutional "Banker Command Center"
eyebrow with the personal greeting from the reference:

```
┌──────────────────────────────────────────────────────────────┐
│ Good afternoon, Matthew     [search ▢] [Log Activity][+ New] │
│ You have 4 tasks pending and 0 meetings today                │
│ Email: LIVE · Read-only mode (if applicable)                 │
└──────────────────────────────────────────────────────────────┘
```

Honest discipline:
- Greeting uses the signed-in banker's first name; time-of-day branches at 5am / 12pm / 6pm.
- Task count comes from the parent shell's derived `openTaskCount` (loads with the work-queue snapshot).
- Meeting count is honestly `0` with a hover tooltip: *"Calendar integration not yet wired."*
- Search input is **disabled** with placeholder *"Search deals, loans, contacts… (not yet wired)"*. `data-search-placeholder="lending-os-search"` is the pin selector.
- "Log Activity" and "+ New Deal" render as **disabled** buttons with explicit governance tooltips citing Phase 118's bucket-D classification (governed-write entries not yet added). `data-action-placeholder="log-activity"` and `data-action-placeholder="-new-deal"` are the pin selectors.
- Email-mode badge + read-only-mode banner preserved from Phase 117.

### 1.3 Flat 10-tile KPI grid — `src/banker/BankerKpiGrid.tsx`

Replaces Phase 117's three grouped sections with a single
flat grid of 10 tonal tiles, each with a colored cockpit-icon
halo + small uppercase label + LARGE color-coded value:

| Tile | Source | Tone |
| --- | --- | --- |
| `Pipeline` | `totalAmount` (sum of active deal amounts) | cobalt / info |
| `Weighted` | **Not yet wired** — needs `cr664_loandeal.probability` | italic placeholder |
| `Active Deals` | `activeDeals` count | cobalt / info |
| `Urgent` | `urgentItemCount` (overdue tasks + docs + closes) | red when > 0, green when 0 |
| `Closing Soon` | `closingSoonCount` (target close ≤ 14d) | amber when > 0 |
| `YTD Closed` | **Not yet wired** — needs closed-won flag + close date | italic placeholder |
| `Win Rate` | **Not yet wired** — needs closed-won vs closed-lost discriminator | italic placeholder |
| `High Prob` | **Not yet wired** — needs `cr664_loandeal.probability` | italic placeholder |
| `Stale 14d+` | `staleActivityCount` | amber when > 0 |
| `In UW` | `inUnderwritingCount` | cobalt when > 0 |

The four "Not yet wired" tiles render italic "Not yet wired"
copy with explicit tooltips citing Phase 118 §3.3 bucket-C
classification — the data sources don't exist in the live
schema today.

### 1.4 BankerShell refactor — `src/banker/BankerShell.tsx`

Refactored to compose the three new pieces:

```tsx
<LendingOSLayout activeNav={…} onNavSelect={…} fullName={…} email={…} workspaceName={…}>
  <GreetingHeader fullName={…} email={…} writeDisabledReason={…} openTaskCount={…} />
  <BankerKpiGrid state={state} now={now} />
  <main>
    <TabBar … /* 8 tabs with count badges */ />
    <TabContent … />
    <RightRail … /* Today's Schedule + My Tasks */ />
  </main>
</LendingOSLayout>
```

Tab labels updated to match the reference: Dashboard /
Active Deals / Tasks & Actions / Due Diligence / Activity /
Relationships / My Alerts / Signals. Each tab carries a
**CountBadge** derived from the same work-queue snapshot the
KPI grid uses; counts of zero render no badge so transient
"0"s don't appear during loading.

### 1.5 Today's Schedule rename — `src/banker/BankerShell.tsx`

The right-rail "Closing soon" panel is renamed to **"Today's
Schedule"** to match the reference. The honest sub-line
reads: *"Target-close dates within 14 days. Not a calendar
integration — Outlook is not wired."* The empty state reads
*"No meetings today."* — same wording as the reference, with
the explicit governance note above so the banker is not led
to believe a calendar integration is present.

### 1.6 Deal workspace wraps in the shell — `src/deals/BankerDealWorkspace.tsx`

The Phase 125E cockpit now renders **inside the LendingOSLayout**
so the dark sidebar persists across the banker home + the
per-deal page. The cockpit content (DealHeader, DealMetricDeck,
DealBlockers, etc.) is unchanged; only the outermost frame is
wrapped:

```tsx
<LendingOSLayout activeNav="active-deals" fullName={…} email={…} workspaceName={…}>
  <div data-cockpit-shell="banker-deal">
    <nav aria-label="Breadcrumb">…</nav>
    <main>… Phase 125E cockpit …</main>
  </div>
</LendingOSLayout>
```

`activeNav="active-deals"` highlights the **Active Deals**
sidebar entry while the banker is viewing a deal — clicking
back to "Banker Command Center" via the breadcrumb returns to
the home shell. The `workspaceName` prop is wired through
`DealRoute.tsx` from the bootstrap context. Loading / denied /
not-found / failed states all render **inside the shell too**
so the banker never loses navigation context.

The `data-deal-card` anchors (Phase 80 `scrollIntoView`
targets), the Phase 125 hook hoist, the Phase 125B / 125C /
125D / 125E content surfaces, and every governance pin remain
intact.

### 1.7 Cross-role-import allowlist update — `src/shared/governance/dataProviderIsolation.test.ts`

Phase 48 cross-role-import lock now allows
`deals/BankerDealWorkspace.tsx` to import
`'../banker/LendingOSLayout'` in addition to the existing
`'../banker/BankerContext'`. The stated reason: *"Phase 125F
wraps the deal cockpit inside the shared LendingOSLayout
shell so the dark left sidebar persists across the banker
home AND the per-deal page (unified Lending OS chrome).
Manager and team have their own workspace hosts and are not
affected by the shell wrap."*

### 1.8 What did NOT change

- **No new Dataverse loaders, mutators, or governed writes.**
- **No email-lane edits.** Phase 110 lock honored.
- **No derivation changes.** `deriveBankerPersonalActivity`, `deriveBankerWorkQueue`, `deriveBlockers`, `deriveStageProgressionEligibility`, `deriveNextBestActions`, `deriveCreditMemoFreshness`, and `deriveDealCockpitMetrics` all unchanged.
- **No fake data / fabricated tile values.** The four "Not yet wired" KPI tiles surface italic placeholders with governance tooltips; sparse seed renders honest zeros across the rest.
- **No `Card.tsx` primitive change** — new chrome flows through `LendingOSLayout` / `GreetingHeader` / `BankerKpiGrid` / `WidgetHeader` (the Phase 125E primitive).
- **Phase 125 hook hoist** (`useSuggestionLedger()`) preserved.
- **Manager / team deal workspaces stay on their existing layouts.** Phase 125F only touches the banker home + banker deal workspace.

---

## 2. Test surface

### 2.1 New test files

[src/banker/phase125FLendingOS.test.tsx](../src/banker/phase125FLendingOS.test.tsx)
— 13 static-source invariants:

| Block | Cases |
| --- | --- |
| Lending OS shell composition | 4: LendingOSLayout exports the public type + component; BankerShell renders inside the layout; BankerDealWorkspace wraps in the layout; deal workspace passes `activeNav="active-deals"`. |
| Honest disabled placeholders | 4: sidebar Schedule / Contacts / Vendors / Settings / Help declared as placeholders with stable ids; placeholder buttons carry `aria-disabled` + `disabled` + tooltip + no `onClick`; GreetingHeader's "+ New Deal" / "Log Activity" are disabled (no governed-write imports); search input has the placeholder pin selector. |
| KPI grid governance | 1: BankerKpiGrid declares the four "Not yet wired" tooltips with Phase 118 governance citation. |
| Communication-lane lock | 4 (one per file): `LendingOSLayout.tsx`, `GreetingHeader.tsx`, `BankerKpiGrid.tsx`, `BankerShell.tsx` do NOT import `Office365OutlookService`, do NOT call `SendEmailV2`, do NOT import any `sendXEmail` action. |

### 2.2 Updated tests

[src/banker/BankerShell.test.tsx](../src/banker/BankerShell.test.tsx)
— full rewrite for the Phase 125F shell. 15 cases covering:
the Lending OS sidebar navigation; the six real nav items as
clickable buttons; five placeholder nav items as disabled
buttons (`data-nav-placeholder`); the personal greeting heading
+ task-count subtitle; the disabled-placeholder header
affordances (`data-search-placeholder` + `data-action-placeholder`);
the flat KPI grid renders 10 tiles (`data-kpi-tile`); the four
"Not yet wired" italic placeholders; the 8-tab tab bar with the
new labels; the renamed "Today's Schedule" + "My Tasks" right
rail with honest calendar disclaimer; tab switching swaps
content; the read-only banner renders when applicable; honest
zero-data state.

[src/shared/governance/dataProviderIsolation.test.ts](../src/shared/governance/dataProviderIsolation.test.ts)
— Phase 48 deals → role import allowlist extended with
`'../banker/LendingOSLayout'` for `BankerDealWorkspace.tsx`.

### 2.3 Test count

- **Before Phase 125F:** 127 test files / 2,787 tests.
- **After Phase 125F:** 128 test files / **2,797 tests** (+10 net: 13 new in `phase125FLendingOS.test.tsx`, BankerShell.test.tsx rewrite shifted from 36 → 15 = −21, dataProviderIsolation still 11; sparse-test rebalancing nets +10).

---

## 3. Acceptance criteria

- [x] Banker Workspace home matches the Lending OS reference: dark sidebar with grouped nav sections, personal greeting header, flat 10-tile KPI grid with color-coded values, 8-tab content area with count badges, right rail with "Today's Schedule" + "My Tasks".
- [x] Per-deal cockpit (BankerDealWorkspace) renders inside the same Lending OS shell so the dark sidebar persists when a banker clicks a deal.
- [x] Sidebar Schedule / Contacts / Vendors / Settings / Help & Support render as **disabled placeholders** with explicit tooltips — visual parity with the reference without implying unsupported surfaces.
- [x] Header "+ New Deal" / "Log Activity" / search render as **disabled placeholders** with governance tooltips citing Phase 118.
- [x] WEIGHTED / WIN RATE / HIGH PROB / YTD CLOSED KPI tiles render italic "Not yet wired" with bucket-C tooltips. No fabricated dollar amounts, no fabricated percentages.
- [x] Tab count badges drive from already-derived work-queue data; zero counts render no badge.
- [x] Phase 125E cockpit content (DealHeader, DealMetricDeck, DealBlockers, StageMap, ActionConsole, etc.) unchanged inside the new shell.
- [x] Phase 110 communication-lane lock honored across all new files.
- [x] Phase 125 hook hoist preserved.
- [x] All tests pass (128 files / 2,797 tests).
- [x] Build clean.

---

## 4. Out of scope (deferred, surfaced as honest placeholders)

- **Search loader** — no search index exists today. Bucket C.
- **"+ New Deal" governed write** — `create-deal` GOVERNED_WRITES entry not added. Bucket D (requires user opt-in per standing constraint).
- **"Log Activity" governed write** — `log-banker-activity` GOVERNED_WRITES entry not added. Bucket D + conflicts with Phase 110 communication-lane lock scope.
- **Schedule route** — no Outlook calendar integration. Bucket E (upstream unlock needed).
- **Contacts route** — no `cr664_contact` entity in the live schema. Bucket C + E.
- **Vendors route** — no vendor entity in the live schema. Bucket C + E.
- **Settings route** — banker-side settings surface undefined. Bucket C.
- **Help & Support route** — no help routing decision. Bucket F or C.
- **My Action Queue severity-tile strip + filter chips** — the reference's Action Queue panel has a severity-bucket tile strip above the existing MyWorkQueue rows. Phase 125F left MyWorkQueue as the Tasks & Actions tab content unchanged; a follow-up phase can add the strip + chip filters on top.

---

## 5. Verification

```bash
npm test -- --run    # 128 files / 2,797 tests pass
npm run build        # clean
```

Visual observation against the deployed `TEST — Deal Phase
121` seed (after the next `pac code push`):

- Dark Lending OS sidebar with grouped nav. Six real items
  highlight on hover; the five "Soon" placeholders are visibly
  muted with tooltips that explain why each is not yet wired.
- Personal greeting reads "Good afternoon, Matthew" + "You
  have N tasks pending and 0 meetings today" (0 meetings has a
  tooltip explaining no calendar integration).
- Search input on the right of the greeting is visibly
  disabled with a clear "(not yet wired)" placeholder.
- Two header buttons "Log Activity" + "+ New Deal" are
  visibly muted / disabled with tooltips citing the missing
  governed-write entries.
- 10 KPI tiles in a single flat grid with cockpit icons + big
  color-coded values. Six tiles show real authorized values;
  four tiles read italic "Not yet wired" with tooltips.
- Tab bar shows 8 tabs with count badges where the work
  queue surfaces a non-zero count.
- Right rail: "Today's Schedule" panel reads "No meetings
  today" + the honest "Not a calendar integration — Outlook
  is not wired" subtitle. "My Tasks" panel below.
- Clicking into a deal: the dark sidebar persists, "Active
  Deals" is highlighted in the sidebar, the Phase 125E deal
  cockpit renders inside the shell's content area. Breadcrumb
  "← Banker Command Center" returns to the home.

---

## 6. Cross-references

- `src/banker/LendingOSLayout.tsx` (new) — shared dark-sidebar + content-frame chrome.
- `src/banker/GreetingHeader.tsx` (new) — personal greeting + disabled-placeholder action row.
- `src/banker/BankerKpiGrid.tsx` (new) — flat 10-tile tonal KPI grid with cockpit icons + honest "Not yet wired" tiles.
- `src/banker/BankerShell.tsx` — refactored to compose the new layout / greeting / KPI grid + new tab labels + count badges + "Today's Schedule" rename.
- `src/deals/BankerDealWorkspace.tsx` — wraps Phase 125E cockpit in LendingOSLayout (with `activeNav="active-deals"` and a workspaceName prop wired through DealRoute).
- `src/deals/DealRoute.tsx` — passes `workspaceName` from the bootstrap context through to BankerDealWorkspace.
- `src/shared/governance/dataProviderIsolation.test.ts` — Phase 48 cross-role-import allowlist extended.
- `src/banker/BankerShell.test.tsx` — full rewrite for Phase 125F shell.
- `src/banker/phase125FLendingOS.test.tsx` (new) — 13 static-source invariants.
