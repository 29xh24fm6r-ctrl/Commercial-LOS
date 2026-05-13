# Commercial Lending Operating System — Specification

Source: paste from user, May 13 2026. This is the canonical functional spec for the
Commercial Lending Code App that was built in the Power Apps Vibe environment.
Use this together with the Dataverse schema in `src/Entities/` to rebuild source.

---

## Overview

A role based commercial lending operating system giving bankers, managers, and
executives tailored workspaces to run pipeline, teams, and portfolio insight.

## App Scopes (confirmed)

- **Commercial lending app** (PowerAppsCodeApp) — Role-based lending OS with
  deterministic bootstrap. Root route resolves Entra identity, LOS User Profile,
  workspace entitlements, provisions if needed, blocks on error, then redirects.
- **KPI baseline reset** (CopilotStudioFlows) — Flow allowing admins to reset KPI
  baseline and update KPI_BASELINE_DATE for performance calculations.
- **Existing loan import** (CopilotStudioFlows) — Flow to ingest existing loans,
  populate import fields, and create loan deals with lifecycle bypass for admins.

## Personas

- **Commercial banker / loan officer** — Originates, manages, closes commercial loans.
- **Team member / lending support** — Credit analysts, processors, support staff.
- **Commercial lending manager** — Team performance, pipeline health, risk oversight.
- **Executive / board viewer** — Strictly read-only, board-safe, governed snapshots only.
  Explicitly denied operational queues, deal edit surfaces, task backlogs, config.
- **Admin** — Full visibility and configuration authority. User admin, system config,
  rights/access management, banker/vendor profiles, governance, audit.
- **Commercial lending team** — Shared workspace for all bankers and support.
- **Manager workspace head** — High-density dashboard for oversight, analytics.
- **W1 Permission** — Enforces strict permission timing, denial, override visibility.
- **W2 Executive live-data hardening** — Snapshot-only audit, blocks live ops services.
- **W3 Workspace leakage prevention** — Route guards, context validation, deterministic landing.
- **W4 Legacy governed-data purge** — Reference-driven rendering, no enum assumptions.
- **W5 Alert reliability and visibility hardening** — Minimum alert rendering, SLA visibility.
- **W6 Data quality and diagnostics surfacing** — Inline DQ flags, severity ordering.
- **W7 Verification audit and regression protection** — Full codebase audit, release gates.
- **Help assistant** — Page-aware, in-Teams contextual help.
- **System automation** — Document workflow, borrower access, reminders.
- **Borrower** — External party uploading documents.
- **Phase 14 Borrower smart intake** — Guided onboarding with prefilled forms.
- **Phase 16 Credit memo borrower interview** — Structured borrower interviews for memos.
- **Phase 18 Copilot AI Assist Layer** — Governed Copilot/AI features.
- **Phase 18 Copilot AI Voice Assist Layer** — Voice+text Copilot, speech-to-text, audited.
- **Phase 22 Borrower Concierge Experience** — Borrower-facing closing portal.
- **Phase 23 Document Intelligence After Upload** — Classification, extraction, staleness.
- **Phase 24 Cross-Document Consistency Checks** — Validates terms across docs.
- **Phase 25 Regenerate on Change Discipline** — Tracks staleness of term sheet/memo/letter.
- **Phase 26 Relationship Memory for Bankers** — Pre-call/pre-meeting briefs.
- **Phase 30 closed loop Copilot AI assist governance** — AI use inventory and oversight.
- **Deal Autopilot operational intelligence** — Continuous deal monitoring.
- **System automation monitors deals** — Rule-based observation engine.
- **Commercial banker** — Auto-recognized activity tracking with effort scoring.
- **Manager** — Real-time team effort/activity monitoring.
- **BorrowerContact** — Magic-link auth, deal-scoped isolation.
- **AI Assist Layer** — Cross-cutting, structured findings, human-in-loop.
- **Deal Autopilot system** — Rule + AI driven, fail-closed, no auto-approval.
- **Relationship Memory system** — Cross-entity graph, interaction persistence.
- **Activity Intelligence system** — Canonical ledger of all events.
- **Performance scoring system** — Deal/banker/team scoring, dynamic, explainable.
- **System super admin** — Delete/archive deals with audit, restoration.

---

## User Stories

> The complete user-story list as provided. Grouped by persona. Each story is a
> first-person "As a … I want to … so that …" with full acceptance language preserved.

### Commercial banker / loan officer

- View my personal loan pipeline by stage so that I can prioritize daily work.
- Drill into a deal workspace with all related parties, tasks, and documents so that I can manage a loan end to end.
- Track next actions, follow ups, and due dates so that nothing stalls my deals.
- See my production metrics and goals so that I understand my performance.
- Switch to team or manager views when authorized so that I understand broader context.
- View personal pipeline summary so that I can see an overview of my current deals and priorities.
- See active deals and deals closing soon so that I focus on my most urgent opportunities.
- Track overdue tasks and stale client follow-ups so that I can proactively address items at risk.
- View open due diligence items for each deal so that I complete requirements efficiently.
- See upcoming meetings and calls so that I am prepared to engage with clients and participants.
- Identify referral and cross-sell opportunities so that I maximize client value and deal outcomes.
- Drill into a deal workspace to manage tasks, contacts, diligence, notes, next actions, and relationship history so that I work deals efficiently end-to-end.
- Log outreach activities for each deal and contact so that relationship history is tracked.
- View and manage all deal-related contacts in one place so that communication is streamlined.
- Initiate calls or emails directly from the workspace so that outreach is quick and convenient.
- Add new contacts, vendors, and participants to a deal so that the right people are engaged.
- Maintain and update next follow-up dates and relationship notes so that ongoing engagement is managed.
- Access and navigate all workspaces and system pages (Banker, Team, Manager, Executive/Board, Portfolio, Deals, Relationships, Vendors, Reporting, Admin) so that there are no restrictions during build and testing.
- View, own, and work alerts and exceptions from a governed operational alert queue.
- Acknowledge or assign alert queue items to myself or others.
- Escalate or resolve alert queue items with status, priority, and required comments.
- Track alert queue items by status, assignment, and SLA.
- Be notified of data quality status, freshness, and workflow readiness for any deal or dashboard viewed.
- Sync all deal-related meetings bidirectionally with my Microsoft Teams calendar.
- Automatically generate, update, or remove Microsoft Teams meeting links.
- See Teams meeting status (scheduled, in-progress, completed, canceled) on the deal timeline.
- Access a Microsoft Teams notification panel inside the app.
- Keep the Banker Workspace open all day as a primary always-on command center with full Teams and Outlook integration.
- End-to-end daily workflow coverage in Banker Workspace including bidirectional calendar sync and unified activity timeline.
- Compose, send, and log emails in-context using Outlook integration within Banker Workspace.
- Chat, launch meetings, and see Teams presence directly from deal, contact, and task contexts.
- View a unified activity timeline combining all calls, meetings, emails, notes, and tasks.
- Receive real-time notifications and see an agenda panel.
- Surface a Relationship Intelligence panel within Banker Command Center.
- Surface a Deal Velocity indicator in My Active Deals (Days in Current Stage vs typical, Green/Amber/Red).
- Upload a received document directly within the Document Request Tracker without leaving Command Center.
- Inline actions in the tracker: Upload Document, View Existing, Request Document, Send Reminder.
- In-context modal with fields for document type, related deal, file, received date, optional notes.
- On save: attach to existing request or create new doc record, mark received, refresh tracker section, update counts inline.
- Send email notification automatically when a document is requested.
- Generate a draft credit memo from existing deal data.
- Trigger Generate Credit Memo action from Deal workspace and Banker Command Center.
- Auto-populate generated credit memo with deal, borrower, pricing, collateral, guarantor, dates, alerts, diligence gaps, documents, banker notes.
- Open generated credit memo in editable experience with missing data marked.
- Save draft credit memo, regenerate, copy/export with permissions respected.
- Customize credit memo template layout per deal.
- Export finalized credit memo to PDF.
- View a Deal Blockers section auto-surfacing missing docs, overdue tasks, open high-severity alerts, stalled stage, pending approvals, missing diligence, unresolved exceptions.
- Send borrower update emails from Banker Command Center, Deal page, My Work Queue via Send Borrower Update quick action.
- In-context email compose modal pre-filled with primary borrower contact, deal subject, body template by stage.
- Supported templates: general status update, missing documents reminder, underwriting update, committee scheduling update, closing progress update.
- Auto-populate deal name, current stage, outstanding items, next steps, borrower actions in body.
- Each sent borrower update email logged to deal activity timeline.
- Remain in context after sending.
- See live completion status of borrower intake.
- Receive structured memo-ready borrower intake data with credit memo, PFS, BDS prefilled.
- Get notified when a borrower certifies and submits intake.

### Team member / lending support

- View a shared team pipeline.
- Filter deals by status, urgency, or assignment.
- Update deal tasks and underwriting statuses.
- Identify stalled or aging deals.
- Access and navigate all workspaces and system pages.
- View, own, and work team-level alert queues.
- Acknowledge, assign, and escalate alerts.
- Resolve alert items and update queue status.
- See team and deal-related meetings with bidirectional Teams calendar sync.
- Teams notification panel scoped to assigned roles and support functions.

### Commercial lending manager

- Monitor real time pipeline health across the team.
- Analyze bottlenecks, aging, stage conversion trends.
- Review production by banker, team, and product.
- Receive visual alerts on exceptions, concentrations, policy limits.
- Drill from portfolio level views into individual deals.
- Access and navigate all workspaces and system pages.
- View estimated profitability alongside actual realized profitability.
- Profitability metrics clearly labeled Estimated vs Actual.
- View documented calculations supporting each profitability KPI.
- Understand refresh cadence for profitability metrics.
- Clear labeling rules for profitability metrics.
- View managed alert and exception queues across teams.
- Acknowledge or reassign alerts/risk flags.
- Escalate unresolved or blocked alerts to upper management or admin queue.
- Monitor alert queue SLAs and overdue items.
- Surface data quality flags in all manager-visible contexts.
- Full two-way Teams calendar sync for team, portfolio, escalation meetings.
- Teams meeting link and status within manager dashboards and deal timelines.
- Teams notification panel showing role-scoped events and escalations.

### Executive / board viewer

- Access Executive/Board Workspace as strictly read-only, board-safe, governed snapshots only.
- Review pipeline volume, forecasted closings, win-loss trends, summarized portfolio risk only from snapshots.
- Portfolio mix, production overviews, concentrations, exception indicators only as summary metrics with as-of date.
- Strictly prevented from operational queues, tasks, deal edits, admin/config by default.
- Profitability KPIs only as governed snapshots with as-of-period and freshness labeling.
- Documentation for summary KPI calculations, refresh cadence, labeling; never operational detail unless explicitly permitted.
- Prominent board-safe labeling of metric as-of date/period and freshness.
- Drill-through is read-only, labeled operational, requires explicit permission, never default landing.
- Require explicit role-based read-only permission for any drill-through.
- Snapshot-based profitability views only; never live operational tables.
- Live profitability tables blocked; attempted queries emit EXECUTIVE_LIVE_DATA_BLOCKED audit event with outcome Denied.
- Profitability views labeled with snapshot as-of date, state (Official, Draft, Superseded), freshness.
- When snapshot exceeds freshness threshold, indicator shown and DQ flag generated for admin diagnostics.
- DQ indicators for each executive-visible metric and KPI.
- Snapshot-only Teams calendar sync for executive/board meetings.
- Read-only Teams notification panel scoped to executive/board permissions.

### Admin

- Define roles and workspace access.
- Configure workspace layouts, metrics, thresholds.
- Manage reference data (products, stages, teams).
- Access and navigate all workspaces and system pages.
- Add, edit, deactivate users; assign user type, team, manager.
- View user activity summaries and admin-only diagnostics workspace (failed/stale profitability refreshes, missing snapshots, alert backlog, unassigned/SLA-breached alerts, DQ issues, failed automations, recent overrides, permission/role changes, audit anomalies).
- Define and configure roles, permission groups, workspace access, page access, admin overrides; remediation is gated and auditable.
- Manage banker profiles, assignments, active status.
- Manage vendor profiles, categories, preferred status, activation.
- Administer deal stages, deal types, task templates, due diligence templates, dropdowns/status values, alert thresholds.
- Configure dashboard defaults, workspace defaults, notification rules, review/maturity timing, profitability inputs, KPI thresholds.
- Track changes to key records (stage/status changes, admin actions) for audit.
- Govern and document profitability assumptions (rates, costs, drivers).
- Configure and enforce thresholds and band definitions (High, Medium, Low, Needs Review).
- Set and manage refresh cadence for profitability KPIs.
- Define and govern rules for transparent labeling of profitability metrics.
- Configure governed workflow objects for alerts, exceptions, covenant issues, risk flags.
- Define alert queue categories, statuses, SLAs, assignment rules, escalation paths.
- Monitor alert queues across all roles in admin diagnostics workspace.
- Ensure all governed actions emit complete audit events; remediation gated and auditable.
- Enforce explicit non-optional audit requirements for auth, lifecycle, alerting, profitability, config, override actions.
- Audit captures who/what/when/where, entities, before/after, correlation id, outcome (incl. failures and blocked).
- Admin diagnostics workspace prioritizes governance failures above informational signals.
- Audit events for any denied access (user, context, denied object, reason).
- Enforce visibility rules so denied access is explicit and audited.
- Deprecate shared-dashboard assumptions; enforce role-based workspaces with reference-driven rendering.
- Mandatory codebase audit: workspace leakage, permission timing, executive live queries, alert underwiring, legacy data violations.
- Formal testing and acceptance checklist gating stabilization.
- Strict phased implementation order: Phase 1 (purge, shells, permissions), Phase 2 (executive snapshot-only, alerts), Phase 3 (banker, manager, admin diagnostics). Block net-new features until phases stable.
- Definition of Done: workspaces are hard execution boundaries, executive snapshot-only by architecture, permissions before render/query, alert queue operational, banker/manager command surfaces, reference-data rendering replaces all legacy enums, admin diagnostics visible/usable, no shared CRM-style dashboards with role filters.
- Command Center UX color hierarchy: red = critical/blocking only, amber/yellow = high priority/overdue non-blocking.
- Command Center Quick Actions (Log Call, Email, Add Task, Schedule, Add Note, Request Document) launch modals, associate to deal, update timeline, stay in Teams.
- Configure and monitor Teams calendar integration and sync with override/troubleshooting.
- Define role-based scoping rules for Teams notification panel.
- Audit all Teams meeting link generation/update/attendance.
- Configure accessibility: multiple themes including high-contrast and color-blind-safe.
- Meet/exceed WCAG contrast; red only for critical/blocking; status/priority cues clear in all modes.
- Theme preview in user settings; preference respected across devices.
- Phase 3 stage gates: block progression when governed requirements not met (underwriting, approval/committee, closing).
- Canonical blocker states: Blocked, At Risk, Clear.
- Approval/committee requires existing credit memo on deal.
- Block closing if close-critical items missing/unresolved.
- Surface blocker state on deal pages, Banker Command Center, Manager pipeline.
- Configure super-admin email for mpaller@oldglorybank.com.

### Commercial lending team (shared workspace)

- Aggregate all active commercial lending activity across bankers and support.
- Total active pipeline count and volume.
- Breakdown by stage, deal type, banker.
- Forecasted closings by month.
- Flag deals at risk, overdue tasks, stale follow-ups.
- Average days in stage and workload distribution.
- Closed-won/closed-lost trends.
- Top referral sources, cross-sell, deposit opportunities.
- Views: team dashboard, team pipeline list, bottleneck analysis, production leaderboard, escalation queue, shared closing calendar.
- Filter by banker, deal type, stage, status, risk, closing month, existing vs new customer, loan size band.
- Access all workspaces and pages.
- Actionable alert queue (not passive tiles).
- DQ indicators on pipeline, workload, production team dashboards.

### Manager workspace head

- Comprehensive pipeline metrics with drill-through.
- Aging and velocity trends.
- Banker production and pipeline performance dashboards.
- Win/loss and loss reason analysis.
- Portfolio mix, concentration, risk, policy exceptions.
- Exceptions, concentrations, alerts, unusual activity in dense dashboard grid.
- Strong global filtering and date controls.
- Compact tables, summary analytics, drill-through.
- Growth intelligence and trend analysis across products, segments, bankers.
- Access all workspaces and pages.
- Governed operational alert queue replacing passive tiles.

### W1 Permission

- Permission resolution before any render or query (no fetch-before-check).
- Explicit denial messages and flows when permission insufficient.
- Visible indicators when admin override is active.
- Uniform permission enforcement across routes, navigation, dashboards, drill-through, lists, exports.

### W2 Executive live-data hardening

- Audit executive-visible components and reports for snapshot-only sources.
- Technically prevent invocation of live operational services in executive/board surfaces.
- Enforce snapshot-sourced as-of-labeled data only on executive surfaces.
- Restrict code/report imports of operational services in executive UX.
- Demote EXECUTIVE_LIVE_DATA_BLOCKED to telemetry-only outcome (defensive, not user-visible block).

### W3 Workspace leakage prevention

- Audit all current routes for workspace leakage.
- Early route-level guards before render.
- Context validation on all shared pages and navigation.
- Remove passive cross-context fallback behaviors.
- Deterministic landing and hardened workspace boundaries.

### W4 Legacy governed-data purge

- Remove all generated-model UI helper imports.
- Eliminate static/ordinal enum assumptions in UI.
- Explicit visible fallbacks for missing/stale references.
- Allow temporary retention of choice fields without broad schema migration.
- Systematically enforce reference-driven rendering with audit.

### W5 Alert reliability and visibility hardening

- Audit all existing alert surfaces.
- Minimum alert rendering: owner, status, SLA, escalation, queue.
- Eliminate reliance on hidden/legacy alert fields.
- SLA breaches and escalations visually prominent.
- Clarify resolution, escalation, transition paths.

### W6 Data quality and diagnostics surfacing

- Inline DQ flags on all data surfaces.
- Admin diagnostics prioritize serious governance failures above info signals.
- Predetermined severity ordering in diagnostics presentation.
- Consistent trust/DQ messaging wherever suspect/stale/incomplete data shown.

### W7 Verification audit and regression protection

- Full codebase audit: permission timing, executive leakage, route/context leakage, governed-data violations, alert underwiring.
- Targeted regression tests for high-risk paths.
- Validate all critical audit events emitted (denials, overrides, executive live-data blocks).
- Strict release gate: prevent sign-off until critical/high findings closed or waived with rationale.

### Help assistant

- Available from global entry point at all times.
- Opens as in-app right-side pane or modal.
- Page-aware, metric-aware, workflow-aware explanations.
- Fully embedded in Teams.
- Predefined quick prompts and actions.
- Adapts to role and workspace.
- Never forces user to exit active workflow.

### System automation (document workflow)

- Tokenized secure access for external borrowers.
- Automate document status transitions on uploads/reviews.
- Reminders to borrowers per configured schedules.
- Upload confirmations and acknowledgment emails.
- Unified visibility of document events in deal timeline.
- Standardized email notification templates.
- Document expiration tracking with reminders before/after expiration.
- Show expiration status in deal document tracker and readiness indicators.

### Borrower (external)

- Secure upload portal via tokenized link.
- Upload requested documents directly.
- See incomplete/overdue requests with due dates.
- Clear system email notifications and reminders.

### Phase 14 — Borrower smart intake

- Secure smart intake link for guided onboarding.
- Save and resume multi-step intake.
- Upload existing financials/debt schedules vs manual entry.
- Review extracted data, confirm accuracy.
- Certify and submit intake.
- Guided onboarding through secure portal.

### Phase 16 — Credit memo borrower interview

- Plain-English progressive questions covering background, owner experience, history, products, customers, suppliers, competition, use of proceeds, timing, repayment, risks, mitigants, recent performance, growth plans, narratives.
- Upload supporting documents alongside responses.
- Save and resume.
- Progress indicator.
- Certify completion.
- Banker: structured summary mapped to credit memo sections with original answers.
- Banker: request targeted follow-ups for missing/unclear sections.
- Banker: reuse interview responses directly in memo drafting.
- System: link each interview to deal and borrower intake session.
- System: hybrid responses (answers + documents) in same session.
- System: emit timeline events for completion and follow-up requests.
- System: data is memo-ready and reusable without manual processing.

### Phase 18 — Copilot AI Assist Layer (text + voice)

- Surface AI principles and guidance (allowed/prohibited/governed).
- AI-guided borrower intake suggestions; banker-reviewable, never auto-decision.
- Structured extraction from uploaded docs; explicit banker review/override/accept.
- Memo draft generation in editable reviewable form; AI labeled; never auto-finalize.
- AI banker workspace summaries and next-best-actions; permission-scoped; human review.
- AI document narratives presented as suggestions for review/editing/acceptance.
- Snapshot-governed board-safe executive/manager summaries; no live insight; no drill-through.
- Tag all AI content with review-needed markers; log all AI actions for governance.
- Permission boundaries, sensitive data restrictions, audit events enforced in all AI flows.
- Voice: users interact with Copilot via voice; speech-to-text feeds same governed flows as text.
- Voice: queries for pipeline, deal-specific questions, workflow actions.
- Voice: action requests (assign tasks, send reminders, request documents) with permission checks.
- Voice: spoken summaries of document extraction labeled as AI-generated and reviewable.
- Voice: log and audit identically to text.

### Phase 22 — Borrower Concierge Experience

- Progress bar showing current status.
- Show received information/documents to build confidence.
- List outstanding information/documents needed.
- Surface outstanding questions/clarifications with due dates.
- Display next step with clear instructions, dynamic updates.
- Easy access to banker contact details with communication options.
- Secure encrypted document upload.
- FAQ section and/or Copilot help; never expose risk/decision data.
- Store portal status in BorrowerPortalStatus table.
- Log messages and communications in BorrowerPortalMessage table.
- Borrower-safe data only; technical blocks on credit decision promises, risk commentary, internal-only content.
- Always show current status, next actions, prompt declines when no follow-up needed.

### Phase 23 — Document Intelligence After Upload

- Classify uploaded documents by type (financial statement, tax return, bank statement, supporting).
- Extract fields, tables, free-text.
- Compare new uploads against prior versions.
- Detect staleness via as-of date, last refresh, business thresholds.
- Push high-confidence extracted facts into intake/readiness models.
- Low confidence requires human review before use.
- Never overwrite governed facts without human approval.
- Track source document reference for every extracted field.
- Mark process complete when all data structured and review-required facts verified.
- Banker review-ready interface for extracted facts with review-needed indicators.
- Done: classify, extract, compare versions, detect stale, push facts, source-tracked, low-confidence reviewed, no governed-fact overwrite.

### Phase 24 — Cross-Document Consistency Checks

- Detect mismatches: intake vs credit memo; memo vs term sheet; term sheet vs commitment letter; financials vs stated revenue/debt.
- Validate borrower names, guarantors, amounts, collateral, proceeds across intake/memo/term sheet/commitment/financials.
- Store rules in ConsistencyCheckRule table.
- Log issues in ConsistencyIssue table with field-level detail and source references.
- Flag inconsistencies before any document release/distribution/progression.
- Surface details: document, field, conflicting value.
- Mark document sets ready only when issues resolved or admin-waived with audit events.

### Phase 25 — Regenerate on Change Discipline

- Detect when term sheet, commitment letter, or memo require regeneration.
- Mark term sheet stale on deal terms change.
- Mark commitment letter stale on approval status or condition change.
- Mark memo stale on borrower narrative or financials change.
- NextBestAction = Regenerate with visible prompt.
- Rules in ArtifactFreshnessRule; status in ArtifactFreshnessStatus.
- Prominent stale indicators.
- Prompt before allowing use of stale artifacts.

### Phase 26 — Relationship Memory for Bankers

- Live context brief and relationship memory before each interaction.
- Pre-call brief: borrower history, prior approvals, requests, pain points, recent communications, open asks.
- Pre-meeting brief: milestones, recent activity.
- Borrower history summary for any deal/relationship.
- Prior approvals, requests, pain points, open asks in relationship workspace.
- Recent communications and current open asks per deal.
- Store generated briefs in RelationshipBrief table.
- Open a deal and instantly see context with no prep.
- Materially reduce call/meeting prep time.

### Phase 30 — Closed-loop Copilot AI assist governance

- Summarize all active AI use cases using existing AI tables.
- Enforce AI governance: permission-scoped, output review, sensitive data controls, audit logging.
- Aggregate and review AI output logs across workflows for label/review/audit compliance.
- Done criteria: explicit review/acceptance; no autonomous decisions/submissions; no unauthorized sensitive surfacing; AI recommendations tracked to source with override.
- Monitor and report governed AI usage, exceptions, non-compliance to admins/managers.
- Apply governed AI across all processes respecting workspace boundaries.

### Deal Autopilot operational intelligence + monitors

- Continuously monitor all deals: missing docs, intake gaps, stale artifacts, stage readiness, approval delays, borrower inactivity, exceptions, cross-doc consistency.
- Apply rule-driven observations across pipeline.
- Trigger automated actions: create tasks, send reminders, push notifications, mark stale, regenerate recommendations, escalate, surface readiness alerts.
- Surface Deal Autopilot panel in Deal Workspace, Banker Command Center, Manager Command Center.
- Strictly never approve deals or modify governed decisions; always require human confirmation.

### Commercial banker (performance recognition)

- Auto-recognize client-facing and pipeline activities.
- Credit performance metrics on qualifying actions (calls, meetings, emails, outreach, deal creation, deal moves, relationship advances).
- Personal Impact Panel: daily/weekly/cumulative effort scores, activity feed, goal progress.
- Relationship Activity Panel: interactions, follow-ups, engagement per client.
- Weekly Effort Summary: activities by type and impact vs goals/averages/prior periods.
- Governed visible rules for qualifying activities.
- Real-time updates to effort, history, metrics.
- Dashboards reflect actual current effort.
- Deal velocity metrics: time since creation, time in current stage, time to milestones, intake-to-memo.
- Completion-rate metrics: checklist %, document request %, borrower response %.
- Deterministic dashboard: active deals by stage, average age, stalled deals, completion %.

### Manager (performance recognition)

- See auto-recognized pipeline/relationship activities for all bankers with real-time effort/scoring.
- Configure or review rules that define performance credit.
- Consolidated dashboard: Personal Impact Panel, Relationship Activity Panel, Weekly Effort Summary for all direct reports with drill-down.
- Real-time updates at banker and team level.
- All dashboard views reflect true up-to-date effort.
- Validate auto-detection logic transparency: classification, scoring, assignment.
- Alerts/summary emails when activity falls below thresholds or trends unusual.
- Deal velocity metrics across team.
- Completion-rate metrics across team.
- Manager dashboard: active deals by stage, average age, stalled deals, completion % for bankers and team.

### BorrowerContact (Borrower Portal)

- Magic-link auth (no password).
- See only deals/documents they are named in (deal-scoped isolation).
- Upload requested loan application documents.
- Review checklist of outstanding/completed/overdue items.
- Secure messaging with banker; attachments; persistent logs.
- Activity log (uploads, messages, completions, certifications) — full audit history.
- Participate in document workflows (requests, uploads, acknowledgments, clarifications).
- Visually blocked from anything outside their scope.
- Automatic notifications for new requests, messages, checklist items.
- Resume session securely via new magic-link.
- Real-time status of uploads and checklist with confirmations.
- Download confirmation receipts.

### AI Assist Layer (cross-cutting)

- On document ingestion / deal updates / user actions, trigger AI summarization (per-doc and portfolio aggregated); store as structured findings (source, timestamp, confidence, context) in canonical ledger; never modify originals.
- Continuous monitoring for risk factors; AI risks as structured governance-tagged suggestions only; never overwrite human-entered data.
- Section-level memo drafting; AI-labeled; read-only suggestions; source references, timestamp, confidence; explicit human review/accept.
- Q&A over deal data and documents; AI-labeled with citations, context, governance tags.
- Next-best-action recommendations in insights panels; never auto-trigger workflow changes.
- All AI outputs stored as immutable structured ledger entries; source/timestamp/refs/confidence/context.
- Inline insights panels on deal/document/memo pages with Accept/Reject controls.
- Every AI-generated artifact labeled AI-generated, review-required, governed; audit log on every accept/reject/regenerate.
- Re-trigger / regenerate affected outputs on source data/document change; new timestamp, version, source reference; flag for re-review.
- AI failures never block workflows; failures non-blocking, visibly surfaced, logged for diagnostic/audit.
- Governance: labels, human-in-loop, automatic regeneration with re-review.
- Done criteria: derivation explanations, full traceability to source, trust-labeled findings with confidence and context, no hallucination, no governed-fact override, full audit history.

### Deal Autopilot system

- Continuous evaluation via rule-based + AI logic.
- Generate next actions and operational alerts; require human confirmation before workflow change.
- Integrate with alert queue by writing autopilot_suggestion records on the ledger.
- Enforce safety rules, fail-closed: no irreversible auto actions, no governed-decision auto-changes.
- Display autopilot insights/suggestions/alerts in workspaces; record recommendations and human responses on canonical ledger.
- Never auto-approve, finalize, or perform non-reversible deal actions.
- Done: recommendations accurate, transitions fully governed, no unintended state changes.

### Relationship Memory system

- Cross-entity graph: borrowers, guarantors, businesses, deals.
- Persist historical interaction data across deals/entities.
- Detect and surface behavior patterns (risk factors, performance, approvals/exceptions).
- Auto-surface related deals when viewing a deal or relationship.
- Flag deals/entities/borrowers with notable risk/performance (rule + AI).
- Pre-call and pre-meeting briefs with live context.
- Dynamic fetch/display of related entities on deal load and timeline navigation.
- Real-time updates to relationship intelligence panels, timeline, metrics.
- Store briefs, canonical events, entity aggregations in secured auditable tables.
- Timeline and relationship panel UI with workspace isolation and data boundaries.

### Activity Intelligence system

- Capture every user action, system event, AI output, document event to canonical immutable ledger.
- Centralized event pipeline with type, category, severity.
- Unified filterable activity timeline in each workspace highlighting critical events.
- Detect patterns: delays, bottlenecks, anomalies, unusual trends.
- Trigger alerts based on signal and severity.
- Event classification: user, system, document, AI output, process stage.
- Integrate with autopilot, performance scoring, alerts.
- Full visibility into deal lifecycle, no silent actions.

### Performance scoring system

- Evaluate deals/bankers/teams by velocity, completion rates, doc turnaround, risk-adjusted outcomes.
- Update scores dynamically on activity/data/completion.
- Store metrics, calculations, histories in structured ledger format.
- Explainability: drivers and contributors for each score.
- Scoring is report-driven; never affects access/permissions.
- Dashboards for individual banker, team comparison, trend analysis.
- Real-time accurate scores with change highlights and drivers.
- Done: accurate, real-time, transparent, dashboard-available.

### System super admin

- Delete or archive deals (super admin only).
- Explicit confirmation dialogs before delete/archive.
- Complete audit trail: user, timestamp, deal, action, confirmation, outcome.
- Remove deleted/archived from all pipeline views, dashboards, manager summaries, reporting modules.
- Soft-delete (archive) with restoration capability and audit logs of restores.
- Data Cleanup interface within Admin Control Center, restricted to super admin.
- Archive or permanently delete deals with strict permissions and explicit intent confirmation per critical action.
- Full audit logs for every archive/delete action.
- Immediate removal of archived/deleted deals from all operational surfaces.
