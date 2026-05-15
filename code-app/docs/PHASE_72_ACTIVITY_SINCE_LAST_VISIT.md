# Phase 72 — Activity Since Last Visit

**Phase posture.** `local-only flow`. Adds a banker-facing
"activity since last visit" signal on the Deal Workspace Activity
Timeline card. Per-deal last-viewed marker lives in
`localStorage`; the derivation is pure. No Dataverse write, no
audit row, no timeline event, no AI, no Teams notification, no
Outlook sync, no cross-device sync. New `LOCAL_ONLY_FLOWS` entry
(`activity-since-last-visit`) registers the surface.

**Vibe capability advanced.** Closes the in-repo rule-based slice
of §1.18 Activity intelligence from the Phase 69 Vibe Capability
Coverage Map. Lane A roadmap item #3.

Related canonical sources:
- [src/shared/lastVisit/lastVisit.ts](../src/shared/lastVisit/lastVisit.ts) — pure storage helpers + derivation.
- [src/shared/lastVisit/useLastVisit.ts](../src/shared/lastVisit/useLastVisit.ts) — React hook with marker-after-delay pattern.
- [src/deals/ActivityTimeline.tsx](../src/deals/ActivityTimeline.tsx) — Phase 72 wiring (subtitle + per-row "New" badge).
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `LOCAL_ONLY_FLOWS.activity-since-last-visit`.
- [docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — §1.18 updated.

---

## 1. Local-only nature

Everything Phase 72 ships is browser-local:

- **State**: per-deal millisecond Unix-epoch timestamp in
  `localStorage` under the key prefix `cc:lastVisit:deal:` + deal
  id. Plain integer, no PII, no deal content, no borrower data.
- **Comparison surface**: existing timeline data already loaded
  by `DealDataProvider`. No new query, no new entity, no
  Dataverse roundtrip.
- **Side effects**: one localStorage write per deal visit, after
  a 2-second settle. That is the entire footprint.

What this phase deliberately does NOT do:

- Write the marker to Dataverse (no `cr664_*UserPreference`
  entity; none would be added by this phase).
- Emit an audit row when the banker opens the timeline.
- Emit a timeline event when the banker opens the timeline.
- Send a Teams notification, an Outlook email, or any other
  external message.
- Subscribe to localStorage events across tabs (a fresh tab is
  treated as a fresh visit by design).
- Sync the marker across the banker's devices (desktop vs.
  mobile; vs. tablet) — each browser keeps its own marker.

## 2. Marker behavior

1. **On mount** (`useLastVisit(dealId)`), the hook reads
   `localStorage.getItem(prefix + dealId)`. The value is the
   marker from the PRIOR visit (or `undefined` on first visit).
2. The prior marker is snapshotted into React state so it stays
   stable for the rest of this visit. The UI uses the snapshot
   for derivation.
3. **After `MARKER_UPDATE_DELAY_MS` (2000ms)**, the hook writes
   a fresh marker = `Date.now()` to localStorage. The next visit
   reads THIS value as its prior marker.
4. **On unmount** before the delay elapses, the scheduled write
   is cancelled — a quick tab switch does not reset history.

The two-step (snapshot, then bump) is deliberate: it gives the
banker time to read the "N new since your last visit" badge
before the marker advances. Without the delay, the badge would
clear instantly on render.

## 3. Derivation (rule-based, deterministic)

`summarizeActivitySinceLastVisit(events, priorLastVisitMs)`
returns:

- `newCount` — count of events whose `eventAt` is **strictly
  after** the prior marker. Events at exactly the marker
  timestamp are NOT counted as new (avoids re-counting the event
  that triggered the previous marker write).
- `latestNewAt` — ISO timestamp of the newest "new" event.
- `isNew(eventAt)` — predicate the row renderer uses to apply
  the per-row "New" badge + left-border accent.

First-visit semantics: when `priorLastVisitMs === undefined`,
`newCount = 0` and `isNew` always returns false. The subtitle
reads "first visit on this browser" so the banker knows the
badge will appear next time.

## 4. UI behavior

Activity Timeline card (Phase 25+, extended by Phase 72):

- **Subtitle** adds context next to the existing event count:
  - First visit: `"N events, newest first · first visit on this browser"`
  - No new since last visit: `"N events, newest first · No new activity since your last visit"`
  - New events present: `"N events, newest first · K new since your last visit (locally tracked, this browser)"`

- **Per-row "New" badge** on each row newer than the prior
  marker. Carries a `title` attribute saying "New since your last
  visit on this browser. Locally tracked; not synced across
  devices."

- **Subtle left-border accent** on the same rows (no new
  palette color — uses the existing primary tint; no layout
  shift — the border sits inside the existing row padding).

Loading and failed states are unchanged from Phase 25.

## 5. Limitations

| Limitation | Why |
|---|---|
| No cross-device sync | Marker lives in localStorage. A banker who reviews on desktop, then opens on mobile, sees every event as new on mobile. Documented as a non-goal by the Phase 72 brief. |
| Marker resets on browser data clear | If the banker clears site data or uses private-browsing, the next visit registers as "first visit." This is the same trade-off every localStorage-backed feature carries. |
| Marker is per-deal, not per-card | If a future phase wants "new tasks since last visit" or "new documents since last visit" as separate signals, that's additive — the per-deal marker is the foundation; per-card markers would need their own storage slot. |
| Marker bump after 2s settle | A banker who closes the deal within 2 seconds keeps the prior marker — useful for "tab switching to verify a detail" but means the FIRST genuine 2-second view counts. The next visit reflects the most recent successful 2-second mount. |
| No explicit "Mark viewed" action | A future phase could add one; Phase 72 chose the simpler auto-bump pattern. The brief authorized either. |
| No "unread count" semantics | The badge says "N new since your last visit," not "N unread." We never claim to model read/unread per event — only "happened after a marker." |

## 6. Privacy / security posture

- **No PII stored.** The marker is an integer (millisecond Unix
  epoch). No deal name, no borrower name, no event content.
- **No network call.** The hook never sends the marker anywhere.
- **No third-party observation.** The marker key prefix is
  app-namespaced (`cc:lastVisit:deal:`); the banker can audit
  storage in their browser's devtools and recognize every key.
- **Private-browsing safe.** `setLastVisitMs` swallows
  `QuotaExceededError` and storage-disabled errors — the feature
  degrades to "you'll see all events as 'new'" rather than
  throwing.
- **No bypass risk.** A banker who edits the marker in
  localStorage to make "new" badges appear or disappear
  affects only their own browser view. The marker does not gate
  any write, audit row, or governance decision.

## 7. Why this is NOT Teams notification or AI activity intelligence

- **Not a notification** — nothing pushes to the banker. The
  signal renders inside the existing timeline card; the banker
  has to open the deal to see it.
- **Not real-time** — no subscription, no websocket, no polling.
  The derivation runs once per mount.
- **Not AI** — pure rule-based comparison: `eventAt >
  priorLastVisitMs`. No model call, no learned weights, no
  inference. The `Phase 24` truthful "No AI was used" stance
  applies — and the LOCAL_ONLY_FLOWS note explicitly disclaims
  AI involvement.
- **Not a Teams integration** — capability §1.7 (Microsoft Teams
  integration) remains "Not started" per the coverage map. This
  phase does not change that.
- **Not an Outlook sync** — same. Phase 61/62/63 email pathways
  are untouched.
- **Not an "official unread count"** — the marker is a heuristic
  ("when did this browser last load the timeline"), not an
  authoritative read receipt.

## 8. Future upgrade path

Stays Lane A unless an upstream change unlocks more:

- **Phase 73+ (still in-repo)**: extend the marker to other
  cards (DealTasks, DealDocuments, BorrowerCommunication) so
  bankers see "new tasks since last visit," "new documents since
  last visit," etc. Same primitive, more surfaces.
- **Phase 73+ (still in-repo)**: add an explicit "Mark viewed"
  button next to the subtitle for bankers who want manual
  control.
- **Lane D / E (upstream)**: add a `cr664_userpreferences` (or
  equivalent) entity to enable cross-device sync. Replace the
  localStorage helper with a typed-service call; keep the same
  pure derivation. The hook abstraction makes this swap
  contained.
- **Lane F (upstream)**: layer AI summarization on top — once a
  model integration + governance policy exist, the same
  derivation can feed a "what changed since you last looked"
  Copilot summary. The Phase 72 marker becomes the temporal
  anchor for the summarization window.

## 9. Phase 72 AAR

**Files created**
- [src/shared/lastVisit/lastVisit.ts](../src/shared/lastVisit/lastVisit.ts) — pure storage + derivation.
- [src/shared/lastVisit/lastVisit.test.ts](../src/shared/lastVisit/lastVisit.test.ts) — 18 assertions (storage helpers + derivation + module hygiene).
- [src/shared/lastVisit/useLastVisit.ts](../src/shared/lastVisit/useLastVisit.ts) — React hook.
- [src/shared/lastVisit/useLastVisit.test.tsx](../src/shared/lastVisit/useLastVisit.test.tsx) — 5 hook tests (first visit, prior snapshot, bump after delay, frozen snapshot across bump, unmount cancellation, namespaced key).
- [src/deals/ActivityTimeline.test.tsx](../src/deals/ActivityTimeline.test.tsx) — 10 UI assertions (first-visit subtitle, returning-visit subtitle with N new, no-new-since subtitle, per-row New badge, boundary equality excluded, tooltip cross-device disclaimer, conservative-copy ban, preserved loading/failed paths).
- [docs/PHASE_72_ACTIVITY_SINCE_LAST_VISIT.md](PHASE_72_ACTIVITY_SINCE_LAST_VISIT.md) — this document.

**Files modified**
- [src/deals/ActivityTimeline.tsx](../src/deals/ActivityTimeline.tsx) — integrated `useLastVisit` + derivation. New subtitle composer + per-row New badge + subtle left-border accent. Loading / failed paths unchanged.
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — new `LOCAL_ONLY_FLOWS.activity-since-last-visit` entry (Phase 72).
- [src/shared/governance/platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) — extended local-only-flows count + Phase 72 anchor assertions (note disclaimer language; doc on disk).
- [docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — §1.18 updated to reflect Phase 72 advancement.

**Vibe capability advanced**
- §1.18 Activity intelligence — rule-based in-repo slice closed. AI summarization remains out of scope.

**Marker behavior implemented**
- Two-step pattern: snapshot prior marker on mount → bump to `now` after 2000ms settle. The current visit's UI uses the frozen snapshot; the next visit reads the bumped marker.
- Unmount before the 2000ms settle cancels the bump.
- Per-deal namespacing via the `cc:lastVisit:deal:` key prefix.

**Local-only limitations**
- No cross-device sync (each browser holds its own marker).
- Resets on site-data clear / private-browsing.
- Marker is per-deal (no per-card granularity in Phase 72).
- 2-second settle means quick tab-switch reviews don't bump.
- No explicit "Mark viewed" button — auto-bump only.
- No "unread" semantics — the marker is a heuristic anchor.

**Surfaces updated**
- Deal Workspace Activity Timeline card (subtitle + per-row badge + accent).
- My Work Queue / Manager / Team / Executive / Admin workspaces — unchanged.

**Tests added/updated**
- 18 derivation + storage assertions in `lastVisit.test.ts`.
- 5 hook tests in `useLastVisit.test.tsx`.
- 10 UI tests in `ActivityTimeline.test.tsx` (a new test file — none existed before Phase 72).
- 2 inventory anchor assertions added in `platformInventory.test.ts`.

**Confirmations**
- No new writes added. `GOVERNED_WRITES.length === 11` unchanged.
- No AI / Teams / notification claim. The Activity Timeline render is scanned for forbidden phrases; the conservative wording ("locally tracked, this browser") is positively asserted.
- No cross-device sync claim. The "New" badge tooltip + the inventory note both state "locally tracked; not synced across devices."
- No schema work. The Phase 72 marker is a browser-local primitive; no new column, no SDK regeneration.
- All Phase 46–50 inventory discipline sweeps still pass.

**Test / build counts**
- 1122 → 1155 tests passing (+33 net Phase 72 assertions).
- Build clean.

**Recommended next phase**
- **Phase 73 — Structured-data credit-memo consistency check** (Lane A item #4 from the Phase 69 coverage map). Closes capability §1.14 (Cross-document consistency checks) via a deterministic rule check between the saved credit memo's stated fields and the deal's structured fields. No AI. No upload. No schema work.
- Alternative: **Phase 73 — Accessibility audit + targeted fixes** (capability §1.28) — the only Vibe capability that hasn't been a phase brief yet.
- Alternative: **Phase 73 — Banker personal activity summary** — port the Phase 71 derivation primitives to a per-banker card on the Banker Workspace (the optional banker surface deferred from Phase 71). Pure derivation; no writes.
