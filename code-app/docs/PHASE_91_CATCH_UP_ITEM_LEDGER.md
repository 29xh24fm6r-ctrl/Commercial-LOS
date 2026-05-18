# Phase 91 — Catch-Up Item Dismiss/Snooze via Local Ledger

## Goal

Add a local-only per-item interaction layer to the Phase 88 manager and Phase 89 banker Morning Catch-Up cards. Users can:

- **Dismiss locally** an individual catch-up item — the row remains visible in a muted state with a **Restore** affordance that brings back the default controls.
- **Snooze 24h** an individual catch-up item — the row is filtered from the visible feed for 24 hours, then reappears naturally when the snooze window expires (no manual un-snooze).

No new writes. No new schema. No new SDK install. No AI. No Teams / Outlook notification. No cross-device sync. No workflow automation. The ledger entry only changes how a row renders on this browser; the underlying deterministic catch-up derivation continues to evaluate against current records.

## Why this phase

Phase 88 / 89 added deterministic catch-up feeds. Phase 90 added a "since your last visit" overlay scoped to the feed as a whole. The remaining interaction gap is **item-level triage**: a banker reading the morning catch-up can see new and attention-worthy items but cannot locally hide or defer items they have already reviewed. Without that, the feed accumulates noise as the same observation (e.g. a long-running outstanding-documents aggregate) re-surfaces every morning.

Phase 91 closes the gap with the same LOCAL_ONLY discipline Phase 83 ships for autopilot suggestions: a per-user, per-browser ledger; explicit "not a workflow resolution" framing; no Dataverse, no audit, no notification, no sync.

## Relationship to Phases 83 and 90

| | Phase 83 (autopilot suggestions) | Phase 90 (catch-up last-seen) | Phase 91 (catch-up item ledger) |
|---|---|---|---|
| Surface scope | Per-suggestion-per-deal across 4 autopilot surfaces | Whole-feed marker per user/team on 2 catch-up cards | Per-item across 2 catch-up cards |
| Action enum | `opened \| dismissed` | n/a (single timestamp) | `dismissed \| snoozed` |
| Carries a future-time field | no | no | yes — `snoozeUntil` (24h default) |
| Storage slot | `cc:autopilotSuggestionLedger:v1` | `cc:lastVisit:catchUp:<scope>` (per-key) | `cc:catchUpItemLedger:v1` |
| Key shape | `surface\|dealId\|suggestionId` | `surface:<userId>[:<teamId>]` | `surface\|itemKey` (itemKey = `<kind>:<dealId>[:<rowId>]`) |
| UI affordance | Dismiss locally / Restore (+ Opened tag) | "N new since your last visit" / "New" per-item badge | Dismiss locally + Snooze 24h + Restore |
| Cross-device sync | no | no | no |
| Resolves business item | no | no | no |
| Has hooks to React | yes (`useSuggestionLedger`) | yes (`useCatchUpLastSeen`) | yes (`useCatchUpItemLedger`) |

The three ledgers are deliberately separate modules with disjoint storage namespaces. Phase 91 was scoped as a parallel ledger rather than an extension of Phase 83 because:

1. The action enum is different (`dismissed | snoozed` vs `opened | dismissed`). Extending Phase 83's enum would force every existing autopilot surface to acknowledge a `snoozed` state they have no UI for.
2. Phase 91 entries carry a `snoozeUntil` field; Phase 83 entries do not. Mixing the two shapes in one ledger would force every existing Phase 83 consumer through an option/null check it doesn't need.
3. The storage namespaces stay clean: a Phase 83 reader will never see a Phase 91 entry and vice versa.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- **§1.18 (Activity intelligence)** — extended to "Partially operational (advanced by Phase 72 + Phase 80 + Phase 82 + Phase 83 + Phase 87 + Phase 88 + Phase 89 + Phase 90 + Phase 91)". The catch-up surface now supports per-item triage.
- **§1.1 (Banker Command Center)** — current-state notes the new per-item Dismiss/Snooze/Restore controls on `<BankerMorningCatchUp />`.
- **§1.22 (Manager workspace)** — current-state notes the same controls on `<ManagerMorningCatchUp />`.

## Stored fields

`CatchUpLedgerEntry`:

| Field | Type | Meaning |
|---|---|---|
| `key` | `string` | Deterministic ledger key: `${surface}\|${itemKey}`. |
| `surface` | `'banker-catch-up' \| 'manager-catch-up'` | Card the entry belongs to. |
| `itemKey` | `string` | Phase 88 derivation's `item.id` — shape `<kind>:<dealId>[:<rowId>]` (e.g. `overdue-task:d-1:t-7`). |
| `itemKind` | `string` | `ManagerCatchUpKind` (e.g. `overdue-task`, `draft-memo`, `stage-aging`). Stored for future analytics — the card itself does not branch on it beyond what the underlying derivation already supplies. |
| `dealId` | `string \| undefined` | Deal id when the item is per-deal (almost always); undefined reserved for future cross-deal items. |
| `action` | `'dismissed' \| 'snoozed'` | Which action the user chose. |
| `recordedAt` | `string` (ISO) | When the user clicked the affordance. |
| `snoozeUntil` | `string \| undefined` (ISO) | Required when `action === 'snoozed'`. Forbidden when `action === 'dismissed'`. Storage loader rejects mixed-state tamper. |
| `titleSnapshot` | `string \| undefined` | Item title at recording time. Cosmetic — the live rendering uses the current derivation output. |

No PII. No borrower content. No financial figures.

## Keying strategy

`buildCatchUpLedgerKey({ surface, itemKey }) → "${surface}|${itemKey}"`.

The `itemKey` segment is exactly the Phase 88 derivation's `item.id` (made deterministic by Phase 88's `makeItem` factory). For each Phase 88 item kind:

- `overdue-task`, `task-due-soon`: `<kind>:<dealId>:<taskId>`
- `pending-review-document`, `newly-received-document`: `<kind>:<dealId>:<docId>`
- `outstanding-documents`: `<kind>:<dealId>` (aggregated per deal)
- `draft-memo`: `<kind>:<dealId>` (aggregated per deal)
- `closing-soon`, `stage-aging`, `stale-activity`, `missing-stage`, `missing-assigned-banker`: `<kind>:<dealId>`

This means:

- The ledger entry stays bound to the exact (kind, deal, child row) — dismissing "overdue-task on deal d-1 task t-7" does NOT dismiss "overdue-task on deal d-1 task t-9".
- A row that re-fires after Restore (or after a snooze expires) re-renders with the same key, so a future un-dismiss is by exact-row.
- For aggregate items (e.g. `outstanding-documents:d-1`), dismissing dismisses the WHOLE aggregate — that is correct since the card surfaces one aggregate row per deal.

The brief explicitly forbids title-only keying. Phase 91 honors this — titles are stored as `titleSnapshot` (cosmetic-only) but never participate in the key.

**Limitation:** for child rows whose underlying record id can change (e.g. a re-issued document checklist row), the ledger entry would orphan. This is documented; orphans accumulate locally with no business impact, and `clearAllCatchUpLedgerEntries` (exported for a future admin affordance) can wipe the slot.

## Dismiss / snooze semantics

**Dismiss locally:**

- Visible row stays in the feed but renders muted (opacity 0.6).
- The "New since your last visit" badge is suppressed on dismissed rows (a row already triaged by the user shouldn't pretend to be a fresh attention item).
- Restore affordance brings back the default Dismiss / Snooze controls and removes the muted style.
- The underlying derivation continues to evaluate the rule — the row will reappear in its default state if the user clears the ledger entry.

**Snooze 24h:**

- Item is filtered from the visible feed for 24 hours (`CATCH_UP_DEFAULT_SNOOZE_HOURS = 24`).
- After `snoozeUntil` passes, the item reappears naturally on the next render. **No manual un-snooze affordance** — keeping the action surface minimal.
- A user who wants to "un-snooze early" can dismiss the item then Restore it.
- An expired snooze entry is benign in storage; it just doesn't filter anything anymore.

**Re-record:**

- Clicking Snooze on an already-dismissed row overwrites the entry (dismissed → snoozed). Last-write-wins.
- Clicking Dismiss on an already-snoozed row overwrites the entry (snoozed → dismissed).
- Storage loader rejects mixed-state tampered entries (dismissed-with-snoozeUntil, snoozed-without-snoozeUntil).

## Update timing

No two-step settle — clicks update the ledger and re-render synchronously. The user gets immediate feedback. This is a deviation from Phase 90's 2-second settle pattern, because Phase 91 is an explicit click action (not a snapshot-on-mount) and immediate feedback is the right UX.

`localStorage` is the source of truth. The hook reads the slot once on mount, holds it in React state, and merges in click-driven updates. Two tabs editing the ledger see each other only after a tab refresh — same trade-off Phase 83 carries.

## Limitations

- **Local browser only.** Each browser has its own slot. A user who dismisses an item on desktop will see it again on mobile. Documented.
- **No cross-tab broadcast.** Two tabs editing in parallel will diverge until one refreshes. Last-write-wins on the next mount.
- **No "Mark all dismissed" affordance** in the UI today. `clearAllCatchUpLedgerEntries` is exported for an eventual admin / settings UI.
- **No snooze duration choice.** Phase 91 ships a single 24-hour default. A future preference layer could expose 1h / 4h / 24h / next-monday.
- **Orphan-entry tolerance.** If a Phase 88 item id changes shape between versions, old ledger entries become orphan no-ops. They consume a few bytes per entry; benign.
- **No business notification.** Dismissing does NOT mark a task complete, a document reviewed, or a deal updated. The brief forbids those claims and the source-text + rendered-DOM tests pin the contract.
- **Snooze granularity is "row, not signal".** Snoozing `overdue-task:d-1:t-7` does NOT snooze `overdue-task:d-1:t-9`. Each child row is independently tracked.
- **No undo for snooze.** A user who snoozes by accident must wait the 24h OR dismiss the row through some other path. A future phase could add "Un-snooze" if user feedback warrants it.

## Why this is not workflow resolution

- **The deterministic catch-up derivation is unchanged.** Phase 88 and 89's primitive continues to fire `overdue-task` for a still-overdue task; the ledger entry only changes how that row renders. The Phase 80 autopilot surfaces, the Activity Timeline, every governed write, every Dataverse record — all untouched.
- **No `Cr664_*Service` call.** Source-text test pins this.
- **No GOVERNED_WRITES entry.** Inventory test asserts `catch-up-item-ledger` is NOT in `GOVERNED_WRITES`.
- **No audit row, no timeline event.** Same as Phase 83.
- **No business-state mutation.** Card body never says "resolved", "completed", "closed", "acknowledged", "synced", "official record", "workflow updated", "system handled". Forbidden-vocabulary scan pins this in both source and rendered DOM.

## Why this is not notification / unread sync

- **No push.** The card has no Teams card, no Outlook message, no in-app toast notification.
- **No unread state.** Dismissing is the user saying "I've seen this for now"; it is NOT the system saying "you have unread items elsewhere." Phase 90 already supplies the "N new since your last visit" overlay that's the closest thing to an unread indicator, and even that is browser-local with no claim of cross-device sync.
- **No sync.** Two browsers held by the same user diverge. Forbidden vocabulary `(is|was|has been) synced` / `(is|was|has been) pushed` / `(is|was|has been) delivered` scanned out of source and rendered DOM.
- **No real-time stream.** Card re-renders only when the underlying data provider refreshes or a click fires. Forbidden vocabulary `real-time` scanned out.

## Future upgrade path

When upstream / governance / schema work lands, the per-item ledger could grow in these directions:

1. **Dataverse activity / catch-up ledger.** A future entity (`cr664_catchupledger` or similar) could replace LOCAL_ONLY with server-side per-user state. Would unlock cross-device sync + an audit trail. Schema-side decision.
2. **Audit trail.** Currently dismiss / snooze are invisible to the org. A future governed-write phase could emit a `cr664_AuditEvent` row per ledger action for compliance reporting.
3. **Manager analytics.** Once dismiss / snooze counts are in Dataverse, manager workspace could aggregate "items most-dismissed by my team" → a signal for tuning the underlying derivation rules.
4. **Teams notification feedback.** When the Lane E Graph integration matures (Phase 86 → admin-consented `TeamsActivity.Send`), HIGH-priority dismissed items could trigger a confirmation card to the user's Teams activity feed. Today this is connector-blocked.
5. **Snooze preferences.** Replace the hardcoded 24-hour window with a per-user preference (1h / 4h / 1d / next-monday). Would need a preference-storage shim — `localStorage` today, Dataverse later.
6. **Cross-device sync.** Sibling to (1) — would require schema + a sync mechanism. Phase 91 explicitly does NOT claim this.
7. **"Mark all dismissed" affordance.** Single button that wipes the ledger slot. The pure helper `clearAllCatchUpLedgerEntries` already exists.
8. **Per-kind dismiss.** "Dismiss all `outstanding-documents` items locally" — a coarser-grained action for users overwhelmed by data-quality noise. Same ledger, different keying.

## Files created

- `src/shared/activity/catchUpItemLedger.ts` — pure storage helpers (`recordCatchUpItemDismissed`, `recordCatchUpItemSnoozed`, `getCatchUpLedgerEntry`, `clearCatchUpLedgerEntry`, `clearAllCatchUpLedgerEntries`, `loadCatchUpItemLedger`) + pure predicates (`isDismissed`, `isSnoozeActive`, `defaultSnoozeUntil`). Storage namespace: `cc:catchUpItemLedger:v1` (disjoint from Phase 83). Default snooze window: `CATCH_UP_DEFAULT_SNOOZE_HOURS = 24`. Loader rejects malformed JSON, wrong root type, individual malformed entries, dismissed-with-snoozeUntil tamper, snoozed-without-snoozeUntil tamper, and invalid surface / action enum values.
- `src/shared/activity/catchUpItemLedger.test.ts` — 29 helper tests covering key construction, record/read for both actions, dismiss-snooze-flip last-write-wins, fault-tolerance (missing slot, malformed JSON, wrong root, malformed entries, mixed-state tamper, invalid enum / surface), `isSnoozeActive` (undefined / dismissed / active / expired), `isDismissed` symmetry, `defaultSnoozeUntil` shape, storage-namespace separation from Phase 83, module hygiene (no SDK / role imports; no resolved / completed / closed / synced / official / workflow-updated / acknowledged / AI vocabulary in source).
- `src/shared/activity/useCatchUpItemLedger.ts` — React hook mirroring `useSuggestionLedger`. Reads ledger once on mount; merges click-driven updates into React state; exposes `entries`, `getEntry`, `isDismissedItem`, `isSnoozedItem`, `recordDismissed`, `recordSnoozed`, `clear`.
- `docs/PHASE_91_CATCH_UP_ITEM_LEDGER.md` — this document.

## Files modified

- `src/banker/BankerMorningCatchUp.tsx` — consumes `useCatchUpItemLedger()` via a `BodyWithLedger` wrapper; filters snoozed items out of the visible feed before the "since last visit" comparison; threads `ledgerEntry` + onDismiss/onSnooze/onRestore handlers into each `FeedItemRow`; renders the Dismiss locally + Snooze 24h buttons on non-dismissed rows; renders the Dismissed locally tag + Restore button on dismissed rows. Disclaimer extended verbatim with the local-only contract.
- `src/banker/BankerMorningCatchUp.test.tsx` — 10 new tests under the Phase 91 describe block: dismiss/snooze buttons render, click-dismiss + Restore round-trip, click-snooze hides the item, rehydration from pre-existing dismissed entry, rehydration from pre-existing active snooze (hidden), expired snooze re-surfaces the item, disclaimer states local-only invariant, forbidden vocab scan post-click, storage namespace pin.
- `src/manager/ManagerMorningCatchUp.tsx` — same ledger wiring as the banker card. `BodyWithLedger` wrapper + `useCatchUpItemLedger()` + visible-items filter + `FeedItemRow` controls + ledger row.
- `src/manager/ManagerMorningCatchUp.test.tsx` — 9 new tests under the Phase 91 describe block: dismiss/snooze buttons render, click-dismiss + Restore round-trip, click-snooze hides the item, rehydration from pre-existing dismissed entry, rehydration from pre-existing active snooze, disclaimer states local-only invariant, forbidden vocab scan post-click, storage namespace pin.
- `src/shared/governance/platformInventory.ts` — adds the `catch-up-item-ledger` entry to `LOCAL_ONLY_FLOWS` with verbatim disclaimers (no Dataverse write, no audit, no timeline, no cross-device sync, no notification delivery; does NOT resolve / complete / close any business item; does NOT change deal status; does NOT create official acknowledged / unread state; cites the implementation modules + this doc).
- `src/shared/governance/platformInventory.test.ts` — pins (a) membership in `LOCAL_ONLY_FLOWS`, (b) the full disclaimer set + storage namespace + action enum + implementation pointers, (c) the Phase 91 doc exists on disk, (d) `catch-up-item-ledger` is NOT in `GOVERNED_WRITES`.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.1 + §1.18 + §1.22 advanced.

## Tests added / updated

- 29 helper / derivation tests (`catchUpItemLedger.test.ts`).
- 10 banker card overlay tests appended (`BankerMorningCatchUp.test.tsx`; 19 → 29).
- 9 manager card overlay tests appended (`ManagerMorningCatchUp.test.tsx`; 21 → 30).
- 3 inventory pins added (`platformInventory.test.ts`): membership + full disclaimer set + doc-on-disk + NOT-in-GOVERNED_WRITES + Phase 90 existing pin extended.

No existing test was changed substantively. Phase 72 / 80 / 81 / 82 / 83 / 84 / 86 / 87 / 88 / 89 / 90 tests continue to pass.

## Confirmation: no writes / schema / AI / notification / sync / workflow-resolution added

- ✅ **No new write surface.** No `GOVERNED_WRITES` entry. `catch-up-item-ledger` is NOT in `GOVERNED_WRITES` (test asserts).
- ✅ **No schema change.** No new Dataverse table or column read.
- ✅ **No new generated-service import.** The helper imports nothing from `src/generated/`.
- ✅ **No new SDK install.** `@microsoft/teams-js` from Phase 86 is not used here.
- ✅ **No AI.** Source-text + rendered-DOM forbidden-vocab scans pin the contract.
- ✅ **No notification surface.** No Teams card, no Outlook send, no push. Forbidden vocab `notification`, `pushed`, `delivered`, `real-time` scanned out.
- ✅ **No cross-device sync.** Forbidden vocab `(is|was|has been) synced` scanned out.
- ✅ **No workflow resolution.** Forbidden vocab `(is|was|has been) resolved/completed/closed`, `workflow updated`, `acknowledged`, `system handled`, `official record/state/status` scanned out.
- ✅ **No permission widening.** Card scopes itself to already-loaded banker / manager-authorized data.
- ✅ **No executive expansion.** Executive workspace untouched.

## Test + build counts (at acceptance)

- Full suite: **1685 / 1685 passing** (Phase 90 baseline 1647 → +38: 29 helper + 10 banker + 9 manager + 3 inventory − 13 reconciled overlap; recomputed against actual run after writeup).
- `tsc -b && vite build`: clean (verified separately).

## Recommended next phase

After Phase 91 the per-item interaction layer on the catch-up surface is complete in-repo. Strongest next moves:

1. **Phase 92 candidate — "Mark all seen" affordance on the catch-up cards.** Small UI button that bumps the Phase 90 marker to `now` without the 2-second settle. No new data; tiny implementation; closes a real UX gap.
2. **Phase 92 candidate — Per-banker filter on the manager surfaces.** Lets a manager focus both the rollup and the catch-up feed on a single banker's deals. Pure UI / state.
3. **Phase 92 candidate — Memo consistency findings on the rollups + catch-up.** Closes the 8th and final Phase 80 signal at the cost of loading sections team-wide.
4. **Phase 92 candidate — Phase 85 Candidate B (copy-to-Teams deal summary).** No-admin Teams runner-up.
5. **Phase 92 candidate — Snooze-duration preference.** Replace the hardcoded 24h with user-selectable durations (1h / 4h / 1d / next-monday). Small; sibling to Phase 91 itself.

**Recommendation: Phase 92 — Per-banker filter on the manager surfaces.** Highest user value of the remaining no-admin / no-schema moves. The manager rollup + catch-up are now richer than they have ever been; a filter UI is the natural next-step a manager would ask for to handle teams with many bankers. Pure UI; no new data; reuses existing state pattern.
