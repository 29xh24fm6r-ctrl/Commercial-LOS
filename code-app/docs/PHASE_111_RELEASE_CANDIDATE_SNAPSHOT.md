# Phase 111 — Release-Candidate Readiness Snapshot

**This is a snapshot, not a feature.**

After the Phase 104–110 banker-triggered Outlook communication lane
was completed and release-locked, this snapshot captures the
project's overall release-candidate state across all surfaces.
It supersedes the [Phase 103 product checkpoint](PHASE_103_PRODUCT_CHECKPOINT.md)
as the current authoritative point-in-time read. **No production
code changed in Phase 111.** One small stale-label fix in
`docs/STABILIZATION_CHECKLIST.md` (its "current counts" pointer was
still aimed at Phase 103) is the only edit outside this doc + its
governance pin.

Snapshot date: 2026-05-21. Snapshot anchor: end of Phase 110.

---

## 0. Snapshot table

| Metric | Value at Phase 111 | Δ vs Phase 103 |
| --- | --- | --- |
| Latest commit | Phase 110 — Communication Lane Final Release Lock | +8 phases |
| Tests | **2523 passing** across **111 test files** | +345 tests / +7 files |
| Build | `tsc -b && vite build` clean (~1047 kB minified / ~235 kB gzip) | +125 kB / +14 kB |
| `GOVERNED_WRITES` | **13** entries | +2 since Phase 110 (Phase 105 `deal-borrower-update-email`, Phase 160 `deal-log-activity`) |
| `LOCAL_ONLY_FLOWS` | **16** entries | +1 (Phase 105 updated `borrower-update-draft` shape; net inventory shifted) |
| `NOT_WIRED` | **9** entries | Includes Phase 160 classification of blocked `new-deal-create` |
| `DELIBERATELY_BLOCKED` | **1** entry (`stage-progression-advance`) | unchanged |
| Vibe capability groups tracked | 29 in [MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) | unchanged |
| Workspaces shipped | Banker · Manager · Team · Executive (snapshot) · Admin | unchanged |
| Admin Workspace card stack | ReleaseReadinessGate · SystemHealthSummary · DataQualityFlags · AuditAnomalies · AlertBacklog · RefreshStatus · ConfigurationOverview · StageGovernanceDiagnostics · **EmailLiveDiagnostics (NEW Phase 109)** · PerformanceDiagnostics | +1 card |
| Banker Deal Workspace card stack | DealSummary · DealAutopilotPanel · RelationshipContext · DealTasks · DealDocuments · CreditMemo · ActivityTimeline · **BorrowerCommunication (Phase 105+107+108: now LIVE-capable + activity-evidence + refresh-wired)** · TeamsChatHandoff · TeamsDealSummaryHandoff | same surfaces; behavior expanded |

The data-layer counts above are CI-pinned by
`src/shared/governance/releaseCandidateSnapshot.test.ts`. If any
inventory count slips, the test fails and this snapshot must be
refreshed before promotion.

---

## 1. What is now release-candidate operational

Capabilities the bank can rely on with green CI evidence, conservative
copy, and read-back contracts pinned by the Phase 46–50 + 106 + 107 +
110 governance sweeps.

### Newly LIVE since Phase 103 (the Phase 104–110 lane)

- **Document-request email — LIVE send** (Phase 104). The Phase 61
  permanent-failure stub was swapped for a typed
  `Office365OutlookService.SendEmailV2` call. Emits one audit row +
  one `EmailLogged` (788190001) timeline row per attempt; masked
  recipient on timeline; "Outlook accepted" wording; no claim of
  delivery. Outcome classification: 408 / 429 / 5xx / no-status /
  thrown → transient; other 4xx → permanent.
- **Borrower-update email — LIVE send** (Phase 105). New governed
  write `deal-borrower-update-email` (12th `GOVERNED_WRITES` entry)
  reusing the same adapter. Emits one audit row + one
  `BorrowerUpdateSent` (788190014) timeline row per attempt. The
  schema designer reserved 788190014 for exactly this moment; the
  Phase 23 inventory note's guardrail is honored.
- **Operator-safety release-readiness pin** (Phase 106). 41-assertion
  static-source pin guarantees: `NOT_WIRED.email-delivery` absent,
  exactly one production import of `Office365OutlookService`, exactly
  one `SendEmailV2` callsite, Phase 101 handoffs copy-to-clipboard,
  no payload expansion, no automation / inbound / portal /
  subscription source.
- **Activity-evidence consistency pin** (Phase 107). 49-assertion
  governance evidence + 12-assertion narrow rendering pin guarantee
  both LIVE writes produce consistent operator-readable rows
  (distinct titles + event-type badges, masked recipient, "Outlook
  accepted" wording, no delivery claim).
- **Post-send activity refresh** (Phase 108). New
  `'after-borrower-update-email'` `DealDataKey` + parent-side wrapper
  in `BorrowerCommunication.tsx` mirrors the Phase 104 doc-request
  pattern. The new `BorrowerUpdateSent` row appears immediately on
  `<BorrowerCommunication />` after Send, no manual page refresh.
- **Operator smoke-test harness** (Phase 109). New
  `<EmailLiveDiagnostics />` admin card surfaces current
  `EMAIL_MODE`, code-availability of both governed send paths, the
  Phase 101 copy-to-clipboard reminder, and an explicit operator-
  triggered smoke send. Reuses `getEmailAdapter()` so no second
  `SendEmailV2` callsite. No Dataverse, no audit, no timeline.
- **Final communication-lane release lock** (Phase 110). 134-assertion
  consolidated lock file at
  `src/shared/governance/communicationLaneReleaseLock.test.ts`
  enforces modal-layer adapter isolation, smoke-test Dataverse
  isolation, lane-wide payload-field + wording pins, and
  forbidden-pattern scans for shared mailbox / Graph / calendar /
  inbound / subscription / scheduled / delivery-tracking surfaces.

### Unchanged since Phase 103 (still solid)

- **Banker Command Center** — work queue + personal activity summary
  + relationship memory + autopilot rollup + morning catch-up.
- **Banker Deal Workspace** — header + summary + autopilot panel +
  relationship context + tasks + documents + credit memo + activity
  timeline + borrower communication + Teams chat / summary handoffs.
- **Document request / receive / review lifecycle** — three governed
  writes + pending-review signal + self-assign task creation +
  receive modal.
- **Task completion**, **credit memo draft save**, **memo consistency
  check**, **Relationship Memory Lite**, **Autopilot Lite**,
  **Morning Catch-Up** — full surface inventory from Phase 103
  remains operational with the same governance discipline.
- **Manager / Team analytics**, **No-admin Teams handoffs**,
  **No-admin Outlook handoffs** — Phase 101 added the four summary
  handoff parity surfaces; all five Teams handoff surfaces shipped;
  five Outlook handoff surfaces shipped (Phase 63 + Phase 67 + Phase
  101). All copy-to-clipboard, all banker-initiated, none touch the
  connector.
- **Admin readiness visibility** — Release Readiness Gate + Capability
  Inventory + KPI threshold config + system settings + (new)
  Outlook LIVE Email Diagnostics card.
- **Audit / timeline / governance plumbing** — **13** governed writes
  emit audit + timeline events with correlation ids and read-back
  contracts.

---

## 2. What is partially operational (deliberate gap, named blocker)

Capabilities that ship a deterministic floor but stop short of the
full Vibe scope because of a documented upstream blocker.

- **Document workflow — metadata-only.** Request / received-flag /
  reviewer chain works; **binary upload / preview / download
  blocked** (`NOT_WIRED.document-upload`, Lane C — File column on
  `cr664_DocumentChecklist`). Unchanged since Phase 103.
- **Outlook integration — LIVE outbound only, no inbound / automation
  / shared mailbox / calendar.** **MAJOR CHANGE since Phase 103.**
  Both governed-write outbound paths are LIVE through `SendEmailV2`
  (Phases 104 + 105) and release-locked (Phase 110). The four Phase
  101 summary surfaces remain copy-to-clipboard regardless of
  `EMAIL_MODE` by design. **Still blocked**: inbound mail logging,
  automated/scheduled outbound, delivery/read tracking, shared
  mailbox `From`, calendar send, Graph generic.
- **Teams integration — handoff only.** Five no-admin slices ship
  (chat / deal summary / catch-up / activity timeline / relationship
  memory). **Channel posting / activity-feed notifications /
  calendar sync / meeting create / Graph user lookup remain
  blocked** (Lane E). Unchanged since Phase 103.
- **Relationship Memory — banker-visible only, no persistent notes,
  no verified-entity graph.** Phase 76 client-name grouping + Phase
  78 LOCAL_ONLY note draft + Phase 102 manager parity card.
  **Persistent banker notes need new schema; verified borrower /
  household / entity graph needs a `cr664_borrower` FK or
  equivalent** (Lane G). Unchanged since Phase 103.
- **Activity Intelligence — local-only markers + observation
  feeds.** Phase 72 last-visit + Phase 88 / 89 morning-catch-up +
  Phase 90 last-seen overlay + Phase 91 dismiss / snooze + Phase 94
  mark-all-seen. **No server-side unread state, no cross-device
  sync, no push / notification delivery** (Lane E + Lane G).
  Unchanged since Phase 103.
- **Credit Memo workflow — draft save only.** Phase 24 local preview +
  Phase 25 governed draft save + Phase 73 consistency check. **No
  AI-assisted generation, no PDF/Word export, no governed finalize /
  approval path** (Lane F + governance). Unchanged since Phase 103.
- **Manager analytics — point-in-time only.** Per-banker / per-team /
  per-stage derivations from current rows (Phase 71). **No historical
  trend lines / win-rate / velocity** (Lane G — time-series storage /
  stage-history table). Unchanged since Phase 103.
- **Executive Workspace — snapshot-only, two surfaces on transitional
  fallback.** `PipelineByStage` + `MonthlyClosingForecast` carry
  honest transitional labels. **Snapshot entities do not exist yet**
  (Lane G). Unchanged since Phase 103.
- ~~**Borrower communication — local draft only.**~~ **Now LIVE in
  Phase 105.** Phase 23 Copy fallback is preserved for offline
  workflows; the LIVE Send path through `deal-borrower-update-email`
  is the production behavior when `VITE_EMAIL_MODE=LIVE`. The
  "no outbound borrower email logged on the timeline" gap from Phase
  103 is closed.

---

## 3. What is not operational / blocked

Capabilities the Vibe scope expects but the repo deliberately does
not implement, with the blocker named on every row.

- **Borrower portal** — `NOT_WIRED.borrower-portal`, Lane D (compound:
  external-identity / invitation-token / external-user role /
  `BorrowerSafe` visibility scope + `Borrower` audit entity type +
  secure-message entity + Lane C File column for uploads + a separate
  Code App workspace). The Phase 110 lock's static-source guard
  forbids any production source from importing portal-route /
  magic-link / invitation modules. Unchanged in posture since Phase
  103; the borrower-portal entry's reason text was updated in Phases
  104 + 105 to honestly note that the LIVE outbound send is wired
  but the platform still never independently notifies a borrower.
- **Borrower upload** — `NOT_WIRED.document-upload`, Lane C (File
  column on `cr664_DocumentChecklist`).
- **Secure borrower messaging** — Lane D (compound — same blocker set
  as the portal).
- ~~**Live Outlook send** — `NOT_WIRED.outlook-connector-live-send`,
  Lane B.~~ **Shipped Phases 104 + 105.** The two NOT_WIRED rows
  that tracked this (`outlook-connector-live-send` + `email-delivery`)
  are both retired.
- **Stage progression write (Advance Stage)** —
  `DELIBERATELY_BLOCKED.stage-progression-advance`, Lane G (no
  deterministic next-stage ordering in schema; no
  `Cr664_stagereferences` service in generated SDK; no
  sequence/order field on the loan deal record or in system
  settings).
- **AI / Copilot assist** — `NOT_WIRED.ai-generation`, Lane F (no
  model-governance policy; no Copilot Studio / Azure OpenAI binding;
  Phase 24 truthful-negation "No AI was used" banner is the standing
  pose).
- **In-app build / test verification feed** —
  `NOT_WIRED.test-coverage-build-verification`, observability gap by
  design.
- **Executive / Admin deal drill-through** —
  `NOT_WIRED.executive-deal-drillthrough` +
  `NOT_WIRED.admin-deal-drillthrough`, governance non-goals (Phase 15
  snapshot-only invariant; separate governance decision required for
  admin deal drill-through).
- **Future-work Outlook surfaces (Phase 110 forbidden list)** —
  automated outbound triggers, inbound email logging, delivery/read
  tracking, shared mailbox send, Phase 101 LIVE delivery, calendar-
  half connector. Each is a future-phase candidate requiring its own
  brief; the Phase 110 lock forbids any in-repo motion until that
  brief lands.

---

## 4. Release-candidate criteria — operator checklist

> **Prerequisite: the app must first be landed in a Microsoft
> Power Platform environment.** The Phase 111 snapshot describes
> what should be true in the local build; nothing here is
> exercisable in the bank's Power Platform environment until the
> Code App has been published there. **The current true blocker
> is environment landing, not app feature readiness.** Complete
> the [Phase 113 Microsoft Environment Landing Plan](PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md)
> §G solo-operator sequence first — once §G.1–G.6 are green,
> proceed below.
>
> **Once environment landing is complete:** the full
> step-by-step operator validation script lives at
> [PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md](PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md).
> The summary below is the gate matrix; the Phase 112 doc has
> the concrete actions, expected results, fail-handling, and an
> evidence-capture template.

Before promoting this build to a release candidate:

### Build + test gates

- [ ] `npm run build` completes clean.
- [ ] `npm test -- --run` reports **2523 / 2523 passing** (or
  whatever the current Phase 111 snapshot value is — the Phase 111
  governance pin will tell you).
- [ ] The Phase 110 release-lock test file
  (`src/shared/governance/communicationLaneReleaseLock.test.ts`)
  reports 134 / 134 passing. If it doesn't, a communication-lane
  boundary has drifted.
- [ ] The Phase 45 conservative-copy guard
  (`src/shared/governance/conservativeCopyGuard.test.ts`) reports
  zero hits.
- [ ] The Phase 106 release-readiness pin
  (`src/shared/governance/emailLiveReleaseReadiness.test.ts`) reports
  41 / 41 passing.

### In-app gates (Admin Workspace)

- [ ] Release Readiness Gate overall badge reads either *"Cannot
  fully verify — signals not wired"* (acceptable when no blocker
  fires) OR shows the expected **Blocked** state for Stage Governance
  AND the **Not Wired** state for build/test (those are the current
  expected red flags; everything else should be Ready / Needs
  Review).
- [ ] No executive snapshot reports a stale-data flag
  (`staleDataFlag`).
- [ ] No Critical alerts open in the Alert Backlog.
- [ ] Outlook LIVE Email Diagnostics card shows the expected mode
  badge for the target environment.
- [ ] If promoting with `VITE_EMAIL_MODE=LIVE`: complete the Phase
  106 operator checklist (now 7 steps including the Phase 109 smoke
  test against a non-borrower test inbox).

### Inventory gates

- [ ] `GOVERNED_WRITES.length` is 12. If it changed, Phase 111
  governance pin will tell you; refresh this doc before promoting.
- [ ] `NOT_WIRED.outlook-connector-live-send` and
  `NOT_WIRED.email-delivery` are absent. If either reappears, Phase
  104 / 105 work has been undone.
- [ ] `DELIBERATELY_BLOCKED` still has one entry
  (`stage-progression-advance`).
- [ ] Borrower-portal `NOT_WIRED` entry is still present (LIVE email
  does not imply a portal exists).

### Out-of-band promotion steps

1. Verify CI is green on the target branch.
2. Verify the connector registration in the target Power Platform
   environment matches the Phase 104 / Phase 109 documentation
   (Office 365 Outlook connector, `SendEmailV2` operation, no other
   operations enabled).
3. If flipping `VITE_EMAIL_MODE=LIVE`: run the Phase 109 smoke test
   against a non-borrower inbox; verify the test inbox actually
   received the message; verify the resulting audit row carries the
   full recipient + the chosen template + the banker note; verify
   the timeline row uses the masked form.
4. Confirm operators understand the wording rule in
   [PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md)
   §4: "Outlook accepted" is connector acceptance, not borrower
   delivery confirmation.

If any gate surfaces an unexpected signal, **do not promote**.

---

## 5. What changed since Phase 103

| Lane | Phase 103 state | Phase 111 state | Phases used |
| --- | --- | --- | --- |
| Lane A (Outlook handoff) | Phase 101 shipped four summary surfaces | Unchanged; deliberately copy-to-clipboard | — |
| **Lane B (Outlook connector)** | Permanent-failure stub | **LIVE for two governed writes; release-locked** | 104, 105, 106, 107, 108, 109, 110 |
| Lane C (File column upload) | Blocked | Still blocked | — |
| Lane D (Borrower portal) | Blocked (compound) | Still blocked; reason text updated to acknowledge Phase 104/105 swap | — |
| Lane E (Teams integration) | Five no-admin slices | Unchanged | — |
| Lane F (AI / Copilot) | Deferred | Still deferred | — |
| Lane G (Schema additions) | Multiple blockers | Unchanged | — |

The single material change since Phase 103 is Lane B — the
communication lane. The other six lanes are byte-identical in
posture; only the doc cross-references updated.

---

## 6. Recommended next phases vs. what to stop adding

### Worth considering (each requires its own brief)

- **Lane A continuation** — accessibility audit, banker-only
  relationship notes card stop-gap, per-banker / per-team derived
  analytics extension. None reopens governance; each closes a
  Vibe-coverage gap.
- **Lane C** — File column on `cr664_DocumentChecklist`. Upstream
  unblocks `NOT_WIRED.document-upload` and unblocks Lane D borrower
  upload.
- **Lane G** — Stage reference data source + sequence field. Upstream
  unblocks `DELIBERATELY_BLOCKED.stage-progression-advance`.

### Already covered; consider stopping

- **More Outlook surfaces.** Phase 110 explicitly locks the lane.
  Adding inbound / automation / delivery tracking / shared mailbox /
  Phase 101 LIVE / calendar-half is forbidden at CI time. Reopen
  only via a new brief with governance review.
- **More copy-to-clipboard handoffs.** Five Teams handoffs + five
  Outlook handoffs already exist. The "copy-to-clipboard pattern"
  is fully expressed.
- **More autopilot signal types.** Phase 80 / 81 / 82 / 84 / 95 cover
  the deterministic per-deal + rollup + memo-consistency surface
  comprehensively. Adding another signal kind is low value per unit
  of work.
- **Manager workspace parity cards.** Phase 102 closed the
  relationship-memory parity gap. Other manager surfaces (autopilot,
  morning catch-up, work queue) already have parity.

### Stop unless schema or admin work lands

- Borrower portal, secure messaging, AI Copilot, calendar sync,
  Teams push notifications, in-app build/test feed. Each is named
  in `NOT_WIRED` or `DELIBERATELY_BLOCKED` with a concrete blocker.

---

## 7. Lightweight CI pin

`src/shared/governance/releaseCandidateSnapshot.test.ts` pins the
counts this doc cites. If any inventory count slips, the test
fails and this doc must be refreshed. The test is intentionally
narrow: it does NOT pin behavior, only the snapshot numbers — so
it won't fail-loud on routine work, only when the snapshot itself
goes stale.

---

## 8. What Phase 111 does NOT do

- **No new product behavior.** No new governed write, no new card,
  no new connector call, no payload expansion. Phase 110's
  forbidden-pattern lock would catch any such drift.
- **No re-classification of any inventory entry.** Counts shift only
  if existing entries change; Phase 111 added zero, removed zero,
  re-classified zero.
- **No new lane.** Phase 111 is a snapshot of the existing seven
  lanes. New-lane proposals belong in their own briefs.
- **No promotion decision.** This doc tells operators what they
  CAN releasably promote; it does not make the decision. The
  decision lives with the operator + the §4 checklist.

---

## 9. Verification

- All Phase 104–110 governance pins remain green:
  41 + 49 + 13 + 15 + 16 + 134 = **268 communication-lane
  assertions** across six dedicated files.
- The Phase 111 light pin
  (`src/shared/governance/releaseCandidateSnapshot.test.ts`,
  introduced in this phase) asserts the inventory counts cited
  above and that the Phase 110 + 109 + 106 pin files all exist on
  disk.
- Full suite: 2523+ tests passing across 111+ files (the +
  reflects Phase 111's new pin file).
- `npm run build`: clean.
