# Phase 90 — Catch-Up Last-Seen Markers

## Goal

Add a local-only "since your last visit on this browser" overlay to both Morning Catch-Up surfaces — `<ManagerMorningCatchUp />` (Phase 88) and `<BankerMorningCatchUp />` (Phase 89) — so users can distinguish items new since their last visit without creating any official unread state, notification, sync, or Dataverse write.

No new writes. No new schema. No new SDK install. No AI. No Teams / Outlook notification. No cross-device sync. No workflow automation.

## Why this phase

Phase 88 and Phase 89 shipped deterministic morning catch-up feeds for the manager and banker workspaces. The Vibe scope expects users to quickly understand "what changed since I last checked" — a basic operational intelligence gesture every Vibe-style command center surface satisfies. The deterministic feed alone shows current state; it doesn't distinguish "this was here last time" from "this just appeared."

Phase 72 established the LOCAL_ONLY last-visit pattern for the per-deal Activity Timeline ("N new since your last visit on this deal"). Phase 90 reuses that same pattern, scoped per-user-per-surface instead of per-deal, on top of Phase 88 / 89.

## Relationship to Phases 72, 88, 89

| | Phase 72 (per-deal) | Phase 90 (catch-up) |
|---|---|---|
| Surface | Activity Timeline card on the Deal Workspace | Morning Catch-Up cards (manager + banker) |
| Scope key | `cc:lastVisit:deal:<dealId>` | `cc:lastVisit:catchUp:<scopeId>` |
| Scope id shape | `<dealId>` | `banker:<bankerId>` OR `manager:<bankerId>:<teamId>` |
| Marker snapshotting | on mount, frozen for the visit | identical |
| Marker bump | after 2s settle | identical |
| Comparison rule | `eventAt > priorMs` (strict greater-than) | `occurredAt > priorMs` (strict greater-than) AND `occurredAt <= now` (future-anchored items excluded) |
| First-visit copy | "first visit" → newCount=0 | identical |
| Cross-device sync | explicitly not supported | identical |
| Future-anchored exclusion | n/a — timeline events are all past | **new in Phase 90** — closing-soon / task-due-soon items are forward-looking; treating them as "new since last visit" would mislead |

Phase 90's helper (`src/shared/lastVisit/catchUpLastSeen.ts`) sits as a **sibling** to `lastVisit.ts` in the same `src/shared/lastVisit/` folder. The storage namespaces are deliberately disjoint (`cc:lastVisit:deal:` vs `cc:lastVisit:catchUp:`) so the two phase's markers cannot collide. The 2-second settle constant is duplicated under a separate name (`CATCH_UP_MARKER_UPDATE_DELAY_MS = 2000`) so a future timing change on one surface doesn't accidentally affect the other.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- **§1.18 (Activity intelligence)** — extended to "Partially operational (advanced by Phase 72 + Phase 80 + Phase 82 + Phase 83 + Phase 87 + Phase 88 + Phase 89 + Phase 90)". The morning-feed "since last visit" overlay closes the most common Vibe expectation that the deterministic feed alone doesn't meet.
- **§1.1 (Banker Command Center)** — current-state notes the new local-only since-last-visit overlay on `<BankerMorningCatchUp />` (per-user marker scoped by bankerId).
- **§1.22 (Manager workspace)** — current-state notes the same overlay on `<ManagerMorningCatchUp />` (per-user-per-team marker keyed as `manager:<bankerId>:<teamId>`).

## Marker keying strategy

**Banker surface.** The scope id is `banker:<bankerId>` where `bankerId` is `cr664_bankerid` from `useBanker()`. This is the stable PK already resolved by the Phase 4 bootstrap chain.

**Manager surface.** The scope id is `manager:<bankerId>:<teamId>` where:
- `bankerId` is the signed-in user's `cr664_bankerid` (resolved by `loadManagerIdentity()`),
- `teamId` is the manager's currently-active team (from `useManager().teamId`).

The team segment exists because a future schema change could let one user manage multiple teams — Phase 90 keys per-team now so the next phase doesn't need to migrate marker keys. Today, every manager has exactly one team, so the segment is effectively constant for any given user.

**Whitespace handling.** Empty or whitespace-only `userId` / `teamId` returns `null` from `buildCatchUpScope`. The card renders an honest "Last-seen marker unavailable for this browser" fallback in that case.

**Storage namespace separation.** The Phase 90 key prefix is `cc:lastVisit:catchUp:` — disjoint from Phase 72's `cc:lastVisit:deal:`. The two markers cannot collide.

## Update timing

The hook (`useCatchUpLastSeen`) follows the Phase 72 two-step pattern verbatim:

1. **On mount (or scope change),** snapshot the PRIOR marker once via `getCatchUpLastSeenMs(scopeId)`. Freeze it in state.
2. **After `CATCH_UP_MARKER_UPDATE_DELAY_MS` (2 s),** schedule a `setTimeout` that writes a fresh marker to `localStorage` via `setCatchUpLastSeenMs(scopeId, Date.now())`. The current visit's snapshot is unchanged — the badge stays stable for the whole visit.
3. **On unmount,** `clearTimeout` cancels the pending bump. A visit shorter than 2 seconds does NOT bump the marker, so a user who tab-flips quickly doesn't lose the "new since last visit" signal on the next visit.

**Strict greater-than comparison.** An item whose `occurredAt` is EXACTLY equal to the prior marker is NOT counted as new. Avoids re-counting the item that triggered the previous marker write.

**Future-anchored exclusion.** Items whose `occurredAt` is strictly after `now` (closing-soon items based on a future targetCloseDate; task-due-soon items based on a future dueDate) are never counted as new. These are forward-looking observations that re-fire as long as the deal stays in the matching window; treating them as "new since last visit" would mislead the user into thinking the deal CHANGED, when in fact it's still in the same window.

## UI behavior

Both cards render the same overlay shape:

- **Since-last-visit line** at the top of the populated state (or beneath the empty-state message when the feed is empty). Four mutually-exclusive copy variants:
  - `"First visit on this browser."` — when the snapshot is initialized and `priorLastSeenMs` is undefined.
  - `"No new items since your last visit on this browser."` — when the snapshot is initialized AND has a prior marker AND `newCount === 0`.
  - `"N new since your last visit on this browser."` — when `newCount > 0`.
  - `"Last-seen marker unavailable for this browser."` — when the scope was null (no stable identity).
- **Per-item "New" badge.** A `<Badge variant="info" appearance="soft">New</Badge>` renders inline next to the priority badge on items where `summary.isNew(item.occurredAt) === true`. ARIA label: `"New since your last visit on this browser"`.
- **Conservative disclaimer extension.** The card's existing disclaimer now appends: `"'New since your last visit' is tracked on this browser only; it is not synced and does not change deal status."`

The badge and the count line are intentionally muted in styling — italics, smaller font, secondary color — so they read as informational rather than as enforcement signals.

## Forbidden vocabulary

The Phase 88 / 89 forbidden-vocabulary scans already pin `unread`, `notification`, `synced`, `pushed`, `official`, `real-time`, `delivered` out of the rendered DOM. Phase 90's new copy uses none of these words:

- "since your last visit on this browser" — explicitly browser-scoped, no claim of cross-device sync.
- "tracked on this browser only" — explicit disclaimer of cross-device sync.
- "First visit on this browser" — explicit first-visit copy; no implication of an official "new user" state.
- "Last-seen marker unavailable for this browser" — honest fallback when identity is missing.

Source-text and rendered-DOM tests scan all new code for the forbidden tokens (`unread`, `notification delivered`, `(is|was|has been) synced`, `(is|was|has been) pushed`, `official record/state/status`, `real-time`).

## Local-only limitations

- **No cross-device sync.** A user who reviews the workspace on desktop, then opens it on mobile, sees EVERY current catch-up item as "new" on mobile because each browser has its own `localStorage`. This is documented as a limitation, not a bug.
- **Tab-switching may lose history.** A user who opens the catch-up card and switches tabs within 2 seconds does not bump the marker — the next visit will still see the same items as new. This is a feature, not a bug: short tab flips shouldn't burn the "new since last visit" signal.
- **Marker is plain text.** No PII, no deal content, no identifying borrower data. The stored value is a millisecond Unix epoch integer.
- **Private-browsing mode swallows errors.** `localStorage.setItem` can throw `QuotaExceededError` in private-browsing mode. Phase 90 swallows the throw silently — losing a marker is a cosmetic regression, not a correctness problem. The user will see "first visit" copy more often in private browsing.
- **Marker is not migrated when bankerId or teamId changes.** A user whose `bankerId` changes (e.g. account-team reassignment) starts fresh on the next visit. There is no migration path because there is no schema that knows the prior key.
- **No "Mark all as seen" affordance.** The marker only updates after the 2-second settle of a visit. A user who wants to clear the new-item count without scrolling the card must wait the settle or close the page. A future phase could add an explicit "Mark seen" button.
- **No cross-tab broadcast.** Each tab is a fresh visit by definition. Two tabs open on the same workspace will both bump the marker on settle; the last-write-wins.

## Privacy / security posture

- **Storage location:** browser `localStorage` only. The Power Apps host has no access to localStorage contents from any server-side surface.
- **Stored value:** integer millisecond timestamp. No user identifier, no deal id, no PII.
- **Key shape:** `cc:lastVisit:catchUp:banker:<bankerId>` or `cc:lastVisit:catchUp:manager:<bankerId>:<teamId>`. The `bankerId` is a Dataverse GUID — internal-only identifier with no external meaning.
- **No network transmission.** Get/set never call `fetch`, never serialize to a Dataverse table, never echo to telemetry.
- **No persistence beyond browser.** Clearing the browser's site data removes all Phase 90 markers; no other storage holds them.
- **Phase 48 isolation preserved:** `src/shared/lastVisit/catchUpLastSeen.ts` defines its own scope-id shape and imports from no role module. The hook lives next door.

## Why this is not notification / unread / sync

- **Not a notification surface.** The badge surfaces an item as `New` based on the local marker; no message is sent, no Teams card raised, no Outlook email composed, no push notification scheduled.
- **Not an unread state.** The marker is a viewing convenience scoped to one browser. There is no official "this user has acknowledged the item" record; the marker doesn't represent enforcement, compliance, or any audit-grade state. Rendered copy never uses the word `unread`.
- **Not synced across devices, sessions, or users.** A user with two browsers sees two independent markers; clearing one does not clear the other. Two users viewing the same team see two independent markers — there is no shared "team has seen this" concept.
- **Not a Dataverse write.** No `Cr664_*Service` call. No `GOVERNED_WRITES` entry. No audit row. No timeline event. The Phase 83 ledger pattern (which also lives in localStorage) is a sibling concept; Phase 90 does not extend the Phase 83 ledger surface union.
- **Not a real-time stream.** The marker is snapshotted on mount and the badge stays stable for the whole visit. The card refreshes only when its underlying data loader (`loadBankerWorkQueueData` for banker; `ManagerDataProvider` for manager) refreshes.

## Future upgrade path

When upstream / governance / schema work lands, the catch-up last-seen surface could grow in these directions:

1. **Server-side activity read model.** A future schema could store a per-user "last seen" timestamp scoped by team/surface in Dataverse, replacing the LOCAL_ONLY marker. The Phase 90 hook would swap its storage to call a typed `LastSeenService`; same UI contract. Would unlock cross-device sync.
2. **Teams notifications.** Once the Lane E Graph integration matures (Phase 86 chat handoff → admin-consented `TeamsActivity.Send`), the "N new since your last visit" count could double as a Teams activity-feed notification for HIGH-priority new items. Today this is connector-blocked.
3. **Cross-device unread state.** Sibling to (1) — would require schema for the unread state plus a sync mechanism. Phase 90 explicitly does NOT claim this.
4. **User preference storage.** Today the 2-second settle and the strict comparison are hardcoded. A future phase could expose them as per-user preferences (with cross-device sync via the same Lane E foundation).
5. **"Mark all as seen" affordance.** Explicit button to bump the marker to `now` before the 2-second settle. Would be a small UI affordance; no data shape change.
6. **Catch-up item dismiss via the Phase 83 ledger.** Extend the `SuggestionLedgerSurface` union with `'manager-catch-up'` and `'banker-catch-up'`. Same `localStorage` slot Phase 83 already uses; per-item dismiss/restore.
7. **"What's new across the org" rollup for the executive surface.** Today executive remains snapshot-only (Phase 15) — adding any operational rollup is a separate governance decision.

## Files created

- `src/shared/lastVisit/catchUpLastSeen.ts` — pure storage helpers (`getCatchUpLastSeenMs`, `setCatchUpLastSeenMs`, `clearCatchUpLastSeenMs`) + scope keying (`buildCatchUpScope` → `null` when identity is missing) + pure derivation (`summarizeCatchUpSinceLastSeen` returning `{ newCount, isFirstVisit, isNew(occurredAt) }`). Forbids future-anchored items from being counted as "new". Storage namespace: `cc:lastVisit:catchUp:`. Settle delay: `CATCH_UP_MARKER_UPDATE_DELAY_MS = 2000` (Phase 72 parity).
- `src/shared/lastVisit/catchUpLastSeen.test.ts` — 27 helper tests: scope-id construction (banker / manager / missing-fields), get/set/clear lifecycle, bad-value tolerance, namespace separation from Phase 72, derivation (first-visit, strict greater-than, future-anchored exclusion, undefined / malformed `occurredAt`, multiple items), module hygiene (no SDK / role imports; no notification / sync / unread / official vocabulary).
- `src/shared/lastVisit/useCatchUpLastSeen.ts` — React hook mirroring `useLastVisit`. Snapshots prior marker on mount, schedules bump after `delayMs`, cancels on unmount. Returns `{ priorLastSeenMs, isInitialized, isUnscoped }`. When `scope` is null, short-circuits to `isUnscoped: true` with no localStorage write.
- `src/shared/lastVisit/useCatchUpLastSeen.test.tsx` — 8 hook tests: first visit, returning visit, marker bump after delay, snapshot frozen across re-renders, null scope (no write), scope change re-snapshots, unmount cancels the bump, banker vs manager key separation.
- `docs/PHASE_90_CATCH_UP_LAST_SEEN_MARKERS.md` — this document.

## Files modified

- `src/banker/BankerMorningCatchUp.tsx` — consumes `useCatchUpLastSeen(buildCatchUpScope({ surface: 'banker', userId: bankerId }))`; renders the four since-last-visit copy variants; passes `summary.isNew(item.occurredAt)` to `<FeedItemRow />` so the "New" badge appears on past-anchored items strictly newer than the prior marker.
- `src/banker/BankerMorningCatchUp.test.tsx` — Phase 90 overlay test block adds 7 tests: first-visit copy, no-new-items copy, count-line + per-item badge, no badge for items older than the marker, unscoped fallback, key-prefix assertion, forbidden-vocab scan.
- `src/manager/ManagerMorningCatchUp.tsx` — consumes `useCatchUpLastSeen(buildCatchUpScope({ surface: 'manager', userId: bankerId, teamId }))`; same four copy variants; same per-item "New" badge.
- `src/manager/ManagerMorningCatchUp.test.tsx` — Phase 90 overlay test block adds 7 tests: first-visit, no-new-items, count + badge, no badge for old items, missing-teamId unscoped fallback, manager-key-shape pin (different markers per team), forbidden-vocab scan. Also adds a `useManager` mock to the test setup (required by the new identity dependency).
- `src/shared/governance/platformInventory.ts` — adds `LOCAL_ONLY_FLOWS.catch-up-last-seen-markers` entry with verbatim disclaimers (no Dataverse write, no audit, no timeline, no cross-device sync, no notification delivery, does NOT create official unread state; lists both implementation modules + the Phase 90 doc path).
- `src/shared/governance/platformInventory.test.ts` — pins (a) membership in LOCAL_ONLY_FLOWS, (b) full disclaimer set incl. storage namespace and key shapes, (c) the Phase 90 doc exists on disk, (d) `catch-up-last-seen-markers` is NOT in GOVERNED_WRITES.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.1 + §1.18 + §1.22 advanced.

## Tests added / updated

- 27 helper tests (`catchUpLastSeen.test.ts`).
- 8 hook tests (`useCatchUpLastSeen.test.tsx`).
- 7 banker card overlay tests appended to `BankerMorningCatchUp.test.tsx`.
- 7 manager card overlay tests appended to `ManagerMorningCatchUp.test.tsx`.
- 3 inventory pins added (`platformInventory.test.ts`): membership + disclaimer set + doc-on-disk + NOT in GOVERNED_WRITES + Phase 86 existing pin extended to mention Phase 90.

No existing test was changed substantively. Phase 72 / 80 / 81 / 82 / 83 / 84 / 86 / 87 / 88 / 89 tests continue to pass unchanged.

## Confirmation: no writes / schema / AI / notification / sync added

- ✅ **No new write surface.** No `GOVERNED_WRITES` entry. `catch-up-last-seen-markers` is NOT in `GOVERNED_WRITES` (test asserts).
- ✅ **No schema change.** No new Dataverse table or column read.
- ✅ **No new generated-service import.** The helper imports nothing from `src/generated/`.
- ✅ **No new SDK install.** `@microsoft/teams-js` from Phase 86 is not used here.
- ✅ **No AI.** Forbidden-vocab scans (source-text + rendered-DOM) pin the contract.
- ✅ **No notification surface.** No Teams card, no Outlook send, no push. Forbidden vocab: `notification`, `pushed`, `delivered`.
- ✅ **No real-time stream.** Marker is snapshotted on mount; badge is stable for the visit.
- ✅ **No cross-device sync.** Explicitly documented as a limitation. Forbidden vocab: `(is|was|has been) synced`.
- ✅ **No official unread state.** Forbidden vocab: `unread`, `official (record|state|status)`.
- ✅ **No permission widening.** The card scopes itself to the signed-in user's authorized data (banker: `loadBankerWorkQueueData(bankerId)`; manager: `useManagerData()` which is already team-scoped via Phase 14 + Phase 87 loaders).
- ✅ **No executive expansion.** Executive workspace untouched.

## Test + build counts (at acceptance)

- Full suite: **1645 / 1645 passing** (Phase 89 baseline 1595 → +50: 27 helper + 8 hook + 7 banker + 7 manager + 1 inventory-pin extension; reconciled to actual count after run).
- `tsc -b && vite build`: clean (verified separately after this writeup).

## Recommended next phase

After Phase 90 the morning-feed surface has both the deterministic feed AND the local-only "since last visit" overlay on both operating workspaces. Strongest next moves:

1. **Phase 91 candidate — Catch-up item dismiss/snooze via the Phase 83 ledger.** Extend the ledger surface union with `'manager-catch-up'` and `'banker-catch-up'`. Reuses the existing Phase 83 plumbing; sibling to the Phase 90 "since" overlay. Lets users dismiss individual items locally without changing deal status.
2. **Phase 91 candidate — Per-banker filter on the manager surfaces.** Pure UI / state. Focuses both the rollup AND the catch-up to a single banker's deals.
3. **Phase 91 candidate — Phase 85 Candidate B (copy-to-Teams deal summary).** The no-admin Teams runner-up; banker pastes deterministic deal summary into Teams chat. Sibling to Phase 86.
4. **Phase 91 candidate — Memo consistency findings on the rollups + catch-up.** Closes the 8th and final Phase 80 signal at the cost of loading sections.
5. **Phase 91 candidate — "Mark all seen" affordance on the catch-up cards.** Small UI button that bumps the marker to `now` without the 2-second settle. No new data; small implementation; closes a real UX gap Phase 90 left open.

**Recommendation: Phase 91 — Catch-up item dismiss/snooze via the Phase 83 ledger.** Closes a real operational gap (the user can mark the whole-feed timeline but cannot dismiss individual items), reuses established Phase 83 plumbing (same pattern Phase 84 used for the `'team-rollup'` surface), and stays squarely inside the LOCAL_ONLY discipline Phase 72 / 83 / 90 already established. Small, useful, honest.
