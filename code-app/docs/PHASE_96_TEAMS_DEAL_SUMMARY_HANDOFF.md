# Phase 96 — Copy-to-Teams Deal Summary

## Goal

Add a no-admin Microsoft Teams handoff that generates a banker-safe
deal summary the banker can copy to the clipboard and paste into
Microsoft Teams (any chat or channel). Sibling to the Phase 86
deep-link `<TeamsChatHandoff />` card on the Banker Deal Workspace —
Phase 86 opens the banker's Teams composer; Phase 96 generates the
message body the banker pastes after the composer opens. The app
does not post anything, does not send anything, does not sync with
Teams, does not raise a Teams notification, and does not call Graph.

This phase closes Phase 85 Candidate B — explicitly identified in
the `docs/PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT.md` summary and
in `MICROSOFT_VIBE_CAPABILITY_COVERAGE.md` §1.7 ("copy-to-Teams deal
summary, a Phase-23-style markdown handoff the banker pastes into
any Teams chat").

## Relationship to Phase 86

| | Phase 86 (chat handoff) | Phase 96 (deal-summary handoff) |
|---|---|---|
| What it produces | Teams deep-link URL | Plain-text deal summary string |
| Affordance | "Open Teams chat" button → `window.open(deepLink)` | "Copy Teams summary" button → `navigator.clipboard.writeText` |
| Surface | `<TeamsChatHandoff />` card on Banker Deal Workspace | `<TeamsDealSummaryHandoff />` card on Banker Deal Workspace (sibling, immediately below) |
| Teams SDK | `@microsoft/teams-js` loaded for diagnostic-only `app.initialize()` probe | Not loaded |
| Graph | Not called | Not called |
| Dataverse write | None | None |
| Audit / timeline | None | None |
| Calendar / notification | None | None |
| LOCAL_ONLY_FLOWS entry | `teams-chat-handoff` | `teams-deal-summary-handoff` (new) |
| What the banker does | Click → Teams composer opens → banker edits + sends | Click → text on clipboard → banker pastes into Teams → banker sends |

The two cards are complementary. A banker who wants to start a chat
about a deal will click "Open Teams chat" on the Phase 86 card, then
click "Copy Teams summary" on the Phase 96 card, then paste into the
Teams composer that Phase 86 just opened. Each card stands alone;
either can be used without the other.

## Vibe capability advanced

`docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md`:

- **§1.7 (Microsoft Teams integration)** — closes Phase 85 Candidate
  B. The "Safe next step" listed in Phase 85 / Phase 86 docs is now
  shipped. The headline state remains **Partial — no-admin handoff
  cards shipped (Phase 86 + Phase 96)**. Push notifications, channel
  posting, presence, meeting create, Graph user lookup, and Teams
  app sideload all remain Lane E.
- **§1.18 (Activity intelligence / collaboration)** — the catch-up
  feed gains a sibling collaboration affordance: a banker who has
  read the catch-up + autopilot signals on a deal can hand off a
  one-glance summary to a colleague over Teams without leaving the
  Deal Workspace.
- **§1.4 (Banker Deal Workspace)** — Banker Deal Workspace now carries
  two Teams cards (chat-handoff + summary-handoff) alongside the
  existing Outlook handoff. Each is honestly disclaimed as local /
  manual / no-write.

## Summary fields included

The Phase 96 formatter (`src/deals/teamsDealSummary.ts`) accepts a
narrow input shape and produces a plain-text string. Fields rendered
to the banker (and pasted into Teams) when present:

- **Deal name** — from `cr664_loandeal.cr664_dealname`.
- **Client name** — from `cr664_loandeal.cr664_clientname`.
- **Stage** — from `cr664_loandeal.cr664_stagereferencename`.
- **Status** — from `cr664_loandeal.cr664_statusreferencename`.
- **Loan amount** — from `cr664_loandeal.cr664_amount`, rendered as
  a USD-style number with thousands separators (`$4,500,000`). The
  formatter does NOT call locale APIs that could leak the host's
  region preferences into the copied text.
- **Target close** — from `cr664_loandeal.cr664_targetclosedate`,
  rendered as `YYYY-MM-DD` UTC for determinism.
- **Open task count** — `tasks.open.length`.
- **Outstanding document count** —
  `documents.outstanding.length`.
- **Documents pending review count** — `documents.received` filtered
  to rows with no reviewer recorded. (Matches the Phase 80 pending-
  review signal's prerequisite set; the formatter does not apply
  the 7-day window to the headline count, only to the optional Next
  Best Action block where Phase 80 already does so.)
- **Memo consistency findings count** — the integer returned by
  `checkCreditMemoConsistency(deal, creditMemo).findings.length`
  (Phase 73). When zero the line still renders as
  `- Memo consistency findings: 0` so the banker sees an honest
  zero, not a missing line that implies the check did not run.
- **Next best action (optional)** — the top-priority suggestion from
  `deriveNextBestActions(...)` (Phase 80). Renders as
  `- {title} — {reason}`. Omitted when no suggestion fires.
- **Closing-soon note (optional)** — when `targetCloseDate` is within
  ±14 days the formatter appends a one-liner using the same
  observational vocabulary the Phase 80 autopilot uses ("Target
  close in N days. Closing soon." / "Target close is today. Closing
  soon." / "Target close was N days ago. Needs attention.").
- **Relationship context (optional)** — the Phase 96 component
  intentionally passes `relationshipContextNote: undefined` for the
  initial release; the Banker Deal Workspace already renders
  `<RelationshipContext />` as a separate card. The formatter
  accepts the optional one-line note so a future phase can thread
  a derived "Borrower has N other deals in your pipeline" hint
  through `DealDataProvider` without changing the formatter.
- **Prepared-by line** — "Prepared by <banker name> on YYYY-MM-DD."
  Falls back to "the assigned banker" when the banker context does
  not surface a full name (rather than fabricating one).
- **Verbatim disclaimer** — "— Local copy only. Not posted to Teams.
  Paste into Teams. You send the message manually."

## Summary fields excluded

The formatter NEVER renders, and the test suite pins this:

- Internal audit IDs (no UUID v4 / GUID-shaped strings in the
  output).
- Raw timeline payload markers (`audit_id:`, `event_id:`,
  `timeline_event:`).
- Full credit memo body text. The check uses the memo's already-
  loaded `textPreview` to count findings; the memo body itself is
  never echoed.
- Internal risk commentary, scoring, model output (no AI on this
  flow at all).
- Approval / denial / decisioning language (`approved`, `denied`,
  `rejected`, `decisioned`, `credit decision`, `risk score`,
  `workflow complete`).
- Borrower-sensitive private fields beyond the basic deal facts the
  banker already sees on the workspace (e.g. no PII, no SSN, no
  contact records, no portal credentials).
- Secrets / tokens / connector state (`Bearer`, `Authorization:`,
  `access_token`, `refresh_token`, `client_secret`, `MSAL`,
  `Graph`).
- Dataverse logical names (no `cr664_*` identifiers).
- Internal `_value` lookup suffixes.

## Teams handoff behavior

1. The card is rendered as the last card on the Banker Deal
   Workspace (sibling to `<TeamsChatHandoff />`).
2. On mount, the formatter runs against the deal data
   `DealDataProvider` has already loaded. No additional queries are
   issued.
3. The card renders the generated string inside a `<pre>` for
   readability (preserves newlines + monospace alignment of the
   counts list).
4. The "Copy Teams summary" button calls
   `navigator.clipboard.writeText(summary)`:
   - On success → role=`status` tag "Copied to clipboard. Paste into
     Teams." Auto-clears after 4 seconds.
   - On rejection or when the Clipboard API is unavailable →
     role=`alert` tag "Clipboard unavailable. Select the preview
     text and copy manually." (The banker can still copy by hand
     because the preview is plain text in a `<pre>`.)
5. The banker pastes into Teams in their own client. The app does
   not see what the banker pastes, when they paste, or whether they
   send.

## No-admin rationale

Phase 96 ships entirely without:

- A Microsoft Graph client.
- An MSAL configuration.
- A Power Platform connector registration.
- An Azure AD app registration beyond what the Code App already
  uses (no new scopes, no admin consent, no tenant work).
- A Teams app manifest / sideload.
- Any tenant administrator action.

The only browser API used is `navigator.clipboard.writeText`, which
is a standard Web API the user implicitly approves by being on a
TLS-served origin and clicking the button. There is no automatic
copy, no copy-on-mount, no off-thread copy — the banker explicitly
triggers it.

## Why this is NOT Teams posting / notification / sync

- **Not posting.** The app does not contact Microsoft Graph, the
  Teams API, or any webhook. The string lives on the clipboard
  until the banker pastes it themselves.
- **Not a notification.** The app does not raise a Teams
  activity-feed notification, does not enqueue a delivery, and does
  not invoke any push/notify primitive.
- **Not sync.** The app does not maintain any synced state with
  Teams. There is no "Teams thread linked to deal" record on either
  side. The act of copying does not establish any persistent
  connection between the deal and a Teams conversation.
- **Not delivery.** The app does not know whether the banker pastes
  what was copied, whether they edit it, or whether they send.
  There is no delivery receipt, no "message sent" signal, no audit
  trail of the paste action.
- **Not a meeting.** No Teams meeting is created, scheduled, or
  referenced. The summary contains a `Target close` line but not a
  meeting link.

The card's verbatim disclaimer states each of these negations
plainly.

## Future upgrade path

When the Lane E upstream blockers clear, Phase 96 can be extended
incrementally without rewriting:

1. **Graph channel posting** — replace the clipboard write with a
   `POST /teams/{team-id}/channels/{channel-id}/messages` call.
   Requires a registered Teams app + `ChannelMessage.Send` Graph
   scope + admin consent + a deal-to-channel mapping table in
   Dataverse. A new GOVERNED_WRITES entry (`teams-channel-message-
   send`) would coordinate the audit + timeline.
2. **Teams notifications** — surface the Phase 88 / 89 Morning
   Catch-Up items as Teams activity-feed notifications via
   `POST /users/{user-id}/teamwork/sendActivityNotification`.
   Requires `TeamsActivity.Send` Graph scope + admin consent.
3. **Deal-to-channel mapping** — a new Dataverse table
   (`cr664_dealteamschannel`) keyed by `cr664_deal` + `teams_channel_id`,
   surfaced as a read-only display on the Deal Workspace and used
   by (1) above to pick the destination.
4. **Meeting summary cards** — extend the Phase 96 formatter to
   produce an Adaptive Card payload (instead of plain text) so
   Teams renders it as a richer summary card when posted. The
   adaptive-card schema is text-only client-side; no Graph call is
   needed for the renderer itself, only for the post in (1).
5. **AI-assisted Teams briefs** — Lane F. A Copilot / model
   integration could enrich the summary with banker-style prose
   while the deterministic counts + signals remain the floor. Would
   need governance review for the "AI in regulated copy" question
   already pinned in Lane F.

None of those upgrades are needed to make Phase 96 useful today.
The single Lane-A primitive (a plain-text string the banker copies)
is sufficient for the workflow.

## Files created / modified

```
src/deals/teamsDealSummary.ts                      (new)
src/deals/teamsDealSummary.test.ts                 (new)
src/deals/TeamsDealSummaryHandoff.tsx              (new)
src/deals/TeamsDealSummaryHandoff.test.tsx         (new)
src/deals/BankerDealWorkspace.tsx                  (modified — wire the new card)
src/shared/governance/platformInventory.ts         (modified — add LOCAL_ONLY_FLOWS entry)
src/shared/governance/platformInventory.test.ts    (modified — pin the new entry)
docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md         (modified — advance §1.7)
docs/PHASE_96_TEAMS_DEAL_SUMMARY_HANDOFF.md        (new — this file)
```

## Confirmations

- No new writes. `GOVERNED_WRITES.length` unchanged.
- No new entry in `NOT_WIRED` or `DELIBERATELY_BLOCKED`.
- New entry in `LOCAL_ONLY_FLOWS`: `teams-deal-summary-handoff`.
- No new schema columns, tables, or option-set values.
- No new SDK install (the Phase 86 `@microsoft/teams-js` already
  exists; Phase 96 does not load it).
- No new connector.
- No Graph / MSAL / token-acquisition code introduced.
- No AI / Copilot / model invocation.
- No document parsing.
- The Banker Deal Workspace scope remains exactly what it was — the
  formatter operates on data already loaded by `DealDataProvider`.
- All tests pass.
