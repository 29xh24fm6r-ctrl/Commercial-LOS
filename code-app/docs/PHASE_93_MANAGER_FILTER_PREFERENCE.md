# Phase 93 — Saved Manager Filter Preference (LOCAL_ONLY)

## Goal

Persist the Phase 92 manager banker-filter selection locally in the browser, so a manager's focused-banker view survives refresh and same-browser navigation. Phase 93 layers persistence onto Phase 92 without changing any other contract: no Dataverse write, no audit row, no cross-device sync, no official-profile claim. The Phase 92 in-memory provider continues to work identically when no stable identity is available (the persistence path silently no-ops).

## Why this phase

Phase 92 shipped the per-banker filter as in-memory state — the most common follow-up question after using it for a day is "why does my filter reset every refresh?". Phase 93 closes that gap using the same honest LOCAL_ONLY pattern Phase 72 / Phase 90 / Phase 91 established. The change is purely a usability improvement; the brief explicitly disclaims any movement toward a real user-preference surface.

## Relationship to Phase 92

| | Phase 92 | Phase 93 |
|---|---|---|
| Selection model | `{ kind: 'all' } \| { kind: 'banker'; id?; name } \| { kind: 'unassigned' }` | unchanged |
| State container | `ManagerBankerFilterProvider` local React state | unchanged |
| Default selection | `{ kind: 'all' }` (fresh mount) | `{ kind: 'all' }` (fresh mount **OR** invalid restore) |
| Storage | none | `localStorage` slot `cc:managerFilterSelection:v1` |
| Scope key | n/a | `manager:<bankerId>:<teamId>` |
| Save trigger | n/a | every `setSelection(...)` call |
| Restore trigger | n/a | first time `teamPipeline` becomes ready (validated against current options) |
| Filtered surfaces | rollup + morning catch-up | unchanged (filter only changes which rows render) |
| Phase 90 last-seen marker | unaffected | unaffected |
| Phase 91 dismiss/snooze ledger | unaffected | unaffected |

Phase 93 is **purely additive**: the in-memory contract of Phase 92 continues to hold; persistence is bolted on as a side effect of `setSelection`. The provider exposes one new boolean flag, `isPreferenceScoped`, so the control can show different helper text when the (manager, team) identity is incomplete.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- **§1.22 (Manager workspace)** — extended to "Operational (Phase 36 + Phase 71 + Phase 81 + Phase 87 + Phase 88 + Phase 90 + Phase 91 + Phase 92 + Phase 93)". The focused-banker view now survives refresh.
- §1.27 (Reporting / portfolio analytics) — no change; Phase 93 is a view convenience, not a reporting surface.

## Stored fields

`ManagerFilterPreferenceEntry`:

| Field | Type | Meaning |
|---|---|---|
| `scopeId` | `string` | Echo of the scope id this entry belongs to (`manager:<bankerId>:<teamId>`). Defensive — dropped if the embedded value disagrees with the map key. |
| `kind` | `'all' \| 'banker' \| 'unassigned'` | Mirrors the Phase 92 selection kind. |
| `bankerId` | `string \| undefined` | Defined only when `kind === 'banker'` AND the banker had a stable `cr664_bankerid` at save time. |
| `bankerName` | `string \| undefined` | Defined only when `kind === 'banker'`. Cosmetic snapshot + name-fallback restore key when `bankerId` is undefined. |
| `recordedAt` | `string` (ISO) | When the preference was written. Not surfaced in UI today; useful for a future "Clear preferences older than N days" admin affordance. |

No PII. No deal content. No pipeline data. No financial figures.

Map shape: `Record<scopeId, ManagerFilterPreferenceEntry>` — one entry per (manager, team) pair. A user who manages two teams (currently impossible per schema, but a future possibility) gets two slots without collision.

## Keying strategy

`buildManagerFilterPreferenceScope({ userId, teamId }) → "manager:<userId>:<teamId>" | null`.

- `userId` = `cr664_bankerid` (the signed-in manager's row).
- `teamId` = `cr664_teamid` resolved by `loadManagerIdentity`.
- Whitespace-only values count as missing.
- Returns `null` when either is missing — the provider then operates as in-memory only and the control surfaces "This filter resets on refresh (no stable identity available)." helper text.

Storage namespace `cc:managerFilterSelection:v1` is **disjoint from**:

- Phase 83 autopilot ledger (`cc:autopilotSuggestionLedger:v1`),
- Phase 90 catch-up last-seen markers (`cc:lastVisit:catchUp:*`),
- Phase 91 catch-up item ledger (`cc:catchUpItemLedger:v1`).

A reader of any of those slots will never see a Phase 93 entry and vice versa.

## Restore / save behavior

**Restore** (one-shot per `(manager, team)` scope):

1. Provider mounts; reads `useManager()` for `bankerId`+`teamId`.
2. If scope is `null`, restore is skipped entirely.
3. Otherwise wait until `teamPipeline.kind === 'ready'` so options are computed.
4. Read the saved entry for the current scope (`getManagerFilterPreference`).
5. Pass it through `validateRestoredPreference(stored, options)` — guarantees the restored selection matches one of the current Phase 92 options.
6. `setSelectionState(validated)` once; remember that we've restored for this scope so re-renders don't clobber subsequent user picks.

**Save** (every selection change):

1. The provider's `setSelection` wraps `setSelectionState` + `saveManagerFilterPreference`.
2. If scope is `null`, the save is a no-op (in-memory only).
3. Otherwise the entry overwrites the prior entry for the current scope (last-write-wins).
4. Storage write failures (private-browsing `QuotaExceededError`, etc.) are swallowed silently — losing a preference is a cosmetic regression, not a correctness issue.

## Stale-option fallback behavior

`validateRestoredPreference(stored, currentOptions)`:

| Stored | Current options | Result |
|---|---|---|
| `undefined` | any | `{ kind: 'all' }` |
| `kind: 'all'` | any | `{ kind: 'all' }` |
| `kind: 'banker'` with `bankerId` matching an option | — | restore by id (returns the matching option's selection) |
| `kind: 'banker'` with `bankerId` NOT matching, but `bankerName` matches (case-insensitive) | — | name-fallback restore |
| `kind: 'banker'` with no matching option | — | `{ kind: 'all' }` (stale) |
| `kind: 'unassigned'` with an `unassigned` option present | — | `{ kind: 'unassigned' }` |
| `kind: 'unassigned'` with no `unassigned` option | — | `{ kind: 'all' }` (stale) |

The validator does not touch storage. A future maintenance phase could call `clearManagerFilterPreference(scopeId)` after a stale fallback to keep storage tidy — Phase 93 doesn't, on the principle that the saved preference might become valid again when the data refreshes.

## Local-only limitations

- **No cross-device sync.** Each browser has its own preference slot. A manager who picks "Alice" on desktop and refreshes on mobile sees All team on mobile until they re-pick. Documented in helper text + the LOCAL_ONLY_FLOWS entry.
- **No cross-tab broadcast.** Two tabs editing the same scope diverge until the next mount; last-write-wins on the next refresh. Same trade-off Phase 83 / 90 / 91 carry.
- **Private-browsing storage errors are silent.** The helper swallows `QuotaExceededError`; the user will see the in-memory-only behavior, no error toast.
- **No expiry / TTL.** Entries persist indefinitely until cleared. `clearManagerFilterPreference` / `clearAllManagerFilterPreferences` are exported helpers; no UI surfaces them today.
- **Name-fallback collapses duplicate-name bankers.** Two bankers with the same denormalized name but different ids restore to whichever option came first when the id is missing. Same trade-off Phase 92 already documented.
- **No "Restored your previous filter" toast.** A future phase could add a one-shot confirmation; Phase 93 keeps the restore silent.
- **No write at scope-change time.** Switching from team A → team B reads team B's saved preference (or falls back to All team); team A's preference is unchanged. This is intentional — selecting a banker on team A doesn't imply a preference for team B.

## Privacy / security posture

- **Storage location:** browser `localStorage` only. The Power Apps host has no server-side read access.
- **Stored value:** integer recordedAt + selection (kind + optional banker id + name). No financial figures, no deal content.
- **Banker id is a Dataverse GUID** — internal-only identifier with no external meaning. The banker name is the same denormalized value already rendered on every manager card.
- **No network transmission.** `getItem` / `setItem` never call `fetch`, never serialize to a Dataverse table, never echo to telemetry.
- **No persistence beyond browser.** Clearing the browser's site data removes all Phase 93 preferences.
- **Phase 48 isolation preserved:** the helper imports `ManagerBankerFilterSelection` / `ManagerBankerFilterOption` types from the sibling module in `src/manager/`; no role-directory cross-import; no SDK / generated-service import.

## Why this is not an official manager setting

- **Not synced.** Forbidden vocab `(is|was|has been) synced` scanned out of source. Helper text states verbatim "Saved on this browser · Not synced across devices."
- **Not in Dataverse.** No `cr664_userpreferences*` row, no governed write. Inventory test asserts `manager-filter-preference` is NOT in `GOVERNED_WRITES`.
- **Not a profile setting.** Forbidden vocab `saved to profile`, `official preference`, `tenant setting`, `manager setting`, `remembered by the system` scanned out of source + rendered DOM.
- **Not an audit-grade decision.** Switching the filter does not emit an audit row or timeline event. The Phase 92 surfaces filtered by this preference make no claim about the underlying data — they only change which rows render.
- **Not a coaching / performance surface.** Same Phase 92 forbidden vocab (`performance ranking`, `underperforming`, `surveillance`, `audit view`) scanned out.

## Future upgrade path

When upstream / governance / schema work lands, the preference surface can grow in these directions:

1. **Dataverse user preferences.** A future `cr664_userpreferences*` entity (or equivalent) would replace LOCAL_ONLY with server-side per-user state, unlocking cross-device sync + audit trail. The current contract maps cleanly: the same scope id (`manager:<bankerId>:<teamId>`) becomes the row's PK; the JSON entry becomes the column body.
2. **Team hierarchy filters.** When `cr664_teams` carries a hierarchy or sub-team concept, the same persistence shape extends to sub-team selection. Map key gains a sub-team segment; entry shape unchanged.
3. **Multi-select banker filters.** Replace the single-banker selection with `{ kind: 'bankers'; ids: string[]; names: string[] }`. Map entry grows by one field; validation extends to filter the saved array against current options.
4. **Stage / product filters.** Sibling preferences saved under separate scope namespaces (e.g. `manager-stage:`) so each preference axis is independently cleared.
5. **Manager coaching preferences.** A coaching surface where the manager picks "show me HIGH-priority items only" or "hide draft-memo signals" would persist under a sibling namespace. Same LOCAL_ONLY pattern; same validation discipline.
6. **"Restored Alice" toast.** One-shot confirmation when the provider's first restore returns a non-default selection. Pure UI; no data shape change.
7. **Clear preferences UI.** A small "Reset to All team" link below the filter control; calls `clearManagerFilterPreference(scopeId)`.

## Files created

- `src/manager/managerBankerFilterPreference.ts` — pure storage helpers (`saveManagerFilterPreference`, `loadManagerFilterPreferences`, `getManagerFilterPreference`, `clearManagerFilterPreference`, `clearAllManagerFilterPreferences`), scope keying (`buildManagerFilterPreferenceScope`), and `validateRestoredPreference(stored, options) → ManagerBankerFilterSelection`. Storage namespace: `cc:managerFilterSelection:v1`. Loader rejects malformed JSON / wrong root / individual malformed entries / mixed-state tamper (banker fields on `all` or `unassigned`; banker kind with neither id nor name; embedded-scope mismatch / invalid kind enum).
- `src/manager/managerBankerFilterPreference.test.ts` — 32 helper tests: scope build (whitespace tolerance; missing user/team), save/load round-trip for all three selection shapes, last-write-wins, scope isolation, namespace separation from Phase 83/90/91, clear (single + no-op), loader fault tolerance (missing slot / malformed JSON / wrong root / malformed entries / scope mismatch / invalid kind / mixed-state tamper), `validateRestoredPreference` for every selection × current-options combination, module hygiene (no SDK / role imports; no profile / official / tenant-setting / sync / AI / real-time vocabulary).
- `docs/PHASE_93_MANAGER_FILTER_PREFERENCE.md` — this document.

## Files modified

- `src/manager/ManagerBankerFilter.tsx` — provider now reads `useManager()` for the scope, computes `preferenceScope = buildManagerFilterPreferenceScope(...)`, runs a one-shot restore effect that fires once teamPipeline is ready, and wraps `setSelectionState` in a write-through `setSelection` that calls `saveManagerFilterPreference(...)`. View shape grows `isPreferenceScoped: boolean`. Control helper text branches on `isPreferenceScoped`: "Saved on this browser · Not synced across devices." when scoped, "This filter resets on refresh (no stable identity available)." otherwise.
- `src/manager/ManagerBankerFilter.test.tsx` — adds `useManager` mock to setup; relaxes the `synced` forbidden-vocab regex to affirmative tense only (Phase 93 source legitimately contains "Not synced across devices." as a negation); adds 12 Phase 93 tests: `isPreferenceScoped` true / false-with-missing-userId / false-with-missing-teamId; save-to-storage on selection change; restore-from-storage on mount when valid; stale-banker fallback to All team; stale-unassigned fallback to All team; no restore when scope is unavailable; no save when scope is unavailable; helper text variants (scoped vs unscoped); forbidden-vocab scan for profile / official / tenant / synced.
- `src/manager/ManagerAutopilotRollup.test.tsx` — `filterView` factory updated to include `isPreferenceScoped: false` (the new required field on `ManagerBankerFilterView`).
- `src/manager/ManagerMorningCatchUp.test.tsx` — same factory update.
- `src/shared/governance/platformInventory.ts` — adds `LOCAL_ONLY_FLOWS.manager-filter-preference` entry.
- `src/shared/governance/platformInventory.test.ts` — pins (a) membership, (b) the full disclaimer set + key shape + implementation pointers, (c) doc-on-disk, (d) NOT in `GOVERNED_WRITES`.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.22 advanced.

## Tests added / updated

- 32 helper tests (`managerBankerFilterPreference.test.ts`).
- 12 provider/control integration tests appended to `ManagerBankerFilter.test.tsx` (26 → 38).
- 2 test-factory updates (rollup + catch-up `filterView` helpers).
- 3 inventory pins added (`platformInventory.test.ts`): membership + full disclaimer set + doc-on-disk + NOT in `GOVERNED_WRITES`.

No production-side behavior outside the manager workspace changed. Phase 80 / 81 / 82 / 83 / 84 / 86 / 87 / 88 / 89 / 90 / 91 / 92 tests continue to pass.

## Confirmation: no writes / schema / sync / profile-setting added

- ✅ **No new write surface.** No `GOVERNED_WRITES` entry. `manager-filter-preference` is NOT in `GOVERNED_WRITES` (test asserts).
- ✅ **No schema change.** No Dataverse table or column read.
- ✅ **No new generated-service import.** The helper imports nothing from `src/generated/`.
- ✅ **No new SDK install.** `@microsoft/teams-js` from Phase 86 is not used here.
- ✅ **No AI.** Forbidden-vocab scans pin the contract.
- ✅ **No notification surface.** Helper text never says "notification", "pushed", "delivered".
- ✅ **No real-time stream.** No `(is|was|has been) synced` claim. Helper text states "Not synced across devices." as an explicit negation.
- ✅ **No profile / official / tenant setting claim.** Forbidden vocab `saved to profile`, `official preference`, `tenant setting`, `manager setting`, `remembered by the system` scanned out.
- ✅ **No permission widening.** The preference operates strictly over the manager's already-authorized scope; if no scope is available, persistence silently no-ops.
- ✅ **No executive expansion.** Executive workspace untouched.

## Test + build counts (at acceptance)

- Full suite: **1782 / 1782 passing** (Phase 92 baseline 1738 → +44: 32 helper + 12 provider/control + 0 rollup/catch-up new but 2 factory updates).
- `tsc -b && vite build`: clean (verified separately).

## Recommended next phase

After Phase 93 the manager filter surface is complete in-repo: in-memory provider (Phase 92) + local persistence (Phase 93) + helper text honesty. Strongest next moves:

1. **Phase 94 candidate — "Mark all seen" affordance on the catch-up cards.** Small UI button that bumps the Phase 90 marker to `now` without the 2-second settle. Closes a known UX gap; tiny implementation.
2. **Phase 94 candidate — Saved banker-side filter or rollup preferences.** Banker rollup is per-banker by definition, but a future banker preference layer (e.g. dismiss-history retention, autopilot signal opt-outs) could share the Phase 93 storage pattern.
3. **Phase 94 candidate — Memo consistency findings on the rollups + catch-up.** Closes the 8th and final Phase 80 signal at the cost of loading sections team-wide.
4. **Phase 94 candidate — Phase 85 Candidate B (copy-to-Teams deal summary).** No-admin Teams runner-up.
5. **Phase 94 candidate — Multi-select banker filter UI.** Replaces the Phase 92 `<select>` with a chip-group; Phase 93's persistence shape extends cleanly.

**Recommendation: Phase 94 — "Mark all seen" affordance on the catch-up cards.** Closes the last small UX gap on the catch-up surface (the user can dismiss / snooze individual items but cannot clear the "N new since your last visit" overlay without waiting the 2-second settle on a fresh visit). Single button; pure UI; reuses the Phase 90 `setCatchUpLastSeenMs` helper. Trivial implementation; immediate user value.
