# Phase 187A — Runtime Dataverse Write-Path Inventory

- **Date:** 2026-06-17
- **Author:** Matthew Paller
- **Mode:** READ-ONLY source inventory. No Dataverse writes. No app code changed.
- **Scope:** all runtime write paths under `src/` (the generated `src/generated/services/*` SDK wrappers are not write paths themselves — their **callers** are inventoried).
- **Spec:** SPEC-DATAVERSE-SYSTEMS-INTEGRITY-AUDIT-AND-MASTER-FIX-1, Phase 187A.

## How to read this

A "write path" is a concrete caller site that issues a Dataverse `create`/`update`/`delete`
through a generated `Cr664_*Service` / `Office365OutlookService`. Each caller site is one row.
Status classification:

- **LIVE** — reachable from a runtime surface with gating that can evaluate to enabled.
- **DISABLED** — code exists, gated off by a feature flag whose default is off (still inventoried per guardrail).
- **DEAD-CODE** — code exists but no runtime caller wires the required injected transport.
- **TEST-ONLY** — only referenced from `*.test.ts`.

## Infrastructure facts that drive the classifications

1. **No central `emitAudit` helper.** Each action builds its `cr664_auditevent` payload inline
   and POSTs via `Cr664_auditeventsService.create`. The one shared builder is
   `buildNewDealAuditPayload` (`src/deals/dealOriginationAudit.ts:94`), used only by the
   new-deal path. There are **13 inline audit create sites**.
2. **Email mode default = `DRY_RUN`** (`src/deals/emailDelivery/emailMode.ts:45-55`, `VITE_EMAIL_MODE`).
   The LIVE Outlook adapter (`outlookEmailAdapters.ts:146`, `Office365OutlookService.SendEmailV2`)
   is only selected when `EMAIL_MODE==='LIVE'`. **Audit + timeline Dataverse writes fire regardless
   of email mode** — they are live writes even when no email leaves the client.
3. **New-Deal create is effectively LIVE (pilot).** The adapter constant
   `NEW_DEAL_CREATE_ADAPTER_ENABLED=false`, but the caller `BankerNewDealCreate.tsx:105` overrides
   `enabled:true`, and `bankerCreatePilotConfig.ts:21-28` (`BANKER_CREATE_PILOT_ENABLED=true`, all
   production context flags `true`) makes `evaluateBankerCreateRollout` return `live_controlled`.
   Rendered at `BankerShell.tsx:299`. It still **fails closed** without a resolved systemuser,
   banker auth, and a Ready production Stage/Status resolver.
4. **CRM automation & portfolio side-effects are structurally DEAD at runtime.** The orchestrator
   runs them only if `deps.runCrmLink` / `deps.runPortfolioWrite` are injected; the only runtime
   caller (`BankerNewDealCreate.tsx:100-110`) injects neither and passes `config:{}` (all
   downstream flags default false). Their adapters import no Dataverse service.

---

## Domain: new-deal / deal-create

| file:line | fn / component | entity set | op | payload builder | required cr664_ fields | lookup binds | actor fields | audit behavior | gate / flag | runtime surface | status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `newDealCreateAdapter.ts:314` (`liveCreateLoanDeal`), entry `createGovernedNewDeal:180` | `liveCreateLoanDeal` ← `createGovernedNewDeal` | `cr664_loandeals` | create | `createGovernedNewDeal:245-255`; allow-list `NEW_DEAL_CREATE_ALLOWED_FIELDS:49-57` | `cr664_dealname`, `cr664_stageentrydate`; optional `cr664_amount` | `cr664_StageReference@odata.bind`, `cr664_StatusReference@odata.bind`, `cr664_AssignedBanker@odata.bind`→`/cr664_bankers`, optional `cr664_Client@odata.bind`→`/cr664_clientrelationships` | owner left to server default; banker via bind | Emits success/failure audit via injected `emitNewDealAuditEvent:347`; **fail-closed**, returns `audit_failed_partial` if audit fails (deal still created) | `enabled` overridden true; net gate `evaluateBankerCreateRollout`→`live_controlled` + systemuser + banker auth + Ready resolver | Banker workspace New Deal panel (`BankerShell.tsx:299` → `BankerNewDealCreate.tsx:103`) | **LIVE** (pilot) |
| `newDealCreateAdapter.ts:408` | `liveEmitNewDealAuditEvent` → `Cr664_auditeventsService.create` | `cr664_auditevents` | create | `buildNewDealAuditPayload` (`dealOriginationAudit.ts:94`); allow-list `:72-85` | name/category/type/entity/outcome/correlation/changeddate | `cr664_LoanDeal@odata.bind`, **`cr664_ChangedBy@odata.bind`→`/cr664_users(...)`** (resolved via `newDealAuditActorResolver`) | ChangedBy resolved to **cr664_user** (CORRECT); no ActorUser, no owner/state | This IS the audit; fail-closed, never faked | same as create | Banker New Deal panel | **LIVE** (pilot) — **reference implementation** |
| `dealCrmAutomationAdapter.ts:76` | `runDealCrmAutomation` (injected `runCrmLink`) | CRM link (bind only) | create/link | inline `:65-68`; allow-list `:19-22` | `cr664_correlationid` | `cr664_Deal@odata.bind` | none | none | `isCrmAutomationEnabled` (`CRM_AUTOMATION_ENABLED=false`) AND injected `runCrmLink` | orchestrator `dealOriginationOrchestrator.ts:269`; runtime caller injects no transport | **DEAD-CODE** |
| `newDealPortfolioSideEffectsAdapter.ts:87` | `runNewDealPortfolioSideEffects` (injected `runPortfolioWrite`) | portfolio mapping (bind only) | create | inline `:76-79`; allow-list `:20-23` | `cr664_correlationid` | `cr664_Deal@odata.bind` | none | none | `isPortfolioSideEffectsEnabled` (`PORTFOLIO_SIDE_EFFECTS_ENABLED=false`); default `skipped_not_needed` | orchestrator `:305`; runtime caller injects no transport | **DEAD-CODE** |

> `buildLiveNewDealCreateDeps` (`newDealCreateAdapter.ts:421`) wires `enabled:NEW_DEAL_CREATE_ADAPTER_ENABLED` (false); the BankerNewDealCreate caller spreads it and overrides `enabled:true` — the live path is the pilot one.

## Domain: tasks

| file:line | fn | entity set | op | required cr664_ fields | lookup binds | actor fields | audit behavior | gate | surface | status |
|---|---|---|---|---|---|---|---|---|---|---|
| `dealTaskActions.ts:168` | `completeTask` | `cr664_dealtask1s` | update | `cr664_completed=true` | — | — | step2/3 audit+timeline; `governance-partial` if either fails | `readOnly` + `banker.systemUserId` | `DealTasks.tsx:29` | **LIVE** (banker) |
| `dealTaskActions.ts:104` | `emitAuditEvent` (complete) | `cr664_auditevents` | create | Lifecycle/StatusChange/LoanDeal + field/old/new | `cr664_LoanDeal@odata.bind` | `cr664_ChangedBy@odata.bind`→`/systemusers` ⚠, `cr664_ActorUser@odata.bind`→`/systemusers` ⚠, `ownerid`+`owneridtype:'systemuser'` ⚠, `statecode:0` ⚠ | fire-and-forget on fail path, awaited on success | same | Deal Workspace | **LIVE** |
| `dealTaskActions.ts:141` | `emitTimelineEvent` (complete) | `cr664_dealtimelineevents` | create | eventtype `TaskCompleted` 788190005 | `cr664_Deal@odata.bind`, `cr664_EventBy@odata.bind`→`/systemusers` | ownerid+owneridtype | governance-partial | same | Deal Workspace | **LIVE** |
| `dealTaskActions.ts:398` | `createDocumentReviewTask` | `cr664_dealtask1s` | create | `cr664_taskname`, `cr664_completed=false`, `statecode:0` | `cr664_AssignedTo@odata.bind`→`/systemusers`, `cr664_Deal@odata.bind` | ownerid+owneridtype:'systemuser' | step2/3 audit+timeline | `readOnly`/systemUserId | `DealDocuments.tsx:181`, `MyWorkQueue.tsx:159` | **LIVE** |
| `dealTaskActions.ts:318` | `emitCreateTaskAuditEvent` | `cr664_auditevents` | create | type `AssignmentChange` 788190002; related `cr664_documentchecklist` | `cr664_LoanDeal@odata.bind` | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | fire-and-forget/awaited | same | Deal Workspace | **LIVE** |
| `dealTaskActions.ts:362` | `emitCreateTaskTimelineEvent` | `cr664_dealtimelineevents` | create | eventtype `TaskCreated` 788190004 | `cr664_Deal`, `cr664_EventBy`→systemusers | ownerid | governance-partial | same | Deal Workspace | **LIVE** |

## Domain: documents

| file:line | fn | entity set | op | required cr664_ fields | lookup binds | actor fields | gate | surface | status |
|---|---|---|---|---|---|---|---|---|---|
| `documentActions.ts:169` | `requestDocument` | `cr664_documentchecklists` | update | `cr664_requestdate` | — | — | `readOnly`/systemUserId | `DealDocuments.tsx:72` | **LIVE** |
| `documentActions.ts:102` | `emitAuditEvent` (request) | `cr664_auditevents` | create | Lifecycle/StatusChange; field `cr664_requestdate` | `cr664_LoanDeal@odata.bind` | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | same | Deal Workspace | **LIVE** |
| `documentActions.ts:139` | `emitTimelineEvent` (request) | `cr664_dealtimelineevents` | create | eventtype `DocumentRequested` 788190009 | `cr664_Deal`, `cr664_EventBy` | ownerid | same | Deal Workspace | **LIVE** |
| `documentActions.ts:377` | `markDocumentReceived` | `cr664_documentchecklists` | update | `cr664_receiveddate` | — | — | `readOnly`/systemUserId | `DealDocuments.tsx:143`, `MyWorkQueue.tsx:109` | **LIVE** |
| `documentActions.ts:308` | `emitAuditEventForReceive` | `cr664_auditevents` | create | field `cr664_receiveddate` | `cr664_LoanDeal` | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | same | Deal Workspace | **LIVE** |
| `documentActions.ts:345` | `emitTimelineEventForReceive` | `cr664_dealtimelineevents` | create | eventtype `DocumentUploaded` 788190010 | `cr664_Deal`, `cr664_EventBy` | ownerid | same | Deal Workspace | **LIVE** |
| `documentActions.ts:600` | `markDocumentReviewed` | `cr664_documentchecklists` | update | `cr664_reviewer` (text) | — | reviewer is text, not a lookup | `readOnly`/systemUserId | `DealDocuments.tsx:160`, `MyWorkQueue.tsx:133` | **LIVE** |
| `documentActions.ts:522` | `emitAuditEventForReview` | `cr664_auditevents` | create | field `cr664_reviewer` | `cr664_LoanDeal` | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | same | Deal Workspace | **LIVE** |
| `documentActions.ts:559` | `emitTimelineEventForReview` | `cr664_dealtimelineevents` | create | eventtype `NoteLogged` 788190002 | `cr664_Deal`, `cr664_EventBy` | ownerid | same | Deal Workspace | **LIVE** |

## Domain: credit memo

| file:line | fn | entity set | op | required cr664_ fields | lookup binds | actor fields | gate | surface | status |
|---|---|---|---|---|---|---|---|---|---|
| `creditMemoActions.ts:262` | `saveCreditMemoDraft` | `cr664_creditmemo1s` | create | memoname/memotype/memotext/status(Draft 788190000)/version/generatedat/borrowersafe:false/workspaceid/memo_schema_version/`statecode:0` | `cr664_Deal@odata.bind` | ownerid+owneridtype:'systemuser' ⚠ | `readOnly`/systemUserId | `CreditMemo.tsx:98` | **LIVE** |
| `creditMemoActions.ts:208` | `createMemoSection` (per section) | `cr664_creditmemodraftsections` | create | sectionkey/drafttext/lastgeneratedat/reviewstatus(Pending)/`statecode:0` | `cr664_Deal@odata.bind` | ownerid ⚠ | same | Deal Workspace | **LIVE** |
| `creditMemoActions.ts:137` | `emitAuditEvent` (memo) | `cr664_auditevents` | create | Lifecycle/StatusChange; field `cr664_status` | `cr664_LoanDeal@odata.bind` | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | same | Deal Workspace | **LIVE** |
| `creditMemoActions.ts:175` | `emitTimelineEvent` (memo) | `cr664_dealtimelineevents` | create | eventtype `NoteLogged`, subtype `creditmemo:draft-saved` | `cr664_Deal`, `cr664_EventBy` | ownerid | same | Deal Workspace | **LIVE** |

## Domain: stage / status advancement

No standalone stage/status write path exists. New deals open at Intake/Open via the bind payload
in the new-deal create. `AUTO_STAGE_ADVANCE_ENABLED=false`; the orchestrator's stage-advance step
is injected-only and never wired (`autoStageAdvanceAdapter.ts`, no runtime `runStageAdvance`
injected). **DISABLED / DEAD-CODE** (no concrete `Service.update` for stage exists in app code).

## Domain: borrower communication

| file:line | fn | entity set | op | required cr664_ fields | lookup binds | actor fields | gate | surface | status |
|---|---|---|---|---|---|---|---|---|---|
| `sendBorrowerUpdateEmail.ts:192` | `emitAuditEvent` ← `sendBorrowerUpdateEmail:257` | `cr664_auditevents` | create | field `borrower_update_send_attempt`; full recipient in `cr664_notes` | `cr664_LoanDeal@odata.bind` | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | `readOnly`/systemUserId; email send gated by `EMAIL_MODE` but **audit/timeline fire regardless** | `BorrowerCommunication.tsx:63` | **LIVE** |
| `sendBorrowerUpdateEmail.ts:239` | `emitTimelineEvent` | `cr664_dealtimelineevents` | create | eventtype `BorrowerUpdateSent` 788190014 | `cr664_Deal`, `cr664_EventBy` | ownerid | same | Deal Workspace | **LIVE** |
| `sendDocumentRequestEmail.ts:195` | `emitAuditEvent` ← `:259` | `cr664_auditevents` | create | field `outlook_send_attempt` | `cr664_LoanDeal@odata.bind` | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | same | `DealDocuments.tsx:97` | **LIVE** |
| `sendDocumentRequestEmail.ts:242` | `emitTimelineEvent` | `cr664_dealtimelineevents` | create | eventtype `EmailLogged` 788190001 | `cr664_Deal`, `cr664_EventBy` | ownerid | same | Deal Workspace | **LIVE** |
| `prepareDocumentRequestHandoff.ts:172` | `emitAuditEvent` ← `:234` | `cr664_auditevents` | create | field `outlook_handoff_prepared` | `cr664_LoanDeal@odata.bind` | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | `readOnly`/systemUserId | `DealDocuments.tsx:122` | **LIVE** |
| `prepareDocumentRequestHandoff.ts:217` | `emitTimelineEvent` | `cr664_dealtimelineevents` | create | eventtype `NoteLogged`, subtype `outlook-handoff-prepared` | `cr664_Deal`, `cr664_EventBy` | ownerid | same | Deal Workspace | **LIVE** |

## Domain: activity logging

| file:line | fn | entity set | op | required cr664_ fields | lookup binds | actor fields | gate | surface | status |
|---|---|---|---|---|---|---|---|---|---|
| `logActivityActions.ts:113` | `createTimelineEvent` ← `logActivity:128` | `cr664_dealtimelineevents` | create | title/summary/eventat/eventtype `NoteLogged`/visibility/issystemgenerated/related/subtype/`statecode:0` | `cr664_Deal@odata.bind`, `cr664_EventBy@odata.bind`→`/systemusers` | ownerid+owneridtype | `logActivityEnabled = !writeDisabledReason && systemUserId && bankerId` | `GreetingHeader.tsx:160` | **LIVE** |
| `logActivityActions.ts:76` | `emitAuditEvent` (activity) | `cr664_auditevents` | create | Lifecycle/StatusChange; field `cr664_dealtimelineeventid` | `cr664_LoanDeal@odata.bind` | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | same | Banker workspace | **LIVE** |

## Domain: admin remediation

| file:line | fn | entity set | op | required cr664_ fields | lookup binds | actor fields | gate | surface | status |
|---|---|---|---|---|---|---|---|---|---|
| `alertActions.ts:142` | `applyAlertRemediation` ← `resolveAlert`/`dismissAlert:189-194` | `cr664_alertqueues` | update | `cr664_alertstatus`(Resolved 788190003 / Closed 788190004), `cr664_resolveddate`, `cr664_resolutionnotes` | `cr664_ResolvedBy@odata.bind`→`/systemusers` | ResolvedBy = actor | `!admin.systemUserId` + `admin.writeDisabledReason` | `AlertBacklog.tsx:52` | **LIVE** (admin) |
| `alertActions.ts:113` | `emitAuditEvent` (alert) | `cr664_auditevents` | create | category Alert 788190003, type ExceptionResolved 788190006, entity Configuration | — | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | same | Admin Console | **LIVE** |
| `dataQualityActions.ts:121` | `resolveDataQualityFlag` | `cr664_dataqualityflags` | update | `cr664_resolutionstatus`(Resolved 788190001), `cr664_resolutionnotes` | — | — | `!admin.systemUserId` + `admin.writeDisabledReason` | `DataQualityFlags.tsx:26` | **LIVE** (admin) |
| `dataQualityActions.ts:92` | `emitAuditEvent` (DQ) | `cr664_auditevents` | create | category Exception 788190007, type ExceptionResolved, entity Configuration | — | ChangedBy/ActorUser→`/systemusers` ⚠, ownerid ⚠ | same | Admin Console | **LIVE** |

## Domain: CRM automation

`runDealCrmAutomation` = **DEAD-CODE** at runtime (see new-deal table). `src/crm/crmDataverseMapper.ts`
is a **pure mapper** (no IO; builds payloads/binds only, incl. a `cr664_crmauditentry` row for a
different table) — not a write path. No live caller constructs a CRM Dataverse `create`/`update`;
no CRM-entity service exists in `src/generated/services`.

## Domain: portfolio / boarding side-effects

| file:line | fn | entity set | op | default | status |
|---|---|---|---|---|---|
| `newDealPortfolioSideEffectsAdapter.ts:87` | `runNewDealPortfolioSideEffects` | portfolio bind | create | `PORTFOLIO_SIDE_EFFECTS_ENABLED=false`; default `skipped_not_needed`; no transport injected | **DEAD-CODE** |
| `portfolioBoarding/portfolioLoanBoardingLivePersistence.ts` | live persistence (`createBoardedLoan`/`updateBoardedLoan`/`attachDocumentRecord`/`addException`/`resolveException`/`addReview`/`addEvidenceLink`) | `cr664_portfolioboardedloan*` | create/update | `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED=false`; default factory is the disabled fail-closed stub | **DISABLED** |

## Domain: identity / user provisioning

**No runtime Dataverse write to identity tables.** `src/bootstrap/bootstrapFlow.ts` and
`workspaceEntitlements.ts` are read-only. `src/admin/adminUserAccessModel.ts` has
`USER_ACCESS_LIVE_WRITE_ENABLED=false`; `buildGrantAccessPreview` is pure. Platform-user / CoreUser /
audit-actor bridge seeds live in **operator seed scripts** (`scripts/phase122-lookup-repair.mjs`),
**not** runtime `src/` app code → out of runtime scope. No `Service.create`/`createRecordAsync`
against `cr664_platformusers`, `cr664_users`, `cr664_userroles`, `cr664_workspacetypes`, or
`systemusers` anywhere in non-test `src/`.

---

## Summary counts

Counting distinct caller write sites (each `Service.create`/`update` call site = 1 row):

- **Total write paths: 35**
  - `cr664_loandeals` create: 1
  - `cr664_dealtask1s`: 2 (update, create)
  - `cr664_documentchecklists` update: 3
  - `cr664_creditmemo1s` create: 1; `cr664_creditmemodraftsections` create: 1
  - `cr664_alertqueues` update: 1; `cr664_dataqualityflags` update: 1
  - `cr664_auditevents` create: **13**
  - `cr664_dealtimelineevents` create: **10**
  - CRM link create: 1; portfolio side-effect create: 1
- **LIVE: 31** (all banker deal-workspace + activity + admin remediation + new-deal create incl. its audit)
- **DISABLED: 2** — portfolio boarding live persistence; stage-advance (flag-only capability, no concrete write site).
- **DEAD-CODE: 2** — `runDealCrmAutomation`, `runNewDealPortfolioSideEffects` (no transport injected by the runtime caller).
- **TEST-ONLY: 0**

## Cross-cutting flags for 187F / 187G

1. **Actor-target defect is widespread.** Every ⚠ above binds `/systemusers(<id>)` into
   `cr664_ChangedBy` / `cr664_ActorUser`. Live metadata proves `cr664_changedby` targets
   **`cr664_user`** — so these 12 governed writes carry the same bug New Deal create already fixed.
   See Phase 187F.
2. **owner/state over-send.** The 12 legacy emitters send `ownerid` / `owneridtype:'systemuser'` /
   `statecode:0` on audit/timeline rows; these are server-defaulted and should not be sent.
3. **New-Deal create is the only correct emitter** (`cr664_ChangedBy`→`/cr664_users` via resolver,
   no owner/state) and is the reference pattern for remediation.
4. **Email DRY_RUN ≠ no Dataverse write** — borrower-comm / doc-request / handoff audit + timeline
   rows write live even in DRY_RUN.
