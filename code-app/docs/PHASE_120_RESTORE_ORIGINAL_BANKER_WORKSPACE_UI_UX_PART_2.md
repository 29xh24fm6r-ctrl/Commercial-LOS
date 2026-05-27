# Phase 120 — Restore Original Banker Workspace UI/UX, Part 2

**Status:** **Shipped.** Second restoration slice from the Phase
118 backlog — bucket-A wave 2 (composition-only). Four restored
surfaces complete the original Banker Workspace UI/UX restoration
that started in Phase 119.

Phase 121 (the deferred live data seed) is now unblocked: the
banker workspace is restored to a richer-than-Phase-117 UI/UX
that is worth screenshotting against the original product. The
deferred-status note at the top of Phase 121 still applies —
execute the seed only after this phase ships.

Related canonical sources:
- [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) — the backlog this phase consumes from. §5.1 items 5–8 + §5.7 wave 2.
- [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md) — wave 1 (stage-grouped pipeline + 3 derived KPI tiles + My-Tasks rail). Phase 120 builds on the same patterns.
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the shell every restoration phase extends. Every Phase 117 invariant is preserved.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants this phase explicitly does not touch.
- [PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md) — deferred seed runbook now unblocked.

---

## 1. What this phase restores

Four surfaces, all from the Phase 118 §5.1 wave-2 list:

| # | Surface | Inventory § | Files touched |
| --- | --- | --- | --- |
| 1 | **Activity tab** — banker-cross-deal recent-updates feed | §5.1.5 | [src/banker/BankerActivityFeed.tsx](../src/banker/BankerActivityFeed.tsx) (new), [src/banker/BankerShell.tsx](../src/banker/BankerShell.tsx) |
| 2 | **Due Diligence tab** — banker-cross-deal documents read view | §5.1.6 | [src/banker/BankerDueDiligenceView.tsx](../src/banker/BankerDueDiligenceView.tsx) (new), [src/banker/BankerShell.tsx](../src/banker/BankerShell.tsx) |
| 3 | **Per-row stale badge in PersonalPipeline** | §5.1.7 | [src/banker/PersonalPipeline.tsx](../src/banker/PersonalPipeline.tsx), [src/shared/analytics/bankerPersonalActivity.ts](../src/shared/analytics/bankerPersonalActivity.ts) |
| 4 | **Workspace switcher in sidebar footer** | §5.1.8 | [src/banker/BankerShell.tsx](../src/banker/BankerShell.tsx), [src/workspaces/BankerWorkspace.tsx](../src/workspaces/BankerWorkspace.tsx) |

Tab bar grows from **5 tabs to 7 tabs** (added Due Diligence + Activity).
Sidebar gains a **workspace-switcher footer block** rendering the
single-workspace state honestly.

---

## 2. Implementation summary

### 2.1 `src/banker/BankerActivityFeed.tsx` (new)

A new card component mounted by the `activity` tab. Loads
`BankerWorkQueueData` via the existing `loadBankerWorkQueueData`
loader (no new query). Derives a recent-updates feed from the
`modifiedon` / `generatedAt` timestamps already on deals + tasks +
outstanding docs + pending-review docs + memos. Sorts descending,
caps at 20 rows.

The card's subtitle clarifies this is NOT the per-deal
`ActivityTimeline` (which queries `cr664_dealtimelineevent`) —
that table is not queried banker-cross-deal anywhere in the app
today, and Phase 120 does not add a new loader for it. Operators
who need the full per-deal event history open the deal workspace.

Honest empty-state: `"No recent updates on your active deals…"`
when no work-queue row carries a parseable timestamp. No
fabricated rows.

The exported `deriveActivityRows(data)` is pure / deterministic /
side-effect-free so the derivation can be tested in isolation.

### 2.2 `src/banker/BankerDueDiligenceView.tsx` (new)

A new card component mounted by the `due-diligence` tab. Loads
`BankerWorkQueueData` (same loader; no new query). Renders two
read-oriented sections: Outstanding documents + Pending-review
documents. Each row shows the document name, deal context, due
date, requested/received dates, and a navigation affordance to
the deal workspace.

**Read-only by deliberate scope.** No Request / Mark Received /
Mark Reviewed / Create Review Task buttons. Those governed
writes live on `MyWorkQueue` (Action Queue tab) + the per-deal
`DealDocuments` card. The Due Diligence tab is the overview,
not a second write surface.

Honest empty-state: `"No outstanding or pending-review documents
on your active deals."`

### 2.3 `src/banker/PersonalPipeline.tsx`

Each `DealRow` now renders a `<Badge variant="atRisk">Stale 14d+
</Badge>` next to the deal name when `lastActivityOn` is ≥ 14
days ago. The threshold imports from
`STALE_ACTIVITY_DAYS` in
[src/shared/analytics/bankerPersonalActivity.ts](../src/shared/analytics/bankerPersonalActivity.ts)
(now exported from that module — same threshold the Phase 119
"Stale 14d+" KPI tile uses, so the tile count and the badged-row
count agree).

Missing / unparseable `lastActivityOn` → no badge (honest, never
silently treated as stale).

### 2.4 `src/banker/BankerShell.tsx` + `src/workspaces/BankerWorkspace.tsx`

- `BankerShell` now takes a `workspaceName: string` prop.
- `BankerWorkspace` reads `useBootstrap()` and passes
  `bootstrap.workspaceName` through. Bootstrap is the
  authoritative entitlement source (it resolves
  `cr664_platformuser._cr664_primaryworkspace_value` →
  `cr664_platformworkspace.cr664_workspacename`).
- The shell's `ShellTab` union extended with `'due-diligence'`
  and `'activity'`. `NAV_ITEMS` grew from 5 to 7 entries.
- `TabContent` switch adds two new cases mounting the new card
  components.
- `Sidebar` gains a `WorkspaceSwitcher` block above the identity
  card. It renders the single-workspace state honestly: the
  current workspace label + a "Current" pill + an italic hint
  "Only one workspace is entitled to your account." No combobox,
  no listbox, no interactive control. The block is a `<div
  role="group" aria-label="Workspace switcher (only one workspace
  available...)">` so screen readers communicate the lack of
  options.

A future phase that wires up multi-workspace entitlements (the
legacy `cr664_workspaceentitlement` table is unpopulated today;
see `src/bootstrap/bootstrapFlow.ts` `New chain` comment) would
upgrade this control to interactive — at which point the test
that pins "no combobox / no listbox / no button" would be
intentionally updated alongside the entitlement loader.

---

## 3. Regression tests added

| Surface | Test file | New / extended assertions |
| --- | --- | --- |
| Activity tab — renders for entitled banker | `src/banker/BankerShell.test.tsx` | new describe block, 2 cases |
| Activity feed — empty / error / disclaimer | `src/banker/BankerActivityFeed.test.tsx` (new) | 4 cases |
| Activity feed — derivation purity | same | 4 cases |
| Activity feed — static-source pins | same | 3 cases |
| Due Diligence tab — renders for entitled banker | `src/banker/BankerShell.test.tsx` | new describe block, 2 cases |
| Due-Diligence view — empty / populated / no-write-buttons / error / no-forbidden-vocab | `src/banker/BankerDueDiligenceView.test.tsx` (new) | 5 cases |
| Due-Diligence view — static-source pins | same | 4 cases |
| Stale badge — appears at 14d+ | `src/banker/PersonalPipeline.test.tsx` | new case |
| Stale badge — absent on fresh rows | same | new case |
| Stale badge — handles missing/invalid date | same | new case |
| Workspace switcher — current name + "Current" pill | `src/banker/BankerShell.test.tsx` | new describe block, 4 cases |
| Workspace switcher — single-workspace hint copy | same | included above |
| Workspace switcher — fallback on blank workspaceName | same | included above |
| Workspace switcher — no combobox / listbox / button | same | included above |
| Existing — sidebar nav count 5 → 7 | same | updated existing case |
| Existing — tab bar count 5 → 7 | same | updated existing case |
| Existing — Due Diligence "not rendered" → flipped | same | Due Diligence assertion removed; Contacts / Alerts still absent |

The Phase 118 release-candidate snapshot pin now also requires
`docs/PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md`
to exist on disk.

---

## 4. Invariants preserved

Phase 120 is composition-only. Every constraint from prior phases
continues to hold.

### 4.1 Permission-before-render

The shell still mounts only inside `BankerProvider`. The new tabs
+ workspace-switcher render as children of the already-permitted
shell. The two new card components call `useBanker()` so they
also fail-closed if mounted outside a `BankerProvider`.

### 4.2 Fail-closed access

Both new components query `loadBankerWorkQueueData(bankerId)` —
the same banker-FK-scoped two-step loader used everywhere else.
No restored surface bypasses the existing filter contract.

The workspace switcher reads from the existing bootstrap result
only — it does NOT query the `cr664_workspaceentitlement` table.
If the entitlement model ever surfaces multiple workspaces, that
work belongs to a separate, governed phase.

### 4.3 No fabricated / sample data

- Activity feed: each row corresponds to a real
  `modifiedon` / `generatedAt` timestamp on a real work-queue
  row. Rows without a parseable timestamp are skipped honestly.
- Due Diligence view: each row corresponds to a real document
  row in `outstandingDocuments` / `pendingReviewDocuments`. No
  sample documents are emitted.
- Stale badge: shown only when the underlying `lastActivityOn`
  parses to a date ≥ 14d ago. No badge on missing / unparseable
  dates.
- Workspace switcher: renders only the bootstrap-resolved
  workspace name. When `workspaceName` is blank/whitespace, it
  falls back to the literal string `"Banker Workspace"` (fail-
  closed display, not a fabricated entitlement claim).

### 4.4 No fallback dashboards

No `if (no data) return mockShell` branch is added anywhere.
Empty states stay honest.

### 4.5 No new Dataverse queries

Both new card components reuse `loadBankerWorkQueueData`. The
workspace switcher reuses the existing bootstrap result. Zero
new queries are introduced.

### 4.6 No new governed writes

Neither new tab introduces a write action. The Due Diligence
tab is intentionally read-only and the static-source pin
asserts no `markDocumentReceived` / `markDocumentReviewed`
import. The Activity feed has no buttons that mutate state.

### 4.7 No email-lane changes

- BankerShell.tsx still imports no `Office365OutlookService`,
  contains no `SendEmailV2(...)` callsite, imports no `sendXEmail`
  action.
- BankerActivityFeed.tsx: same static-source pins (asserted in
  its test file).
- BankerDueDiligenceView.tsx: same static-source pins (asserted
  in its test file).
- PersonalPipeline.tsx: the stale-badge addition does not touch
  the email lane.
- bankerPersonalActivity.ts: only the `export` keyword was
  prepended to the existing `STALE_ACTIVITY_DAYS` constant.

The Phase 110 communication-lane release lock continues to pass.

### 4.8 Right-rail "Closing soon — Not a calendar integration"

Unchanged. Phase 120 touched neither the Closing-soon panel nor
the My Tasks rail panel.

### 4.9 Phase 119 KPI tiles + My Tasks panel

Unchanged. The 9 KPI tiles + the My Tasks rail panel from Phase
119 continue to mount and render, and their tests continue to
pass.

### 4.10 Phase 117 intentional omissions still absent

- No `Contacts` tab (no underlying surface).
- No `Alerts` tab (no underlying surface).
- No `New Deal` action button (no governed write).
- No `Log Activity` action button (no governed write).

The test file's "no fake routes" assertion was updated to drop
`Due Diligence` (which IS now intentional and governed) but
still pins the absence of Contacts and Alerts.

---

## 5. What this phase explicitly does NOT do

These remain in the inventory but are deferred to future phases:

- **Bucket-C loader phases** — YTD-closed / win-rate /
  pipeline-weighted / high-probability / global search.
  Inventory §5.3. Each requires either a new historical loader
  or schema confirmation (`cr664_probability`).
- **Bucket-D governed writes** — `New Deal` button + `Log
  Activity` button. Must ask first; Phase 110 scope-extension
  decision required.
- **Bucket-E upstream-blocked** — Today's Schedule rail
  (calendar), Cross-sell widgets (Copilot), Contacts entity,
  Vendors entity.
- **Bucket-F visual polish pass** — Phase 118 §5.2. Should run
  after Phase 121 (data seed) is executed against the now-
  restored workspace.
- **Per-deal Activity Timeline aggregation** — a banker-cross-
  deal query of `cr664_dealtimelineevent` would surface
  richer activity than the Phase 120 modifiedon-derived feed.
  Out of scope here because it requires a new Dataverse query;
  Phase 120's brief explicitly forbids that.

---

## 6. Verification

### 6.1 CI gates

- `npm test -- --run`: full suite passes. New / extended cases:
  - `bankerPersonalActivity.test.ts` — unchanged (the
    `STALE_ACTIVITY_DAYS` constant export does not change
    derivation behavior).
  - `BankerShell.test.tsx` — 9 new test cases (Activity tab,
    Due Diligence tab, Workspace switcher); 3 updated cases
    (sidebar nav count, tab bar count, Due Diligence assertion
    flipped).
  - `PersonalPipeline.test.tsx` — 3 new stale-badge cases.
  - `BankerActivityFeed.test.tsx` (new) — 11 cases (component
    + derivation + static-source).
  - `BankerDueDiligenceView.test.tsx` (new) — 9 cases
    (component + static-source).
- `npm run build`: clean. No new vite warning beyond the pre-
  existing bundle-size advisory.

### 6.2 Operator gate

Phase 120 is implementation. The honest pre-seed state Phase 120
produces:

- 7 sidebar nav items, 7 tabs.
- Workspace switcher in sidebar footer showing the bootstrap-
  resolved workspace name + "Current" pill.
- All KPI tiles render honest zeros / `$0`.
- Activity tab renders `"No recent updates on your active
  deals…"`.
- Due Diligence tab renders `"No outstanding or pending-review
  documents…"`.
- Pipeline tab renders the empty-state card.
- Right rail: Closing soon empty + My Tasks empty.

After this phase ships, [PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md)
is unblocked. The operator can run §3 of that runbook to seed
test data and walk §4 of that runbook against the now-restored
populated workspace.

### 6.3 Operator-side `pac code push`

Required for this phase — code did change (2 new React source
files + 3 edited React files + 1 modified shared module). Run
`pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d
--solutionName CommercialLendingLOS` after merging.

---

## 7. Cross-references

- [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md §5.1 items 5–8](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) — the backlog this phase implements.
- [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md §5.7 wave 2](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) — the recommended sequence Phase 120 follows.
- [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md) — wave 1.
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the shell this phase extends.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane lock this phase does not touch.
- [PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md) — deferred seed runbook now unblocked.
- `src/banker/BankerActivityFeed.tsx` (new) + `BankerActivityFeed.test.tsx` (new).
- `src/banker/BankerDueDiligenceView.tsx` (new) + `BankerDueDiligenceView.test.tsx` (new).
- `src/banker/PersonalPipeline.tsx` — per-row stale badge added.
- `src/banker/BankerShell.tsx` — 2 new tabs + workspace switcher + workspaceName prop.
- `src/workspaces/BankerWorkspace.tsx` — reads `useBootstrap()` + passes through.
- `src/shared/analytics/bankerPersonalActivity.ts` — `STALE_ACTIVITY_DAYS` now exported.
- `src/bootstrap/bootstrapFlow.ts` — the authoritative entitlement source the workspace switcher reads via `useBootstrap()`.
