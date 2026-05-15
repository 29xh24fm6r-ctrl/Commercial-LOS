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
- **Current state.** **Operational.** Phase 4 banker workspace + Phase 54 pending-review signal + Phase 56 (work queue refresh) + MyWorkQueue surfaces.
- **Gap.** No relationship-memory hint cards; no AI-summarized "what changed since you last looked"; no deal-autopilot suggestions.
- **Blocker.** None for the core. The Vibe-doc deltas above are Lane F (Copilot) and Lane A (in-repo memory MVP).
- **Safe next step.** Lane A: ship a Phase-21-style governed task-reassign write to action the Phase 54 stale-pending-review signal (the 11th governed write).
- **Schema / admin work needed?** No.
- **Build now / later / deferred.** Now.

### 1.2 Deal Workspace

- **Vibe expected.** Per-deal page with header, summary, blockers, tasks, documents, credit memo, activity, borrower communication, stage gate.
- **Current state.** **Operational.** Phase 4 banker + Phase 36 manager (read-only) + Phase 37 team (read-only). Nine cards mount under DealDataProvider after authorized load.
- **Gap.** Executive + admin deal drill-through are deliberately unwired (`NOT_WIRED.executive-deal-drillthrough` + `NOT_WIRED.admin-deal-drillthrough`).
- **Blocker.** Governance decision, not technical. Phase 15 chose snapshot-only for executive; admin drill-through is a separate gov call.
- **Safe next step.** No motion required. Re-evaluate only if a brief asks for it.
- **Schema / admin work needed?** No.
- **Build now / later / deferred.** Deferred.

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
- **Current state.** **Local-only workaround + DRY_RUN / handoff only.** Phase 23 borrower-update draft (clipboard copy), Phase 24 credit-memo preview, Phase 61 document-request email (DRY_RUN/LIVE-stub), Phase 63 document-request handoff (mailto + clipboard), Phase 66/67 borrower-safe status packet + handoff. Banker initiates everything.
- **Gap.** No automated outbound; no inbound (responses arrive in the banker's own Outlook inbox); no two-way thread; no borrower-facing portal (`NOT_WIRED.borrower-portal`).
- **Blocker.** Connector (Outlook), auth/security (borrower identity), schema (`BorrowerSafe` visibility scope; secure-message entity).
- **Safe next step.** Lane B: Outlook connector registration unblocks Phase 61 LIVE mode and `NOT_WIRED.email-delivery` simultaneously. Two governance rows close with one upstream action.
- **Schema / admin work needed?** Yes (connector for LIVE; schema for portal-grade communication).
- **Build now / later / deferred.** Lane B = soon (connector). Two-way thread = deferred (compound blocker).

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
- **Current state.** **DRY_RUN / handoff only.** Phase 61 governed send with `DRY_RUN | LIVE | HANDOFF` mode split. DRY_RUN simulates locally; LIVE is a permanent-failure stub (Phase 62); HANDOFF (Phase 63) is the operational default — banker's own Outlook does the actual send.
- **Gap.** LIVE-mode connector-backed send. Inbound email logging.
- **Blocker.** Connector — Office 365 Outlook connector not registered for this Code App.
- **Safe next step.** Lane B: the single highest-leverage upstream action. The Phase 62 §2 swap is documented and ready; one PR after the connector registers.
- **Schema / admin work needed?** Yes (admin — connector registration).
- **Build now / later / deferred.** Soon (Lane B).

### 1.7 Microsoft Teams integration

- **Vibe expected.** Deals visible inside Teams; banker presence; thread-in-deal pattern.
- **Current state.** **Not started.** No Teams entry in any inventory.
- **Gap.** Everything.
- **Blocker.** Connector + tenant-admin (Teams app registration; Graph permissions for deal context). Lane E.
- **Safe next step.** None in-repo. The Lane E roadmap below sketches the unblock dependencies.
- **Schema / admin work needed?** Yes (tenant + connector + Graph).
- **Build now / later / deferred.** Later (after Outlook connector + portal-adjacent decisions).

### 1.8 Teams calendar sync

- **Vibe expected.** Banker calendar events for deal milestones; close-date reminders; SLA alerts.
- **Current state.** **Not started.**
- **Gap.** Everything.
- **Blocker.** Same as 1.7 (Teams + Graph calendar permissions).
- **Safe next step.** Lane E.
- **Schema / admin work needed?** Yes.
- **Build now / later / deferred.** Later.

### 1.9 Teams notifications

- **Vibe expected.** Push notifications to bankers when a deal needs action (received doc, escalated alert, etc.).
- **Current state.** **Not started.**
- **Gap.** Everything.
- **Blocker.** Lane E.
- **Safe next step.** Lane E.
- **Schema / admin work needed?** Yes.
- **Build now / later / deferred.** Later.

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
- **Current state.** **Not started.**
- **Gap.** Everything.
- **Blocker.** Lane C + Lane F — needs binary documents OR a fully structured representation; needs an analysis engine.
- **Safe next step.** Lane A could ship a structured-data-only version: derive a "memo consistency check" that compares the saved credit memo draft's stated fields against the deal's structured fields (amount, stage, customer type) without AI. Small but meaningful.
- **Schema / admin work needed?** No (for the structured-only version).
- **Build now / later / deferred.** Now (the structured-only slice) / later (the binary slice).

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
- **Current state.** **Not started.** Deal-scoped data only. `cr664_borrowers` has no notes/preferences/contact-history field.
- **Gap.** Everything cross-deal.
- **Blocker.** Schema (new entity or extended borrower record) + governance (privacy / consent).
- **Safe next step.** Lane A could ship a banker-only "relationship notes" card per deal as a Phase-23-style LOCAL_ONLY flow (generate-and-copy notes the banker maintains in their own system) — that's a stop-gap, not a relationship-memory replacement. Real relationship memory is multi-deal and needs new schema.
- **Schema / admin work needed?** Yes (real implementation).
- **Build now / later / deferred.** Later.

### 1.17 Deal autopilot

- **Vibe expected.** App suggests next actions; auto-progresses tasks; nudges bankers.
- **Current state.** **Not started.** No suggestion surface exists.
- **Gap.** Everything.
- **Blocker.** Lane F + design — even a rule-based "suggestion" engine needs a UX surface and a governance trail (each suggestion is auditable). Stage progression is also deliberately blocked (1.26) which limits autopilot's reach.
- **Safe next step.** Lane A: a small derivation-only "stale items needing attention" card (no writes; reads from existing data). Phase 54 already surfaces some of this — extending it would be Lane A.
- **Schema / admin work needed?** No (derivation-only version).
- **Build now / later / deferred.** Now (derivation slice) / deferred (write-capable autopilot).

### 1.18 Activity intelligence

- **Vibe expected.** Smart summaries of deal activity; "what changed since you last looked"; trend lines.
- **Current state.** **Partially operational.** Phase 25+ timeline ledger exists. No summarization, no intelligence layer.
- **Gap.** Summarization, trend extraction.
- **Blocker.** Lane F (AI) — OR rule-based summaries (Lane A) which would be honest but lighter than the Vibe vision.
- **Safe next step.** Lane A: a derived "activity since last visit" summary on the deal workspace using existing timeline data + a banker-side last-seen timestamp (local storage or a minimal schema column). Low risk.
- **Schema / admin work needed?** No (local-storage version).
- **Build now / later / deferred.** Now (rule-based) / later (AI-driven).

### 1.19 Performance scoring

- **Vibe expected.** Banker / team / deal scoring against KPI thresholds; rolled up to manager and exec.
- **Current state.** **Partially operational.** KPI threshold configuration exists (`cr664_kpithresholdconfigurations`); profitability snapshots feed executive surfaces; Phase 15 transitional fallback marks `PipelineByStage` and `MonthlyClosingForecast` as transitional.
- **Gap.** Per-banker / per-team scoring beyond what already surfaces; granular threshold visualizations.
- **Blocker.** Schema (per-banker rollup tables don't exist) OR derivation work (compute in-app from existing deals).
- **Safe next step.** Lane A: derive per-banker pipeline rollup from existing `cr664_loandeals` rows. Read-only; safe; useful.
- **Schema / admin work needed?** No (derivation).
- **Build now / later / deferred.** Now.

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
- **Current state.** **Operational** (Phase 36). Team-scoped read-only via `loadDealForManager`. Four write-capable cards render with `readOnly=true`.
- **Gap.** Manager analytics (per-banker scoring, team-wide trend lines) are not yet shipped.
- **Blocker.** Same as 1.19.
- **Safe next step.** Lane A: derive team analytics from existing data.
- **Schema / admin work needed?** No.
- **Build now / later / deferred.** Now (analytics extension).

### 1.23 Team workspace

- **Vibe expected.** Team members see deals they touch.
- **Current state.** **Operational** (Phase 37). Same team-scoped read-only as manager.
- **Gap.** Tighter "deals you touch" scoping (Phase 37 doc flagged this) — currently shared with manager scope.
- **Blocker.** Governance + schema decision on what "you touch" means.
- **Safe next step.** Deferred until the scope decision lands.
- **Schema / admin work needed?** Possibly.
- **Build now / later / deferred.** Deferred.

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
- **Current state.** **Partially operational.** A custom theme system (`palette`, `radius`, `spacing`, `typography`) exists. Severity-aware badges (`Badge`, `StatusDot`). Modal patterns use `role="dialog"` + `aria-modal`. No formal accessibility audit has been run; some surfaces likely fall short.
- **Gap.** Formal a11y audit; dark theme; keyboard nav consistency; tested screen-reader paths.
- **Blocker.** None technical. Just hasn't been a phase brief.
- **Safe next step.** Lane A: an accessibility-audit phase that fixes the lowest-hanging fruit (color contrast on severity badges; keyboard-trap audit on modals; aria-label hygiene).
- **Schema / admin work needed?** No.
- **Build now / later / deferred.** Now.

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

### Lane B — Needs Outlook connector registration

Single upstream action (Power Platform admin: register the
Office 365 Outlook connector for this Code App). Closes multiple
governance rows simultaneously.

1. Phase 62 §2 swap — flip `liveAdapter.send` from permanent-failure to typed `Office365EmailService.sendEmailV2` call.
2. `NOT_WIRED.outlook-connector-live-send` removal.
3. `NOT_WIRED.email-delivery` (borrower update outbound) — additional governed-write phase using the same adapter.
4. Inbound email logging (timeline `EmailLogged` events from connector callbacks; would also require Power Automate or a connector callback pattern — possibly Lane B + Lane E hybrid).

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

1. Teams app registration in tenant.
2. Graph permissions for deal context.
3. Teams calendar sync (Graph calendar).
4. Teams notifications (deal-state callbacks).
5. Teams embedded workflow (deals visible inside Teams chat).
6. Voice / meeting capture (Lane E + Lane F).

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
6. **(Awaiting upstream — track but don't start)** — Outlook connector registration (Lane B); File column (Lane C); stage reference schema (Lane G). Each unblocks an existing `NOT_WIRED` / `DELIBERATELY_BLOCKED` entry with a known in-repo follow-up phase already documented.
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
