# Microsoft Vibe Capability Coverage Map

**Purpose.** Canonical comparison between the Microsoft Vibe
commercial-lending operating-system scope and what this Code App
actually does today. The intent is the same as
[PHASE_64_BORROWER_PORTAL_AUDIT.md](PHASE_64_BORROWER_PORTAL_AUDIT.md)
generalized across every Vibe capability: future phase briefs
should be picked from the gaps here, not invented adjacent to
them.

**Phase posture (Phase 69 — the phase that created this doc).**
docs / planning only. No new features, no new writes, no schema
work, no UI changes. The map below is a single source of truth
for capability status; specific governance metadata still lives
in
[platformInventory.ts](../src/shared/governance/platformInventory.ts).

**Phase 111 release-candidate snapshot (current authoritative
read).** After Phase 110 release-locked the banker-triggered
Outlook communication lane (Phases 104–110), the project has a
defensible release-candidate posture across all surfaces. See
[PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md](PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md)
for the consolidated counts (12 governed writes / 16 LOCAL_ONLY_FLOWS /
8 NOT_WIRED / 1 DELIBERATELY_BLOCKED at end of Phase 110), the
operator release checklist, the seven-lane delta vs. Phase 103, and
the recommended-vs-stopping next-phase guidance. The earlier
checkpoint at
[PHASE_103_PRODUCT_CHECKPOINT.md](PHASE_103_PRODUCT_CHECKPOINT.md)
is preserved for historical context.

**Phase 112 operator validation script.** The human-executable
step-by-step release-candidate validation lives at
[PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md](PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md).
Eleven sections (A–K) walk an admin or release-operator through
pre-flight, app launch, release-readiness/inventory, admin email
diagnostics, banker document-request flow, banker borrower-update
flow, negative checks, an evidence-capture template, failure
handling, what the script does NOT validate, and cross-references.
Run it in the deployed environment after every build before
promotion. The Phase 111 snapshot tells you what should be true;
Phase 112 tells the operator how to verify it.

**Phase 113–121 first-live-launch sequence.** Real deployment
proved the app could publish (Phase 113), bootstrap identity
correctly against the seeded `cr664_platformuser` table (Phase
115), recognize the six live Platform Workspace names including
`Portfolio Management → manager route` (Phase 116), and present
a product-grade Banker Workspace shell with dark sidebar + KPI
grid + tabs + right rail (Phase 117). The Phase 117 shell
preserves every prior invariant: no email-lane change, no fake
routes (Contacts / Due Diligence / Alerts tabs deliberately
omitted), no `New Deal` / `Log Activity` buttons (no governed
write supports either), and the read-only banner surfaces when
`BankerIdentity.writeDisabledReason` is populated.
[PHASE_118_ORIGINAL_UI_UX_INVENTORY.md](PHASE_118_ORIGINAL_UI_UX_INVENTORY.md)
classifies the missing original-product UI surfaces (A through F
buckets — already-implemented-not-composed, implemented-needs-
seed, loader-missing, write-missing, deliberately-blocked, pure
polish) so restoration phases can be sequenced against
governance reality.
[PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md](PHASE_119_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_1.md)
implements the first restoration slice (bucket-A wave 1: stage-
grouped pipeline + 3 new KPI tiles + My-Tasks right-rail panel).
[PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md](PHASE_120_RESTORE_ORIGINAL_BANKER_WORKSPACE_UI_UX_PART_2.md)
ships the second restoration slice (bucket-A wave 2: Activity
tab + Due Diligence tab + per-row stale badges + sidebar-footer
workspace switcher). After Phase 120 the tab bar surfaces 7 tabs
(Overview / Pipeline / Action Queue / Due Diligence / Activity /
Relationships / Signals); Contacts and Alerts remain absent, and
no `New Deal` / `Log Activity` buttons are surfaced.
[PHASE_121_LIVE_BANKER_DATA_SEED.md](PHASE_121_LIVE_BANKER_DATA_SEED.md)
captures the manual seed reference runbook;
[PHASE_121_OPERATOR_SEED_CHECKLIST.md](PHASE_121_OPERATOR_SEED_CHECKLIST.md)
is the streamlined operator click-through with pre-verified
live IDs. Phase 121 shipped with **reduced scope**: Stage
Reference, Status Reference, Borrower, and Deal rows were
seeded successfully, while Task + Document seeds were skipped
due to Dataverse lookup/config blockers (the
`cr664_dealtask1.cr664_AssignedTo` form/quick-find view
misconfiguration + the `cr664_documentchecklist.cr664_Deal`
legacy-vs-modern target mismatch).
[PHASE_122_RETARGET_DEAL_LOOKUPS.md](PHASE_122_RETARGET_DEAL_LOOKUPS.md)
scopes the Dataverse-configuration phase that retargets the
modern operational child-table Deal lookups to `cr664_loandeal`,
unblocking the deferred Phase 121 document seeds. Phase 122 is
**not a React phase** — the production app already binds
correctly to `/cr664_loandeals(...)`; Phase 122 makes the live
schema match what the app already assumes.
[PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md](PHASE_122A_OGB_LOS_ORIGINAL_UI_UX_RECOVERY_AUDIT.md)
is the visual-recovery audit. Headline finding: no archived
richer UI exists in the repo. The audit produces a forward-
looking visual-restoration backlog with buckets A / B / C / D
and proposes Phases 123–129.
[PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md](PHASE_123_PREMIUM_BANKER_COMMAND_CENTER_VISUAL_SHELL.md)
ships the first wave: a premium command-center hero header,
the KPI grid reorganized into Pipeline / Work items / Attention
groups with hero treatment for Active deals + Pipeline, a
premium tab bar, accent-striped right-rail panels, polished
sidebar + workspace switcher pill, and framed empty states
across PersonalPipeline / Activity / Due Diligence / My Tasks
rail.
[PHASE_124_RICH_PIPELINE_STAGE_BOARD.md](PHASE_124_RICH_PIPELINE_STAGE_BOARD.md)
rebuilds the Pipeline tab as a horizontal stage-board with one
lane per canonical non-terminal STAGE_CATALOG stage + custom
lanes for live operator-named stages + Stage-unknown fallback.
Premium deal cards replace the per-stage flat tables; lane
headers carry deal-count pills + compact-currency amount
summaries (omitted honestly when all deals in a lane lack
amounts). Terminal stages are deliberately excluded because the
loader already filters out `cr664_isterminalstatus = true`.
[PHASE_125_DEAL_WORKSPACE_COCKPIT.md](PHASE_125_DEAL_WORKSPACE_COCKPIT.md)
extends the cockpit feel into the per-deal workspace: DealHeader
becomes a hero band with primary accent stripe + hero name +
amount hero block + relative target-close countdown + honest
"Not set" copy for missing fields, DealBlockers +
DealStageProgressionCard signal/reason rows get severity-tinted
framed treatment, and the DealTasks / DealDocuments / CreditMemo
/ ActivityTimeline / BorrowerCommunication honest-empty states
match the framed dashed-border treatment shipped in Phases 123 +
124.
[PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md](PHASE_125B_DEAL_WORKSPACE_VISUAL_REDESIGN.md)
implements the design-pass-first redesign of that deal workspace:
navy hero band with a glass metric strip + two-column cockpit
grid (intelligence left, attention right) + honest "Not set"
chips for missing stage / status. Preserves the Phase 125 hook
hoist verbatim.
[PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md](PHASE_125C_PREMIUM_DEAL_COCKPIT_VISUAL_UPGRADE.md)
is the premium polish pass on top of Phase 125B: adds the
cobalt / teal / cyan / violet accent families to the Phase 79
theme tokens, a horizontal canonical-stage pill rail to
DealStageProgressionCard (with a custom-stage fallback for
the Phase 121 sparse seed), a layered hero glow to DealHeader,
inline-SVG severity glyphs (warning triangle / alert circle /
info circle) replacing the small color-dot indicator on
DealBlockers + Stage Progression signal rows, a cobalt
liquid-glass overlay backdrop to the right-rail attention
column, and a refreshed DealAutopilotPanel priority stripe
palette (cobalt / teal / at-risk). Phase 125 hook hoist
preserved.
[PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md](PHASE_125D_BLOOMBERG_APPLE_DEAL_COCKPIT.md)
is the Bloomberg-Terminal-meets-Apple-Enterprise cockpit
redesign on top of Phase 125C. Adds the slate cockpit-surface
theme tokens (panelBg / deckBg / deckTile / glassPanel /
panelBorder), a pure-function deriveDealCockpitMetrics() that
produces every KPI deck / workstream-bar / right-rail count-
badge value, and six new shared visual primitives (MetricTile,
CompletenessRing, WorkstreamBar, CountBadge, SeverityMeter,
GlassPanel). Introduces a DealMetricDeck KPI strip (8 tonal
tiles + completeness ring + missing-fields readout) and a
DealWorkstreamPanel (4 progress bars). Promotes DealBlockers
→ Attention Console (severity-meter header), DealStageProgressionCard
→ connected-node Stage Map (numbered nodes + tonal
connectors + glass command strip), and DealAutopilotPanel →
Action Console (priority-meter header). Refreshes DealSummary
into three tonal grouped sections (identity / pricing /
structure). Adds count badges to right-rail Tasks + Documents
card headers. Page background flips to the slate cockpit
platform. Phase 125 hook hoist preserved.
[PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md](PHASE_126_RELATIONSHIPS_SIGNALS_VISUAL_RESTORATION.md)
upgrades the Relationships + Signals tabs into premium
intelligence surfaces: per-client RelationshipMemory rows gain
a primary-accent left stripe + bumped client-name typography,
BankerAutopilotRollup rows gain a severity-tinted left stripe
driven by row priority, and both cards' empty states match the
framed dashed-border treatment. All Phase 76 / 78 / 82 / 83 /
100 / 101 derivations + local ledgers + clipboard / mailto
handoffs preserved verbatim; new static-source pins assert the
Phase 110 communication-lane lock holds on both files.
Composition-only — no Dataverse / loader / governed-write
changes. Phases 118 + 121 + 122 + 122A are documentation /
Dataverse-config only; Phases 119 + 120 + 123 + 124 + 125 +
125B + 125C + 125D + 125E + 126 are implementation with
regression tests.
[PHASE_125G_LENDING_OS_COCKPIT_FIT_AND_FINISH.md](PHASE_125G_LENDING_OS_COCKPIT_FIT_AND_FINISH.md)
is the targeted polish pass after Phase 125F restored the
Lending OS shell. Six changes: stable .cc-kpi-grid /
.cc-metric-deck-tiles CSS breakpoints (no orphan tile), the
DealCockpitNav 8-anchor strip under the deck with
smooth-scroll links, Attention Console missing-field chip
grouping by category (Economics / Parties / Timing / Stage &
status / Structure), DealHeader "Deal Cockpit" lockup pill +
brighter accent, right-rail widget consistent height. No
data / loader / governed-write / email-lane changes.
[PHASE_125F_LENDING_OS_SHELL_RESTORATION.md](PHASE_125F_LENDING_OS_SHELL_RESTORATION.md)
is the restorative phase that brought the original Lending OS
dark-sidebar shell + greeting header + flat 10-tile KPI deck
+ 8-tab work area + right rail back into shape and wrapped
the per-deal cockpit inside the same shell.
[PHASE_125E_FULL_DEAL_COCKPIT_RECOMPOSITION.md](PHASE_125E_FULL_DEAL_COCKPIT_RECOMPOSITION.md)
is the corrective recomposition pass that replaces the Phase
125D layout: command hero with identity slots (no metric
strip), 6 large tonal KPI tiles + completeness ring, big
Attention Console with severity meter + missing-data
checklist, large connected-node Stage Map (44/52px nodes),
icon-led WidgetHeader on every right-rail widget with count
badges + mini progress bars, Deal Summary demoted to the
bottom of the cockpit. Adds 16 inline-SVG cockpit icons +
LargeMetricTile + WidgetHeader primitives. Phase 125 hook
hoist preserved. No phase changes the
loan-deal / banker / borrower schema, fabricates React data,
adds automation, or exercises the email lane.

**Phase 103 checkpoint (historical).** After Phases 70–102 shipped
the full Lane A buildable list (analytics + activity intelligence +
relationship memory + autopilot + Teams handoffs + Outlook
handoffs + manager parity), this map's Lane A roadmap was
**substantially complete**. The remaining Vibe gaps were gated on
upstream unlocks (Lanes B / C / D / E / F / G). See
[PHASE_103_PRODUCT_CHECKPOINT.md](PHASE_103_PRODUCT_CHECKPOINT.md)
for the build-now / defer / stop decision per lane and the
explicit "do not build more in-repo right now" list. Until an
upstream trigger lands, in-repo Lane A feature work is paused.

**How to read this map.** Each capability has:
- a one-line description of what Vibe expected
- a "Current state" — what actually ships today
- a "Gap" — what is missing
- a "Blocker" — why we can't close the gap inside this repo today
- a "Safe next step" — the smallest honest motion (which may be
  "defer" / "wait for upstream" / "ship the X Y Z" sub-phase)
- "Schema / admin work needed?" — yes / no
- "Build now / later / deferred"

When a Phase brief is silent on a capability, treat this map's
"Safe next step" line as the standing default.

---

## 0. Status legend

| Status | Meaning |
|---|---|
| **Operational** | Fully wired end-to-end. Has tests; surfaces in the app today. |
| **Partially operational** | Wired but missing meaningful capability the Vibe doc expected. |
| **Local-only workaround** | Generates content / copy / preview locally; no Dataverse write; no external delivery. |
| **DRY_RUN / handoff only** | Wired end-to-end on the app side; actual delivery is either simulated (DRY_RUN) or handed off to the banker's own client. |
| **Schema-blocked** | Cannot ship without a Dataverse column / table / option-set value that does not exist. |
| **Connector/admin-blocked** | Cannot ship without a Power Platform connector registration or tenant-admin action. |
| **Auth/security-blocked** | Cannot ship without an external-identity / invitation / consent mechanism that does not exist. |
| **Not started** | Capability has no app-side work and no inventory row. |
| **Intentionally deferred** | A deliberate non-goal today. May or may not be re-evaluated later. |

---

## 1. Capability map (29 groups)

### 1.1 Banker Command Center

- **Vibe expected.** A banker's home: pipeline + work queue + alerts + KPIs at a glance.
- **Current state.** **Operational.** Phase 4 banker workspace + Phase 54 pending-review signal + Phase 56 (work queue refresh) + MyWorkQueue surfaces. **Phase 75** added a deterministic personal activity/workload snapshot card (PersonalActivitySummary). **Phase 76** added a deterministic Relationship Memory Lite card (RelationshipMemory). **Phase 78** layered a local-only "Draft relationship note" button on each client row. **Phase 82** added `<BankerAutopilotRollup />` — a deterministic personal rollup of the Phase 80 Next Best Actions across the banker's own pipeline. **Phase 89** added `<BankerMorningCatchUp />` — a deterministic banker-side "morning catch-up" feed that delegates to the Phase 88 manager primitive via the thin Phase 89 adapter (reshapes banker work-queue data into the catch-up input shape). **Phase 90** added a local-only "since your last visit on this browser" overlay on the catch-up card (per-user marker scoped by bankerId; new-item count + per-item "New" badge; honest first-visit + unscoped fallback states; no cross-device sync). **Phase 91** added per-item Dismiss locally / Snooze 24h / Restore controls on the same catch-up card via a sibling Phase-83-style local ledger; the controls change row rendering only, never change deal status. **Phase 98** added a "Copy Teams summary" button on the banker catch-up card that writes a plain-text feed summary to `navigator.clipboard` for paste-into-Teams handoff; the click never mutates the Phase 90 marker or Phase 91 ledger and never invokes Phase 94 mark-all-seen. **Phase 100** layered the same handoff onto the Phase 76 `<RelationshipMemory />` card: a per-row inline "Copy Teams summary" button writes a per-client relationship snapshot (active deals + pipeline + timeline anchors + Asks / Attention blocks + up to 8 active deal lines + verbatim relationship-graph / household / score negations) to `navigator.clipboard`; the click never opens the Phase 78 note-draft modal and never mutates the Phase 83 / 90 / 91 ledgers. Banker autopilot answers "what to do next per deal"; banker catch-up answers "what happened across my pipeline / what needs attention" with observational items including data-quality items (`missing-stage`). The banker IS the assigned banker on every deal in their pipeline, so `missing-assigned-banker` is never surfaced on the banker workspace. None of Phase 75/76/78/82/89/90/91/98/100/101 introduces a new query shape or new write surface.
- **Gap.** No AI-summarized "what changed since you last looked"; no deal-autopilot suggestions; no persistent banker notes per borrower; no contact-history ingestion from Outlook/Teams.
- **Blocker.** None for the core. The Vibe-doc deltas above are Lane F (Copilot), Lane E (Outlook/Teams), and schema (persistent banker notes / verified borrower entity id). Phase 78 explicitly ships as a LOCAL_ONLY stop-gap toward the persistent-notes future phase.
- **Safe next step.** Lane A: dark theme tokens (Phase 74 named this as the largest remaining a11y gap). Persistent-banker-notes governed-write phase requires schema + governance work and is later.
- **Schema / admin work needed?** No for the current LOCAL_ONLY surface; yes for the future persistent-notes governed write.
- **Build now / later / deferred.** Now.

### 1.2 Deal Workspace

- **Vibe expected.** Per-deal page with header, summary, blockers, tasks, documents, credit memo, activity, borrower communication, stage gate, and per-deal relationship context.
- **Current state.** **Operational.** Phase 4 banker + Phase 36 manager (read-only) + Phase 37 team (read-only). Cards mount under DealDataProvider after authorized load. **Phase 77** added a banker-only `<RelationshipContext />` card between DealSummary and DealTasks. **Phase 80** added the banker-only `<DealAutopilotPanel />` between DealSummary and RelationshipContext — a deterministic Next Best Actions surface with at most 3 priority-ordered suggestions and scroll-into-view links to the Tasks / Documents / Credit Memo / Borrower Communication / Activity Timeline / Stage Progression cards (wrapped with `data-deal-card` anchors). **Phases 86 + 96 + 97 + 99** layered the no-admin Teams handoff vocabulary across the Banker Deal Workspace: Phase 86 added `<TeamsChatHandoff />` (deep-link to the banker's Teams client); Phase 96 added `<TeamsDealSummaryHandoff />` (copy-to-clipboard plain-text deal summary); Phase 97 threaded a Phase 76/77 cross-deal relationship line into that summary; Phase 99 added an inline "Copy Teams summary" button on `<ActivityTimeline />` itself that emits a deal-scoped activity digest. All four surfaces share the same posture: clipboard write only, no Graph, no MSAL, no Teams API send, no notification, no audit/timeline, no Dataverse write. Manager / team / executive Deal Workspaces unchanged (Phase 77/80/86/96/97/99 surfaces are banker-only).
- **Gap.** Executive + admin deal drill-through are deliberately unwired (`NOT_WIRED.executive-deal-drillthrough` + `NOT_WIRED.admin-deal-drillthrough`).
- **Blocker.** Governance decision, not technical. Phase 15 chose snapshot-only for executive; admin drill-through is a separate gov call.
- **Safe next step.** No motion required for the core. A future phase could extend the Phase 77 surface to manager / team Deal Workspaces (their providers already carry deal lists; the card would group by client name across the manager's team pipeline or the team's shared pipeline).
- **Schema / admin work needed?** No.
- **Build now / later / deferred.** Now (banker side delivered by Phase 77); manager / team / executive extension deferred.

### 1.3 Document workflow

- **Vibe expected.** Request, receive, review, upload (binary), preview, download, with audit + timeline trail.
- **Current state.** **Partially operational.** Metadata-only: Phase 22 request + Phase 51 mark-received + Phase 55 mark-reviewed (all governed writes, audit + timeline). Phase 54 surfaces stale pending-review.
- **Gap.** Binary upload is `NOT_WIRED.document-upload` (schema: no File column on `cr664_DocumentChecklist`). Preview / download are downstream of upload.
- **Blocker.** Schema — File column missing. Lane C.
- **Safe next step.** No motion in-repo. When schema arrives, wire `client.uploadFileToRecord` to the new column. Until then, the Phase 51/55 metadata pattern remains the operational record.
- **Schema / admin work needed?** Yes (schema).
- **Build now / later / deferred.** Later (Lane C).

### 1.4 Borrower communication

- **Vibe expected.** Outbound updates, status checks, doc requests, two-way thread.
- **Current state.** **Banker-initiated LIVE outbound across both major write paths; no automation, no inbound, no portal.** Phase 23 borrower-update draft (Copy fallback), Phase 24 credit-memo preview, Phase 61/104 document-request email (DRY_RUN + LIVE through `SendEmailV2`), Phase 63 document-request handoff (mailto + clipboard), Phase 66/67 borrower-safe status packet + handoff, **Phase 105** borrower-update email (DRY_RUN + LIVE through `SendEmailV2`, governed write `deal-borrower-update-email`, audit + `BorrowerUpdateSent` timeline 788190014, masked recipient, "Outlook accepted" copy — never "delivered"). Both LIVE send paths are fully banker-initiated (banker types recipient + body + banker note + clicks Send).
- **Gap.** No automated outbound (no scheduled trigger, no event-driven push). No inbound — responses arrive in the banker's own Outlook inbox and are not synced into the deal timeline. No two-way thread. No borrower-facing portal (`NOT_WIRED.borrower-portal`).
- **Blocker.** Automation, inbound mail, and portal remain governance + schema + cross-tenant identity problems (see `NOT_WIRED.borrower-portal` blockers (1)–(6)). The LIVE outbound half is closed.
- **Safe next step.** Maintain. Both LIVE outbound write surfaces are shipped and governed. Inbound mail would be a separate phase with its own audit/timeline coordination; automation would be a separate phase with a governance review for "the app independently messaging borrowers."
- **Schema / admin work needed?** No (for outbound LIVE — already shipped). Yes (governance + schema) for inbound and portal-grade two-way thread.
- **Build now / later / deferred.** Phase 105 closed the borrower-update LIVE half. Inbound + automation + two-way thread deferred (compound blocker).

### 1.5 Borrower portal / concierge

- **Vibe expected.** External-user-facing portal where borrowers see their deal, upload documents, message the banker, acknowledge requests.
- **Current state.** **`NOT_WIRED.borrower-portal` (compound).** Phase 64 audited; Phase 65 ratified deferral with structural-source tests forbidding portal routes, magic-link handlers, etc.
- **Gap.** Everything portal-facing. See [PHASE_65](PHASE_65_BORROWER_PORTAL_DEFERRAL.md) §4 for the six-step unblock checklist.
- **Blocker.** Compound: no external auth, no invitation/token table, no external-user role, no File column, no secure-message persistence, no connector-backed email.
- **Safe next step.** Lane D when the team is ready to take on the cross-tenant identity work. Until then: maintain the Phase 65 deferral; keep banker-initiated artifacts (Phase 23/66/67) operational.
- **Schema / admin work needed?** Yes (large; cross-team).
- **Build now / later / deferred.** Deferred.

### 1.6 Outlook email integration

- **Vibe expected.** Send borrower updates and document requests from the app; log sent/received emails on the deal timeline.
- **Current state.** **Lane B email is RELEASE-LOCKED through Phase 110.** Two governed LIVE send paths wired (document-request via Phase 104, borrower-update via Phase 105), operator-safety regression-pinned (Phase 106), activity-evidence regression-pinned (Phase 107), post-send activity refresh wired (Phase 108), operator smoke-test harness shipped (Phase 109), and the full lane sealed by a consolidated 134-assertion release-lock test file (Phase 110, [docs/PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md)). Catch-up / activity / relationship summary surfaces remain copy-to-clipboard by design. Any future communication-lane work (inbound mail, automation, portal messaging, delivery tracking, shared mailbox, Phase 101 LIVE delivery) is explicitly out of scope and forbidden at CI time by the Phase 110 lock. Phase 61 shipped the `DRY_RUN | LIVE | HANDOFF` mode split for document-request; Phase 63 added the HANDOFF (mailto + clipboard) path. **Phase 104** registered the Office 365 Outlook connector and swapped the LIVE stub in `outlookEmailAdapters.ts` to call `Office365OutlookService.SendEmailV2`. **Phase 105** added a parallel borrower-update LIVE send path: new governed write `deal-borrower-update-email` (12th `GOVERNED_WRITES` entry) reusing the same adapter, emits audit + `BorrowerUpdateSent` (788190014) timeline rows with masked recipient and "Outlook accepted" copy. **Phase 106** is a verification + docs phase that proves at CI time that flipping `VITE_EMAIL_MODE=LIVE` is operator-safe for *exactly* those two writes. The new pin file `src/shared/governance/emailLiveReleaseReadiness.test.ts` (41 assertions across six invariants) enforces: `NOT_WIRED.email-delivery` is absent; `Office365OutlookService` is imported by exactly one production file; only `SendEmailV2` is called (no calendar/contact/batch/subscription); the four Phase 101 summary handoffs and their helper/button file do NOT import the connector regardless of `EMAIL_MODE`; the LIVE adapter sets only `To` / `Subject` / `Body` / `Importance: 'Normal'`; no automation / scheduler / inbound-mail / borrower-portal-import surface exists; and the action layers contain no "delivered" / "email was sent" claims. Both LIVE paths use the minimal `ClientSendHtmlMessage` — no attachments, Cc, Bcc, From (shared mailbox), ReplyTo, or Sensitivity. Outcome classification on both: success → `accepted`; 408 / 429 / 5xx / no-status / thrown rejection → `transient-failure`; other 4xx → `permanent-failure`. The Phase 23 Copy fallback remains in `DraftBorrowerUpdateModal` for offline workflows and DRY_RUN. **Phase 101** Outlook summary handoffs (Banker MorningCatchUp, Manager MorningCatchUp, per-deal ActivityTimeline, per-client RelationshipMemory) do NOT call `SendEmailV2` regardless of `EMAIL_MODE` — those four surfaces remain copy-to-clipboard handoffs by design, now structurally guarded by the Phase 106 pin file. Inventoried as `LOCAL_ONLY_FLOWS.outlook-summary-handoff`.
- **Gap.** Catch-up / activity / relationship summary LIVE send (deliberately not built — Phase 101 stays copy-to-clipboard). Inbound email logging. Two-way thread. Automated borrower-notification triggers.
- **Blocker.** No remaining connector blocker for outbound send. Inbound + automation are separate governance + schema phases.
- **Safe next step.** Maintain. Phase 104 + Phase 105 closed the highest-leverage Lane B items. The remaining surfaces are deliberate scope freezes per the Phase 103 product checkpoint — no additional sibling Outlook send variants should land just because the pattern exists.
- **Schema / admin work needed?** No (for both LIVE send paths — shipped). Yes (governance) for inbound email logging and automated triggers.
- **Build now / later / deferred.** Phase 104 shipped LIVE document-request send. Phase 105 shipped LIVE borrower-update send. Summary-handoff LIVE deliberately not built (Phase 101 copy-to-clipboard is the operating model). Inbound + automation deferred.

### 1.7 Microsoft Teams integration

- **Vibe expected.** Deals visible inside Teams; banker presence; thread-in-deal pattern.
- **Current state.** **Partial — five no-admin handoff surfaces shipped (Phase 86 chat-handoff + Phase 96 deal-summary + Phase 98 catch-up summary + Phase 99 activity-timeline digest + Phase 100 relationship-memory snapshot), enriched with cross-deal relationship context in Phase 97.** Phase 85 audited the upstream dependencies in depth and identified two feasible no-admin slices; Phase 86 shipped Candidate A and Phase 96 shipped Candidate B. **Phase 98** extended the same no-admin handoff vocabulary into the activity-intelligence lane on the morning-catch-up cards. **Phase 99** rounds out the family by adding a "Copy Teams summary" button to the per-deal `<ActivityTimeline />` card on the Banker Deal Workspace — a pure formatter (`src/deals/activityTimelineTeamsSummary.ts`) writes a plain-text deal-scoped activity digest (deal name + UTC date + total event count + Phase 72 since-last-visit context + up to 8 most recent events as `- <UTC stamp> · <Event type[/SubType]>: <Title> — <summary> (<sourceLabel> · by <actor>)[ · new]`). The Banker Deal Workspace now carries the full no-admin Teams vocabulary in a single workspace: chat handoff (Phase 86), deal summary (Phase 96 + Phase 97 relationship), and activity digest (Phase 99). The Banker Command Center is rounded out by Phase 98 (catch-up summary) and **Phase 100** (per-client `<RelationshipMemory />` snapshot — a pure formatter `src/shared/relationship/relationshipMemoryTeamsSummary.ts` turns one `RelationshipMemoryEntry` into a plain-text relationship snapshot the banker pastes into Teams; the copy click never mutates the Phase 78 note-draft state, the Phase 83 suggestion ledger, the Phase 90 last-seen markers, or the Phase 91 dismiss / snooze ledger). The banker-facing slate is now five no-admin handoff surfaces across both workspaces. `@microsoft/teams-js@^2.53.0` is installed and used for one purpose only — a best-effort, never-throw `app.initialize()` + `app.getContext()` probe surfaced as a diagnostic-only "Detected: running inside Teams" badge on the Phase 86 card. The Teams SDK is NOT loaded by Phase 96 / 97 / 98 / 99. The Phase 86 `<TeamsChatHandoff />` card on the Banker Deal Workspace opens `https://teams.microsoft.com/l/chat/0/0?users=<signed-in banker email>&topic=<deal name>&message=Re: <deal name>` in a new tab so the banker's own Teams client opens; the banker edits recipient and message before sending. **Phase 96** added the sibling `<TeamsDealSummaryHandoff />` card immediately below: a pure formatter (`src/deals/teamsDealSummary.ts`) produces a plain-text deal summary (deal name, client, stage/status, loan amount, target close, open-task / outstanding-doc / pending-review-doc / Phase 73 memo-consistency counts, optional top Phase 80 Next Best Action, optional closing-soon note, verbatim disclaimer), and the "Copy Teams summary" button writes that string to `navigator.clipboard`. **Phase 97** wires the Phase 76/77 `deriveCrossDealContext` primitive into the Phase 96 summary's optional `relationshipContextNote` slot: when the banker has other visible deals in the same client-name group, the summary gains a one-line "Relationship: N other visible deals for <client> (client-name grouped). Across those deals: …. Nearest upcoming close YYYY-MM-DD. From visible records; may not include all related borrowers." Phase 97 introduces no new derivation logic — `src/shared/relationship/relationshipContextNote.ts` is a one-line formatter over the existing aggregate. When the deal has no client name OR no other visible deals share the group, the relationship line is omitted entirely. The banker pastes it into Teams in their own client. Neither card sends, posts, reads, syncs, notifies, calls Graph, or writes to Dataverse. Inventoried as `LOCAL_ONLY_FLOWS.teams-chat-handoff` (Phase 86) and `LOCAL_ONLY_FLOWS.teams-deal-summary-handoff` (Phase 96 + Phase 97 — extended in place) — both explicitly disclaim no Dataverse write, no audit row, no timeline event, no calendar sync, no notification delivery, no Graph call, no access-token acquisition. The Phase 96 card never says sent / posted / delivered / notified / synced / Teams integrated / Graph connected as a positive claim; the Phase 97 relationship line never says household / verified / complete / full relationship profile / relationship score / risk score / all borrower exposure / AI-generated / relationship graph (source-hygiene tests pin both lists). Full integration remains blocked — Graph client / MSAL / Graph admin consent / Teams app manifest / meeting-link schema / notification schema are all still absent (see Phase 85 §3). See [docs/PHASE_86_TEAMS_SDK_CHAT_HANDOFF.md](PHASE_86_TEAMS_SDK_CHAT_HANDOFF.md), [docs/PHASE_96_TEAMS_DEAL_SUMMARY_HANDOFF.md](PHASE_96_TEAMS_DEAL_SUMMARY_HANDOFF.md), and [docs/PHASE_97_TEAMS_SUMMARY_RELATIONSHIP_CONTEXT.md](PHASE_97_TEAMS_SUMMARY_RELATIONSHIP_CONTEXT.md).
- **Gap.** Push-to-Teams notifications, calendar sync, meeting create, presence, channel posting, Graph user lookup, Teams app sideload — all still connector/admin/schema-blocked.
- **Blocker.** Connector + tenant-admin (Teams app registration; Graph permissions; Outlook connector for calendar). Lane E.
- **Safe next step.** Phase 86 + Phase 96 + Phase 97 + Phase 98 + Phase 99 + Phase 100 closed every identified no-admin Teams slice across the Banker Deal Workspace, the morning-catch-up cards, and the Relationship Memory card. Everything else stays Lane E until upstream consent + connector work lands.
- **Schema / admin work needed?** No further no-admin slices remain; yes (tenant + connector + Graph) for every other Teams capability.
- **Build now / later / deferred.** Phase 86 + Phase 96 + Phase 98 + Phase 99 + Phase 100 closed the no-admin handoff slices (chat-handoff, deal-summary, catch-up-summary, activity-timeline digest, relationship-memory snapshot). Phase 97 enriched the deal-summary with relationship context. Later for the Lane E lane (after Outlook connector + Graph consent + Teams app manifest).

### 1.8 Teams calendar sync

- **Vibe expected.** Banker calendar events for deal milestones; close-date reminders; SLA alerts.
- **Current state.** **Not started.** Phase 85 reaffirmed: calendar read/write requires the Office 365 Outlook connector OR Graph `Calendars.Read*` permissions with admin consent. The connector itself was registered in Phase 104 (which wired `SendEmailV2` for document-request email), but calendar APIs are a separate set of connector operations + governance decisions and remain unwired. The repo's `SharedClosingCalendar.tsx` is a deterministic per-deal bucketing by `targetCloseDate` rendered as a calendar-style card — it is NOT a calendar integration and does not write to or read from any external calendar.
- **Gap.** Everything.
- **Blocker.** Same as 1.7 (Teams + Graph calendar permissions). Phase 104 registered the Outlook connector for `SendEmailV2` only; the calendar half of 1.8 needs separate calendar-operation registration and governance.
- **Safe next step.** Lane E (no in-repo motion until connector lands).
- **Schema / admin work needed?** Yes.
- **Build now / later / deferred.** Later.

### 1.9 Teams notifications

- **Vibe expected.** Push notifications to bankers when a deal needs action (received doc, escalated alert, etc.).
- **Current state.** **Not started for push-to-Teams.** Phase 85 reaffirmed: writing to a user's Teams activity feed requires Graph `TeamsActivity.Send` with admin-consented permissions; channel/chat posting requires `ChannelMessage.Send` / `Chat.ReadWrite`. Neither is wired and faking a "notification sent to Teams" UI is **explicitly forbidden** (Phase 85 §2 rows 2.6 / 2.7). **In-app notification panels ARE partly served** today by the Phase 80 per-deal Next Best Actions panel, the Phase 82 banker rollup, and the Phase 84 team rollup — these are deterministic local surfaces, honestly labelled "Nothing happens automatically" and not claimed as Teams pushes. There is no path between the in-app autopilot signals and a Teams push without the upstream connector / Graph work.
- **Gap.** Push-to-Teams remains blocked; the in-app notification half is partly addressed by the autopilot triad.
- **Blocker.** Lane E (Teams app registration + Graph `TeamsActivity.Send` admin consent).
- **Safe next step.** Lane E. A future no-schema enhancement could add a centralized in-app notification panel that consolidates Phase 80/82/84 signals — but that is a presentation refactor of capability §1.17, not a new Teams capability.
- **Schema / admin work needed?** Yes (admin consent + connector + possibly a `cr664_notificationpreferences*` schema for per-user opt-in across devices).
- **Build now / later / deferred.** Later for push-to-Teams. Now-feasible (already partly delivered) for in-app notification panels via the autopilot rollups.

### 1.10 Credit memo workflow

- **Vibe expected.** Draft → review → save → finalize → submit for decision.
- **Current state.** **Partially operational.** Phase 24 local preview generator + Phase 25 governed draft save (audit + timeline). No finalize / submit / decision step.
- **Gap.** Finalize / submit / decision workflow. Cross-document consistency check is a related gap (see 1.14).
- **Blocker.** Governance — the "decision" step exists outside this app today (separate underwriting system). Adding a finalize write requires upstream consensus on what "final" means inside this surface.
- **Safe next step.** No motion in-repo. The Phase 24 + Phase 25 pair remains the canonical memo workflow; finalize lives in the broader bank workflow.
- **Schema / admin work needed?** Possibly (depends on whether finalize needs a new column or option-set value).
- **Build now / later / deferred.** Deferred until the team decides finalize lives here.

### 1.11 AI / Copilot assist

- **Vibe expected.** Banker types a question; Copilot answers using deal + activity context. Suggests next actions. Drafts memos.
- **Current state.** **Intentionally deferred.** `NOT_WIRED.ai-generation`. Phase 24 truthful-negation banner says "No AI was used to produce this draft."
- **Gap.** Everything Copilot.
- **Blocker.** Lane F (Copilot/AI integration). Needs both technical (Power Platform Copilot Studio or Azure OpenAI binding) AND governance (model-output disclosure, audit trail for AI suggestions, hallucination policy) work.
- **Safe next step.** None in-repo until the team has a model-governance policy. Even a small AI surface needs a per-token audit trail and a "this is AI" disclaimer surface; both are upstream decisions.
- **Schema / admin work needed?** Yes (integration + governance).
- **Build now / later / deferred.** Later (Lane F).

### 1.12 AI voice assist

- **Vibe expected.** Banker speaks to the app; meetings transcribed; voice notes attached to deals.
- **Current state.** **Not started.**
- **Gap.** Everything.
- **Blocker.** Lane F + connector (speech-to-text / Teams meetings).
- **Safe next step.** None in-repo.
- **Schema / admin work needed?** Yes.
- **Build now / later / deferred.** Later.

### 1.13 Document intelligence

- **Vibe expected.** Parse uploaded documents (PFS, tax returns) to extract entities and surface inconsistencies.
- **Current state.** **Not started.** Implicitly blocked because there are no uploads.
- **Gap.** Everything.
- **Blocker.** Lane C (upload schema) THEN Lane F (AI binding).
- **Safe next step.** None in-repo. Wait for both upstream items.
- **Schema / admin work needed?** Yes (both schema and integration).
- **Build now / later / deferred.** Deferred.

### 1.14 Cross-document consistency checks

- **Vibe expected.** Compare numbers across PFS, tax returns, memo, etc.; flag mismatches.
- **Current state.** **Partially operational** (advanced by Phase 73 + Phase 95). Phase 73 shipped a deterministic structured-data consistency review on the Credit Memo card: six pure check types (`deal-name-reference`, `client-name-reference`, `stage-reference`, `loan-amount-reference`, `loan-amount-mismatch`, `collateral-section-empty`) compare the saved memo draft's `textPreview` against the deal's structured fields. **Phase 95** generalized the Phase 73 primitive (narrower structural input types so it can be called from `src/shared/`) and wired it into five additional surfaces: the banker / manager / team autopilot rollups all now fire the Phase 80 `memo-consistency-findings` signal (MEDIUM), and the banker / manager morning-catch-up cards now surface a `memo-consistency-findings` feed item (also MEDIUM) when the check returns one or more findings. Each role surface loads its own scope-authorized memo text + per-deal sections — no permission widening. Local-only (`LOCAL_ONLY_FLOWS.credit-memo-consistency-check`); no Dataverse write; no AI; no approval / credit decision; no automatic blocking; no document parsing.
- **Gap.** Binary-document parsing (PFS, tax returns, term sheet) — needs upload + extraction. AI-driven semantic matching. Cross-document comparisons (memo vs. checklist receipts).
- **Blocker.** Lane C (binary upload schema) for the document slice; Lane F (AI) for semantic matching.
- **Safe next step.** Maintain. Future phase could extend checks to additional structured fields (guarantor structure, pricing margin) without schema work.
- **Schema / admin work needed?** No for further structured-field checks; yes for binary parsing.
- **Build now / later / deferred.** Phase 73 closed the per-deal structured-data slice. Phase 95 extended the same primitive across five rollup + catch-up surfaces. Binary / AI slices remain later.

### 1.15 Regenerate-on-change discipline

- **Vibe expected.** When Dataverse schema changes, the typed SDK is regenerated; the app picks up new fields automatically.
- **Current state.** **Operational** (developer workflow). `pac modelbuilder build` regenerates `src/generated/`. The repo treats `src/generated/` as read-only and reviews the diff during PR.
- **Gap.** No automated trigger; regeneration is a manual developer step.
- **Blocker.** None technical; minor process improvement.
- **Safe next step.** No motion required for capability completeness.
- **Schema / admin work needed?** No.
- **Build now / later / deferred.** Deferred.

### 1.16 Relationship memory

- **Vibe expected.** "What we know about this borrower" persists across deals; banker notes accrue; conversation history surfaces.
- **Current state.** **Partially operational (advanced by Phase 76 + Phase 77 + Phase 78 + Phase 97 + Phase 100 + Phase 101 + Phase 102).** Deal-scoped data only; `cr664_borrowers` has no notes/preferences/contact-history field. Phase 76 added **Relationship Memory Lite** — a deterministic banker-only card on the Banker Command Center that groups the banker's active deals by normalized client name and surfaces a per-client snapshot. **Phase 77** extended the surface into the Deal Workspace: a `<RelationshipContext />` card per banker deal that surfaces the borrower's other already-authorized deals. **Phase 78** layered a local-only banker note-capture surface on top of both cards: a "Draft relationship note" button opens `<RelationshipNoteDraftModal />` with the client + deal context pre-filled; the banker drafts a note + optional follow-up + optional open-asks block, then copies the formatted preview to the clipboard. **Phase 97** added a fourth consumer of the Phase 76/77 primitive — the Phase 96 `<TeamsDealSummaryHandoff />` now threads a one-line relationship-context note (derived from `deriveCrossDealContext` over the banker's already-authorized pipeline) into its `relationshipContextNote` slot. The note is rendered by a pure formatter (`src/shared/relationship/relationshipContextNote.ts`); when the deal has no client name OR no other visible deals share the client-name group, the line is omitted entirely. Phase 97 introduces no new derivation logic; it reuses the existing primitive and inherits its limitations ("client-name grouped", "may not include all related borrowers"). **Phase 100** added a fifth consumer of the primitive — a per-row "Copy Teams summary" button on the Phase 76 `<RelationshipMemory />` card writes a per-client snapshot (display name + UTC date + verbatim "Client-name grouped." + active deal count + pipeline + Phase 76 timeline anchors + conditional Asks block + conditional Attention block + up to 8 active deal lines + verbatim relationship-graph / household / score negations) to `navigator.clipboard`. The Phase 100 formatter (`src/shared/relationship/relationshipMemoryTeamsSummary.ts`) is pure; the inline component runs the same `deriveRelationshipMemory` aggregate the card already renders. Crucially, copying does NOT save relationship notes, open the Phase 78 `<RelationshipNoteDraftModal />`, or mutate the Phase 83 / 90 / 91 ledgers (pinned by a localStorage byte-snapshot test). Copying does NOT create an official relationship record, does NOT imply a verified borrower / entity graph, and does NOT infer householding. Inventoried as `LOCAL_ONLY_FLOWS.relationship-memory-teams-summary-handoff`. **Phase 101** added an Outlook handoff sibling ("Open in Outlook" + "Copy email") per row that emits the same plain-text snapshot via mailto / clipboard. Inventoried as `LOCAL_ONLY_FLOWS.outlook-summary-handoff` (shared with the Phase 98 / 99 surfaces). **Phase 102** added the manager-side counterpart `<ManagerRelationshipMemory />` on the Manager Workspace: a read-only card that runs the same Phase 76 `deriveRelationshipMemory` aggregate over the manager-authorized team pipeline (filtered through the Phase 92 banker-filter for consistency with the sibling autopilot + catch-up cards). Caps at 10 client groups + 5 deal pills per row with honest overflow lines. Deliberately read-only: no Teams / Outlook handoff button on the manager surface — the manager view is for cross-banker awareness, not client solicitation. Same client-name-grouped limitation markers ("not a verified relationship graph", "not a household linkage", "not a relationship score") render verbatim. No Dataverse write, no audit row, no timeline event, no governed write across any of these phases. Conservative copy is explicit on every surface: "client-name grouped", "may not include all related borrowers", "not a verified relationship graph", "not a household linkage", "not a relationship score", "no predictive claim". Phase 78 modal renders the verbatim disclaimer "Local draft. Not saved to the system. Paste into the appropriate system of record." in both the visible banner and the copied draft footer. Inventoried as `LOCAL_ONLY_FLOWS.relationship-note-draft` (Phase 78) and as the Phase 97 extension of `LOCAL_ONLY_FLOWS.teams-deal-summary-handoff` (Phase 96 row, updated). No AI, no graph, no cross-borrower deduplication, no household linkage.
- **Gap.** Cross-deal banker notes that accrue per-borrower; verified borrower entity id; conversation/contact-history; cross-borrower deduplication; relationship graph table; Outlook/Teams activity ingestion; AI-assisted relationship briefs.
- **Blocker.** Schema (new entity or extended borrower record) + governance (privacy / consent) for the persistent-notes slice; Lane E (Teams/Outlook) for contact-history; Lane F (AI) for relationship briefs.
- **Safe next step.** Lane A: a banker-only "relationship notes" capture (Phase-23-style LOCAL_ONLY flow — generate-and-copy notes the banker maintains in their own system) layered on top of the Phase 76 client-keyed view. Real cross-borrower memory still requires new schema.
- **Schema / admin work needed?** No for further derivation extensions; yes for persistent notes / verified borrower entity id.
- **Build now / later / deferred.** Phase 76 closed the in-repo derivation slice; Phase 97 extended its reuse to the Teams deal-summary handoff; Phase 100 added a per-client Teams handoff on the Phase 76 card itself; Phase 102 added the manager-workspace parity card. Further extensions (notes capture, contact-history, AI briefs) are later.

### 1.17 Deal autopilot

- **Vibe expected.** App suggests next actions; auto-progresses tasks; nudges bankers.
- **Current state.** **Partially operational (advanced by Phase 80 + Phase 81 + Phase 82 + Phase 83 + Phase 84 + Phase 87 + Phase 95).** **Phase 80** shipped the per-deal Next Best Actions panel on the Banker Deal Workspace (8 signals; top 3 per deal; `isAutomated: false` typed). **Phase 81** extended to a team-level rollup on the Manager Command Center. **Phase 82** added the banker-side counterpart on the Banker Command Center. **Phase 84** added the team-workspace counterpart on the Team Command Center. **Phase 87** then broadened the manager rollup itself by loading manager-authorized child data (open tasks, document checklist rows with `status` discriminant, credit memo status) scoped by the parent deal's team. **Phase 95** added the 8th signal — `memo-consistency-findings` — to the three rollup surfaces and the two morning-catch-up surfaces by loading memo text previews + per-deal draft sections in each role's scope-authorized loader and routing them into the Phase 73 deterministic consistency check. Four rollup surfaces now consume the same `deriveNextBestActions` derivation with full 8/8 parity: per-deal (banker), team rollup (manager), personal rollup (banker), team rollup (team workspace). **Phase 83** added a local-only suggestion ledger that lets the user mark individual suggestions as "Dismissed locally" or "Opened locally" — state lives in `localStorage` under `cc:autopilotSuggestionLedger:v1` and the Phase 83 ledger surface union includes `team-rollup` (Phase 84). Dismissing does NOT resolve the underlying deal item; the same rule still fires; the ledger only changes how the suggestion is rendered ("Dismissed locally · tracked on this browser · Restore"). Inventoried as `LOCAL_ONLY_FLOWS.autopilot-suggestion-ledger`. No write, no audit, no sync. No AI on any of the seven phases.
- **Gap.** Write-capable autopilot (auto-create-task with banker confirmation; auto-advance-stage); AI-assisted explanations of WHY each suggestion fired; Teams notifications when a high-priority signal appears; a suggestion ledger so accept/reject feedback can refine the rules.
- **Blocker.** Stage progression remains DELIBERATELY_BLOCKED (§1.26). Auto-create-task is the closest write extension — same shape as Phase 70's `deal-document-review-task-create` but triggered from autopilot instead of from a per-row button. AI explanations are Lane F. Teams notifications are Lane E.
- **Safe next step.** A Phase-21-style governed write to create a task from a "Next best action" with explicit banker confirmation. Add a suggestion ledger (LOCAL_ONLY or new entity) to record which suggestions the banker actioned vs ignored, so a future rule-tuning phase has data.
- **Schema / admin work needed?** No for further derivation extensions; yes for the suggestion ledger and for write-capable autopilot.
- **Build now / later / deferred.** Now (derivation slice — delivered by Phase 80). Later (write-capable extensions; AI-assisted explanations).

### 1.18 Activity intelligence

- **Vibe expected.** Smart summaries of deal activity; "what changed since you last looked"; trend lines.
- **Current state.** **Partially operational** (advanced by Phase 72 + Phase 80 + Phase 82 + Phase 83 + Phase 87 + Phase 88 + Phase 89 + Phase 90 + Phase 91 + Phase 92 + Phase 95 + Phase 98 + Phase 99 + Phase 101). Phase 25+ timeline ledger exists. Phase 72 shipped a rule-based "activity since last visit" surface on the Activity Timeline card. **Phase 80** added a stale-activity signal to the per-deal autopilot panel. **Phase 82** extends the same signal to the personal banker rollup. **Phase 83** added a local-only suggestion ledger so the user can track "opened" / "dismissed" state per suggestion across the three Autopilot surfaces — local interaction memory for activity-intelligence-style features, without claiming AI learning or cross-device sync. **Phase 87** broadened the manager rollup's activity-driven coverage by loading manager-scoped child data; the manager surface now fires the same overdue-tasks / outstanding-documents / pending-review-documents / draft-memo / stale-activity signals the banker / team rollups fire. **Phase 88** added a deterministic "Morning catch-up" feed on the Manager Command Center built on top of the Phase 87 child data — an observation-style surface (multiple rows per deal, including data-quality items "missing stage" / "missing assigned banker" + "task due soon" + "newly received document") complementary to the action-style autopilot rollup. **Phase 89** added the banker-side counterpart `<BankerMorningCatchUp />` via a thin adapter that delegates to the Phase 88 primitive — the morning-feed half of activity intelligence is now shipped on both operating workspaces (manager + banker). **Phase 90** layered the Phase 72 last-visit pattern onto BOTH catch-up cards: a per-user-per-surface `localStorage` marker is snapshotted on mount, bumped after a 2-second settle, and used to render a "N new since your last visit on this browser" line and a per-item "New" badge. Items with future-anchored `occurredAt` (e.g. closing-soon based on a future targetCloseDate) are never marked "new" — only past-anchored items that crossed the marker since the user last looked. **Phase 94** added a "Mark all seen" button next to the count line that bumps the marker to `now` immediately (no 2-second wait); button surfaces only when the marker scope is available AND there are visible new items. Local-only; no Dataverse write; no official unread state. **Phase 91** added per-item dismiss / snooze locally via a sibling Phase-83-style local ledger (`cc:catchUpItemLedger:v1`, action enum `dismissed | snoozed`, default 24-hour snooze window). Snoozed items are filtered from the visible feed until snoozeUntil passes, then reappear naturally; dismissed items remain visible muted with a Restore affordance. The ledger entry only changes how the row renders — the underlying deterministic derivation continues to evaluate against current records and the item resurfaces unchanged after Restore or snooze expiry. Honestly disclaimed: local-only, no cross-device sync, no notification delivery, does NOT create official unread / acknowledged state, does NOT resolve any business item. **Phase 92** added a manager banker-filter that narrows the autopilot rollup and morning catch-up cards (manager surface) to one banker's deals — pure UI/state, no persistence; the Phase 90 marker and Phase 91 ledger continue to apply by stable item key. **Phase 95** added a 12th catch-up item kind, `memo-consistency-findings` (MEDIUM), to both morning-catch-up cards: when a deal has memo text and / or per-deal draft sections, the Phase 73 deterministic consistency check runs and surfaces one feed item per deal when one or more findings come back. Same observational phrasing ("banker review recommended"); no AI; no document parsing; no permission widening. **Phase 98** layered the no-admin Teams handoff pattern onto both morning-catch-up cards: a "Copy Teams summary" button writes a plain-text catch-up summary (surface label + date + visible-item count + Phase 90 since-last-visit context + up to 8 top items as `- [PRIORITY] DealName — Title: Reason`, with `(Banker: <ownerName>)` appended on the manager surface) to `navigator.clipboard`. The banker / manager pastes it into Teams in their own client; the app does not post, send, sync, or notify. Critically, copying does NOT mutate the Phase 90 last-seen marker, the Phase 91 dismiss / snooze ledger, or invoke the Phase 94 mark-all-seen action — items are not marked seen / dismissed / snoozed / resolved by the copy click. **Phase 99** extended the same no-admin Teams handoff pattern to the per-deal Activity Timeline card: an inline "Copy Teams summary" button on `<ActivityTimeline />` writes a deal-scoped activity digest (deal name + UTC date + total event count + Phase 72 since-last-visit context + up to 8 most recent events with UTC timestamps, event type, title, summary, banker-friendly source label, and actor) to `navigator.clipboard`. Copying does NOT mutate the Phase 72 last-visit marker — activity is not marked seen by the copy click; a localStorage byte-snapshot test pins this. Inventoried as `LOCAL_ONLY_FLOWS.catch-up-teams-summary-handoff` (Phase 98) and `LOCAL_ONLY_FLOWS.activity-timeline-teams-summary-handoff` (Phase 99). **Phase 101** adds an Outlook handoff sibling ("Open in Outlook" + "Copy email") to both surfaces, reusing the Phase 63 mailto + clipboard primitives over the same plain-text body. Inventoried as `LOCAL_ONLY_FLOWS.outlook-summary-handoff`. Still deterministic, still read-only, still no push / real-time / Graph claim.
- **Gap.** AI summarization; trend extraction; cross-device sync.
- **Blocker.** Lane F (AI) for summarization / trend; schema + tenant work (user-preference entity) for cross-device sync.
- **Safe next step.** Maintain the Phase 72 marker. Future phase could add an explicit "Mark viewed" button or extend the marker to other surfaces (My Work Queue, BorrowerCommunication, etc.). AI summarization stays Lane F.
- **Schema / admin work needed?** No for further local-only extensions; yes for cross-device sync.
- **Build now / later / deferred.** Phase 72 closed the largest in-repo slice; Phase 98 added a no-admin Teams handoff for the catch-up feed itself; Phase 99 added the same handoff for the per-deal Activity Timeline. Further extensions later.

### 1.19 Performance scoring

- **Vibe expected.** Banker / team / deal scoring against KPI thresholds; rolled up to manager and exec.
- **Current state.** **Partially operational** (advanced by Phase 71 + Phase 75). KPI threshold configuration exists (`cr664_kpithresholdconfigurations`); profitability snapshots feed executive surfaces; Phase 15 transitional fallback marks `PipelineByStage` and `MonthlyClosingForecast` as transitional. Phase 71 added deterministic per-banker / per-team derived analytics (stage aging + pipeline mix on manager workspace; per-banker workload breakdown on team workspace). **Phase 75** added the banker-side counterpart: a personal activity / workload snapshot on the banker workspace covering pipeline shape, time-sensitive attention signals, work-item counts, document attention, and draft memos. All three surfaces explicitly disclaim "score" / "ranking" / "predictive" / "compensation" language.
- **Gap.** Connector-backed performance signals (Teams presence; activity logs from external systems); AI-derived insight.
- **Blocker.** Lane E (Teams) for some signals; Lane F (AI) for insight.
- **Safe next step.** Maintain. Future phase could extend the derivations with more dimensions (e.g. velocity, win rate) once Phase 56-era close/won tracking lands.
- **Schema / admin work needed?** No for further derivation; Lane B/E/F for the connector-backed slice.
- **Build now / later / deferred.** Phase 71 + Phase 75 closed the in-repo slice across all three role workspaces. Further extensions are later.

### 1.20 Alert queue

- **Vibe expected.** Centralized alert backlog with severity, owner, resolution path.
- **Current state.** **Operational.** Phase 19 `alert-resolve` / `alert-dismiss` governed writes. AlertBacklog card on admin surface. Critical alerts block Release Readiness Gate.
- **Gap.** None critical.
- **Blocker.** None.
- **Safe next step.** Maintain.
- **Schema / admin work needed?** No.
- **Build now / later / deferred.** N/A (operational).

### 1.21 Data quality diagnostics

- **Vibe expected.** Surface data anomalies; let admin acknowledge / resolve.
- **Current state.** **Operational.** Phase 18 `data-quality-flag-resolve` governed write. Open-flag count rolled into Release Readiness Gate.
- **Gap.** None critical.
- **Blocker.** None.
- **Safe next step.** Maintain.
- **Schema / admin work needed?** No.
- **Build now / later / deferred.** N/A.

### 1.22 Manager workspace

- **Vibe expected.** Manager sees their team's deals; can review without editing.
- **Current state.** **Operational** (Phase 36 + Phase 71 + Phase 81 + Phase 87 + Phase 88 + Phase 90 + Phase 91 + Phase 92 + Phase 93 + Phase 95 + Phase 98 + Phase 101 + Phase 102). Team-scoped read-only via `loadDealForManager`. Four write-capable cards render with `readOnly=true`. Phase 71 added the `ManagerActivitySummary` card surfacing stage aging + pipeline mix derivation. **Phase 81** added the `<ManagerAutopilotRollup />` card. **Phase 90** layered a local-only "since your last visit on this browser" overlay onto `<ManagerMorningCatchUp />` (per-user-per-team marker keyed as `manager:<bankerId>:<teamId>`; honest first-visit + unscoped fallback states; no cross-device sync; no official unread state). **Phase 91** added per-item Dismiss locally / Snooze 24h / Restore controls on the same card via a sibling Phase-83-style local ledger; the controls change row rendering only, never change deal status. **Phase 92** added a manager banker-filter that threads a `matchesDeal` predicate into the autopilot rollup and morning catch-up cards. **Phase 93** persists the Phase 92 filter selection locally (`cc:managerFilterSelection:v1` scoped by `manager:<bankerId>:<teamId>`) so the focused-banker view survives refresh/navigation on the same browser. Validation against current options on restore — stale selections (banker no longer has deals; Unassigned no longer applies) fall back silently to All team. No Dataverse write, no audit, no cross-device sync, and explicitly NOT an official manager profile setting. The control's helper text states the local-only posture verbatim. Other manager cards (TeamPipelineSummary / DealsByStage / ClosingForecast / AtRiskBlockedDeals / BankerWorkloadSummary / ManagerActivitySummary / TeamWorkQueue) intentionally remain unfiltered. **Phase 87** broadened the manager autopilot rollup itself: `ManagerDataProvider` now fires three new manager-scoped child loaders in parallel (`loadManagerTeamTasks` / `loadManagerTeamDocuments` / `loadManagerTeamMemos`), each filtering by the parent deal's `_cr664_team_value` via the same OData navigation-property pattern the team workspace uses. The new collections are routed into an extended `ManagerRollupInput` (optional task / document / memo arrays — Phase 81 callers continue to work unchanged) and the manager rollup now fires the same 7-of-8 Phase 80 signals as the banker (Phase 82) and team (Phase 84) rollups: overdue-tasks, pending-review-documents, closing-soon-stale-activity, closing-soon, stage-aging, outstanding-documents, draft-memo, stale-activity. The `memo-consistency-findings` signal remains silenced (memo loader pulls status only; sections needed); same gap banker/team rollups carry. **Phase 88** added the `<ManagerMorningCatchUp />` card on top of the same Phase 87 child data — a deterministic "what changed / what needs attention" feed that surfaces 12 item kinds (Phase 95 added `memo-consistency-findings`; the original 11 are overdue-task, task-due-soon, pending-review-document, newly-received-document, outstanding-documents, draft-memo, stage-aging, closing-soon, stale-activity, missing-stage, missing-assigned-banker). Complementary to the autopilot rollup: autopilot says "what to do next per deal"; the catch-up feed says "what happened across the team / what needs attention", with multiple rows possible per deal including data-quality items. **Phase 98** layered a "Copy Teams summary" button on this card (and on the banker counterpart) that writes a plain-text feed summary (surface label + date + visible-item count + Phase 90 since-last-visit context + up to 8 top items with `(Banker: <ownerName>)` ownership suffix on the manager surface) to `navigator.clipboard`. Local-only handoff — no Graph, no post, no notification — and the click does NOT mutate the Phase 90 marker / Phase 91 ledger / Phase 94 mark-all-seen. **Phase 101** added an Outlook handoff sibling ("Open in Outlook" + "Copy email") on the manager catch-up card that emits the same plain-text summary via mailto / clipboard. **Phase 102** added a manager-side `<ManagerRelationshipMemory />` card alongside the autopilot rollup + morning catch-up: same Phase 76 `deriveRelationshipMemory` aggregate, scoped to the manager's team pipeline, honoring the Phase 92 banker filter for symmetry. Read-only — no copy-to-Teams or Outlook handoff button on this surface (cross-banker awareness, not solicitation). Caps at 10 client groups + 5 deal pills per row with honest overflow lines. No new query shape.
- **Gap.** Trend lines over time (would need time-series storage); banker velocity / win-rate (would need historic stage transition data).
- **Blocker.** Schema-side (no time-series store) for trend lines.
- **Safe next step.** Maintain. A future phase could add a manager-side suggestion ledger filter (per-banker / per-priority views), or invest in trend-line storage when the schema lands.
- **Schema / admin work needed?** No for what's shipped; yes for time-series.
- **Build now / later / deferred.** Phase 71 + 81 + 87 + 95 closed the primary in-repo gaps; Phase 98 + 101 added the no-admin Teams + Outlook handoff for the catch-up feed; Phase 102 added the Relationship Memory parity card. Later for time-series.

### 1.23 Team workspace

- **Vibe expected.** Team members see deals they touch.
- **Current state.** **Operational** (Phase 37 + Phase 84 + Phase 95). Same team-scoped read-only as manager. **Phase 84** added the `<TeamAutopilotRollup />` card to the team workspace — a deterministic shared-pipeline rollup of Phase 80 Next Best Actions across team deals (HIGH/MEDIUM/LOW deal counts, top 5 deals with their top suggestion, assigned-banker / stage / target-close meta, read-only click-through to the deal). Reuses the Phase 82 banker derivation. **Phase 95** added memo `textPreview` + per-deal sections to the team-scoped loaders so the team rollup now fires all 8 Phase 80 signals (closing the previous `memo-consistency-findings` gap). The card uses the Phase 83 suggestion ledger surface `team-rollup`; the surface union was extended for Phase 84.
- **Gap.** Tighter "deals you touch" scoping (Phase 37 doc flagged this) — currently shared with manager scope.
- **Blocker.** Governance + schema decision on what "you touch" means.
- **Safe next step.** Deferred until the scope decision lands.
- **Schema / admin work needed?** Possibly.
- **Build now / later / deferred.** Phase 84 closed the autopilot-parity gap. The "deals you touch" scoping gap is still deferred.

### 1.24 Executive / Board workspace

- **Vibe expected.** Snapshot-only KPI roll-ups; pipeline health; portfolio mix.
- **Current state.** **Partially operational.** Phase 15 + transitional fallback for `PipelineByStage` + `MonthlyClosingForecast`. Executive surfaces are snapshot-safe by design (no live data, no deal drill-through).
- **Gap.** Snapshot entities for the two transitional features.
- **Blocker.** Schema — snapshot entities don't exist yet.
- **Safe next step.** Lane G-adjacent (snapshot schema is a separate ask from stage schema). For now, the transitional fallback is honestly labelled.
- **Schema / admin work needed?** Yes.
- **Build now / later / deferred.** Later.

### 1.25 Admin configuration

- **Vibe expected.** Admin can view + edit system configuration (KPI thresholds, system settings).
- **Current state.** **Operational.** Phase 17 admin workspace. System settings + KPI threshold configurations are loadable. Phase 30 Release Readiness Gate + Phase 68 Capability Inventory surface inventory data read-only.
- **Gap.** Edit affordances for system settings (today read-only). Would require new governed writes.
- **Blocker.** Governance — each editable setting needs its own governed-write coordination.
- **Safe next step.** No motion required. Add per-setting governed writes only when a brief asks for that specific surface.
- **Schema / admin work needed?** No.
- **Build now / later / deferred.** Deferred.

### 1.26 Stage gates / stage progression

- **Vibe expected.** Stages: Application → Underwriting → Approval → Closing → Active → Closed. Banker advances stage with a governed write when criteria met.
- **Current state.** **Partially operational.** Stage display works (Phase 27/29/41/43). Stage Catalog is canonical (`STAGE_CATALOG`). Stage governance diagnostics card (Phase 29). **Advance Stage write is `DELIBERATELY_BLOCKED.stage-progression-advance`.**
- **Gap.** The Advance Stage governed write.
- **Blocker.** Schema (Lane G): `Cr664_stagereferences` not registered as a Power Apps data source; no sequence/order field exposed. See [docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md).
- **Safe next step.** No motion in-repo. The enablement map enumerates exactly what schema needs to land.
- **Schema / admin work needed?** Yes (Lane G).
- **Build now / later / deferred.** Soon-ish (smaller schema ask than borrower portal; concrete unblock plan exists).

### 1.27 Reporting / portfolio analytics

- **Vibe expected.** Pipeline by stage, monthly closing forecast, deal velocity, banker leaderboards.
- **Current state.** **Partially operational.** Executive surfaces ship today; some on transitional fallback (1.24).
- **Gap.** Same as 1.19 + 1.24.
- **Blocker.** Schema for snapshot entities.
- **Safe next step.** Lane A: derive per-banker / per-team analytics from existing `cr664_loandeals` rows (manager workspace extension).
- **Schema / admin work needed?** Schema for full version; no for derivation.
- **Build now / later / deferred.** Now (derivation slice).

### 1.28 Accessibility / theme support

- **Vibe expected.** WCAG-compliant; dark/light theme; keyboard nav; screen-reader labels.
- **Current state.** **Partially operational (advanced by Phase 74 + Phase 79).** A custom theme system (`palette`, `radius`, `spacing`, `typography`) exists. Severity-aware badges (`Badge`, `StatusDot`). Modal patterns use `role="dialog"` + `aria-modal` + `aria-labelledby`. Phase 74 audited the Phase 51–73 operational surfaces and applied targeted fixes (outcome `role="status"`/`role="alert"`, `aria-required` + `aria-describedby` on required form fields, `Badge` `aria-label` forwarding). **Phase 79** added the dark-theme token foundation: every banker-visible color the app paints flows through a `--cc-*` CSS variable declared in `src/index.css`, with both a light `:root` declaration and a dark declaration (gated on `prefers-color-scheme: dark` AND `:root[data-theme="dark"]` so a future explicit toggle can override OS preference). The semantic palette (red blocked / amber at-risk / green clear / blue info / gray neutral / navy primary) is preserved across themes — dark-mode values are lightened/desaturated for legibility, not redefined. `color-scheme` is declared in both contexts so native form controls follow. The existing `palette` JS export now references CSS variables, so existing inline styles (`style={{ color: palette.text }}`) follow the active theme with zero consumer change. Conservative-copy discipline preserved — no "failed/invalid/approved" wording introduced.
- **Gap.** User-selectable theme setting (settings UI + persistence); high-contrast palette; color-blind-safe palette; formal WCAG contrast-ratio static test against the theme tokens; tested keyboard-nav consistency across long-running tab cycles; formal screen-reader path audit (NVDA/JAWS/VoiceOver runs).
- **Blocker.** None technical. User-selectable theme persistence wants schema (`cr664_userpreference` or similar) AND a settings UI. Color-blind-safe palette requires palette-vetting work.
- **Safe next step.** Lane A: high-contrast palette as a third theme (declared under `[data-theme="high-contrast"]`) and a settings UI gated on a future preference entity. Lane B/F: optional WCAG contrast-ratio static test against the theme tokens.
- **Schema / admin work needed?** No for further visual extensions; yes for persisted user preference.
- **Build now / later / deferred.** Now (more themes via the Phase 79 token foundation). Later (formal screen-reader path audit; user-selectable persistence).

### 1.29 Audit / governance

- **Vibe expected.** Every write writes to a privileged audit ledger; correlation ids tie audit rows to timeline rows; outcomes are discriminated unions.
- **Current state.** **Operational** and deeply test-pinned. Phases 18–25 wrote the audit + timeline infrastructure. Phases 46–50 added the inventory-driven discipline sweeps (correlation-id, outcome-union, audit payload, timeline payload, conservative copy). Phase 67 added the 10th governed write. Phase 68 added the Capability Inventory display.
- **Gap.** None critical. Future governed writes inherit the discipline automatically.
- **Blocker.** None.
- **Safe next step.** Maintain. New governed writes go through the existing discipline sweep tests.
- **Schema / admin work needed?** No.
- **Build now / later / deferred.** N/A.

---

## 2. "Do not forget" — high-risk capability reminders

The Vibe scope is wide. These are the capabilities most likely to
be missed by a phase brief that focuses on what's already
operational. Each one-liner restates the current honest state so
nothing slides off the roadmap:

- **Microsoft Copilot / AI Assist** — `NOT_WIRED.ai-generation` (governance). Phase 24 truthfully says "No AI was used." Lane F.
- **Microsoft Teams embedded workflow** — Not started. Lane E.
- **Outlook send / logging** — DRY_RUN simulates; LIVE is a permanent-failure stub (Phase 62 connector not registered); HANDOFF (Phase 63) is operational. Lane B.
- **Teams calendar sync** — Not started. Lane E.
- **Borrower portal** — `NOT_WIRED.borrower-portal` (compound). Phase 65 deferral pinned with structural tests. Lane D.
- **Borrower upload** — `NOT_WIRED.document-upload` (schema: File column missing). Lane C.
- **Relationship memory** — Not started. Schema-blocked for the real version. Lane A can ship a banker-only stop-gap.
- **Deal autopilot** — Not started. Lane A can ship a derivation-only slice; full version is Lane F.
- **Document intelligence** — Not started; implicit Lane C + Lane F dependency.
- **Activity intelligence** — Partially operational (ledger exists; summarization doesn't). Lane A can ship rule-based; Lane F for AI.
- **Performance scoring** — Partially operational (Phase 15 + thresholds). Lane A derivation extension is low-risk.
- **Manager analytics** — Same as performance scoring. Lane A.
- **Executive board-safe snapshots** — Partially operational; two surfaces on transitional fallback. Schema-adjacent.
- **Admin diagnostics** — Operational (Phase 30 + Phase 68). Maintain.

---

## 3. Roadmap by lane

Lanes group future phase candidates by what they need from
outside this repo. A phase brief can pick any item from Lane A
without upstream blockers; Lanes B–G are gated on the respective
upstream change.

### Lane A — No-admin app-side work available NOW

**Phase 103 status: substantially complete.** Every Lane A
candidate listed below shipped between Phases 70 and 102. Further
Lane A work is paused until a real product need surfaces or an
upstream lane unlocks. See
[PHASE_103_PRODUCT_CHECKPOINT.md](PHASE_103_PRODUCT_CHECKPOINT.md)
§4 for the per-candidate phase mapping and §5 for the explicit
"do not build more in-repo right now" list.

The shortest path to incremental Vibe coverage without any
upstream dependency. Ranked by current operational leverage:

1. **Stale Pending-Review Escalation (Phase 54 → governed reassignment write).** Becomes the 11th `GOVERNED_WRITES` entry; reuses Phases 46–50 discipline sweeps. Visible to bankers + managers immediately.
2. **Per-banker / per-team derived analytics (manager workspace + executive).** Read-only derivation from existing `cr664_loandeals` rows. Closes part of capability §1.19 + §1.22.
3. **Activity since last visit (rule-based).** Local-storage last-seen timestamp + derived timeline diff. Closes part of capability §1.18.
4. **Structured-data credit-memo consistency check.** Compare saved memo fields against deal fields (amount, stage, etc.). No AI. Closes part of capability §1.14.
5. **Accessibility audit + targeted fixes.** Closes capability §1.28.
6. **Multi-deal borrower-safe packet** (extension of Phases 66/67). Banker selects a borrower; packet covers their portfolio. Stays LOCAL_ONLY.
7. **Capability Inventory mirror in `STABILIZATION_CHECKLIST.md`.** Phase 68 ships the in-app view; mirror the same data in the standing docs for external readers.
8. **Banker-only relationship notes card (LOCAL_ONLY).** A Phase-23-style draft surface — banker maintains notes off-app; the app surfaces a structured editor + Copy. Stop-gap for capability §1.16.

### Lane B — Outlook connector registration (**RELEASE-LOCKED through Phase 110**)

Upstream action (Power Platform admin: register the Office 365
Outlook connector for this Code App) — **completed for `SendEmailV2`**
in Phase 104. Both outbound governed writes have shipped. The full
lane is consolidated and release-locked by Phase 110; see
[docs/PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md).

**Closed at release (Phases 104–110):**

1. ~~Phase 62 §2 swap — flip `liveAdapter.send` from permanent-failure to typed `Office365OutlookService.SendEmailV2` call.~~ **Done in Phase 104.** See [docs/PHASE_104_OUTLOOK_LIVE_SEND.md](PHASE_104_OUTLOOK_LIVE_SEND.md).
2. ~~`NOT_WIRED.outlook-connector-live-send` removal.~~ **Done in Phase 104.**
3. ~~`NOT_WIRED.email-delivery` (borrower-update outbound) — separate governed-write phase using the same adapter.~~ **Done in Phase 105.** See [docs/PHASE_105_BORROWER_UPDATE_LIVE_SEND.md](PHASE_105_BORROWER_UPDATE_LIVE_SEND.md). New governed write `deal-borrower-update-email`; `BorrowerUpdateSent` (788190014) timeline event type used. `NOT_WIRED.email-delivery` retired.
4. ~~Operator-safety regression pin for `VITE_EMAIL_MODE=LIVE`.~~ **Done in Phase 106.** See [docs/PHASE_106_EMAIL_MODE_RELEASE_READINESS.md](PHASE_106_EMAIL_MODE_RELEASE_READINESS.md). Six invariants pinned at CI.
5. ~~Activity-evidence regression pin for the two completed governed writes.~~ **Done in Phase 107.** See [docs/PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md](PHASE_107_COMMUNICATION_ACTIVITY_LEDGER.md). 49 governance-evidence assertions + 12 narrow `<BorrowerCommunication />` rendering assertions.
6. ~~Post-send activity refresh for the borrower-update path.~~ **Done in Phase 108.** See [docs/PHASE_108_BORROWER_UPDATE_REFRESH.md](PHASE_108_BORROWER_UPDATE_REFRESH.md). New `'after-borrower-update-email'` `DealDataKey` + parent-side wrapper in `BorrowerCommunication.tsx`. No new send path.
7. ~~Operator smoke-test harness for LIVE Outlook email mode.~~ **Done in Phase 109.** See [docs/PHASE_109_EMAIL_LIVE_SMOKE_TEST.md](PHASE_109_EMAIL_LIVE_SMOKE_TEST.md). New `<EmailLiveDiagnostics />` admin card; explicit operator-triggered smoke send reusing `getEmailAdapter()` (no new `SendEmailV2` callsite). No governed write, no audit row, no timeline row.
8. ~~Final release lock — consolidated boundary evidence + future-work scoping.~~ **Done in Phase 110.** See [docs/PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md](PHASE_110_COMMUNICATION_LANE_RELEASE_LOCK.md). 134-assertion lock file at `src/shared/governance/communicationLaneReleaseLock.test.ts` enforces modal-layer adapter isolation, smoke-test Dataverse isolation, broader payload-field + wording pins across the communication lane, and lane-wide forbidden-pattern scans for shared mailbox / Graph / calendar / inbound / subscription / scheduled / delivery-tracking surfaces.

---

**Lane B future-work candidates (NOT roadmap; forbidden at CI time
by the Phase 110 lock).** Each item below requires its own brief,
its own governance review, and its own pin file before any
in-repo motion. Listing is reverse-priority order — these are
ranked by how disruptive they would be to the current honest
posture, not by how desirable they are.

9. Borrower portal messaging — two-way thread; borrower-readable inbox; status updates. Requires Lane D compound (external-user auth + secure-message schema + invitation/magic-link table). Would land in a NEW Code App, not this repo (workspace-isolation invariant).
10. Inbound email logging — `EmailLogged` rows from connector callbacks; borrower replies appear on the deal timeline. Requires Power Automate or callback pattern + governance review for "incoming-mail visibility scope". Hybrid Lane B + Lane E phase.
11. Automated outbound triggers — scheduled or event-driven borrower notifications (reminders for outstanding documents, pending review, stale stage). Requires governance review for "the app independently sending borrower mail" + a scheduler. New governed write per trigger + new audit shape for "system-initiated send".
12. Delivery / read tracking — operators see whether a recipient opened / received the message. Requires connector callback for delivery receipts + governance review for tracking-pixel discipline. New schema column + new outcome enum value.
13. Shared mailbox support — send-from a team mailbox instead of the banker's UPN. Requires tenant config + connector permission grant + governance review for "who is the audit `ChangedBy`". Currently forbidden field (`From`) on the Phase 110 payload pin.
14. Phase 101 email LIVE delivery — catch-up / activity / relationship summaries sent through `SendEmailV2` instead of copy-to-clipboard. Requires governance review for "summary surfaces don't have a typed governed write today" + either four new governed writes or one generic "summary email send" with a strict source-classification field.
15. Optional calendar-half connector registration — separate connector operations + governance step to unblock the calendar half of capability §1.8.

### Lane C — Needs File column / upload schema

Upstream: add a File column on `cr664_DocumentChecklist` and regenerate the SDK.

1. Binary document upload (closes `NOT_WIRED.document-upload`).
2. File preview / download.
3. Mark-received UX upgrade (button switches from metadata-only to "Upload to receive").
4. Pre-requisite for Lane D borrower-upload.

### Lane D — Needs borrower auth / token schema (compound)

The hardest lane. Full unblock checklist in [PHASE_65](PHASE_65_BORROWER_PORTAL_DEFERRAL.md) §4.

1. External-identity provider decision (External Identities / Entra guest invitations / external IdP).
2. Invitation-token table or external-identity sign-up flow.
3. External-user role in `workspaceRoutes.ts` + entitlement chain.
4. `BorrowerSafe` value on `cr664_DealTimelineEvent.cr664_visibilityscope` (schema).
5. `Borrower` value on `cr664_AuditEvent.cr664_entitytype` (schema).
6. Optional secure-message entity (or repurpose timeline events).
7. Then ship a separate borrower-portal Code App (not in this repo — workspace-isolation invariant).
8. Plus Lane C File column (uploads).

### Lane E — Needs Teams integration

Full audit in [PHASE_85](PHASE_85_TEAMS_INTEGRATION_READINESS_AUDIT.md). The Lane E shopping list:

1. Teams app registration in tenant.
2. Graph permissions for deal context (admin consent + delegated grants: `User.Read.All`, `Presence.Read.All`, `Chat.ReadWrite`, `ChannelMessage.Send`, `Calendars.ReadWrite`, `OnlineMeetings.ReadWrite`, `TeamsActivity.Send`).
3. Teams calendar sync (Graph calendar).
4. Teams notifications (deal-state callbacks).
5. Teams embedded workflow (deals visible inside Teams chat).
6. Voice / meeting capture (Lane E + Lane F).
7. `@microsoft/teams-js` + `@microsoft/microsoft-graph-client` + `@azure/msal-browser` package additions; Teams app `manifest.json` in repo; sideload to Teams Admin Center.

One **no-admin slice** identified by Phase 85 §4 Candidate A IS in-repo feasible without any of the above: the Teams chat deep-link handoff card (Phase 63 pattern applied to Teams). Phase 86 candidate.

### Lane F — Needs Copilot / AI integration

1. Model-governance policy (audit trail for AI suggestions; per-token disclosure; hallucination policy).
2. Power Platform Copilot Studio binding OR Azure OpenAI endpoint registration.
3. Document intelligence (Lane C + Lane F).
4. AI-assisted memo drafting (replacing Phase 24's deterministic generator with an opt-in AI mode; Phase 24's "No AI was used" banner becomes opt-in disclosure).
5. AI voice assist.
6. Cross-document consistency (AI version).
7. Activity intelligence (AI version).
8. Deal autopilot (write-capable suggestion engine).

### Lane G — Needs stage reference schema

Concrete unblock plan in [docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md](STAGE_PROGRESSION_ENABLEMENT_MAP.md).

1. Register `Cr664_stagereferences` as a Power Apps data source.
2. Add a sequence / order field on the loan deal record or system settings.
3. Then ship the Advance Stage governed write (closes `DELIBERATELY_BLOCKED.stage-progression-advance`).

---

## 4. Top recommended next phases (in priority order)

Synthesizing the lanes above:

1. **Phase 70 — Stale Pending-Review Escalation (11th GOVERNED_WRITES entry).** Lane A. Single best in-repo phase that delivers visible banker value AND closes a Vibe capability gap (deal autopilot derivation slice). Reuses the Phase-21 + Phase 67 pattern.
2. **Phase 71 — Per-banker / per-team derived analytics.** Lane A. Closes the largest Vibe gap (performance scoring + manager analytics) without schema or admin work.
3. **Phase 72 — Activity-since-last-visit (rule-based).** Lane A. Closes the activity-intelligence gap without AI.
4. **Phase 73 — Structured-data credit-memo consistency check.** Lane A. Closes the cross-document-consistency gap without AI.
5. **Phase 74 — Accessibility audit + targeted fixes.** Lane A. The only Vibe capability that hasn't been a phase brief yet; lowest political risk.
6. **(Awaiting upstream — track but don't start)** — File column (Lane C); stage reference schema (Lane G). Each unblocks an existing `NOT_WIRED` / `DELIBERATELY_BLOCKED` entry with a known in-repo follow-up phase already documented. Lane B is now mostly closed — Phase 104 wired LIVE document-request send and Phase 105 wired LIVE borrower-update send. Residual Lane B (inbound mail / automation / calendar) needs governance review before any in-repo motion.
7. **(Long-horizon — track but don't start)** — Borrower portal (Lane D); Teams (Lane E); Copilot (Lane F).

The priority order weighs (a) value to bankers, (b) in-repo feasibility today, and (c) the size of the Vibe-coverage gap closed. Phases 70–74 are all Lane A and could be done in any order; the order above sorts by how much Vibe coverage each adds per unit of work.

---

## 5. Coverage summary

Quick numbers — a snapshot of how the 29 capability groups distribute:

| Status | Count | Examples |
|---|---|---|
| Operational | 6 | Banker workspace, Deal workspace (core), Alert queue, DQ diagnostics, Audit/governance, Regen discipline |
| Partially operational | 8 | Document workflow, Credit memo, Executive workspace, Stage progression, Activity intelligence, Performance scoring, Manager workspace, Reporting |
| Local-only workaround | 1 | Borrower communication |
| DRY_RUN / handoff only | 1 | Outlook email integration |
| Schema-blocked | 1 | Borrower upload (`NOT_WIRED.document-upload`) |
| Connector/admin-blocked | 0 (live-send is "DRY_RUN/handoff only" above) | |
| Auth/security-blocked | 1 | Borrower portal (`NOT_WIRED.borrower-portal` compound) |
| Not started | 8 | Teams integration, Teams calendar, Teams notifications, AI Copilot, AI voice, Document intelligence, Relationship memory, Deal autopilot, Cross-doc consistency |
| Intentionally deferred | 3 | Executive deal drill-through, Admin deal drill-through, AI generation |
| **Partial coverage (Operational + Partial)** | **14 / 29** | ~48% |
| **In-repo motion possible today (Lane A items)** | **~8 capabilities** | See §3 |

About half of the Vibe scope is operational or partially
operational today. Most of the remaining half is gated on
clearly-identified upstream work (Lanes B / C / D / E / F / G).
Lane A — what can ship in this repo today — covers ~8 distinct
Vibe capabilities (or partial slices of them) without any upstream
change. That is the immediate runway.

---

## 6. Phase 69 AAR

**Files created**
- [docs/MICROSOFT_VIBE_CAPABILITY_COVERAGE.md](MICROSOFT_VIBE_CAPABILITY_COVERAGE.md) — this document. The only deliverable.

**Files modified**
- [docs/CANONICAL_SOURCES.md](CANONICAL_SOURCES.md) — one row added pointing at this map.

**Capability groups tracked**
- 29 groups, every one with status, expected vs. current, gap, blocker, safe next step, and a build-now/later/deferred classification.

**Operational capabilities identified**
- 6 fully operational: Banker workspace, Deal workspace (core), Alert queue, DQ diagnostics, Audit/governance, Regen-on-change discipline.
- 8 partially operational: Document workflow (metadata-only), Credit memo (draft + save), Executive workspace (some transitional), Stage progression (read-only), Activity intelligence (ledger only), Performance scoring (KPI thresholds), Manager workspace (no analytics yet), Reporting (transitional).

**Blocked capabilities identified**
- Borrower portal — compound (auth + schema + connector + governance).
- Borrower upload — schema (File column).
- Outlook LIVE send — connector (Office 365 connector registration).
- Borrower-update email outbound — governance (deferred design decision).
- Teams integration / calendar / notifications — Lane E (connector + tenant + Graph).
- AI / Copilot / voice / doc intelligence / cross-doc consistency / deal autopilot / activity intelligence — Lane F (model integration + governance policy).
- Stage progression Advance Stage write — schema (Lane G).

**No-admin buildable capabilities identified (Lane A — what can ship without upstream)**
- Stale Pending-Review Escalation (becomes 11th governed write).
- Per-banker / per-team derived analytics.
- Activity-since-last-visit (rule-based).
- Structured-data credit-memo consistency check.
- Accessibility audit + targeted fixes.
- Multi-deal borrower-safe packet.
- Banker-only relationship notes (LOCAL_ONLY stop-gap).
- Capability Inventory mirror in STABILIZATION_CHECKLIST.md.

**Top recommended next phases**
- **Phase 70 — Stale Pending-Review Escalation (Lane A, becomes 11th governed write).**
- **Phase 71 — Per-banker / per-team derived analytics (Lane A).**
- **Phase 72 — Activity-since-last-visit, rule-based (Lane A).**
- **Phase 73 — Structured-data credit-memo consistency check (Lane A).**
- **Phase 74 — Accessibility audit + targeted fixes (Lane A).**

**Confirmations**
- No new features. No new writes. No schema work. No UI changes. Only docs.
- `GOVERNED_WRITES.length === 10` (unchanged from Phase 67).
- `NOT_WIRED` count and contents — unchanged.
- `DELIBERATELY_BLOCKED` — unchanged.
- `LOCAL_ONLY_FLOWS` — unchanged.
- No claim about portal availability, live email enabled, upload available, AI used, or Teams integrated.
- All 1038 tests still pass (the Phase 68 suite count holds; nothing was added or removed).
- `npm run build` not re-run (docs-only phase).
