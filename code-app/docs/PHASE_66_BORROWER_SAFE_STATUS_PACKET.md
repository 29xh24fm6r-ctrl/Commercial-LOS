# Phase 66 — Borrower-Safe Status Packet

**Phase posture:** `read-only surface` with a `LOCAL_ONLY_FLOWS`
entry. No Dataverse write. No email send. No SDK call. No new
governed write. No borrower route. No fake auth. No upload. No
secure messaging. The borrower-portal posture from Phase 65
(`NOT_WIRED.borrower-portal`) remains intact.

**What this phase ships:** a banker-facing generator that produces
a structured, borrower-safe summary of a deal's outstanding,
received, and under-review documents — plus a "Next requested
actions" list — and a local preview/copy modal. The banker pastes
the text into their own mail client (the Phase 63 Outlook handoff
on the Documents card is one option) to actually deliver it. The
app does not send the packet and does not record that the banker
copied it.

Related canonical sources:
- [src/deals/borrowerSafeStatusPacket.ts](../src/deals/borrowerSafeStatusPacket.ts) — pure generator
- [src/deals/BorrowerSafeStatusPacketModal.tsx](../src/deals/BorrowerSafeStatusPacketModal.tsx) — local preview + Copy
- [src/deals/BorrowerCommunication.tsx](../src/deals/BorrowerCommunication.tsx) — trigger button (Phase 66 wiring)
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `LOCAL_ONLY_FLOWS.borrower-safe-status-packet`
- [PHASE_63_EMAIL_HANDOFF_FALLBACK.md](PHASE_63_EMAIL_HANDOFF_FALLBACK.md) — the manual delivery channel the banker uses
- [PHASE_64_BORROWER_PORTAL_AUDIT.md](PHASE_64_BORROWER_PORTAL_AUDIT.md) — the audit this phase respects
- [PHASE_65_BORROWER_PORTAL_DEFERRAL.md](PHASE_65_BORROWER_PORTAL_DEFERRAL.md) — the standing deferral this phase respects

---

## 1. What the packet includes

The generator (`buildBorrowerSafeStatusPacket`) reads exactly four
inputs:

- `deal.name` and `deal.clientName` — used for the subject + greeting.
- `documents.outstanding` — rendered as "Items requested (N):".
- `documents.received` — rendered as "Items received (N):".
- `documents.reviewed` — rendered as "Items under bank review (N):".
- A "Next requested actions:" list derived from the outstanding
  documents (`"Please send: <doc name>"` per item).

The body structure is deterministic and looks like:

```
Hi <client name>,

Below is a borrower-safe summary of where things stand on <deal name>.
Last updated: <today>.

Items requested (N):
  - <doc name> (due <date>) — requested on <date>
  - …

Items received (N):
  - <doc name> — received on <date>
  - …

Items under bank review (N):
  - <doc name>
  - …

Next requested actions:
  - Please send: <doc name>
  - …

This is a working summary from our records. It does not represent
a decision on your loan; please confirm details with your banker
before relying on this for any next step.

Thank you,
<banker name>
```

Each list section caps at 25 items with an honest "…and N more"
overflow line. Empty lists render their canonical zero-state line
("No outstanding items at this time.", "Nothing received yet.",
etc.).

The subject is `Status update — <deal name>` (or `Status update —
your loan` if the deal has no name).

## 2. What is excluded — deliberately

The brief's exclusion list, mapped to verified findings:

| Excluded content | How exclusion is enforced |
|---|---|
| Internal risk commentary | Generator never reads `_cr664_risklevelreference_value` (no SDK import). |
| Alert severity / internal exceptions | No `Cr664_alertqueuesService` import; no `Cr664_dataqualityflagsService` import. |
| Credit memo content | No `creditMemoQueries` / `creditMemoActions` import. |
| Underwriting conclusions | No fields named in the schema are read for this. |
| Approval / denial language | The deterministic template contains none of `approved`, `denied`, `cleared`, `accepted`, `validated`, `final`. Tested. |
| Profitability metrics | No `Cr664_profitabilitysnapshot1sService` / `Cr664_profitabilityrefreshstatusesService` import. |
| Internal audit data | No `Cr664_auditeventsService` import. |
| Internal task assignments | No `dealTaskQueries` / `dealTaskActions` import. The "Next requested actions" list is derived from outstanding DOCUMENTS, not from internal `cr664_dealtask1s` rows. |
| Pricing margin / collateral | The generator reads `deal.name` and `deal.clientName` only — never `collateralSummary`, `spreadMargin`, `productType`, etc. Tested. |
| Deal amount | Conservative call: omitted (borrower already knows). Tested. |
| Deal stage | Conservative call: omitted (the borrower experiences bank stages as opaque progress). Tested. |
| Reviewer identity | The "Items under bank review" section renders names only; the `reviewer` field on a doc is intentionally not read. Tested. |

The exclusion discipline is structurally pinned by a static-source
assertion in `borrowerSafeStatusPacket.test.ts`: the generator file
must not import any internal-data module, any SDK service, or the
`@microsoft/power-apps` package. A future edit that violates this
fails CI.

## 3. Why this is NOT a portal

This phase delivers a banker-facing artifact. The borrower does not
visit any URL, does not log in, does not see the deal in a browser,
and does not upload anything. The packet content is **handed to**
the borrower via the banker's own mail client (Phase 63 Outlook
handoff, or the banker's personal channel).

Concretely, this phase does NOT:

- Add a `/borrower/*` route. (Phase 65 pins this structurally.)
- Add a borrower workspace role to `workspaceRoutes.ts`.
- Add an external auth path, magic link, or invitation token.
- Add an upload UI or imply uploads are possible.
- Add a secure-message thread, comment box, or chat widget.
- Emit a `BorrowerUpdateSent` timeline event (the schema enum value
  exists but remains unemitted, per Phase 23 and Phase 64).
- Write to Dataverse at all. No audit row, no timeline row, no
  checklist mutation.

Because no write occurs, there is no governed write entry. The
phase uses `LOCAL_ONLY_FLOWS.borrower-safe-status-packet` as its
governance row, which is the same classification as the Phase 23
borrower update draft and the Phase 24 credit memo local preview.

## 4. How bankers use it with the Phase 63 email handoff

1. Banker opens a deal in the Banker Deal Workspace.
2. Banker clicks **Borrower-safe status packet** in the Borrower
   Communication card header (left of the existing **Draft Borrower
   Update** button).
3. The modal opens with a fully-formed subject + body preview. The
   banker may lightly edit the text (edits are the banker's
   responsibility — the template is borrower-safe by construction,
   but post-edit text is not re-validated).
4. Banker clicks **Copy borrower update**. The text (`Subject: …\n\n<body>`)
   lands on the clipboard.
5. Banker pastes it into Outlook — either via the Phase 63 Outlook
   handoff on the Documents card (which records the handoff as a
   governed write with audit + timeline), or directly into a new
   Outlook compose window (no app-side record).

The Phase 66 modal does **not** auto-launch Outlook. The banker
chooses the delivery channel. This is deliberate: a future phase
that adds a "Send packet via Outlook handoff" button would need a
new governed write to record the send, because the packet is a
distinct artifact from the document-request email. Phase 66 stops
at "local preview + copy."

## 5. Remaining portal blockers (unchanged)

All six blockers Phase 64 identified and Phase 65 ratified remain
in effect. Phase 66 does not resolve any of them:

1. **No external auth provider** — runBootstrap still requires a
   Bank-tenant Entra UPN.
2. **No invitation-token / magic-link table.**
3. **No external-user role model.**
4. **No File column on `cr664_DocumentChecklist`.**
5. **No secure-message persistence.**
6. **No connector-backed email delivery** (Office 365 Outlook
   connector unregistered; Phase 62 stub still active).

`NOT_WIRED.borrower-portal` remains in place. The Phase 65
structural sweep (no borrower route, no magic-link path, no
upload-portal path, etc.) still passes — Phase 66 deliberately
chose path/component names (`BorrowerSafeStatusPacket*`) that don't
match any Phase 65 forbidden pattern.

---

## 6. Tests

| File | What it pins |
|---|---|
| [borrowerSafeStatusPacket.test.ts](../src/deals/borrowerSafeStatusPacket.test.ts) | 33 assertions. Subject + framing (deal name in subject; client greeting; fallback to "Hi there,"; signoff with/without banker name; "Last updated:" line; working-summary disclaimer). Section derivation (counts, names, due-date + requested-on + received-on metadata, reviewer is NOT leaked, "Please send: …" lines, zero-states, 25-item cap with overflow line). Borrower-safe exclusion (no internal field values leak even when deal contains "SECRET-…" markers; no amount, stage, or banker-assignment data; static-source assertion that generator imports no internal data modules, no SDK, no power-apps package). Conservative-copy discipline (9 forbidden terms — `approved`, `denied`, `cleared`, `accepted`, `validated`, `final`, `portal`, `secure message`, `uploaded by borrower` — never appear in template text; canonical section labels appear verbatim; no "sent / delivered" claims; no portal / sign-in / upload-the-X implications). |
| [BorrowerSafeStatusPacketModal.test.tsx](../src/deals/BorrowerSafeStatusPacketModal.test.tsx) | 7 assertions. Renders local-preview-only banner and "the app does not send this" framing; renders deal header facts; subject defaults to canonical form; body contains all four sections + signoff; Copy button writes the canonical "Subject: …\n\n<body>" payload to the clipboard and surfaces a success outcome panel; Esc closes; no "email sent / delivered / portal / secure message" claim anywhere on screen. |
| [platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) | Extended with: `borrower-safe-status-packet` appears in `LOCAL_ONLY_FLOWS`; its `phase` is 66; its note disclaims any portal implication AND references the Phase 66 doc by path. The existing Phase 23 + Phase 24 LOCAL_ONLY_FLOWS assertions still hold. |

The Phase 65 borrower-portal sweep still passes. No Phase 65
forbidden path matches `BorrowerSafeStatusPacket*` or any of the
new file names. The `'borrower-portal'` string literal still only
appears in `platformInventory.ts`. `workspaceRoutes.ts` still
names exactly the five internal roles.

## 7. Bundle / build impact

- Bundle: `675.88 kB → 686.02 kB` (+10 kB raw, +1.7 kB gzip). The
  delta is the new generator (~3 kB) + the modal (~6 kB) + the
  extended platformInventory entry (~1 kB).
- Build: clean. No new dependencies. No new generated-service
  imports.
- Tests: `970 → 1011` passing (+41 Phase 66 assertions).

## 8. Test-stability change (one-line config bump)

The `vitest.config.ts` default `testTimeout` was bumped from the
Vitest default (5000ms) to 15000ms. Several pre-existing jsdom +
userEvent.type tests intermittently hit the 5s ceiling under heavy
parallel load now that the suite is at 1011 tests. Every flaking
test passes well under 1s in isolation; the contention happens
when many workers simulate keystroke loops simultaneously. The
bump is an env-resilience fix only — it changes nothing about what
any test verifies. If a test legitimately needs longer than 15s,
it should pass `{ timeout: ... }` to `it()` and document why.

This is the smallest possible stability change; no test file was
modified to make Phase 66 green.

## 9. Phase 66 AAR

**Files created**
- [src/deals/borrowerSafeStatusPacket.ts](../src/deals/borrowerSafeStatusPacket.ts) — pure generator (`buildBorrowerSafeStatusPacket`).
- [src/deals/borrowerSafeStatusPacket.test.ts](../src/deals/borrowerSafeStatusPacket.test.ts) — 33 derivation / exclusion / conservative-copy assertions.
- [src/deals/BorrowerSafeStatusPacketModal.tsx](../src/deals/BorrowerSafeStatusPacketModal.tsx) — local preview + Copy modal. No write.
- [src/deals/BorrowerSafeStatusPacketModal.test.tsx](../src/deals/BorrowerSafeStatusPacketModal.test.tsx) — 7 UI assertions.
- [docs/PHASE_66_BORROWER_SAFE_STATUS_PACKET.md](PHASE_66_BORROWER_SAFE_STATUS_PACKET.md) — this document.

**Files modified**
- [src/deals/BorrowerCommunication.tsx](../src/deals/BorrowerCommunication.tsx) — added the "Borrower-safe status packet" trigger button (banker write surface, no Dataverse write); mounts the modal on click; preserves Phase 36 readOnly behavior (neither button renders in manager / team mode).
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — added the `LOCAL_ONLY_FLOWS.borrower-safe-status-packet` entry (Phase 66).
- [src/shared/governance/platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) — extended the local-only-flows assertions.
- [vitest.config.ts](../vitest.config.ts) — bumped default `testTimeout` from 5000ms to 15000ms (env-resilience only; see §8).

**Packet fields included**
- Deal name (subject + body).
- Client / borrower name (greeting).
- Outstanding documents (name + due-date + requested-on).
- Received documents (name + received-on).
- Reviewed documents (name only — reviewer identity excluded).
- Next requested actions (derived from outstanding docs).
- Working-summary disclaimer.
- Banker signoff.

**Excluded fields confirmed**
- All 13 categories in §2. Each exclusion is enforced either by
  not reading the field at all OR by the static-source assertion
  that the generator file imports no internal-data modules.

**LOCAL_ONLY_FLOWS / governed-write status**
- New `LOCAL_ONLY_FLOWS.borrower-safe-status-packet` entry
  (Phase 66). No governed-write entry. `GOVERNED_WRITES` stays at
  10.

**Tests added/updated**
- 33 generator tests (new file).
- 7 modal tests (new file).
- 3 platformInventory tests extended (existing file).
- 0 transitive-mock test files updated (the new module is pure,
  doesn't reach the SDK, doesn't change any banker write surface
  the existing transitive mocks guard).
- `vitest.config.ts` default `testTimeout` bumped to 15000ms (env-
  resilience only).

**Confirmations**
- No borrower route added.
- No fake auth / token / magic link added.
- No upload UI added.
- No secure-message UI added.
- No borrower role added to `workspaceRoutes.ts` or
  `WORKSPACE_DEAL_ACCESS`.
- No new governed write — `GOVERNED_WRITES` still at 10.
- `NOT_WIRED.borrower-portal` (Phase 65) is unchanged.
- `NOT_WIRED.document-upload` is unchanged.
- The Phase 65 static-source sweep still passes — no Phase 66
  source path matches any forbidden pattern, no production source
  contains `'borrower-portal'` outside the inventory, and
  workspaceRoutes still names exactly the five internal roles.
- Production behavior: a new optional banker action shipped on the
  Borrower Communication card (replaces nothing). Readonly /
  manager / team surfaces are byte-identical.

**Recommended next phase**
- Phase 67 should NOT add a portal slice. The two highest-leverage
  upstream items remain (1) Office 365 Outlook connector
  registration (closes Phase 62 stub + one portal blocker
  simultaneously) and (2) File column on `cr664_DocumentChecklist`
  (closes `NOT_WIRED.document-upload` + another portal blocker).
- In-repo, the natural next operational phase is **Phase 67 — Stale
  Pending-Review Escalation**: extend the Phase 54 pending-review
  signal into a Phase-21-style governed task reassignment write so
  documents that sit unreviewed past the at-risk window get
  surfaced for action. No portal exposure; pure internal
  banker/manager flow; reuses existing audit + timeline
  discipline. Alternative low-risk options: extend the Phase 66
  packet to include a per-borrower summary across multiple deals
  (banker-facing only); refine the Release Readiness Gate to
  surface the new `LOCAL_ONLY_FLOWS.borrower-safe-status-packet`
  row in admin diagnostics.
