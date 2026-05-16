# Phase 78 — Banker Relationship Notes Capture (LOCAL_ONLY)

## Goal

Add a banker-facing local-only notes-capture surface layered onto Relationship Memory Lite. A banker can draft a relationship note + optional follow-up + optional open-asks block for one of their clients, then copy the formatted preview to the clipboard for paste into their own system of record. No Dataverse write. No audit. No timeline. No governed write.

## Why this phase

The Microsoft Vibe scope expects relationship memory, borrower history, banker notes, open asks, and preparation support. Phases 76 and 77 surfaced deterministic relationship context (who the client is, what deals they carry, what attention signals exist). The remaining piece — note capture — needs schema (a `cr664_borrowernote` entity or equivalent) and governance (privacy / consent) that does not exist today. Phase 78 ships the safe local-only stop-gap so the banker has a structured drafting surface inside the app, even though the persistence layer lives outside.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- §1.16 (Relationship memory) — current-state advanced to "Partially operational (advanced by Phase 76 + Phase 77 + Phase 78)". The Phase 78 note describes the LOCAL_ONLY draft + the verbatim disclaimer in both the visible banner and the copied draft footer.
- §1.1 (Banker Command Center) — current-state notes the "Draft relationship note" affordance on each RelationshipMemory client row; safe-next-step now points back to dark theme tokens (Phase 74's named gap).

§1.18 (Activity intelligence) is intentionally NOT advanced — note capture is not activity-summarization, and the brief gated that update on "only if appropriate".

## Why this is local-only

- **The persistence schema does not exist.** `cr664_borrowers` has no notes / preferences / contact-history field. There is no `cr664_borrowernote` entity. Creating one is governance work (privacy / consent / who-can-read) that has not been done.
- **No governed-write contract exists.** Every Phase-21-style governed write has an audit + timeline pair and an outcome union. Standing up that contract for notes requires schema first.
- **Cross-device persistence requires server state.** Even if a Dataverse table existed, surfacing the note "where the banker last left off" across devices needs an authoritative store — not a clipboard.

Phase 78 sidesteps all three by being explicitly local-only: the draft lives in React state for the lifetime of the modal; copying does not transmit anywhere except the clipboard; closing without copying drops the draft.

## What the draft includes

The modal renders:

- **Header:** "Draft relationship note" + "Local draft only" badge.
- **Local-only banner (verbatim):** "Local draft. Not saved to the system. Paste into the appropriate system of record. The app does not store this note, does not emit an audit or timeline event, and does not sync across devices. Closing this modal without copying drops the draft."
- **Read-only summary:** client name, banker name, active-deal count.
- **Note** (required): textarea, banker-typed. `aria-required="true"`; helper line explains the local nature.
- **Follow-up** (optional): textarea; omitted from the copied draft when blank.
- **Open asks / next steps** (optional): textarea; omitted from the copied draft when blank.
- **Preview pane:** the formatted output the Copy button writes to the clipboard, regenerated on every keystroke so the banker can see exactly what gets copied.
- **Outcomes:** copy-success via `role="status"`; clipboard-blocked via `role="alert"` (does NOT claim the draft was saved).
- **Footer buttons:** Close + Copy note.

The formatted preview (from `buildRelationshipNoteText`):

```
Relationship note — <Client name>
Prepared <YYYY-MM-DD UTC> by <Banker name>

Active deals:                                    (only when deals supplied)
- <Deal name> (<Stage>)
- ...

Note:
<banker-typed note>

Follow-up:                                       (only when non-blank)
<banker-typed follow-up>

Open asks / next steps:                          (only when non-blank)
<banker-typed open asks>

— Local draft. Not saved to the system. Paste into the appropriate system of record.
```

## What is NOT persisted

- No Dataverse write of any kind.
- No `cr664_auditevent` row.
- No `cr664_dealtimelineevent` row.
- No `cr664_dealtask1` row.
- No localStorage / sessionStorage / IndexedDB write — the draft does not survive a modal close, a route change, or a page refresh.
- No telemetry, analytics, or perf-registry call carries the note text.
- The clipboard write is the ONLY exit point for the text, and the destination is whatever the OS clipboard is — the banker's own paste target.

## Files created

- `src/shared/relationship/relationshipNoteDraft.ts` — pure formatter (`buildRelationshipNoteText` + `LOCAL_DRAFT_FOOTER` constant + structural input types).
- `src/shared/relationship/relationshipNoteDraft.test.ts` — 16 formatter tests: heading + prepared-by, banker-name handling (undefined / blank), active-deal pill rendering, stage-pareheses behavior, empty-deals block omission, blank-note placeholder, whitespace trimming, optional-block omission, footer verbatim, ISO-day UTC determinism, module-hygiene (no SDK / role imports; no affirmative persistence / sync / AI / official-record vocabulary).
- `src/banker/RelationshipNoteDraftModal.tsx` — local-only modal component.
- `src/banker/RelationshipNoteDraftModal.test.tsx` — 8 rendering tests: modal semantics (role=dialog, aria-modal, aria-labelledby), local-only banner, Copy disabled until required note non-empty, Copy writes preview to clipboard (success via role=status), clipboard-blocked outcome via role=alert (and does NOT claim the draft was saved), Escape closes, rendered-DOM forbidden-vocab scan, Preview block contains the LOCAL_DRAFT_FOOTER verbatim.
- `docs/PHASE_78_RELATIONSHIP_NOTES_LOCAL_ONLY.md` — this document.

## Files modified

- `src/banker/RelationshipMemory.tsx` — each client row gains a "Draft relationship note" button; clicking it mounts `<RelationshipNoteDraftModal />` with the client + deals pre-filled.
- `src/deals/RelationshipContext.tsx` — the `has-other-deals` and `no-other-deals` branches gain a "Draft relationship note" button; clicking it mounts the same modal. Banker name is pulled from `useOptionalBanker()` (already in scope for the Phase 77 role boundary).
- `src/shared/governance/platformInventory.ts` — added `LOCAL_ONLY_FLOWS.relationship-note-draft` with the full Phase 78 disclaimer.
- `src/shared/governance/platformInventory.test.ts` — added Phase 78 assertions (entry exists; disclaimers verbatim; verbatim footer phrase; doc exists on disk).
- `src/shared/governance/dataProviderIsolation.test.ts` — extended the existing `deals/RelationshipContext.tsx` allowlist entry to include `../banker/RelationshipNoteDraftModal` with a stated Phase 78 reason.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.1 + §1.16 advanced.

## Surfaces updated

- **Banker Command Center → RelationshipMemory card** (Phase 76): "Draft relationship note" button per client row.
- **Banker Deal Workspace → RelationshipContext card** (Phase 77): "Draft relationship note" button in both the `has-other-deals` and `no-other-deals` branches (skipped in the `no-client-name` branch — no client to note).

## Draft fields implemented

| Field | Required | Notes |
|---|---|---|
| Note | Yes | Required to enable Copy. Trimmed on copy. |
| Follow-up | No | Omitted from the copied draft when blank. |
| Open asks / next steps | No | Omitted from the copied draft when blank. |

Implicit metadata (auto-populated from props; banker cannot edit):

- Client name (from the relationship entry's `clientNameDisplay`).
- Banker name (from `useBanker().fullName`).
- Active deals (passed as `RelationshipNoteDealRef[]` — name + stage; the modal does not look up additional deal data).
- `generatedAt` ISO-day (UTC) — captured once on modal mount.

## Local-only posture

- **State:** lives in `useState` inside the modal component. No upward propagation, no context write, no localStorage write.
- **Lifecycle:** the draft exists between modal mount and unmount. Closing the modal without copying loses it; that is the documented contract.
- **Persistence exit:** `navigator.clipboard.writeText(preview)`. If the browser blocks clipboard access, the modal surfaces a `role="alert"` outcome telling the banker to select the Preview text and copy it manually.
- **No external transmission:** no `fetch`, no `Cr664_*Service` call, no SDK invocation. The static-source hygiene test in `relationshipNoteDraft.test.ts` enforces this for the pure formatter; the modal itself uses only `Card` / `Badge` / theme imports from `src/shared/`.

## Inventory status

- `GOVERNED_WRITES`: unchanged (no new entry).
- `LOCAL_ONLY_FLOWS`: new entry `relationship-note-draft` (Phase 78). Note text explicitly disclaims Dataverse write, audit row, timeline event, governed-write entry, cross-device persistence, and includes the verbatim `LOCAL_DRAFT_FOOTER` phrase + Phase 78 doc path.
- `NOT_WIRED`: unchanged.
- `DEALS_ALLOWED_CROSS_IMPORTS` (Phase 48 isolation): the existing `deals/RelationshipContext.tsx` entry was extended to allow `../banker/RelationshipNoteDraftModal` with a stated Phase 78 reason.

## Tests added / updated

- 16 formatter tests in `src/shared/relationship/relationshipNoteDraft.test.ts`.
- 8 modal-rendering tests in `src/banker/RelationshipNoteDraftModal.test.tsx`.
- 2 new inventory anchors in `src/shared/governance/platformInventory.test.ts`:
  - `relationship-note-draft (Phase 78) is a LOCAL_ONLY flow with the right disclaimers`;
  - `the Phase 78 doc actually exists on disk`.
- The existing inventory-list assertion was extended to include `relationship-note-draft` in the expected `LOCAL_ONLY_FLOWS` id set.
- The existing `every local-only flow note explicitly states no Dataverse write` assertion continues to enforce the disclaimer on the new entry.

No existing test was changed substantively. Phase 77's RelationshipMemory + RelationshipContext rendering tests continue to pass — the new "Draft relationship note" button is a sibling to the existing pills, so the existing has-other-deals / no-other-deals assertions still match.

## Future schema upgrade path

The Phase 78 LOCAL_ONLY surface is the stop-gap. The Vibe-expected persistent-notes capability requires the following additions:

1. **`cr664_borrowernote` entity** (new). Columns: `cr664_clientreference`, `cr664_dealreference` (optional), `cr664_noteauthor` (lookup to systemuser), `cr664_noteat`, `cr664_notetext`, `cr664_followup`, `cr664_openasks`, `cr664_visibility` (banker-only / team / etc.). Governance call required for visibility defaults.
2. **Governed write** — Phase-21-style. Save Note → audit row + timeline event + outcome union. The Phase 78 modal's "Copy note" stays as a parallel local path; "Save note" becomes the persistence path.
3. **Verified borrower entity id.** A real `cr664_borrower` foreign key on the deal + on the note entity is the prerequisite for cross-deal note visibility. Phase 76's client-name grouping remains the fallback.
4. **Outlook / Teams activity ingestion.** Lane E connector phase. Once contact history is ingested, the note draft modal can offer "Most recent borrower email" / "Most recent meeting" pre-fills.
5. **AI-assisted prep briefs.** Lane F. The note modal could (opt-in) surface a Copilot brief summarizing recent activity. Gated behind an explicit "Copilot brief — review before use" warning; never auto-applied.
6. **Cross-deal banker notes view.** Once persistence lands, RelationshipMemory + RelationshipContext can render a "Recent notes" section per client, populated from the new entity rather than left as a banker-paste workflow.

Phase 78 is intentionally shaped so that swapping in the persistence layer later is a localized change: the modal already collects all the right fields; swapping `navigator.clipboard.writeText` for a governed-write call is the only contract-level change. The Phase 78 local-only banner + footer are removed at that point and replaced with audit / timeline outcome wording.

## Confirmation: no writes / schema / AI / graph / sync added

- **No new write surface.** No `GOVERNED_WRITES` entry was added.
- **No schema change.** No new Dataverse table or column. The modal collects banker text and copies it to the clipboard; nothing else.
- **No AI.** Pure formatter; no model invocation. Module-hygiene test pins the source.
- **No graph or household linkage.** Inherits the Phase 76 client-name grouping; does not extend it.
- **No cross-device sync.** Modal state is React-local and discarded on close.

## Test + build counts (at acceptance)

- Full suite: **1290 / 1290 tests passing** (Phase 77 baseline 1266 + Phase 78's 16 formatter + 8 modal + 2 inventory anchors and the +1 to the existing inventory-list assertion). The 1-test delta on the existing assertion was a content edit, not a new test.
- `tsc -b && vite build`: clean.

## Recommended next phase

From the coverage map and the standing Lane-A momentum:

- **Dark theme tokens** — closes the largest remaining a11y gap (Phase 74 §1.28 named dark theme as the next a11y step). Pure UI / token-system phase; no schema, no writes, no new derivation. This is the cleanest in-repo Lane A target now that the relationship-memory / activity / cross-deal-context / notes-capture quartet is complete.
- **Manager / team Deal Workspace cross-deal context** — extends Phase 77 to manager and team workspaces using their existing already-authorized deal lists. Same role-boundary discipline; pure read-only.
- **Per-deal pinned banker notes (still LOCAL_ONLY)** — a sibling LOCAL flow that lets a banker draft a per-deal note rather than a per-client note, surfaced from the Deal Workspace. Same modal shape; different scope label.

Dark theme tokens is the lowest-risk and closes the most concrete a11y gap. Manager/team cross-deal context extends an already-shipped capability with no new product moves. Per-deal pinned notes is the natural Phase 78 sibling if the user wants to continue on the relationship-memory branch before pivoting to a11y.
