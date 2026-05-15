# Phase 67 — Borrower-Safe Packet Email Handoff Integration

**Phase posture:** local-only flow extension. Reuses the Phase 63
handoff helpers (`buildMailtoUrl`, `buildHandoffClipboardText`) and
the Phase 66 packet generator. No new governed write. No new
Dataverse write. No new audit row. No new timeline event. No email
send. The Phase 65 `NOT_WIRED.borrower-portal` posture remains
intact and the Phase 65 structural sweep still passes.

**What this phase ships:** the Phase 66
`BorrowerSafeStatusPacketModal` now renders an optional Recipient
field, an "Open in Outlook" button, and a "Copy email" button — so
a banker can prepare a borrower-safe email and hand it to their
own Outlook client without leaving the modal. The Phase 66 packet
generator is unchanged; only the modal grew.

Related canonical sources:
- [src/deals/BorrowerSafeStatusPacketModal.tsx](../src/deals/BorrowerSafeStatusPacketModal.tsx) — the modal (Phase 66 + 67)
- [src/deals/borrowerSafeStatusPacket.ts](../src/deals/borrowerSafeStatusPacket.ts) — pure generator (Phase 66; unchanged)
- [src/deals/emailDelivery/emailHandoff.ts](../src/deals/emailDelivery/emailHandoff.ts) — `buildMailtoUrl` / `buildHandoffClipboardText` (Phase 63)
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — `LOCAL_ONLY_FLOWS.borrower-safe-status-packet`
- [PHASE_63_EMAIL_HANDOFF_FALLBACK.md](PHASE_63_EMAIL_HANDOFF_FALLBACK.md) — the no-admin handoff pattern this phase reuses
- [PHASE_66_BORROWER_SAFE_STATUS_PACKET.md](PHASE_66_BORROWER_SAFE_STATUS_PACKET.md) — the packet shape this phase delivers via email handoff
- [PHASE_64_BORROWER_PORTAL_AUDIT.md](PHASE_64_BORROWER_PORTAL_AUDIT.md), [PHASE_65_BORROWER_PORTAL_DEFERRAL.md](PHASE_65_BORROWER_PORTAL_DEFERRAL.md) — the standing portal-deferral posture this phase respects

---

## 1. Workflow

1. **Banker opens the deal workspace.**
2. **Banker clicks "Borrower-safe status packet"** on the Borrower
   Communication card header.
3. **Modal opens** with:
   - Header facts (deal name, borrower display name, item counts).
   - A **Recipient (optional)** input — empty by default.
   - A **Subject** field, pre-filled by the Phase 66 generator.
   - A **Borrower-safe summary** textarea, pre-filled by the
     Phase 66 generator (four sections + disclaimer + signoff).
4. **Banker (optionally) types a recipient.** If they have a
   verified borrower email, they type it. If not, they leave the
   field blank.
5. **Banker chooses one of two handoff actions:**
   - **Open in Outlook** — sets `window.location.href` to an RFC
     6068 `mailto:` URL with the (possibly empty) recipient,
     URL-encoded subject, and URL-encoded body. The OS hands off
     to the banker's default mail client.
   - **Copy email** — writes a Phase 63-format
     `To: <recipient>\nSubject: <subject>\n\n<body>` payload to
     `navigator.clipboard`. The banker pastes into Outlook (or
     any other mail client) manually.
6. **Banker sends from Outlook.** The Code App does **not** send.
7. **Modal surfaces a conservative outcome panel** confirming the
   handoff method without claiming a send happened.

No part of this workflow writes to Dataverse. No audit row. No
timeline event. The banker's actual send (in their own Outlook)
is outside the app's observation surface.

## 2. No-admin rationale

The same logic as Phase 63 applies, refreshed for the packet case:

| Capability that would normally require admin / tenant work | Why Phase 67 does not need it |
|---|---|
| Office 365 Outlook connector registration | The app never invokes a connector. `mailto:` is OS-level; the clipboard is browser-level. |
| Graph API permission grant | Not used. |
| Tenant guest invitations for the borrower | The borrower never authenticates against this app. |
| Secrets in the client (SMTP creds, OAuth refresh, etc.) | None. The Code App holds nothing secret. |
| Power Automate flow registration | Not used. |
| External-user role provisioning | Not used. |

Phase 67 ships purely with what the customer already has: a
modern browser and an installed mail client. The packet content
is deterministic from data the banker is already authorized to
see, and the handoff helpers are pure functions.

## 3. What is local-only

Everything Phase 67 ships is local-only:

- **The packet preview** — rendered entirely from data the
  Phase 66 generator can produce locally; no SDK call.
- **The Recipient field** — banker-typed; not persisted, not
  validated against an external directory.
- **The mailto URL** — assembled in the browser by
  `buildMailtoUrl`; the navigation is OS-level (`window.location.href`).
- **The clipboard text** — assembled in the browser by
  `buildHandoffClipboardText`; written via
  `navigator.clipboard.writeText`.
- **The outcome panels** — UI-only acknowledgments that the
  banker triggered an action. No row is written, anywhere.

## 4. What is NOT logged / NOT sent by the app

Explicitly:

- **No email is sent by the app.** The Code App never calls
  Outlook, Graph, an SMTP relay, or any other mail transport.
- **No audit row is written.** Phase 63's
  `deal-document-request-handoff` governed write records a
  per-document handoff because a specific document checklist
  row is the subject of that write. The Phase 67 packet is a
  deal-wide status snapshot, not a per-document event. No
  governed write was added; the existing
  `GOVERNED_WRITES` count of 10 is unchanged.
- **No timeline event is emitted.** The packet has no
  per-document subtype, and the `BorrowerUpdateSent`
  enum value remains unused (per Phase 23 and Phase 64).
- **No Dataverse write of any kind.** The modal reads from
  `useDealData()` (already authorized) and writes nothing.

Adding a governed write for "banker prepared a borrower-safe
packet handoff" is a separate phase decision. If it ever lands,
the new write would need its own correlation prefix, audit event
name, timeline subtype, and `GOVERNED_WRITES` entry — same shape
as Phase 63. Phase 67 intentionally stops short of that scope.

## 5. How this relates to Phase 63 HANDOFF

| | **Phase 63** — `deal-document-request-handoff` | **Phase 67** — borrower-safe packet handoff |
|---|---|---|
| Subject of the handoff | A single document on the checklist (per-row) | The deal-wide status snapshot (no row) |
| Pre-fill source | Banker fills request note + recipient | Phase 66 generator produces subject + body deterministically |
| Recipient handling | Required input (the banker is targeting a known borrower) | Optional (Phase 64 confirmed no borrower email column; we never infer) |
| Helpers used | `buildMailtoUrl`, `buildHandoffClipboardText` | Same helpers (Phase 67 reuses them verbatim — no duplication) |
| Governance | Governed write — audit + timeline emitted with correlation prefix `'oh'` | LOCAL_ONLY_FLOWS — no write |
| Conservative copy | "handoff prepared", never "sent" | Same discipline; pinned by the modal's no-"sent"/no-"delivered"/no-"portal" tests |
| `GOVERNED_WRITES` count | +1 (10th entry) | +0 (still 10) |

Phase 67 explicitly does **not** subsume Phase 63. They serve
different operational events. A future phase could converge them
under a single "outgoing borrower email" governed write, but that
is a deliberate design choice with its own brief.

## 6. Remaining portal blockers (unchanged)

All six blockers Phase 64 identified and Phase 65 ratified remain
in effect. Phase 67 resolves zero of them:

1. **No external auth provider.**
2. **No invitation-token / magic-link table.**
3. **No external-user role model.**
4. **No File column on `cr664_DocumentChecklist`.**
5. **No secure-message persistence.**
6. **No connector-backed email delivery** — `NOT_WIRED.outlook-connector-live-send` and `NOT_WIRED.email-delivery` both still in place. The Office 365 Outlook connector remains unregistered (per [PHASE_62](PHASE_62_OUTLOOK_LIVE_SEND.md)).

The Phase 65 structural sweep still passes — no Phase 67 source
path matches any forbidden borrower-portal / magic-link /
upload-portal pattern, `'borrower-portal'` literal still only
appears in `platformInventory.ts`, and `workspaceRoutes.ts` still
recognizes exactly the five internal roles.

`NOT_WIRED.borrower-portal` is unchanged. `NOT_WIRED.document-upload`
is unchanged.

## 7. Tests

| File | What it pins |
|---|---|
| [BorrowerSafeStatusPacketModal.test.tsx](../src/deals/BorrowerSafeStatusPacketModal.test.tsx) | Phase 66 surfaces (local-preview banner with no-"sent" claim; deal facts; subject default; body sections; Esc closes; no "send / delivered / portal / secure message / upload / approved / accepted / cleared" claim anywhere on screen). Phase 67 surfaces: Recipient (optional) input renders empty by default with helper text; Open-in-Outlook and Copy-email buttons both render; Open in Outlook produces `mailto:?subject=…&body=…` with EMPTY recipient slot when no email typed AND the body greeting (which contains the client name) does NOT leak into the recipient slot; Open in Outlook with a banker-typed recipient produces `mailto:<encoded recipient>?…`; Copy email writes `To: \nSubject: …\n\n<body>` (Phase 63 format) when no recipient typed; Copy email honors a typed recipient on the To: line; both handoff buttons disable when the body is cleared; the mailto URL never contains internal deal data (collateral, margin, stage) even when the deal object carries explicit "SECRET-…" markers. |
| [platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) | Extended: `LOCAL_ONLY_FLOWS.borrower-safe-status-packet` note references the Phase 67 doc by path; states "no audit row", "no timeline event", "no Dataverse write" explicitly; describes the mailto + clipboard helpers; states "never infer a recipient from clientName" explicitly. New Phase 67 describe block: `borrower-safe-status-packet` is NOT in `GOVERNED_WRITES`; `GOVERNED_WRITES.length === 10` (the count has not drifted); the Phase 67 doc exists on disk. |

The existing Phase 65 borrower-portal sweep continues to pass —
Phase 67 did not introduce any source path matching a forbidden
pattern, did not introduce the `'borrower-portal'` string literal
anywhere outside `platformInventory.ts`, and did not touch
`workspaceRoutes.ts`.

The existing Phase 66 generator tests are unchanged.

## 8. UI copy used and avoided

Per the brief's copy rules:

**Used (verbatim):**
- "Open in Outlook" — primary handoff button.
- "Copy email" — secondary handoff button.
- "Prepared for banker review" — banner framing.
- "The banker sends from Outlook" — outcome-panel framing
  (appears twice — once for the mailto branch, once for the
  clipboard branch).

**Avoided (pinned by tests):**
- "sent", "delivered", "approved", "accepted", "cleared",
  "validated", "final", "portal", "secure message",
  "uploaded by borrower".

The modal-wide no-claim sweep (`Phase 66 local preview > does NOT
render any "send" / "delivered" / "portal" claim anywhere on
screen`) was extended in Phase 67 to also forbid `upload`,
`approved`, `accepted`, and `cleared`. The test scans
`document.body.textContent` at render time.

## 9. Phase 67 AAR

**Files created**
- [docs/PHASE_67_PACKET_EMAIL_HANDOFF.md](PHASE_67_PACKET_EMAIL_HANDOFF.md) — this document.

**Files modified**
- [src/deals/BorrowerSafeStatusPacketModal.tsx](../src/deals/BorrowerSafeStatusPacketModal.tsx) — added the optional Recipient input + helper text; replaced the single Phase 66 "Copy borrower update" button with the Phase 67 pair "Open in Outlook" + "Copy email"; refactored the action state from a `CopyState` enum to a richer `ActionState` union that distinguishes copied / copy-failed / mailto-launched; replaced the body of `handleCopy` with `buildHandoffClipboardText` (Phase 63 helper) so the clipboard payload includes a `To:` line; added `handleOpenMailto` using `buildMailtoUrl` (Phase 63 helper); updated the banner copy to use "Prepared for banker review" and the outcome panels to use "Banker sends from Outlook" framing.
- [src/deals/BorrowerSafeStatusPacketModal.test.tsx](../src/deals/BorrowerSafeStatusPacketModal.test.tsx) — replaced the single Phase 66 "Copy button copies Subject: …\\n\\n<body>" assertion with the Phase 67 Phase-63-format payload assertion; extended the conservative-copy sweep with additional forbidden words; added a new `Phase 67 handoff surfaces` describe block (8 assertions) covering Recipient field render, both handoff buttons render, mailto with/without recipient, Copy email with/without recipient, button-disabled-on-empty-body, and mailto-leak-test for internal deal data.
- [src/shared/governance/platformInventory.ts](../src/shared/governance/platformInventory.ts) — extended the `LOCAL_ONLY_FLOWS.borrower-safe-status-packet` note to describe the Phase 67 in-modal handoff affordance, reference the Phase 67 doc by path, and disclaim audit / timeline / Dataverse writes for the handoff.
- [src/shared/governance/platformInventory.test.ts](../src/shared/governance/platformInventory.test.ts) — extended the Phase 66 assertion to require the Phase 67 doc reference; added a new Phase 67 describe block pinning that the handoff is NOT a governed write, that `GOVERNED_WRITES.length === 10`, and that the Phase 67 doc exists on disk.
- [docs/CANONICAL_SOURCES.md](CANONICAL_SOURCES.md) — added one row pointing at this doc.

**Handoff behavior implemented**
- "Open in Outlook" → builds RFC 6068 `mailto:` URL via `buildMailtoUrl` and sets `window.location.href`. OS hands off to the banker's default mail client.
- "Copy email" → writes the Phase 63 four-line `To: …\nSubject: …\n\n<body>` payload to `navigator.clipboard`.
- Outcome panels acknowledge each action in conservative-copy framing ("Outlook handoff launched" / "Email content copied to clipboard"), each with an explicit "the app did not send" / "nothing was logged" line.

**Recipient behavior**
- Field is optional, empty by default.
- The helper text explicitly states there is no verified borrower email on this deal record.
- We never infer a recipient from `clientName`. The static test "mailto URL has empty recipient slot AND body greeting does not leak into recipient slot" pins this structurally.
- We never hardcode a fallback recipient.
- The typed recipient appears only in the local Outlook compose surface or the copied email text; no audit row, no timeline event, no Dataverse write of any kind.

**Borrower-safe exclusions confirmed**
- All Phase 66 exclusions still hold (the generator was not touched).
- New Phase 67 test pins that the mailto URL never contains internal deal data (collateral, margin, stage) even when the deal object carries explicit "SECRET-…" markers.

**LOCAL_ONLY_FLOWS / governed-write status**
- `LOCAL_ONLY_FLOWS.borrower-safe-status-packet` extended with Phase 67 note (still LOCAL_ONLY).
- `GOVERNED_WRITES` count unchanged: still 10.

**Tests / build counts**
- Test count: 1011 → 1024 passing (+13 new Phase 67 assertions, –1 Phase 66 assertion that was replaced rather than removed: the old `Subject: …\\n\\n<body>` Copy assertion was superseded by the new `To: \nSubject: …\n\n<body>` Copy assertion). Net +13.
- Build clean; bundle delta: small (the modal grew by ~1 kB; no new modules).

**Confirmations**
- No app-side email send — the modal calls `window.location.href` (OS-level handoff) or `navigator.clipboard.writeText` (browser-level), never an SDK service.
- No new governed write — `GOVERNED_WRITES` still at 10.
- `NOT_WIRED.borrower-portal` (Phase 65) unchanged.
- `NOT_WIRED.document-upload` unchanged.
- `NOT_WIRED.outlook-connector-live-send` unchanged.
- Phase 65 structural sweep still green — no Phase 67 source path matches any forbidden pattern, no production source contains `'borrower-portal'` outside the inventory, `workspaceRoutes.ts` still names exactly the five internal roles.

**Recommended next phase**
- Phase 68 should NOT be a portal phase. The two highest-leverage upstream items remain the Office 365 Outlook connector registration and the File column on `cr664_DocumentChecklist`.
- In-repo options that respect the deferral:
  - **Phase 68 — Stale Pending-Review Escalation** (originally floated in Phase 66): extend Phase 54's pending-review signal into a Phase-21-style governed task reassignment write. Internal flow, no portal exposure, reuses the audit + timeline discipline.
  - **Phase 68 — Borrower-safe packet across multiple deals**: extend the Phase 66/67 packet so a banker can produce one packet covering a borrower's portfolio of deals (banker-facing only, still LOCAL_ONLY). Useful for relationship managers.
  - **Phase 68 — Admin Release Readiness Gate refinements**: surface `LOCAL_ONLY_FLOWS.borrower-safe-status-packet` (now with the Phase 67 handoff affordance) in the admin diagnostics panel so leadership has a single place to see the operational borrower-comms posture.
