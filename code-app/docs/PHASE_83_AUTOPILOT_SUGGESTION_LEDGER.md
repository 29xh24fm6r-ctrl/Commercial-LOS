# Phase 83 — Autopilot Suggestion Ledger (LOCAL_ONLY)

## Goal

Add a local-only suggestion ledger that lets users mark Phase 80 / 81 / 82 Autopilot Lite suggestions as "opened" (auto, when they click the action button) or "dismissed" (explicit local action) — across the per-deal panel, the manager team rollup, and the banker personal rollup. State lives in browser `localStorage` only. No Dataverse write. No audit. No timeline. No governed write. No cross-device sync. No AI.

The slogan extends:

> **Autopilot suggests. Banker decides. Local notes stay local.**

## Why this phase

Phases 80–82 added deterministic Autopilot Lite suggestions across three surfaces. The Vibe scope expects an assistant-like operating experience — "I dismissed this one, show me the next thing", "I'm working on this now". The safe path to that experience without a governance / schema layer is local browser memory: just enough state for the banker / manager to triage their suggestions, with the explicit promise that dismissing is a personal note, not workflow resolution.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- §1.17 (Deal autopilot) — advanced to "Partially operational (advanced by Phase 80 + Phase 81 + Phase 82 + Phase 83)". The autopilot now has a thin interaction layer in addition to the derivation engine.
- §1.18 (Activity intelligence) — extended. The ledger is a small piece of activity-intelligence local state, deliberately framed as personal interaction memory and explicitly NOT cross-device, NOT AI learning, NOT workflow resolution.

## Relationship to Phases 80, 81, 82

| | Phase 80 panel | Phase 81 manager rollup | Phase 82 banker rollup |
|---|---|---|---|
| Surface key | `deal-panel` | `manager-rollup` | `banker-rollup` |
| Ledger key shape | `deal-panel|<dealId>|<suggestionId>` | `manager-rollup|<dealId>|<suggestionId>` | `banker-rollup|<dealId>|<suggestionId>` |
| "Open" action | Action button click → scrollIntoView | Deal-name click → navigate | Deal-name click → navigate |
| "Dismiss" action | Per-suggestion "Dismiss locally" button | Per-row "Dismiss locally" button | Per-row "Dismiss locally" button |
| Restore | Restore button replaces dismissed row's actions | Restore button replaces dismissed row's dismiss button | Same |
| Counts affected? | No (counts always reflect underlying rules) | No | No |

The ledger is **scoped by surface**: dismissing on the manager rollup does NOT carry over to the banker rollup or the per-deal panel. That's deliberate — each role's "local note" applies to their own card.

## Stored fields

Each `SuggestionLedgerEntry` carries:

| Field | Type | Meaning |
|---|---|---|
| `key` | `string` | Deterministic — `surface|dealId|suggestionId`. Embedded in entry for round-trip integrity check. |
| `surface` | `'deal-panel' \| 'banker-rollup' \| 'manager-rollup'` | Which Autopilot surface recorded the action. |
| `suggestionId` | `string` | Phase 80 `NextBestAction.id` (e.g. `"overdue-tasks"`). |
| `dealId` | `string \| undefined` | Deal id (undefined for future cross-deal suggestions). |
| `action` | `'opened' \| 'dismissed'` | What the user did. |
| `recordedAt` | `string` (ISO) | When the action was recorded. |
| `titleSnapshot` | `string \| undefined` | Cosmetic suggestion title at action time. The live rendering uses the current rule output. |

No PII, no borrower content, no deal amount. The ledger captures interaction intent, not deal state.

## Keying strategy

`buildSuggestionLedgerKey(input)` returns `${surface}|${dealId ?? ''}|${suggestionId}`. The pipe-delimited shape:

- **Deterministic** — same inputs produce the same key (used by both writer and reader).
- **Surface-scoped** — the same suggestion id on different surfaces produces different keys, so each surface's local notes stay isolated.
- **Deal-scoped** — adding `dealId` to the key means `overdue-tasks` on deal A and on deal B are distinct entries.
- **Forward-compatible** — empty middle segment for cross-deal suggestions (`manager-rollup||some-new-id`).
- **Stable across rule re-runs** — Phase 80 suggestion ids are constants (`overdue-tasks`, `pending-review-documents`, etc.). If the rule fires again tomorrow with new counts, the key still matches the previous dismiss.

Keys are **NOT** derived from suggestion titles or reasons because those strings change when the rule fires with different inputs.

## UI behavior

### Per-suggestion "Dismiss locally" button

- Renders on the row's footer next to the action button.
- Click → calls `useSuggestionLedger().recordDismissed(...)` which writes to localStorage AND updates the in-memory entries map.
- Row visually mutes (opacity 0.6) and the action button is replaced with `Dismissed locally · YYYY-MM-DD · tracked on this browser` + a Restore button.

### "Restore" button

- Renders only on dismissed rows.
- Click → calls `useSuggestionLedger().clear(key)` which removes the entry from BOTH localStorage and the in-memory map.
- Row returns to its default state.

### "Opened locally" auto-tag

- Triggered automatically when the user clicks the action button (per-deal panel) or the deal-name button (rollups).
- Records `action: 'opened'` via the same writer.
- Renders a small green-tinted "Opened locally · YYYY-MM-DD" tag next to the action button. The action still fires its existing behavior (scrollIntoView for the panel; navigate for the rollups).
- Does NOT block the user from dismissing the suggestion afterwards.

### Required copy (statically asserted)

Each card's bottom disclaimer is extended with:

> "Dismiss locally" and "Opened locally" are tracked on this browser only; they do not change deal status.

The tag text uses verbatim phrases: "Dismissed locally", "Opened locally", "tracked on this browser", "Restore", "Dismiss locally".

### Forbidden vocabulary (statically asserted in source + rendered DOM)

`is/was/has been resolved`, `is/was/has been completed`, `is/was/has been closed`, `is/was/has been synced`, `official record / state / status`, `system acknowledged`, `AI-learned`, `workflow updated`, `is/was/has been approved`.

## LOCAL_ONLY behavior

- **Storage**: `localStorage[cc:autopilotSuggestionLedger:v1]` — a JSON-serialized object map keyed by suggestion key.
- **Versioned namespace**: the `v1` suffix lets a future schema change migrate without colliding with the old payload.
- **No cross-device sync**: A banker who opens / dismisses on browser A will not see those notes on browser B. The disclaimer states this.
- **No cross-tab sync**: The hook reads once on mount; two tabs with the same card open will see independent in-memory state until both reload. Documented as an out-of-scope limitation.
- **Fault tolerance**: `loadSuggestionLedger()` never throws. Malformed JSON → empty map. JSON-array root → empty map. Entries with missing fields → dropped individually. Entries whose embedded `key` doesn't match the map key → dropped (defensive — guards against a future migration writing inconsistent slots).

## Why this is not workflow resolution

- **Counts unchanged.** The H/M/L priority chip counts on the rollups always reflect the deterministic rule output. Dismissing a suggestion on a deal does NOT decrement the chip — the underlying deal still has the signal.
- **No status mutation.** The deal stays in its current stage. The task stays open. The document stays outstanding. The ledger only changes how a suggestion ROW is rendered; it never touches the underlying Dataverse record.
- **No audit trail.** Phase-21-style governed writes record an `auditevent` + `dealtimelineevent`. The ledger writes neither. There is no governance trace because there is no governance action.
- **No notifications.** Nothing fires when a row is dismissed. No banker, no manager, no Teams card, no email.
- **Documentation says so verbatim.** The card disclaimers say "tracked on this browser only", "do not change deal status". The brief's forbidden vocabulary ("resolved", "completed", "closed", "synced", "official", "system acknowledged", "AI learned", "workflow updated") is statically asserted absent.

## Why this is not AI learning

- **No model.** No `fetch` to AI endpoints, no Copilot connector, no embedding lookup, no preference model.
- **No personalization.** The ledger is a flat map of explicit user actions. It does not adapt rule priorities, does not predict which suggestion the user will dismiss next, does not learn frequency patterns.
- **No telemetry.** No counters, no aggregate stats, no per-user behavior reports. The ledger is bounded to one user's browser.
- **Static-source forbids the vocabulary.** `AI-learned`, `predicts`, `prediction` are all banned in both the ledger module source and the rendered DOM.

## Limitations

- **One browser only.** No cross-device, no cross-tab sync. Documented.
- **No conflict resolution.** Two tabs both dismissing the same row → last-write-wins on localStorage. Both tabs' in-memory views diverge until reload.
- **No expiration.** A dismissed entry persists indefinitely. If a banker leaves a deal and the suggestion stops firing six months later, the ledger row still exists but does nothing (no matching live suggestion → no rendering). A future cleanup phase could prune entries older than N days.
- **No quota management.** Typical payload is ~200 bytes per entry; even thousands of entries are well within `localStorage`'s ~5 MB budget. If the slot ever throws `QuotaExceededError`, the write is silently swallowed (the action still works in-memory until reload).
- **`titleSnapshot` is cosmetic only.** It's stored at action time; the live UI uses the rule's current title. If the title text changes between rule runs (e.g. "2 overdue tasks" → "3 overdue tasks"), the live render shows the new text — the snapshot is auditing data, not a display source.
- **No bulk dismiss / bulk restore.** Each row is dismissed / restored individually. A "Clear local autopilot notes" admin affordance is a future phase.
- **No surface-level "hide all dismissed" toggle.** Dismissed rows stay visible (muted, with Restore). The brief's intent is "the user should still see what they dismissed"; this is the honest rendering.
- **Same-key collisions across users on shared workstations.** A locked-down shared workstation where multiple users sign in to the same OS account would share the ledger. This is the standard localStorage privacy model; not a Phase 83 regression.

## Future upgrade path

1. **Dataverse suggestion ledger.** A `cr664_autopilotsuggestionlog` entity with audit trail. Each accept / dismiss becomes a Phase-21-style governed write. Schema work + governance call required.
2. **Accept/reject governance.** Once a Dataverse ledger exists, accept/reject decisions become first-class workflow events that managers can roll up and bankers can review.
3. **Manager analytics.** "Suggestions dismissed most often" / "Suggestions actioned within N hours" once a governed ledger exists with multi-user data.
4. **AI rule-tuning.** With a governed ledger, a Lane F phase could analyze accept/dismiss patterns to suggest threshold tweaks (e.g. raise pending-review-documents threshold from 7d to 10d when bankers dismiss it routinely on day 7). Always with explicit banker review; never auto-applied.
5. **Teams notification feedback.** Lane E. When a Teams notification fires for a HIGH-priority signal, capture the banker's response (clicked / dismissed / ignored) back into the ledger.
6. **Cleanup phase for stale local entries.** Auto-prune entries older than 90 days (or N days configurable). Today's ledger never expires.

## Files created

- `src/shared/autopilot/suggestionLedger.ts` — pure storage helpers (`buildSuggestionLedgerKey` + `loadSuggestionLedger` + `recordSuggestionAction` + `getSuggestionLedgerEntry` + `clearSuggestionLedgerEntry` + `clearAllSuggestionLedgerEntries` + `SUGGESTION_LEDGER_STORAGE_KEY`).
- `src/shared/autopilot/suggestionLedger.test.ts` — 19 tests covering key generation, record / read / clear, malformed-storage fault tolerance, embedded-key integrity check, invalid-enum drop, module hygiene (no SDK / role imports; no resolution / sync / AI / workflow vocabulary).
- `src/shared/autopilot/useSuggestionLedger.ts` — React hook (`useSuggestionLedger`) exposing `entries` + `getEntry` + `recordOpened` + `recordDismissed` + `clear`.
- `src/shared/autopilot/useSuggestionLedger.test.tsx` — 6 hook tests covering mount rehydration, reactive write-through, clear, last-write-wins, malformed-slot safety.
- `docs/PHASE_83_AUTOPILOT_SUGGESTION_LEDGER.md` — this document.

## Files modified

- `src/deals/DealAutopilotPanel.tsx` — wires `useSuggestionLedger()`, passes the ledger entry to each `SuggestionRow`. Each row gains a "Dismiss locally" button + Restore flow + Opened-locally tag. The bottom disclaimer is extended with the local-tracking copy.
- `src/deals/DealAutopilotPanel.test.tsx` — +7 Phase 83 tests covering the new dismiss/restore/opened-tag behavior, the extended disclaimer, the forbidden-vocab rendered-DOM scan, and rehydration from a pre-seeded localStorage slot.
- `src/banker/BankerAutopilotRollup.tsx` — same integration on the personal rollup. Click-deal-name records opened.
- `src/banker/BankerAutopilotRollup.test.tsx` — +6 Phase 83 tests.
- `src/manager/ManagerAutopilotRollup.tsx` — same integration on the manager team rollup.
- `src/manager/ManagerAutopilotRollup.test.tsx` — +5 Phase 83 tests.
- `src/shared/governance/platformInventory.ts` — added `LOCAL_ONLY_FLOWS.autopilot-suggestion-ledger` (Phase 83) with verbatim disclaimers + namespaced storage key + Phase 83 doc reference.
- `src/shared/governance/platformInventory.test.ts` — extended the inventory-list assertion + added 2 Phase 83 anchors (entry contract verification + doc exists on disk).
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.17 + §1.18 advanced.

## Surfaces updated

- **Banker Deal Workspace · DealAutopilotPanel** — per-suggestion dismiss/restore + opened tag.
- **Banker Command Center · BankerAutopilotRollup** — per-row dismiss/restore + opened tag.
- **Manager Command Center · ManagerAutopilotRollup** — per-row dismiss/restore + opened tag.

A future `<TeamAutopilotRollup />` (named as the next phase in the brief) would reuse the same ledger by adding a new `'team-rollup'` to the `SuggestionLedgerSurface` union; no migration of existing entries required.

## Local ledger fields

See "Stored fields" above. Seven fields per entry; all JSON-serializable; no PII.

## Key strategy

`surface|dealId|suggestionId` pipe-delimited. Deterministic. Surface-scoped. See "Keying strategy" above.

## Local-only limitations

See "Limitations" above. The headline: one browser only, no sync, no expiration, dismiss ≠ resolution.

## Tests added / updated

- 19 ledger tests in `src/shared/autopilot/suggestionLedger.test.ts`.
- 6 hook tests in `src/shared/autopilot/useSuggestionLedger.test.tsx`.
- 7 dismiss/restore/opened tests in `src/deals/DealAutopilotPanel.test.tsx`.
- 6 dismiss/restore/opened tests in `src/banker/BankerAutopilotRollup.test.tsx`.
- 5 dismiss/restore/opened tests in `src/manager/ManagerAutopilotRollup.test.tsx`.
- 1 extended inventory-list assertion + 2 Phase 83 anchors in `src/shared/governance/platformInventory.test.ts`.

Total: 45 new tests + 1 extended.

## Confirmation: no writes / schema / AI / automation added

- **No new `GOVERNED_WRITES` entry.** The ledger is local-only.
- **New `LOCAL_ONLY_FLOWS` entry**: `autopilot-suggestion-ledger` (Phase 83), with verbatim disclaimers asserted by the inventory test.
- **No schema change.** No new Dataverse table or column.
- **No AI.** Pure storage helpers. Module-hygiene + rendered-DOM tests forbid the AI vocabulary.
- **No automation.** Phase 80's `isAutomated: false` flows through. Dismissing a suggestion is not an automation event; it's a local interaction note.
- **No permission widening.** The ledger reads only localStorage. The action buttons it triggers (scrollIntoView / navigate) use the existing access checks.
- **No executive expansion.** Executive workspace unchanged.

## Test + build counts (at acceptance)

- Full suite: **1424 / 1424 tests passing** (Phase 82 baseline 1379 + 45 new).
- `tsc -b && vite build`: clean.

## Recommended next phase

From the coverage map after Phase 83:

- **Team-side Autopilot Rollup** (`<TeamAutopilotRollup />`) — mirror on Team Workspace using `TeamDataProvider.deals`. Closes the rollup parity across all three banker-adjacent role workspaces. Plug into the existing suggestion ledger by adding a new `'team-rollup'` to the `SuggestionLedgerSurface` union.
- **Manager-scoped child-data loader** — broadens Phase 81 manager rollup signal coverage to match Phase 82's 7/8 (or 8/8 with memo consistency). Two-step pattern modeled on Phase 32. Closes signal-coverage parity.
- **BankerDataProvider deduplication** — one shared loader for the four Banker Command Center cards. No new feature; one-time refactor.
- **High-contrast theme palette** — declare `[data-theme="high-contrast"]` on top of Phase 79's foundation. Closes the remaining a11y gap named in Phase 74 / 79.
- **Cleanup-phase for stale ledger entries** — auto-prune entries older than 90 days. Pure helper + tests.

The **team-side rollup** is the natural role-parity move (completes the triad of rollups). The **manager child-data loader** is the natural coverage-parity move. The **suggestion-ledger cleanup** is a small follow-up to Phase 83 itself.
