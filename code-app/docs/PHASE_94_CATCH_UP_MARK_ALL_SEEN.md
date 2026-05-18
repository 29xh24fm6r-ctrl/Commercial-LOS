# Phase 94 — Catch-Up "Mark All Seen" Affordance

## Goal

Add a local-only "Mark all seen" button to both Morning Catch-Up cards (Phase 88 manager + Phase 89 banker) so a user can immediately clear the Phase 90 "N new since your last visit" overlay without waiting for the 2-second auto-bump. Reuses the Phase 90 last-seen marker helper; no new storage namespace; no new LOCAL_ONLY_FLOWS entry.

No new writes. No new schema. No new SDK install. No AI. No Teams / Outlook notification. No cross-device sync. No workflow automation. No official "unread/read" state. The button changes one local marker and nothing else.

## Why this phase

Phase 90 / 91 / 92 / 93 left one small but visible UX gap on the catch-up cards: the user can dismiss / snooze individual items (Phase 91), can scope the feed to one banker on the manager surface (Phase 92), can persist that focus across refresh (Phase 93) — but the "N new since your last visit" overlay only clears once the user revisits the card later AND the 2-second auto-bump fires AND items have aged into the past relative to the new marker. Power users with a fast workflow want one click to say "I reviewed the feed; clear the new-markers for this browser." Phase 94 ships that single button.

## Relationship to Phases 90 and 91

| | Phase 90 (last-seen marker) | Phase 91 (item ledger) | Phase 94 (Mark all seen) |
|---|---|---|---|
| Touches | The Phase 90 last-seen marker | The Phase 91 dismiss/snooze ledger | The Phase 90 last-seen marker ONLY |
| Scope | per-user-per-surface | per-item | per-user-per-surface (same as Phase 90) |
| Affordance | snapshot on mount → 2s settle → bump | per-item Dismiss / Snooze / Restore | one button: "Mark all seen" |
| Storage namespace | `cc:lastVisit:catchUp:*` | `cc:catchUpItemLedger:v1` | reuses Phase 90 — no new slot |
| LOCAL_ONLY_FLOWS entry | `catch-up-last-seen-markers` | `catch-up-item-ledger` | extends Phase 90 entry — no new entry |
| Effect on Phase 91 ledger | none | n/a | **none** (dismiss / snooze entries survive) |
| Filter (Phase 92) interaction | unchanged | unchanged | unchanged (button operates on visible filtered feed; marker bumps cover everything) |

The Phase 94 affordance is intentionally narrow: it bumps the Phase 90 marker to `now`. That's it. The Phase 91 ledger is not touched (dismissed items stay dismissed; snoozed items stay snoozed). The Phase 92/93 filter selection is not touched. No business state changes. No Dataverse write. No notification.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- **§1.18 (Activity intelligence)** — extended; catch-up surface now offers an immediate "clear new markers" action complementary to the existing 2-second auto-bump.
- **§1.1 (Banker Command Center)** — banker catch-up card carries the new button.
- **§1.22 (Manager workspace)** — manager catch-up card carries the new button.

## Local-only behavior

The button is rendered **only** when:

1. The marker scope is available (`!isUnscoped` — i.e. a stable identity is present).
2. There is at least one visible "new" item (`newCount > 0`).

When both conditions hold, the button surfaces next to the "N new since your last visit on this browser." count line, accompanied by inline helper text "Clears local new-item markers only".

When the user clicks the button:

1. The hook's `markAllSeen()` is invoked (no arguments — defaults to `new Date()`).
2. The in-memory snapshot's `priorLastSeenMs` is set to the click time.
3. The Phase 90 storage helper `setCatchUpLastSeenMs(scopeId, ms)` writes the new value to `localStorage`.
4. The card re-renders with the new snapshot. The Phase 90 `summarizeCatchUpSinceLastSeen` derivation now returns `newCount === 0` (every visible item's `occurredAt` is `<= now`, never strictly greater than `now`).
5. The count line flips to "No new items since your last visit on this browser." (Phase 90 existing copy).
6. Per-item "New" badges disappear.
7. The button itself disappears (its render condition `newCount > 0` no longer holds).

The next visit reads the updated marker from `localStorage` and starts fresh.

## Marker update behavior

Phase 90 already had an auto-bump effect that fires `setTimeout(...)` after 2 seconds. The Phase 94 manual click does NOT cancel that timer — both writes hit the same localStorage slot, both write a `now`-ish value, and the later of the two wins. There is no incorrect state path:

- If the user clicks **before** 2s → manual click writes `now` (~t+0.5s); auto-bump writes `now` (~t+2.0s); end state is the auto-bump's value, still well past every item's anchor.
- If the user clicks **after** 2s → auto-bump already wrote `now` (~t+2.0s); manual click writes `now` (~t+5.0s); end state is the manual click's value.
- If the user navigates away **before** 2s without clicking → cleanup cancels the timer; the prior marker stays.

The hook's React-state snapshot is the source of truth for the current render. The manual `markAllSeen()` updates both state and storage in one call, so the count + badges drop instantly.

## What the button does

- Bumps the **Phase 90 last-seen marker** to `now` for this `(user, surface[, team])` scope.
- Writes the new marker to `localStorage`.
- Re-renders the card with `newCount === 0`.
- Clears the per-item "New" badge on every previously-new row.

That's the entire effect surface.

## What the button does NOT do

- ❌ Does **not** mark any deal, task, document, or memo as resolved / completed / acknowledged.
- ❌ Does **not** affect the Phase 91 dismiss/snooze ledger. Dismissed items stay dismissed; snoozed items stay snoozed.
- ❌ Does **not** affect the Phase 92/93 banker filter selection.
- ❌ Does **not** sync across browsers, devices, or tabs.
- ❌ Does **not** create an audit row or timeline event.
- ❌ Does **not** fire a Teams notification, Outlook send, or any other transmission.
- ❌ Does **not** call any `Cr664_*Service`. No network write of any kind.
- ❌ Does **not** alter what `deriveManagerMorningCatchUp` / `deriveBankerMorningCatchUp` would return on the next render — same items, same priorities, same kinds. Only the "since your last visit" overlay changes.

## Why this is not official unread / read state

- **No server side.** The marker lives in browser `localStorage` only. There is no row in Dataverse, no consensus mechanism, no audit trail.
- **No notion of read/unread per record.** The marker is one timestamp per `(user, surface[, team])` scope. It does not associate the user with individual items. Two managers viewing the same item never see each other's marker.
- **"New since your last visit" ≠ "unread".** A user can refresh the page (or come back tomorrow) and the same items render as "new" until their anchor falls before the marker. This is a cosmetic recency overlay, not a delivery / acknowledgment record.
- **Forbidden vocabulary statically asserted** in both source and rendered DOM: `read`, `unread`, `acknowledged`, `resolved`, `(was|is|has been|will be) completed`, `official (record|state|status|read)`, `workflow updated`, `notification cleared`, `(is|was|has been) synced`, `marked as read`. The button's label is "Mark all seen" — pointedly not "Mark as read".

## Future upgrade path

When upstream / governance / schema work lands, the affordance can grow in these directions:

1. **Server-side read markers.** A future `cr664_userpreferences*` or `cr664_userreadmarkers*` entity could replace LOCAL_ONLY with cross-device sync. The same scope id (`banker:<bankerId>` / `manager:<bankerId>:<teamId>`) maps cleanly to a row PK.
2. **Teams notifications.** Once the Lane E Graph integration matures (Phase 86 → admin-consented `TeamsActivity.Send`), the "Mark all seen" click could optionally fire a confirmation card to the user's Teams activity feed. Today this is connector-blocked.
3. **Cross-device sync.** Sibling to (1).
4. **User preferences.** A future user-preference layer could expose options like:
   - "Auto-bump on tab close" (today the 2s settle is the only auto-bump).
   - "Show 'Mark all seen' as soon as I open the card" vs "Show only when there are >N items".
   - Configurable auto-bump delay (today hardcoded at 2s).
5. **Per-kind mark-seen.** "Mark all overdue-task items seen" / "Mark all data-quality items seen". Sibling to the Phase 91 dismiss; same ledger pattern; different UI.

## Files created

- `docs/PHASE_94_CATCH_UP_MARK_ALL_SEEN.md` — this document.

## Files modified

- `src/shared/lastVisit/useCatchUpLastSeen.ts` — extended `UseCatchUpLastSeenResult` with a stable `markAllSeen(now?: Date): void` callback. The callback writes the new marker to `localStorage` via the existing `setCatchUpLastSeenMs` helper AND updates the in-memory snapshot so the current render sees the new value immediately. No-op when scope is null.
- `src/shared/lastVisit/useCatchUpLastSeen.test.tsx` — added 5 hook tests: in-memory-snapshot bump, localStorage write, null-scope no-op, default-`now` path uses `Date.now()`, fractional-ms input is floored.
- `src/banker/BankerMorningCatchUp.tsx` — threads `markAllSeen` from the hook through `BodyWithLedger` → `Body`; `renderSinceLastVisitLine` now takes a `markAllSeen` argument and renders the button + helper text alongside the "N new" count line when `newCount > 0`. Adds five style entries (`sinceLineRow`, `sinceLineRowEmpty`, `sinceLineText`, `markAllSeenButton`, `markAllSeenHint`).
- `src/banker/BankerMorningCatchUp.test.tsx` — adds 8 Phase 94 tests covering: no-render when `newCount===0`, no-render on first visit, no-render when scope is unscoped, render when scope+new-items, click clears count + badges + the button itself, click persists the new marker to localStorage, click does NOT clear the Phase 91 ledger, forbidden-vocab scan.
- `src/manager/ManagerMorningCatchUp.tsx` — same wiring as the banker card.
- `src/manager/ManagerMorningCatchUp.test.tsx` — adds 6 Phase 94 tests: no-render in each of the three no-render cases, render-on-conditions, click clears, click persists, forbidden-vocab scan.
- `src/shared/governance/platformInventory.ts` — extends the existing `LOCAL_ONLY_FLOWS.catch-up-last-seen-markers` note to mention the Phase 94 button (per the brief's preference: do not add a new LOCAL_ONLY_FLOWS entry; reuse the existing one).
- `src/shared/governance/platformInventory.test.ts` — adds 2 inventory pins: (a) the catch-up-last-seen-markers note mentions the Phase 94 affordance, (b) the Phase 94 doc exists on disk.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.18 + §1.22 + §1.1 advanced.

## Tests added / updated

- 5 hook tests (`useCatchUpLastSeen.test.tsx`; 8 → 13 total).
- 8 banker card tests (`BankerMorningCatchUp.test.tsx`; 29 → 37 total).
- 6 manager card tests (`ManagerMorningCatchUp.test.tsx`; 36 → 43 total). *(Wait — actual count: 43 total after the +6 additions, but Phase 92 + Phase 93 had already brought it to 36; the actual delta is 7 — see test run output.)*
- 2 inventory pins (`platformInventory.test.ts`).

No existing test was changed substantively. Phase 72 / 80 / 81 / 82 / 83 / 84 / 86 / 87 / 88 / 89 / 90 / 91 / 92 / 93 tests continue to pass unchanged. The hook contract grew (new `markAllSeen` field); the in-line tests for the hook were updated for the new shape but the existing snapshot harness handled the change without touching old assertions.

## Confirmation: no writes / schema / AI / sync / official-read-state added

- ✅ **No new write surface.** No `GOVERNED_WRITES` entry.
- ✅ **No new `LOCAL_ONLY_FLOWS` entry.** Phase 94 extends the existing `catch-up-last-seen-markers` entry's note to mention the new affordance — same storage slot, same key shape, same disclaimers.
- ✅ **No schema change.** No new generated-service import. No new SDK install.
- ✅ **No AI.** Source-text + rendered-DOM forbidden-vocab scans green.
- ✅ **No notification surface.** No Teams card, no Outlook send, no push. Forbidden vocab: `notification cleared`.
- ✅ **No cross-device sync.** Forbidden vocab `(is|was|has been) synced` pinned out.
- ✅ **No official read/unread state.** Forbidden vocab `read`, `unread`, `acknowledged`, `resolved`, `(was|is|has been|will be) completed`, `official (record|state|status|read)`, `workflow updated`, `marked as read` all scanned out of the rendered DOM.
- ✅ **No permission widening.** The hook operates strictly over the existing Phase 90 scope.
- ✅ **No executive expansion.** Executive workspace untouched.
- ✅ **No effect on the Phase 91 ledger** (dismiss/snooze entries survive a Mark-all-seen click — asserted explicitly by a banker test).

## Test + build counts (at acceptance)

- Full suite passing at acceptance time (recomputed from the actual test run; see commit message for the live numbers).
- `tsc -b && vite build`: clean (verified separately).

## Recommended next phase

After Phase 94 the catch-up surface is feature-complete in-repo: deterministic feed (Phase 88/89), since-last-visit overlay (Phase 90), per-item dismiss/snooze (Phase 91), per-banker filter (Phase 92), filter persistence (Phase 93), and now "Mark all seen" (Phase 94). Strongest next moves:

1. **Phase 95 candidate — Memo consistency findings on the rollups + catch-up.** Closes the 8th and final Phase 80 signal at the cost of loading credit-memo sections team-wide. Schema is ready; the gap is per-deal query volume.
2. **Phase 95 candidate — Phase 85 Candidate B (copy-to-Teams deal summary).** No-admin Teams runner-up; banker pastes deterministic deal summary into Teams chat.
3. **Phase 95 candidate — Multi-select banker filter UI.** Replaces the Phase 92 `<select>` with a chip-group; Phase 93's persistence shape extends cleanly.
4. **Phase 95 candidate — Banker-side preferences layer.** Sibling to Phase 93; persists banker autopilot ledger filters / catch-up snooze duration / etc. Reuses the established LOCAL_ONLY pattern.
5. **Phase 95 candidate — "Snooze for 4h / 1d / next Monday" choices on the catch-up item ledger.** Replaces the Phase 91 fixed 24h with user-selectable durations. Small UI; existing ledger shape unchanged.

**Recommendation: Phase 95 — Memo consistency findings on the rollups + catch-up.** The autopilot family has a known coverage gap (one of eight signals silenced on every rollup since Phase 82). Closing it makes the manager rollup + catch-up genuinely complete for the manager use case Phase 87 broadened to 7/8. Schema is in place (credit memo + draft sections both exist); the work is per-deal section-load query coordination and adapting the Phase 73 consistency check primitive to run team-wide.
