# Phase 101 — Outlook Handoff Parity for Catch-Up / Activity / Relationship Memory

## Goal

Add no-admin Outlook handoff parity for every summary surface that
now supports Teams handoff (Phases 98 / 99 / 100):

- Banker Morning Catch-Up
- Manager Morning Catch-Up
- per-deal Activity Timeline
- per-client Relationship Memory rows

Each card renders an "Open in Outlook" + "Copy email" pair below the
existing "Copy Teams summary" button. The app does NOT send email,
does NOT call the Office 365 Outlook connector, does NOT call Graph,
does NOT raise a notification, does NOT write to Dataverse, and does
NOT mutate the Phase 72 / 78 / 83 / 90 / 91 local state any of the
sibling surfaces use.

## Why this phase

The Vibe scope expects Outlook-based workflow continuity alongside
the Teams handoff. The Office 365 Outlook connector live-send is
still blocked (`NOT_WIRED.outlook-connector-live-send` / Lane E).
The Phase 61 / 63 / 67 mailto + copy pattern is operational and
safe and already used by Phase 67 packet email handoff. Phase 101
extends that pattern to the four summary surfaces the Phase 98 /
99 / 100 family covers, so bankers who prefer email-based brief
have the same option as their Teams-handoff counterparts.

## Relationship to prior phases

| Phase | Surface | What it shipped | Phase 101 reuse |
|---|---|---|---|
| 63 | Per-deal document request | `buildMailtoUrl` + `buildHandoffClipboardText` pure helpers | **Both reused verbatim** — Phase 101 introduces no new mailto encoding logic |
| 67 | Borrower-safe status packet | Outlook mailto + clipboard handoff modal | Pattern reference (no shared code) |
| 72 | Per-deal Activity Timeline | Local last-visit marker | Read-only; **never mutated** |
| 78 | Relationship Memory | Local note-draft modal | **Never invoked** |
| 83 | Autopilot suggestion ledger | Local opened/dismissed state | **Never mutated** |
| 90 | Catch-up last-seen markers | Local per-user-per-surface marker | **Never mutated** |
| 91 | Catch-up dismiss / snooze ledger | Per-item local state | **Never mutated** |
| 98 | Banker + Manager Morning Catch-Up | `<CatchUpTeamsCopyButton />` (Teams) | Body string reused via `buildCatchUpTeamsSummary` |
| 99 | Per-deal Activity Timeline | `<ActivityTimelineTeamsCopyButton />` (Teams) | Body string reused via `buildActivityTimelineTeamsSummary` |
| 100 | Per-client Relationship Memory | `<RelationshipMemoryTeamsCopyButton />` (Teams) | Body string reused via `buildRelationshipMemoryTeamsSummary` |

Phase 101 adds:

- **Helper** —
  `src/shared/email/summaryOutlookHandoff.ts`. Wraps the Phase 63
  primitives in a `prepareSummaryOutlookHandoff` function that
  returns both the mailto URL and the clipboard payload in one
  call, and adds three banker-safe subject builders. No new mailto
  encoding logic.
- **Reusable React component** —
  `src/shared/email/SummaryOutlookHandoffButtons.tsx`. Renders
  "Open in Outlook" + "Copy email" buttons + role-status / role-
  alert tags + a verbatim local-handoff disclaimer. Consumers pass
  `subject`, `body`, and an `ariaContext` string.
- **Inline wrappers on each consuming surface** —
  `<CatchUpOutlookHandoff />` in BankerMorningCatchUp.tsx,
  `<ManagerCatchUpOutlookHandoff />` in ManagerMorningCatchUp.tsx,
  `<ActivityTimelineOutlookHandoff />` in ActivityTimeline.tsx,
  `<RelationshipMemoryOutlookHandoff />` in RelationshipMemory.tsx.
  Each builds the same plain-text body the sibling Teams copy
  button emits.

## Surfaces supported

| Surface | Component | Subject |
|---|---|---|
| BankerMorningCatchUp | `<CatchUpOutlookHandoff surface="banker" />` | `Morning catch-up summary` |
| ManagerMorningCatchUp | `<ManagerCatchUpOutlookHandoff />` | `Morning catch-up summary` |
| Per-deal ActivityTimeline | `<ActivityTimelineOutlookHandoff />` | `Deal activity summary — <Deal Name>` |
| Per-client RelationshipMemory (one per row) | `<RelationshipMemoryOutlookHandoff />` | `Relationship snapshot — <Client Name>` (or `Relationship snapshot — (no borrower name on record)` when missing) |

The Outlook handoff is mounted as a sibling to the existing Teams
copy button on each card. When the card itself renders in an empty
/ loading / failed state, neither handoff group renders.

## Summary fields reused

The Outlook handoff does NOT duplicate the Phase 98 / 99 / 100
formatter output — it consumes those formatters' return strings
verbatim as the email body. Subjects are the three short verbatim
lines pinned in the brief. The Phase 63 `buildHandoffClipboardText`
puts a `To:` / `Subject:` / blank-line / body composition on the
clipboard; `buildMailtoUrl` encodes the same trio into an RFC 6068
mailto URL where body newlines become `%0A`.

## Recipient behavior

The brief is explicit:

> Recipient should be optional and empty by default unless a
> reliable recipient field exists.
> Do not infer recipient from client name.
> Do not hardcode recipient.

The Phase 101 helper enforces this contract:

- `SummaryOutlookHandoffInput.recipient` is `string | undefined`.
- When the caller omits the field, the helper defaults to `''`.
- `prepareSummaryOutlookHandoff(...)` passes the value through to
  the Phase 63 helpers verbatim.
- `<SummaryOutlookHandoffButtons />` never accepts or renders a
  recipient prop. Bankers type the recipient in their Outlook
  client after the mailto launches.
- The mailto URL surfaces no characters between `mailto:` and the
  leading `?` when no recipient is provided. The clipboard payload
  reads `To: ` (with no value) on the first line.

A unit test pins that "Acme Manufacturing, LLC" never leaks into
the recipient slot of the mailto URL when the body / subject /
ariaContext all contain it.

## Local-only handoff posture

Identical to Phase 96 / 97 / 98 / 99 / 100:

- The Teams SDK (`@microsoft/teams-js`) is not loaded by this flow.
- No Microsoft Graph client. No MSAL. No token acquisition. No
  external API call.
- The OS hands the mailto URL to the user's default mail client
  (typically Outlook on a bank workstation).
- Failure paths surface a `role="alert"` with `"Clipboard
  unavailable. Select and copy manually."`
- The banker sends from their own Outlook client.

## Why this is NOT connector-backed email delivery

- **Not connector send.** No Office 365 Outlook connector is
  registered. No Office 365 connection is created. No connector
  configuration is read at runtime. The Phase 60–63 connector audit
  documented exactly which steps are required to register the
  connector; none of them have happened.
- **Not Graph send.** No `POST /me/sendMail` call. No MSAL token
  acquisition. No Graph permission requested.
- **Not delivery.** The app does not know whether the banker pastes
  what was copied, whether they edit it, whether they send, when
  they send, or who they send to.
- **Not scheduled.** No digest cadence, no daily timer, no
  background job.
- **Not automated.** Every Outlook handoff is initiated by an
  explicit user click on a labelled button.

The disclaimer on every consuming card says verbatim:
`"Local handoff only. The app does not send email. You send from
Outlook. No Office 365 connector call. No Graph. No Dataverse
write. No audit row. No timeline event."`

## Why this does NOT mutate local ledgers / markers

The Outlook handoff click reads the same in-memory aggregates the
Teams copy button reads on each surface. It does NOT call any
setter and does NOT write any `localStorage` slot directly. Each
consuming surface has a localStorage byte-snapshot test that
asserts equality across the click:

- **Banker MorningCatchUp** — Phase 90 banker last-seen marker
  (`cc:lastVisit:catchUp:banker:<bankerId>`) + Phase 91 ledger
  (`cc:catchUpItemLedger:v1`) untouched.
- **Manager MorningCatchUp** — Phase 90 manager last-seen marker
  (`cc:lastVisit:catchUp:manager:<bankerId>:<teamId>`) + Phase 91
  ledger untouched.
- **ActivityTimeline** — Phase 72 per-deal last-visit marker
  (`cc:lastVisit:deal:<dealId>`) untouched.
- **RelationshipMemory** — Phase 78 note-draft modal not opened;
  the Phase 83 / 90 / 91 ledgers untouched.

The handoff click also never:
- Invokes Phase 94 mark-all-seen.
- Opens the Phase 78 `<RelationshipNoteDraftModal />`.
- Records a Phase 83 suggestion-ledger entry.
- Writes any Dataverse row.
- Emits any audit or timeline event.

## Future upgrade path

When Lane E + connector + Graph admin consent land, Phase 101 can
be extended without rewriting:

1. **Office 365 Outlook connector registration.** A registered
   connection in the environment unblocks `NOT_WIRED.outlook-
   connector-live-send`. The Phase 101 helper would gain an
   optional Connector send path; the mailto / clipboard fallback
   stays as the default. A new `GOVERNED_WRITES` entry
   (`summary-outlook-connector-send`) would coordinate audit +
   timeline.
2. **Graph-backed send.** Once Graph consent lands with the
   `Mail.Send` scope, the same call replaces the connector send.
   Same governed-write entry shape; the only change is the
   transport.
3. **Audit / timeline send logging.** Both upgrade paths above add
   `EmailLogged` timeline events + correlation ids on success. The
   Phase 101 plain-text body is already structured for direct
   inclusion in the timeline payload.
4. **Scheduled digests.** A separate phase could emit the
   catch-up / activity / relationship summary on a daily cadence
   (e.g. 7am local time) via an Azure Function. Phase 101 is the
   local single-click slice; the scheduler is a separate decision.
5. **Teams / Outlook notification preferences.** Once both transports
   are wired, a per-user preference table could let bankers route
   each digest type to Teams (channel post), Outlook (email send),
   or both. Phase 101 stays the no-config fallback.

None of those are needed for Phase 101 to be useful today.

## Files created / modified

```
src/shared/email/summaryOutlookHandoff.ts                       (new)
src/shared/email/summaryOutlookHandoff.test.ts                  (new)
src/shared/email/SummaryOutlookHandoffButtons.tsx               (new)
src/shared/email/SummaryOutlookHandoffButtons.test.tsx          (new)
src/banker/BankerMorningCatchUp.tsx                             (modified — wire <CatchUpOutlookHandoff />)
src/banker/BankerMorningCatchUp.test.tsx                        (modified — Phase 101 smoke test)
src/manager/ManagerMorningCatchUp.tsx                           (modified — wire <ManagerCatchUpOutlookHandoff />)
src/manager/ManagerMorningCatchUp.test.tsx                      (modified — Phase 101 smoke test)
src/deals/ActivityTimeline.tsx                                  (modified — wire <ActivityTimelineOutlookHandoff />)
src/deals/ActivityTimeline.test.tsx                             (modified — Phase 101 UI + last-visit non-mutation tests)
src/banker/RelationshipMemory.tsx                               (modified — wire <RelationshipMemoryOutlookHandoff />)
src/banker/RelationshipMemory.test.tsx                          (modified — Phase 101 UI + draft-modal non-open test)
src/shared/governance/platformInventory.ts                      (modified — new LOCAL_ONLY_FLOWS entry)
src/shared/governance/platformInventory.test.ts                 (modified — pin new entry + doc-exists check)
docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md                      (modified — advance §1.6 + §1.18 + §1.16 + §1.1 + §1.22)
docs/PHASE_101_OUTLOOK_SUMMARY_HANDOFF.md                       (new — this file)
```

## Confirmations

- No new writes. `GOVERNED_WRITES.length` unchanged.
- No new entry in `NOT_WIRED` or `DELIBERATELY_BLOCKED`.
- New entry in `LOCAL_ONLY_FLOWS`: `outlook-summary-handoff`.
- No new schema columns, tables, or option-set values.
- No new SDK install. No new connector.
- No Graph / MSAL / token-acquisition code introduced.
- No Office 365 Outlook connector registration or call.
- No Teams API send / channel post / notification raised /
  calendar work.
- No AI / Copilot / model invocation.
- No new derivation logic — Phase 98 / 99 / 100 formatters reused
  unchanged.
- The Phase 63 `buildMailtoUrl` + `buildHandoffClipboardText`
  primitives are reused verbatim — no new mailto encoding.
- Phase 72 / 78 / 83 / 90 / 91 local state untouched by the
  Outlook click (pinned by localStorage byte-snapshot tests on each
  surface).
- Recipient empty by default; never inferred from client name.
- All tests pass.
