# Phase 74 — Accessibility Audit + Targeted Fixes

## Goal

Audit and improve accessibility on the primary banker operational surfaces added or expanded in Phases 51–73, without adding product capability, write surfaces, schema work, AI, Teams/Outlook changes, or workflow behavior changes.

## Scope

- Accessibility fixes only.
- No new product capability.
- No new writes (no new `GOVERNED_WRITES` entry; no new `LOCAL_ONLY_FLOWS` entry).
- No schema work.
- No AI.
- No Teams/Outlook changes.
- No workflow behavior changes.

## Surfaces audited

- `src/deals/DealDocuments.tsx` — banker document list + actions.
- `src/deals/ReceiveDocumentModal.tsx` — Phase 51 governed receive.
- `src/deals/ReviewDocumentModal.tsx` — Phase 55 governed review.
- `src/deals/CreateDocumentReviewTaskModal.tsx` — Phase 70 review-task.
- `src/deals/BorrowerSafeStatusPacketModal.tsx` — Phase 66/67 packet.
- `src/deals/RequestDocumentModal.tsx` — Phase 22/61/63 request + email/handoff.
- `src/banker/MyWorkQueue.tsx` — banker work queue.
- `src/deals/CreditMemo.tsx` — Phase 73 consistency review block.
- `src/deals/ActivityTimeline.tsx` — Phase 72 last-visit badges.
- `src/manager/ActivitySummary.tsx` — Phase 71 derived analytics.
- `src/team/TeamBankerActivityBreakdown.tsx` — Phase 71 per-banker breakdown.

## Findings (audit summary)

Already in good shape across the operational surfaces:

- **Modal semantics.** Every modal uses `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the visible `<h2>` title.
- **Buttons.** Every action button has visible text or an explicit `aria-label` (the icon-row patterns in DealDocuments and MyWorkQueue use `aria-label={`Request document ${doc.name}`}`).
- **Forms.** All form fields are labeled via `<label htmlFor>` + matching `id`.
- **Error blocks.** All Card-level `ErrorBlock` components in DealDocuments / ActivityTimeline / ActivitySummary / TeamBankerActivityBreakdown / MyWorkQueue already declare `role="alert"`.
- **Tables.** TeamBankerActivityBreakdown uses real `<table>` / `<thead>` / `<th>` / `<tbody>` / `<td>` so header-to-cell association is implicit.
- **Keyboard.** Modal `Escape`-to-close handlers exist on all five governed-write modals + the BorrowerSafeStatusPacketModal. MyWorkQueue rows are `tabIndex={0}` + `role="link"` and respond to Enter / Space.
- **Conservative copy.** Phase 45 + 73 phrase guards remain enforced; no "failed", "invalid", "approved", "rejected", "AI-detected", "hallucinated", or "guaranteed mismatch" language is anywhere in the operational copy.

## Targeted fixes applied

### 1. Outcome blocks announce via live regions

Before Phase 74, the post-submit outcome blocks inside each modal were plain `<div>` containers — colored, visible to sighted users, but invisible to screen readers because no live region was declared. After submit, focus stays on the form area and the outcome silently appears.

Fix: success outcomes now declare `role="status"` (polite — announce when convenient), and error / partial / unknown outcomes declare `role="alert"` (assertive — announce immediately).

Surfaces touched:

- `ReceiveDocumentModal` `OutcomeBlock` — 4 branches.
- `ReviewDocumentModal` `OutcomeBlock` — 4 branches.
- `CreateDocumentReviewTaskModal` `OutcomeBlock` — 4 branches.
- `RequestDocumentModal` `RequestOutcomeBlock` (4) + `SendOutcomeBlock` (4) + `HandoffOutcomeBlock` (4) — 12 branches.
- `BorrowerSafeStatusPacketModal` — 3 local-only action outcomes (`copied` / `mailto-launched` / `copy-failed`).

### 2. Required form fields declare `aria-required` and link helper text

Before Phase 74, the visual "required" indicator next to the field label was sighted-user-only. Screen readers had no programmatic indication the field was required, and the helper line below the field was not linked back to the field as a description.

Fix: every required textarea / input across the governed-write modals now carries `aria-required="true"`, and the helper line carries an `id` that the field references via `aria-describedby`.

Surfaces touched:

- `ReceiveDocumentModal` — `receive-document-note` textarea + `receive-document-note-help` line.
- `ReviewDocumentModal` — `review-document-note` textarea + `review-document-note-help` line.
- `CreateDocumentReviewTaskModal` — `create-review-task-note` textarea + `create-review-task-note-help` line.
- `RequestDocumentModal` — `request-document-note` textarea + `request-document-note-help` line (note-only branch); `email-recipient` + `email-subject` inputs in both the send and handoff branches gain `aria-required="true"`.

### 3. Badge component forwards `aria-label`

Before Phase 74, the shared `Badge` component supported `title` (rendered as the native `title` attribute) but not `aria-label`. Some screen readers ignore `title` alone, leaving badges with terse visible text ("New", "Pending review") with no accessible long-form name.

Fix: `Badge` now accepts an optional `aria-label` prop and forwards it to the rendered `<span>`. The visual text remains short; the screen-reader-authoritative form is explicit.

Surfaces touched:

- `DealDocuments` — the "Pending review" badge gains `aria-label="Pending review — received Nd+ days ago and not yet reviewed"`.
- `ActivityTimeline` — the "New" since-last-visit badge gains `aria-label="New since your last visit on this browser, locally tracked"`.

## Files created

- `src/shared/accessibility/phase74AccessibilityAudit.test.tsx` — 9 rendered-DOM assertions pinning the new live-region roles, the `aria-required` / `aria-describedby` linkage, and the `Badge` `aria-label` forwarding (presence + absence).
- `docs/PHASE_74_ACCESSIBILITY_AUDIT.md` — this document.

## Files modified

- `src/shared/Badge.tsx` — added `aria-label` prop forwarded to the span.
- `src/deals/ReceiveDocumentModal.tsx` — outcome live regions + textarea aria contract.
- `src/deals/ReviewDocumentModal.tsx` — outcome live regions + textarea aria contract.
- `src/deals/CreateDocumentReviewTaskModal.tsx` — outcome live regions + textarea aria contract.
- `src/deals/RequestDocumentModal.tsx` — 12 outcome branches gain role; textarea + email inputs gain `aria-required`.
- `src/deals/BorrowerSafeStatusPacketModal.tsx` — three local-only action outcomes gain role.
- `src/deals/DealDocuments.tsx` — pending-review badge `aria-label`.
- `src/deals/ActivityTimeline.tsx` — since-last-visit "New" badge `aria-label`.
- `docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` — §1.28 advanced.

## Tests added / updated

- 9 new rendered-DOM assertions in `src/shared/accessibility/phase74AccessibilityAudit.test.tsx`:
  - `ReceiveDocumentModal` declares `aria-required="true"` + `aria-describedby` on the note textarea.
  - `ReceiveDocumentModal` success outcome is `role="status"`; no `role="alert"` present on a success.
  - `ReceiveDocumentModal` failure outcome is `role="alert"`.
  - `ReviewDocumentModal` declares `aria-required="true"` + `aria-describedby` on the note textarea.
  - `ReviewDocumentModal` success outcome is `role="status"`.
  - `CreateDocumentReviewTaskModal` declares `aria-required="true"` + `aria-describedby` on the follow-up note textarea.
  - `CreateDocumentReviewTaskModal` success outcome is `role="status"`.
  - `Badge` forwards `aria-label` to the rendered span when provided.
  - `Badge` omits `aria-label` entirely (no empty string attribute) when not provided.

No existing test was changed. The fixes are additive — they declare what was previously implicit (or invisible to assistive tech) — so prior snapshots and assertions continue to pass.

## Conservative copy review

The phrasing introduced by Phase 74 follows the Phase 45 + 73 discipline:

- The `aria-label` text on the pending-review badge says "Pending review — received Nd+ days ago and not yet reviewed" — factual, not "failed" / "invalid" / "noncompliant".
- The `aria-label` text on the since-last-visit "New" badge says "New since your last visit on this browser, locally tracked" — no claim that the badge is synced across devices.
- No "AI detected", "live sent", "portal available", "approved", "rejected", or "guaranteed" language is introduced. The Phase 45 phrase guard remains active (and continues to pass — `npx vitest run src/shared/governance/conservativeCopyGuard.test.ts` is green).

## Manual keyboard smoke checklist (suggested)

This is the recommended human-verified path that complements the automated rendered-DOM assertions:

1. Open a banker deal workspace.
2. **Tab from the page top.** The card actions should focus in source order — no off-screen focus jumps, no skipped buttons.
3. **DealDocuments — outstanding row:**
   - Tab to the "Request" button; press Enter.
   - In the request modal, Tab through Receipt note → Cancel → Record request. Press Escape to close.
4. **DealDocuments — outstanding row, "Mark received":**
   - Tab to "Mark received"; press Enter.
   - In the receive modal, type a note; Tab to "Mark received"; press Enter.
   - Verify a screen reader (NVDA / VoiceOver) announces "Recorded".
5. **MyWorkQueue:**
   - Tab to a row (it is a `role="link"`); press Enter — navigates to the deal.
   - Reopen `/banker`; Tab to an overdue-document row's "Mark received" button (it is inside a row but Tab should land on it before navigating); press Enter.
6. **BorrowerSafeStatusPacket:**
   - Open from the deal workspace.
   - Tab through the recipient → subject → body → Copy email → Open in Outlook → Close.
   - Press Escape; modal closes.
7. **ActivityTimeline:**
   - Confirm a screen reader announces the "New" badge with the long-form text ("New since your last visit on this browser, locally tracked").

## Limitations

- **No formal screen-reader path audit was run.** The fixes were applied based on static review and DOM-level assertions. A future phase should run NVDA / JAWS / VoiceOver against the operational surfaces and capture concrete defect lists.
- **No dark theme yet.** The theme token system is in place (`palette`, `radius`, `spacing`, `typography`) but only one palette is wired. Adding a `dark` palette + a runtime toggle is a future phase.
- **No color-blind-safe palette vetting.** The severity colors (atRisk / blocked / clear / info / neutral) were chosen for legibility but have not been audited against deuteranopia / protanopia / tritanopia.
- **No automated WCAG contrast-ratio static test.** The theme tokens are not pinned against a numeric contrast-ratio rule; a future phase could add a static test that asserts each `palette.<fg>` / `palette.<bg>` pair meets WCAG AA at 4.5:1.
- **Keyboard-trap audit is informal.** Modal `Escape`-to-close + focus-on-mount-textarea is verified; full focus-trap (so Tab cannot escape the modal) is not enforced. Adding a focus-trap library is a future phase.
- **`<table>` cells in TeamBankerActivityBreakdown** rely on implicit header-cell association; the table layout passes basic semantics but does not declare `scope="col"` on `<th>`. Adding `scope` is a low-cost future improvement.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` §1.28 (Accessibility / theme support) moves from "Partially operational" to "Partially operational (advanced by Phase 74)". The status enum did not change — the row's gap and "safe next step" fields now identify the remaining work (dark theme, color-blind-safe palette, formal screen-reader path audit, WCAG contrast static test, focus-trap).

## Remaining accessibility / theme gaps

- Dark theme + user-selectable theme toggle.
- Color-blind-safe severity palette.
- WCAG AA contrast-ratio static test against theme tokens.
- Formal screen-reader path audit (NVDA, JAWS, VoiceOver).
- Modal focus-trap (Tab cannot escape `role="dialog"` while the modal is open).
- `scope="col"` on table headers across `<table>` surfaces (TeamBankerActivityBreakdown, etc.).

## Confirmation: no workflow / write / schema changes

- **No new `GOVERNED_WRITES` entry.** No write surface was added.
- **No new `LOCAL_ONLY_FLOWS` entry.** The fixes do not introduce a new derivation; they declare existing-but-undeclared accessibility properties on existing surfaces.
- **No schema change.** No new Dataverse column was touched or added.
- **No workflow behavior change.** Disabled buttons still disable. Submit handlers still submit. Outcome states are unchanged; only their accessibility representation is changed.
- **Conservative copy discipline preserved.** Phase 45 phrase guard (`src/shared/governance/conservativeCopyGuard.test.ts`) continues to pass without any allowlist addition.

## Test + build counts (at acceptance)

- Full suite: **1204 / 1204 tests passing** (Phase 73 baseline 1195 + Phase 74's 9 new accessibility assertions).
- `tsc -b && vite build`: clean.

## Recommended next phase

From the Microsoft Vibe coverage map (§1.x rows whose status is "Partially operational" or "Not wired"):

- **Banker Personal Activity Summary** (a banker-side counterpart to Phase 71's manager / team summaries — deterministic, derived from the banker's own active deals).
- **Relationship Memory Lite** (deterministic surface that surfaces "last activity" / "open commitments" per borrower from existing records — no new schema).
- **Theme tokens — dark mode** (Lane A, derived from the Phase 74 finding that one palette is wired).

Of the three, the Banker Personal Activity Summary is the closest match to current Lane A momentum (deterministic, no new write, no new schema, matches the Phase 71 derivation pattern). Theme tokens (dark mode) would close the largest remaining a11y gap but is a pure UI phase.
