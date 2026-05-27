# Phase 118 — Original UI/UX Inventory and Restoration Backlog (Banker)

**Status:** **Documentation only.** No production code change, no
schema change. This phase reconstructs the original Banker
Workspace UI/UX surface area, classifies every gap against the
Phase 117 shell, and sequences the restoration phases that
follow.

**Scope is banker-first.** This document covers ONLY the banker-
facing surface: the BankerShell, the cards in `src/banker/*`, and
the per-deal cards in `src/deals/*` that the banker reaches via
the shell. Manager, team, executive, and admin inventory work is
out of scope and will land in a separate phase if needed. The
banker is the persona Matt actually signs in as, and the
populated screenshot comparison the user wants to run is against
the banker workspace.

Why this matters: real deployment proved the app launches
(Phase 113), bootstraps identity (Phase 115), routes correctly
(Phase 116), and renders the Phase 117 product-grade shell. But
the original product UI was a richer banker operating dashboard
than Phase 117 restored. Phase 117 deliberately omitted Contacts
/ Due Diligence / Alerts tabs and New Deal / Log Activity
buttons because no honest governed-write or query surface exists
for them today. Phase 118 names what is missing, classifies why
it is missing, and sequences the restoration order — without
adding any speculative React component, fake data, or governed
write.

Related canonical sources:
- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — the shell this phase compares against.
- [PHASE_119_LIVE_BANKER_DATA_SEED.md](PHASE_119_LIVE_BANKER_DATA_SEED.md) — the populated-state validation that follows after the seed lands. Phase 118 names the gaps Phase 119 makes visible.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants that bound any restoration phase touching borrower communication.
- [MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — the lane-A / lane-E / lane-F capability map. Each restoration backlog item maps to a lane.
- `src/banker/BankerShell.tsx` — the Phase 117 shell composition (NAV_ITEMS, TabContent, RightRail).
- `src/shared/governance/platformInventory.ts` — the canonical NOT_WIRED + DELIBERATELY_BLOCKED inventory referenced by bucket E.

---

## 1. Classification scheme

Every old-UI surface element missing from the Phase 117 shell
falls into one of six buckets. The bucket determines whether the
gap is closeable inside this repo, partially closeable, or
requires an upstream unlock first.

| Bucket | Label | What it means | Closeable inside this repo? |
| --- | --- | --- | --- |
| **A** | Already implemented, not composed into shell | The React component exists in source today; BankerShell does not mount it OR the data primitive exists but no card renders it | **Yes** — composition / wiring phase |
| **B** | Implemented but needs data seed | The component exists, mounts, and runs — it renders empty because no live data is assigned to the signed-in banker | **Yes via Phase 119** — seed phase, not a code phase |
| **C** | Needs a loader / query | The visual concept is doable but no Dataverse loader / derivation primitive exists for it yet | **Yes** — loader phase. May require schema confirmation first |
| **D** | Needs a governed write | The element implies a banker action that has no governed write surface today | **Partial** — needs schema + GOVERNED_WRITES inventory addition + audit/timeline wiring |
| **E** | Not allowed yet / intentionally blocked | The element is in `NOT_WIRED` or `DELIBERATELY_BLOCKED`, or is upstream-gated (Lane E Outlook / Lane F Copilot / connector-blocked / auth-blocked) | **No** until upstream unlock |
| **F** | Pure visual polish | Spacing, density, color, typography, button placement, KPI tile rendering — no new component, no new loader, no new write | **Yes** — visual polish phase |

Buckets are ordered loosely by restoration cost: A is cheapest,
F is purely cosmetic. A single old-UI element can carry multiple
buckets when it has both a missing layout AND a missing loader —
the lower-letter bucket determines sequencing.

---

## 2. Phase 117 BankerShell — current composition

For the comparison to be honest, the current shell needs to be
stated explicitly. As of Phase 117:

### 2.1 Sidebar (left, dark navy, sticky)

- Brand block: `OGB` mark + `Old Glory Bank · Banker Workspace` lockup.
- Nav list: five tab buttons.
- Identity card: avatar (initials), full name, email — from `useBanker()`.

### 2.2 Header

- Eyebrow: `Commercial Lending`.
- Title: `Banker Command Center`.
- Conservative subtitle naming the data sources.
- Meta row: `EMAIL_MODE` badge (DRY_RUN / LIVE), optional `Read-only mode` badge.
- Optional read-only banner when `writeDisabledReason` is set.

### 2.3 KPI grid (6 tiles, single row on wide viewports)

| Tile | Source | Tint condition |
| --- | --- | --- |
| Active deals | `kpis.activeDealCount` | none |
| Pipeline | `kpis.totalPipelineValue` | none |
| Closing soon | `kpis.closingSoonCount` | blue if > 0 |
| Open tasks | `kpis.openTasksCount` | amber if any overdue |
| Outstanding docs | `kpis.outstandingDocumentsCount` | none |
| Pending reviews | `kpis.pendingReviewDocumentsCount` | none |

### 2.4 Tabs (5)

| Tab key | Mounts |
| --- | --- |
| `overview` | `<PersonalActivitySummary />` + `<BankerMorningCatchUp />` |
| `pipeline` | `<PersonalPipeline />` |
| `action-queue` | `<MyWorkQueue />` |
| `relationships` | `<RelationshipMemory />` |
| `signals` | `<BankerAutopilotRollup />` |

### 2.5 Right rail

- "Closing soon" panel: up to 6 deals from `closingSoonDeals` (14-day horizon).
- Disclaimer: "Not a calendar integration."

### 2.6 Per-deal workspace (banker-accessible via Pipeline row click)

`src/deals/BankerDealWorkspace.tsx` composes: DealHeader, DealSummary,
DealBlockers, DealStageProgressionCard, DealAutopilotPanel, DealTasks
(+ CompleteTaskModal), DealDocuments (+ Request/Receive/Review/Create-
Review-Task modals), CreditMemo (+ CreditMemoDraftModal),
ActivityTimeline (+ Outlook + Teams handoff buttons), BorrowerCommunication
(+ DraftBorrowerUpdateModal + BorrowerSafeStatusPacketModal),
TeamsChatHandoff, TeamsDealSummaryHandoff, RelationshipContext.

The per-deal surface is substantially complete and matches old-UI
parity. The gap is at the **shell + dashboard level**, not the deal level.

---

## 3. Original Banker Workspace UI — surface inventory

Reconstructed from the operator's prior-product screenshot and
the comparison the user provided. Eight surface groups; each
group lists the elements that were present in the original UI.

### 3.1 Application chrome

```
- Dark left sidebar
- Lending OS / Banker Workspace branding
- Role-aware workspace navigation
- Top search bar (global)
- User identity / avatar (top-right)
- Action buttons (top-right): New Deal, Log Activity
- Settings / Help & Support (sidebar footer)
```

### 3.2 Sidebar nav sections

```
- Dashboard
- Active Deals
- Alerts
- Tasks
- Due Diligence
- Schedule
- Relationship section:
  - Contacts
  - Activity Log
- Resources section:
  - Vendors
```

### 3.3 Dashboard composition

```
- Greeting ("Good afternoon, Matthew")
- Task / meeting count summary
- KPI cards:
  - Pipeline (weighted)
  - Active deals
  - Urgent items
  - Closing soon
  - YTD closed
  - Win rate
  - High probability
  - Stale 14d+
  - In underwriting
```

### 3.4 Pipeline view

```
- Stage lanes / progression bar (visual)
- Deal cards (not rows):
  - Borrower / client name
  - Amount
  - Probability
  - Idle / stale badges
- Stage grouping:
  - Lead
  - Initial Review
  - Underwriting
  - Credit Approval
```

### 3.5 Right rail panels

```
- Today's Schedule
- My Tasks
- My Alerts
- Cross-sell / pipeline widgets
```

### 3.6 Tab / work areas

```
- Pipeline
- Contacts
- Due Diligence
- Activity
- Alerts
- Action Queue
```

### 3.7 Deal workspace cards

```
- Deal Tasks
- Deal Documents
- Credit Memo
- Borrower Communication
- Activity Timeline
- Relationship Context
- Deal Autopilot Panel
- Teams Deal Summary Handoff
- Borrower-safe status packet
- Request Document modal
- Receive Document modal
- Review Document modal
- Create Document Review Task modal
- Complete Task modal
- Credit Memo Draft modal
- Draft Borrower Update modal
```

### 3.8 Communication / handoff surfaces

```
- Document-request email
- Borrower-update email
- DRY_RUN / LIVE mode banners
- Activity-ledger rows
- Masked recipient on timeline, full recipient on audit
- Teams summary copy handoffs
- Outlook handoff buttons
- Email-live smoke-test diagnostics (admin)
```

---

## 4. The gap table — old surface → current status → bucket

The core of this phase. Every old-UI element from §3 is
classified against the current Phase 117 shell.

### 4.1 Application chrome

| Old element | Current state in Phase 117 | Bucket | Restoration source |
| --- | --- | --- | --- |
| Dark left sidebar | **Present.** | F | Visual polish only |
| Branding lockup | **Present** (`OGB · Old Glory Bank · Banker Workspace`). | — | — |
| Role-aware workspace navigation | **Present** at the workspace-route level (Phase 116 alias map); not surfaced as cross-workspace switcher in sidebar | A | New workspace-switcher composition in sidebar footer (data already in `BankerIdentity` + `workspaceRoutes.ts`) |
| Top search bar (global) | **Missing.** No search loader exists today. | C | Needs `searchAcrossDeals(bankerId, query)` loader. Deals already indexed; tasks + documents would also need indexing. Possibly Lane-A buildable; needs scope phase. |
| User identity / avatar (top-right) | **Present** in sidebar (not header) | F | Visual polish — relocate identity chip to header if desired |
| `New Deal` button | **Missing.** No governed write to create a deal. | D + E | New `GOVERNED_WRITES` row: `create-deal`. Needs Dataverse FK targets (banker, client, stage ref, status ref) chosen via form. Adds first banker-side write since Phase 110. **Must ask user before adding** per standing constraint. |
| `Log Activity` button | **Missing.** No governed write to log activity. | D + E | New `GOVERNED_WRITES` row: `log-banker-activity`. Conflicts with Phase 110 communication-lane scope (the audit/timeline lane is reserved for email-lane events). Likely needs a Phase 110 scope-extension decision before this is safe. **Must ask user before adding.** |
| Settings link | **Missing.** No banker-side settings surface today. | C | Needs a settings scope decision. EMAIL_MODE is admin-only; what banker settings exist is undefined. |
| Help & Support link | **Missing.** | F or C | Static link with no telemetry is F; routed help is C. |

### 4.2 Sidebar nav sections

| Old nav item | Current state | Bucket | Restoration source |
| --- | --- | --- | --- |
| Dashboard | Present as `Overview` tab | F | Rename if `Dashboard` preferred |
| Active Deals | Present as `Pipeline` tab | F | Same |
| Alerts | **Missing.** Banker-side alerts not a surface today. | C + E | Needs alert source decision. If "alerts" = subset of MyWorkQueue + MorningCatchUp signals, this is bucket A (composition). If "alerts" = admin-pushed bulletins, needs schema + write + connector — bucket C/D. |
| Tasks | Present as part of `Action Queue` tab | F or A | Could be split out as dedicated tab. Data is loaded; needs only tab composition. |
| Due Diligence | **Missing.** Semantically overlaps with `Action Queue` (documents-bucket) + per-deal Documents card. | A or E | Decision phase: either alias `Due Diligence` to `Action Queue` (F polish), or define `Due Diligence` as a banker-cross-deal documents view (A composition — `loadDocumentsAwaitingActionForDeals` already exists). |
| Schedule | **Missing.** No calendar integration. | E | Lane E (Outlook / Graph calendar) unlock required. Out of repo scope until upstream. |
| Contacts | **Missing.** No banker-side contacts UI. | C + E | RelationshipMemory surfaces client-level rollups but is not a contacts table. Real contacts surface requires schema (`cr664_contact` or equivalent) + loader. Possibly Lane B / C scope. |
| Activity Log | **Missing** at banker scope. Per-deal `ActivityTimeline` exists; no banker-cross-deal activity feed. | A | `loadBankerWorkQueueData` returns deals; an activity-aggregation primitive could derive a per-banker activity feed. Composition + small derivation primitive. |
| Vendors / Resources | **Missing.** No vendor entity in repo today. | C + E | Out of repo scope — needs schema (`cr664_vendor` or equivalent) + governance decision. |

### 4.3 Dashboard composition

| Old element | Current state | Bucket | Restoration source |
| --- | --- | --- | --- |
| Greeting ("Good afternoon, Matthew") | **Missing.** Header has banker name; no time-of-day greeting. | F | Visual polish — add deterministic time-of-day prefix to header. Risk: locale assumption. Optional. |
| Task / meeting count summary | Open Tasks tile present; **no meeting count** | E | Calendar / meetings = Lane E unlock |
| Pipeline (weighted) | Pipeline tile present (raw `cr664_amount` sum); **no probability weighting** | C | Needs `cr664_probability` field on deal. Schema confirmation required first. If field exists, derivation primitive is trivial. |
| Active deals | **Present.** | — | — |
| Urgent items | Open Tasks tile tints amber when overdue tasks exist; **no dedicated `Urgent` tile** | A | Compose a 7th tile from MyWorkQueue's high-severity grouping. Data primitive already returns severity-classified items. |
| Closing soon | **Present.** | — | — |
| YTD closed | **Missing.** | C | Needs closed-deal history loader (`statecode = 1` + closed-status reference scope + within-year filter). Possibly schema-light (data already exists; just a different filter). |
| Win rate | **Missing.** | C | Needs outcome ledger: count of won vs lost deals over a period. Same loader family as YTD closed. |
| High probability | **Missing.** | C | Same as Pipeline-weighted; depends on `cr664_probability` field. |
| Stale 14d+ | **Missing as a tile.** MorningCatchUp surfaces stale-activity signals. | A | Compose a tile from `BankerMorningCatchUp` stale-activity rollup. Data already derived. |
| In underwriting | **Missing as a tile.** | A | Compose a tile from `state.data.deals` filtered by stage = `Underwriting`. Trivial composition. |

### 4.4 Pipeline view

| Old element | Current state | Bucket | Restoration source |
| --- | --- | --- | --- |
| Stage lanes / progression bar | **Missing.** `PersonalPipeline` is a flat table. | A | Stage data is loaded; needs a lane-grouped layout component. No new loader. |
| Deal cards (not rows) | **Present as rows.** | F or A | Visual upgrade — table rows → card layout. Pure presentation. |
| Borrower / client name | **Present.** | — | — |
| Amount | **Present.** | — | — |
| Probability | **Missing.** | C | Schema-blocked on `cr664_probability`. |
| Idle / stale badges (per row) | **Missing on pipeline rows.** Available via MorningCatchUp. | A | Compose stale-signal badge into pipeline row. Data primitive exists. |
| Stage grouping (Lead / Initial Review / Underwriting / Credit Approval) | **Missing.** | A | Same as stage lanes — group rows by `cr664_StageReference`. Stage catalog defined in `src/shared/stages/stageCatalog.ts`. |

### 4.5 Right rail panels

| Old element | Current state | Bucket | Restoration source |
| --- | --- | --- | --- |
| Today's Schedule | **Missing.** No calendar integration. | E | Lane E unlock required (Outlook Graph calendar). |
| My Tasks (rail) | **Missing as rail.** Present in Action Queue tab. | A | Compose a rail-sized subset of MyWorkQueue (top-3-by-severity). Data primitive exists. |
| My Alerts (rail) | **Missing.** Banker-side alerts undefined. | C + E | Same alert-source decision as 4.2. |
| Cross-sell / pipeline widgets | **Missing.** | E | Cross-sell suggestions = Lane F (Copilot) unlock. Out of repo scope. |
| Closing soon (rail) | **Present.** | — | — |

### 4.6 Tab / work areas

| Old tab | Current state | Bucket | Restoration source |
| --- | --- | --- | --- |
| Pipeline | **Present.** | — | — |
| Contacts | **Missing.** No banker-side contacts UI. | C + E | Same as 4.2. |
| Due Diligence | **Missing.** | A | Compose a banker-cross-deal Outstanding + Pending-Review documents view. `loadDocumentsAwaitingActionForDeals` already returns the right shape. |
| Activity | **Missing at banker scope.** | A | Compose a banker-cross-deal activity feed. Needs small derivation primitive that aggregates per-deal `ActivityTimeline` events. |
| Alerts | **Missing.** | C + E | Same alert-source decision. |
| Action Queue | **Present.** | — | — |

### 4.7 Deal workspace cards (banker-accessible)

This is the strongest area — substantial parity with the
original product. Every card the original UI surfaced exists in
the current codebase and mounts in `BankerDealWorkspace`:

| Old card | Current state | Bucket |
| --- | --- | --- |
| Deal Tasks | **Present** (`<DealTasks />` + `CompleteTaskModal`). | — |
| Deal Documents | **Present** (`<DealDocuments />` + Request/Receive/Review/Create-Review-Task modals). | — |
| Credit Memo | **Present** (`<CreditMemo />` + `CreditMemoDraftModal`). | — |
| Borrower Communication | **Present** (`<BorrowerCommunication />` + `DraftBorrowerUpdateModal`). | — |
| Activity Timeline | **Present** (`<ActivityTimeline />`). | — |
| Relationship Context | **Present** (`<RelationshipContext />` via Phase 77). | — |
| Deal Autopilot Panel | **Present** (`<DealAutopilotPanel />` via Phase 80). | — |
| Teams Deal Summary Handoff | **Present** (`<TeamsDealSummaryHandoff />` via Phase 96). | — |
| Borrower-safe status packet | **Present** (`<BorrowerSafeStatusPacketModal />`). | — |

**Per-deal gap = zero net new components needed.** Any per-deal
restoration work is bucket F (visual polish of existing cards).

### 4.8 Communication / handoff surfaces

All Phase 104–110 invariants. **DO NOT TOUCH** in any restoration
phase without a Phase 110 scope-extension decision and the user's
explicit go-ahead.

| Old element | Current state | Bucket |
| --- | --- | --- |
| Document-request email | **Present** (governed write; Phase 104). | — |
| Borrower-update email | **Present** (governed write; Phase 105). | — |
| DRY_RUN / LIVE mode banners | **Present** in BankerShell header + EmailLiveDiagnostics. | — |
| Activity-ledger rows | **Present** (Phase 107). | — |
| Masked recipient on timeline / full on audit | **Present** (Phase 107 governance pin). | — |
| Teams summary copy handoffs | **Present** (Phases 86 / 96 / 97 / 99 / 100). | — |
| Outlook handoff buttons | **Present** (`SummaryOutlookHandoffButtons` shared component). | — |
| Email-live smoke-test diagnostics | **Present** (Phase 109 — admin-only). | — |

---

## 5. Restoration backlog — sequenced

Sorted by cheapest first, alongside the bucket and dependency.
None of these are committed phases; they are candidate phases
for the user to approve in order.

### 5.1 Bucket-A composition phases (cheapest — no new schema, no new loader)

1. **Stage-grouped pipeline layout** — group `PersonalPipeline` rows by `cr664_StageReference`, surface as visual lanes. (§4.4)
2. **In-underwriting + stale-14d KPI tiles** — derive two additional tiles from existing data primitives. (§4.3)
3. **Urgent items KPI tile** — derive from MyWorkQueue severity. (§4.3)
4. **My-Tasks rail panel** — rail subset of MyWorkQueue. (§4.5)
5. **Banker-cross-deal activity tab** — aggregate per-deal `ActivityTimeline` events. (§4.6)
6. **Due-Diligence tab** — banker-cross-deal documents view. (§4.6)
7. **Stale-row badges in PersonalPipeline** — compose existing stale signals into pipeline row. (§4.4)
8. **Workspace-switcher in sidebar footer** — surface the Phase 116 alias map. (§4.1)

### 5.2 Bucket-F visual polish phase (no behavior change)

9. **Visual polish pass** — spacing, density, KPI tile styling, right-rail item presentation, deal-row → deal-card conversion, optional greeting prefix, Teams-iframe fit. (Per Phase 119 §8 — runs after Phase 119 seeds populated state.)

### 5.3 Bucket-C loader phases (require new derivation primitives)

10. **YTD-closed + win-rate loaders** — historical closed-deal aggregations. Schema-light. (§4.3)
11. **Pipeline-weighted + high-probability + per-row probability** — depends on `cr664_probability` schema confirmation. **Schema confirm first.** (§4.3 / §4.4)
12. **Global search loader** — `searchAcrossDeals(bankerId, query)`. Scope phase first. (§4.1)

### 5.4 Bucket-A or bucket-C decision phases

13. **Alerts source decision** — is `Alerts` a composition of existing signals (bucket A) or a new admin-pushed bulletin entity (bucket C + D)? Decision phase. (§4.2 / §4.5 / §4.6)
14. **Settings scope decision** — what does banker-side `Settings` mean? Decision phase. (§4.1)

### 5.5 Bucket-D + bucket-E phases (require governance escalation)

15. **`New Deal` governed write** — adds the first banker-side create-write since Phase 110. Requires `GOVERNED_WRITES` inventory addition + Dataverse FK targeting + form UI + audit/timeline wiring. **Must ask user before scoping.** (§4.1)
16. **`Log Activity` governed write** — potentially conflicts with Phase 110 communication-lane scope. Requires explicit Phase 110 scope-extension decision before this is safe. **Must ask user before scoping.** (§4.1)

### 5.6 Bucket-E upstream-blocked phases (defer indefinitely)

17. **Schedule rail / today's calendar** — Lane E (Outlook / Graph) unlock required. Defer until upstream.
18. **Cross-sell / pipeline-suggestion widgets** — Lane F (Copilot) unlock required. Defer until upstream.
19. **Contacts entity + tab** — schema-blocked. Lane B / C decision required.
20. **Vendors entity + resource section** — out of repo scope. Schema + governance required.

### 5.7 Recommended near-term sequence (suggestion, not committed)

1. Phase 119 (seed) — already documented.
2. Visual polish pass (5.2 item 9) — purely cosmetic; honest improvement to the populated state.
3. Bucket-A wave 1 — stage-grouped pipeline + 3 derived KPI tiles + my-tasks rail. (5.1 items 1–4)
4. Bucket-A wave 2 — activity tab + due-diligence tab + workspace-switcher. (5.1 items 5–8)
5. Bucket-C wave — historical closed/win-rate loaders, then schema-confirm probability. (5.3)
6. Alerts + settings decision phase. (5.4)
7. Governed-write scoping (only if user approves). (5.5)

This is the **honest closing order** that respects every existing
constraint. Each item is independently shippable, has a clear
governance posture, and produces an observable UX improvement
without a speculative component.

---

## 6. Guardrails preserved by every restoration phase below

These are not Phase 118's policies; they are existing standing
constraints that every restoration backlog item must observe.

1. **No email-lane changes.** The Phase 110 lock-file pins
   exactly one `Office365OutlookService` import, one
   `SendEmailV2` callsite, three `getEmailAdapter()` callers,
   and no `subject` / `body` / `to` payload expansion. No
   restoration phase touches these.

2. **No fallback dashboards.** No restoration phase introduces a
   "if no data, show fabricated sample data" path. Empty states
   stay honest.

3. **No fake sample data in React code.** No restoration phase
   ships a `if (process.env.NODE_ENV !== 'production') return mockData`
   branch. Phase 119 covers the seed; React code never fabricates.

4. **Permission-before-render holds.** `BankerProvider` continues
   to fail-closed when the signed-in UPN has no `cr664_banker`
   row. No restoration phase relaxes this.

5. **`writeDisabledReason` continues to surface.** Phase 117 added
   the read-only header banner; no restoration phase removes it.

6. **Conservative copy.** "Outlook accepted" only — never
   "delivered" / "email sent" / "borrower was notified" / "sent
   successfully" / "email delivered" (Phase 110 conservative-copy
   pin).

7. **Must-ask-first on any new write surface.** Bucket D items
   (`New Deal`, `Log Activity`, any other governed write
   addition) require explicit user approval before scoping —
   even if the restoration backlog lists them above. They are
   listed for visibility, not pre-approval.

8. **No schema changes unless explicitly approved.** Bucket-C
   probability work specifically requires schema confirmation
   first — `cr664_probability` may or may not exist in the live
   env.

---

## 7. Out of scope for Phase 118 (per scope decision)

Explicitly deferred to future inventory phases if needed:

- **Manager Command Center inventory** — `src/manager/*` + manager-routed workspaces (`Manager Command Center`, `Portfolio Management`).
- **Team Workspace inventory** — `src/team/*` + team-shared work queue.
- **Executive / Board inventory** — `src/executive/*` + snapshot route.
- **Admin Control Center inventory** — `src/admin/*` (release readiness, stage governance, perf diagnostics, email live diagnostics, capability inventory).
- **Cross-persona shared inventory** — `src/shared/*` components that render in multiple personas (already covered partially in §2.6 to the extent they appear in BankerDealWorkspace).

Each can become its own future phase if the user wants
restoration backlog for those personas. The banker-first cut
covers Matt's signed-in experience and is the right starting
inventory to act on now.

---

## 8. Verification

This is a documentation-only phase. The code surface is
unchanged. CI gates:

- `npm test -- --run`: full suite passes unchanged.
- `npm run build`: unchanged.
- `src/shared/governance/releaseCandidateSnapshot.test.ts`:
  required-doc-existence pin extended to include
  `docs/PHASE_118_ORIGINAL_UI_UX_INVENTORY.md` so future docs-
  only edits can't quietly delete this inventory.

No `pac code push` needed.

---

## 9. Cross-references

- [PHASE_117_BANKER_WORKSPACE_UX_PARITY.md](PHASE_117_BANKER_WORKSPACE_UX_PARITY.md) — current shell; the empty-state target this inventory compares against.
- [PHASE_119_LIVE_BANKER_DATA_SEED.md](PHASE_119_LIVE_BANKER_DATA_SEED.md) — manual seed recipe; the populated-state baseline the bucket-A and bucket-F restoration phases will be validated against.
- [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md) — the email-lane invariants every restoration phase must respect.
- [PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md](PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md) — the workspace-alias map (Banker Workspace, Manager Command Center, Portfolio Management → manager, Executive Dashboard, Team Workspace, Admin Control Center) referenced by §4.1 workspace-switcher.
- [MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — the lane-A / lane-E / lane-F capability map; every bucket-E item references a specific lane.
- `src/banker/BankerShell.tsx` — the Phase 117 shell composition referenced throughout §2 and §4.
- `src/banker/PersonalPipeline.tsx` — flat-table layout referenced in §4.4 stage-grouped restoration candidate.
- `src/banker/MyWorkQueue.tsx` — severity-grouped data primitive referenced in §4.3 (Urgent tile) and §4.5 (My-Tasks rail).
- `src/banker/BankerMorningCatchUp.tsx` — stale-activity signal source referenced in §4.3 (Stale 14d+ tile) and §4.4 (per-row badge).
- `src/shared/stages/stageCatalog.ts` — stage canonical names referenced in §4.4 (stage grouping).
- `src/shared/governance/platformInventory.ts` — `NOT_WIRED` / `DELIBERATELY_BLOCKED` / `GOVERNED_WRITES` / `LOCAL_ONLY_FLOWS` source for bucket-E classifications.
