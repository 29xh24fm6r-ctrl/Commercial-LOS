# Phase 117 — Banker Workspace UX Parity

**Status:** **Shipped.** The Banker Workspace now renders behind a
product-grade shell — dark left sidebar with section nav, header
with workspace title + identity + mode badges, KPI tile grid drawn
from real banker-scoped data, tabbed content area, and a "Closing
soon" right rail. The pre-Phase-117 single-column stack of cards
is gone.

**Zero email-lane changes. Zero governed-write changes. Zero
schema changes. Zero relaxations to permission-before-render.**
The shell renders only inside `BankerProvider`, which fails
closed when the signed-in UPN has no `cr664_Banker` row; the
existing read-only/write-disabled state is now surfaced as a
header banner instead of being a silent attribute on a child
card.

Related canonical sources:
- [src/banker/BankerShell.tsx](../src/banker/BankerShell.tsx) — the new shell. ~640 lines.
- [src/banker/BankerShell.test.tsx](../src/banker/BankerShell.test.tsx) — 22 assertions across 5 describe blocks.
- [src/workspaces/BankerWorkspace.tsx](../src/workspaces/BankerWorkspace.tsx) — collapsed to a single import + composition (was ~120 lines of inline layout).
- [PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md) — the deployment-stabilization phase that landed Matt in the bare stacked-card UX this phase replaces.

> **Restoration backlog + populated-state validation:** This
> phase pins the empty-state shell. Follow-up phases bracket the
> gap to the original product UX:
>
> - [PHASE_118_ORIGINAL_UI_UX_INVENTORY.md](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md) —
>   surface inventory comparing the original Banker Workspace
>   UI/UX against the Phase 117 shell, with an A–F classification
>   per missing element and a sequenced restoration backlog.
> - [PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md) —
>   first restoration slice (bucket-A wave 1: stage-grouped
>   pipeline + 3 new KPI tiles + My-Tasks right-rail panel).
> - [PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md](PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md) —
>   second restoration slice (bucket-A wave 2: Activity tab +
>   Due Diligence tab + per-row stale badges + sidebar-footer
>   workspace switcher). Tab bar grew 5 → 7; sidebar gained a
>   workspace switcher.
> - [PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md) —
>   manual seed reference runbook. The streamlined operator
>   checklist for execution is
>   [PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md).
>   Phase 121 ships with reduced scope (Steps 5–7 skipped) due
>   to Dataverse lookup/config blockers — task `cr664_AssignedTo`
>   form-config + doc `cr664_Deal` legacy-target.
> - [PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md) —
>   Dataverse-config phase (explicitly NOT React) that retargets
>   `cr664_documentchecklist.cr664_Deal` (+ candidates on task /
>   memo / draft-section / timeline-event) to `cr664_loandeal`,
>   unblocking the deferred Phase 121 Steps 6 + 7.
> - [PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md) —
>   visual recovery audit. Headline: no archived richer UI
>   exists in the repo; the current shell IS the only banker UI.
>   Audit produces a forward-looking visual-restoration backlog
>   (buckets A / B / C / D) and proposes Phases 123–129.
> - [PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md) —
>   first wave of visual restoration: command-center hero
>   header, KPI grid grouped into Pipeline / Work items /
>   Attention with hero anchor tiles, premium tab bar,
>   accent-striped right-rail panels, polished sidebar +
>   workspace switcher pill, framed empty states. Composition-
>   only; no data / loader / governed-write changes.
> - [PHASE_124_RICH_PIPELINE_STAGE_BOARD.md](PHASE_124_RICH_PIPELINE_STAGE_BOARD.md) —
>   Pipeline tab refactor from flat-table-per-stage to a
>   horizontal Kanban with one lane per canonical non-terminal
>   stage + custom lanes from live env + Stage-unknown
>   fallback. Premium deal cards (name + stale badge + client
>   + status + amount-or-"Amount not set" + target-close-if-real
>   + last-touched). Lane headers carry deal count pill + real
>   amount summary. Terminal stages deliberately excluded
>   because the loader already filters them out.
> - [PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md) —
>   Deal workspace cockpit polish + the React error #310
>   hotfix (hoisted `useSuggestionLedger()` in
>   `DealAutopilotPanel`). DealHeader becomes a hero band,
>   DealBlockers + DealStageProgressionCard signal/reason rows
>   get severity-tinted framed treatment, DealTasks /
>   DealDocuments / CreditMemo / ActivityTimeline /
>   BorrowerCommunication honest-empty states become framed
>   dashed-border cards. No data / loader / governed-write /
>   email-lane changes.
> - [PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md](PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md) —
>   Deal workspace command-center redesign from the live-
>   screenshot design pass. Navy hero band with glass metric
>   strip + two-column cockpit (intelligence left, attention
>   right) + honest "Not set" chips for missing stage / status.
>   Preserves the Phase 125 hook hoist. No data / loader /
>   governed-write / email-lane changes.
> - [PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md](PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md) —
>   Premium polish on top of Phase 125B. Adds the cobalt /
>   teal / cyan / violet accent families to the Phase 79 theme
>   tokens. Adds a horizontal canonical-stage pill rail to
>   DealStageProgressionCard (with a custom-stage fallback
>   for the Phase 121 sparse seed). Adds a layered hero glow
>   to DealHeader. Adds inline-SVG severity glyphs (warning
>   triangle / alert circle / info circle) replacing the
>   color-dot indicator on DealBlockers + Stage Progression
>   signal rows. Adds a cobalt liquid-glass overlay backdrop
>   to the right-rail attention column. Refreshes the
>   DealAutopilotPanel priority stripe palette (cobalt /
>   teal / at-risk). Phase 125 hook hoist preserved. No
>   data / loader / governed-write / email-lane changes.
> - [PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md](PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md) —
>   Bloomberg-Terminal-meets-Apple-Enterprise cockpit
>   redesign. Adds slate cockpit-surface theme tokens
>   (panelBg / deckBg / deckTile / glassPanel / panelBorder),
>   a pure-function deriveDealCockpitMetrics() that produces
>   every KPI / workstream / count-badge value, and six new
>   shared visual primitives (MetricTile / CompletenessRing /
>   WorkstreamBar / CountBadge / SeverityMeter / GlassPanel).
>   Introduces a DealMetricDeck KPI strip (8 tonal tiles +
>   completeness ring + missing-fields readout) and a
>   DealWorkstreamPanel (4 progress bars). Promotes
>   DealBlockers → Attention Console, DealStageProgressionCard
>   → connected-node Stage Map + glass command strip,
>   DealAutopilotPanel → Action Console. Refreshes
>   DealSummary into three tonal grouped sections (identity /
>   pricing / structure). Adds count badges to right-rail
>   Tasks + Documents card headers. Page background flips to
>   the slate panel backdrop. Phase 125 hook hoist preserved.
>   No data / loader / governed-write / email-lane changes.
> - [PHASE_125G_LENDING_OS_COCKPIT_FIT_AND_FINISH.md](PHASE_125G_LENDING_OS_COCKPIT_FIT_AND_FINISH.md) —
>   Fit-and-finish polish after Phase 125F. Stable
>   .cc-kpi-grid / .cc-metric-deck-tiles CSS breakpoints (no
>   orphan tile), DealCockpitNav 8-anchor strip under the
>   deck with smooth-scroll links, Attention Console missing-
>   field chip grouping (Economics / Parties / Timing / Stage
>   & status / Structure), DealHeader "Deal Cockpit" lockup
>   pill + brighter accent, right-rail consistent widget
>   height. No data / loader / governed-write changes.
> - [PHASE_125F_LENDING_OS_SHELL_RESTORATION.md](PHASE_125F_LENDING_OS_SHELL_RESTORATION.md) —
>   Restorative phase that brought the original Lending OS
>   shell back. New LendingOSLayout (dark sidebar, grouped
>   nav, disabled placeholders for unwired routes),
>   GreetingHeader (personal greeting + honest task/meeting
>   count + disabled-placeholder search / Log Activity / New
>   Deal), flat 10-tile BankerKpiGrid with cockpit-icon halos
>   + four "Not yet wired" placeholder tiles for
>   schema-gated metrics, 8-tab bar with count badges,
>   Today's Schedule rename, wraps BankerDealWorkspace inside
>   the same shell. No data / loader / governed-write
>   changes.
> - [PHASE_125E_FULL_DEAL_COCKPIT_RECOMPOSITION.md](PHASE_125E_FULL_DEAL_COCKPIT_RECOMPOSITION.md) —
>   Corrective recomposition pass. Phase 125D's primitives
>   passed but the deployed result still read as stacked
>   cards. Phase 125E rebuilds the page composition:
>   command hero w/ identity slots (no metric strip), 6
>   LARGE tonal KPI tiles + completeness ring, big
>   Attention Console (severity meter + missing-data
>   checklist), large connected-node Stage Map (44/52px),
>   icon-led WidgetHeader on every right-rail widget
>   (Tasks / Documents / Borrower Comm / Memo / Activity /
>   Teams handoffs) with count badges + mini progress bars.
>   Deal Summary demoted to the BOTTOM of the left column.
>   New shared cockpitIcons (16 inline-SVG glyphs) +
>   LargeMetricTile + WidgetHeader primitives + a
>   display-scale typography token. Phase 125 hook hoist
>   preserved. No data / loader / governed-write / email-
>   lane changes.
> - [PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md](PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md) —
>   Relationships + Signals tab visual restoration. Per-client
>   RelationshipMemory rows gain a 3px primary accent left
>   stripe + bumped client-name typography. BankerAutopilotRollup
>   rows gain a severity-tinted left stripe driven by row
>   priority. Both cards' loading / empty states become framed
>   dashed-border cards consistent with the cockpit pattern.
>   All Phase 76 / 78 / 82 / 83 / 100 / 101 derivations + local
>   ledgers + clipboard / mailto handoffs preserved verbatim.
>   New static-source pins assert Phase 110 communication-lane
>   lock holds on both files. No data / loader / governed-write
>   / email-lane changes.

---

## 1. The layout

```
┌────────────┬────────────────────────────────────────────────────────┐
│            │  Header: "Banker Command Center" + mode badges         │
│ OGB         │ (Email: DRY_RUN | LIVE) + optional Read-only banner   │
│ Banker WS  ├────────────────────────────────────────────────────────┤
│            │  KPI grid: 6 tiles                                     │
│ ▸ Overview │  [Active deals] [Pipeline] [Closing soon]              │
│   Pipeline │  [Open tasks ] [Outstanding docs] [Pending reviews]    │
│   Action Q ├────────────────────────────────────────────────────────┤
│   Relation │  Tab bar: Overview | Pipeline | Action Queue |         │
│   Signals  │           Relationships | Signals                       │
│            ├──────────────────────────────────────┬─────────────────┤
│            │                                      │  Closing soon   │
│            │   Tab content (existing cards,       │  (right rail —  │
│            │   re-composed):                      │   derived from  │
│ ◯ M Paller │                                      │   target-close  │
│  mp@bnk.   │   - Overview → ActivitySummary +     │   dates)        │
│            │                MorningCatchUp        │                 │
│            │   - Pipeline → PersonalPipeline      │  Closing-soon   │
│            │   - Action Queue → MyWorkQueue       │  disclaimer:    │
│            │   - Relationships → RelationshipMem  │  "Not a         │
│            │   - Signals → AutopilotRollup        │  calendar       │
│            │                                      │  integration"   │
└────────────┴──────────────────────────────────────┴─────────────────┘
```

### Sidebar (dark navy, sticky)

- **Brand block** — "OGB" mark + "Old Glory Bank · Banker
  Workspace" lockup.
- **Nav list** — five buttons. Each button's `aria-label` is
  `<Section> — <hint>` so screen readers get the same context the
  visible hint text provides.
- **Identity card** — avatar with initials derived from the
  banker's full name + name + email. Fed from `useBanker()`, NOT
  fabricated.

### Header

- **Title block** — eyebrow ("Commercial Lending") + "Banker
  Command Center" + a single conservative subtitle that names the
  data sources (pipeline / tasks / docs) and explicitly disclaims
  performance / predictive / compensation framing.
- **Meta** — current `EMAIL_MODE` badge (DRY_RUN or LIVE; tinted
  per Phase 109 convention) + optional `Read-only mode` badge
  when `writeDisabledReason` is set.
- **Read-only banner** — full-width amber banner appears only
  when `BankerIdentity.writeDisabledReason` is populated. Carries
  the reason text verbatim + the identity chip + the explicit
  statement "Write actions in this workspace remain disabled
  until the underlying issue is resolved." No silent demotion.

### KPI grid

Six tiles, every value computed by `deriveBankerPersonalActivity`
over the banker-scoped `BankerWorkQueueData` the shell loads once.
No fabricated values; zero is honest:

| Tile | Source | Hint |
| --- | --- | --- |
| Active deals | `activeDeals` | "Authorized to you" |
| Pipeline | `totalAmount` (compact-formatted) | "Sum across active deals" — or, when `dealsMissingAmount > 0`, "N deal(s) missing amount" |
| Closing soon | `closingSoonCount` | "Target close ≤ 14 days" |
| Open tasks | `openTaskCount` | "N overdue" when `overdueTaskCount > 0`, else "No overdue tasks" |
| Outstanding docs | `outstandingDocumentCount` | "Awaiting receipt" |
| Pending reviews | `pendingReviewDocumentCount` | "Received, no reviewer yet" |

**Loading + failed states are honest.** Loading renders six
skeleton tiles labeled "Loading…" with em-dash values. Failed
renders a single full-width alert with the error message + a
recovery hint. Neither state fabricates a number.

### Tab bar

Five tabs only — **Overview**, **Pipeline**, **Action Queue**,
**Relationships**, **Signals**. Each tab maps to an existing
banker card. The tabs are `<button role="tab" aria-selected>`
with proper a11y wiring; only one is selected at a time
(pinned by test).

### Tab content

Existing cards, unchanged. The shell composes them under tabs:

| Tab | Cards rendered |
| --- | --- |
| Overview | `PersonalActivitySummary` + `BankerMorningCatchUp` |
| Pipeline | `PersonalPipeline` |
| Action Queue | `MyWorkQueue` |
| Relationships | `RelationshipMemory` |
| Signals | `BankerAutopilotRollup` |

Each card continues to load its own data (no test-surface
refactor). The shell additionally hoists ONE
`loadBankerWorkQueueData(bankerId)` call to power the KPI tiles +
right rail. This means a fresh banker workspace makes the same
banker-scoped query twice — once by the shell, once by
`PersonalActivitySummary`. **Future-phase candidate:** introduce a
shared `BankerDataContext` to dedupe the loads. Not in Phase 117
scope.

### Right rail — Closing soon

Honest derivation: filter `BankerWorkQueueData.deals` for
`targetCloseDate` within the next 14 days, sort by date ascending,
take the first 6. Render as a vertical list of `name + relative
date` rows.

States:
- Loading → "Loading…"
- Failed → "Could not load closing-soon list. Refresh to retry."
- Ready + zero matches → "No deals with a target close in the
  next 14 days."
- Ready + ≥1 matches → list.

**Disclaimer (always visible):** "Derived from target-close dates
on current deals. Not a calendar integration — no events are read
from or written to Outlook / Teams calendars." This is the same
honesty discipline Phase 101 + Phase 110 enforce on summary
handoffs.

---

## 2. What this phase explicitly does NOT do

The brief's reference screenshot described several surfaces that
don't exist in this repo. Phase 117 deliberately omits each one
rather than fabricating UI:

| Brief mention | Status | Why omitted |
| --- | --- | --- |
| "Contacts" tab | **Omitted** | No banker-side contacts UI exists. The closest is the per-deal client/borrower view inside `DealRoute`, but that's deal-scoped, not banker-scoped. Adding a Contacts tab would imply a surface that hasn't been built. |
| "Due Diligence" tab | **Omitted** | The `MyWorkQueue` card already surfaces outstanding documents — that's the actual due-diligence-equivalent surface. Adding a separate DD tab would either duplicate that or imply a workflow that doesn't exist. |
| "Alerts" tab | **Omitted** | The Admin Workspace has Alert Backlog / Audit Anomalies cards; banker-side alerts are not a separate surface. The autopilot signals (under Signals tab) carry the per-deal next-best-action equivalent. |
| "New Deal" header button | **Omitted** | No governed write for banker-initiated deal creation exists. Rendering a button that does nothing — or worse, a button that creates a deal via an ungoverned write — would violate the brief. |
| "Log Activity" header button | **Omitted** | No `cr664_DealTimelineEvent` write path exists for banker-initiated free-form activity. Phases 21 / 22 / 25 / 51 / 55 / 70 / 104 / 105 govern every existing banker write; none of them is a free-form "log activity" surface. Adding the button without an action would be cosmetic-bypass-of-data-guards. |

These all remain **future-phase candidates**, not Phase 117 work:

1. **Banker contacts surface** — would need its own data loader, a
   typed view of `cr664_borrower` and any relationship-link
   schema. Its own brief.
2. **Free-form activity log** — would need a new governed write
   for `EmailLogged` / `CallLogged` / `MeetingLogged` /
   `NoteLogged` with the same audit + timeline coordination
   pattern as Phases 21 / 22 / 25. Its own brief, governance
   review, and pin file.
3. **Banker-initiated deal create** — would need a new governed
   write for `cr664_loandeal` creation with banker ownership
   stamp + Phase-46 correlation-id + Phase-49 audit + Phase-50
   timeline. Its own brief.

Each candidate would expand the brief's "no fake routes" envelope
honestly: ship the data layer + governed write first, then
surface the UI. Not the reverse.

---

## 3. Preserved invariants

| Invariant | How preserved |
| --- | --- |
| **Permission-before-render** | `BankerShell` renders only inside `BankerProvider`. `BankerProvider` fails closed if `cr664_Banker` doesn't resolve. The shell does not relax this in any way. |
| **Read-only / write scoping** | `BankerIdentity.writeDisabledReason` surfaces as both a header badge AND a full-width banner. Write affordances inside child cards already consult `useBanker().systemUserId`; that wiring is unchanged. |
| **Phase 104–110 communication lock** | `BankerShell.tsx` source contains no Office365 import, no `SendEmailV2` call, no `sendDocumentRequestEmail` / `sendBorrowerUpdateEmail` import. Three explicit static-source pins enforce this in `BankerShell.test.tsx`. |
| **Phase 115 Platform User bootstrap** | `BankerShell` consumes `useBanker()` which consumes `useBootstrap()` which is populated by `runBootstrap()` matching against `cr664_platformuser`. Unchanged. |
| **Phase 116 workspace aliases** | The Banker Workspace renders only when a user's `cr664_PrimaryWorkspace` name resolves to `/workspaces/banker` via the Phase 116 alias map. Unchanged. |
| **No fallback dashboards** | The shell does NOT default to "Overview" when child cards fail. If `BankerProvider` fails, the existing `ErrorState` renders. If the shell's KPI load fails, the KPI region renders a `role="alert"` panel with the error message — the cards below still render independently (each with its own load/fail handling). |
| **No fake sample data** | Every metric, every right-rail item, and every identity field is sourced from `BankerWorkQueueData` or `useBanker()`. The test file pins "honest zeros" — a zero-data banker sees `0` across the KPI grid, not a fabricated number. |

---

## 4. Test coverage

`src/banker/BankerShell.test.tsx` — **22 assertions across 5
describe blocks**:

### Shell layout regions (4 tests)
- Sidebar nav renders with all five canonical sections + correct aria-labels.
- Header renders the title + identity (full name + email).
- Tab bar renders with 5 tabs (`role="tab"` × 5).
- Right rail "Closing soon" panel renders with its subtitle.

### KPI grid (3 tests)
- Six tiles labeled correctly when data resolves; `within(kpiGrid)` scope used to avoid colliding with the "Pipeline" tab label and "Closing soon" right-rail title.
- Zero-data state renders honest zeros (`$0` for Pipeline, `0` for each count); no fabricated metric.
- Failed-load state renders an alert region with the error message.

### Tab switching (6 tests)
- Overview tab renders both `PersonalActivitySummary` + `BankerMorningCatchUp` by default.
- Pipeline tab swaps to `PersonalPipeline` and removes Overview content.
- Action Queue tab swaps to `MyWorkQueue`.
- Relationships tab swaps to `RelationshipMemory`.
- Signals tab swaps to `BankerAutopilotRollup`.
- Exactly one tab is `aria-selected` at any time.

### No fake routes / no unsupported claims (4 tests)
- Contacts / Due Diligence / Alerts tabs absent from the rendered DOM.
- "New Deal" / "Log Activity" buttons absent.
- Forbidden Phase 110 vocabulary (`delivered`, `email sent`, `borrower notified`) absent.
- "Not a calendar integration" disclaimer present on the right rail.

### Permission / read-only state (2 tests)
- Read-only banner renders within `role="status"` when `writeDisabledReason` is set, carrying the full reason text.
- Read-only banner is absent when `writeDisabledReason` is undefined.

### Communication-lane lock (3 tests)
- Static-source: `BankerShell.tsx` does not import `Office365OutlookService`.
- Static-source: `BankerShell.tsx` does not call `SendEmailV2`.
- Static-source: `BankerShell.tsx` does not import `sendDocumentRequestEmail` or `sendBorrowerUpdateEmail`.

The communication-lane Phase 110 lock test file
(`src/shared/governance/communicationLaneReleaseLock.test.ts`,
134 assertions) was already passing pre-Phase-117 and continues
to pass — Phase 117 does not touch any file the lock watches.

---

## 5. Bundle impact

Pre-Phase-117 (end of Phase 116): 1045.87 kB / 235.52 kB gzipped.
Post-Phase-117: 1059.32 kB / 238.43 kB gzipped.

Delta: **+13.45 kB minified / +2.91 kB gzipped.** That's the
inline-style shell + KPI derivation + right-rail derivation. No
new dependency; the shell uses existing palette + shadow +
spacing tokens and re-uses `deriveBankerPersonalActivity` which
was already in the bundle.

---

## 6. Manual validation (after `pac code push`)

The brief's manual-validation list:

- [ ] Matt signs in.
- [ ] Banker Workspace loads.
- [ ] Page visually resembles the prior product-grade Banker
  Workspace: dark sidebar, identity chip, KPI tile row, tabs,
  right rail.
- [ ] Empty data states still render professionally (zeros show as
  `0`; "No deals with a target close in the next 14 days." on
  the right rail; "No active deals assigned to you." in the
  Overview tab's Activity Summary card).
- [ ] No access/provisioning regression: a user with no Platform
  User row still sees Phase 115's AuthGate; a user with no Banker
  row still sees `BankerProvider`'s "Banker profile missing" error.
- [ ] No communication-lane regression: open a deal from the
  Pipeline tab; the deal workspace's borrower-communication +
  document-request flows render exactly as Phase 104–110 sealed
  them.

If any check fails:
- Layout issue (e.g. sidebar overlaps content) → Phase 117 §1 + the
  CSS in `BankerShell.tsx` styles object. The shell uses CSS Grid
  for the page-level split and CSS Flex for inner regions; both
  are responsive within the Power Apps iframe.
- KPI shows wrong number → check `deriveBankerPersonalActivity` in
  `src/shared/analytics/bankerPersonalActivity.ts`; the shell just
  renders what it returns.
- Tab not switching → check `BankerShell.test.tsx`'s tab-switching
  block; if those tests still pass locally, the deployed bundle
  may be stale (re-`pac code push`).

---

## 7. Future-phase candidates (out of scope for Phase 117)

Each requires its own brief; none is implied as next:

1. **Banker data context to dedupe loads** — currently the shell
   AND `PersonalActivitySummary` both call
   `loadBankerWorkQueueData(bankerId)`. A new
   `BankerDataProvider` could load once and pass results to both.
   No correctness impact today; just network efficiency.
2. **Free-form activity log** — see §2 (governed write needed).
3. **Banker contacts surface** — see §2 (data + governed write
   needed).
4. **Banker deal creation** — see §2 (governed write needed).
5. **Sidebar collapse / mobile** — the sidebar is fixed-width
   240px today. Power Apps embeds adjust; a future small phase
   could add a mobile-collapsed state.
6. **KPI drill-through** — clicking a KPI tile currently does
   nothing. A future phase could wire tiles to filter the
   relevant tab (e.g. clicking "Open tasks" jumps to Action
   Queue scoped to overdue). Honest data; just navigation.
7. **Per-deal quick actions in the right rail** — clicking a
   "Closing soon" row could deep-link to the deal workspace.
   Honest behavior; just routing.

Phase 117 deliberately stops at "shell + composition of existing
cards" so the work is reviewable in one phase.

---

## 8. Verification

### CI gates

- `src/banker/BankerShell.test.tsx`: **22/22 assertions pass.**
- Full suite: **2624/2624 tests pass across 116 files** (was
  2602/115 at end of Phase 116; +22 tests, +1 file from the new
  shell test).
- `npm run build`: clean. Bundle +13.45 kB minified / +2.91 kB
  gzipped from the shell + KPI grid + right rail.

### Operator gate

```bash
pac code push --environment 5f2d77a5-de50-edeb-9d74-5b2400a2320d --solutionName CommercialLendingLOS
```

Then run the manual validation list in §6. The Phase 113 §F
failure triage rows apply unchanged.

---

## 9. Cross-references

- [PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md) — the previous stabilization phase. Phase 117 is the "next UX parity phase" that doc references.
- [PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md](PHASE_115_FIRST_LAUNCH_IDENTITY_PROVISIONING.md) — identity entry point; the shell renders only when this resolves.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — communication lock invariants the shell explicitly preserves (three static-source pins enforce this in the shell test).
- [PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md](PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md) — §F failure triage table still applies for any deployed-app issue.
- `src/banker/BankerShell.tsx` — the new shell.
- `src/banker/BankerShell.test.tsx` — the pin file.
- `src/workspaces/BankerWorkspace.tsx` — collapsed to a single import.
