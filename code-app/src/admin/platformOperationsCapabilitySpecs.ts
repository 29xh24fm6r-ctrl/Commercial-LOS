/**
 * Factory Arc Phase 4 — Platform Operations Workspace.
 *
 * Pure, hand-authored per-capability specs for the 12 capabilities the phase
 * asks an admin to be able to inspect: New Deal creation, Stage advancement,
 * Task generation, Document requirement workflow, Borrower email, Borrower SMS,
 * CRM manual writes, CRM automated writeback, Portfolio manual boarding,
 * Portfolio automatic boarding, Document upload, Audit-event writes.
 *
 * Every `flags` value below is read directly from the real feature-flag
 * constant — never re-typed as a literal. `routeState` / `diState` /
 * `actorAuthorizationRequirement` / `auditSinkState` / `rollback` are static
 * architecture facts (true today, verified by reading the referenced files),
 * not live probes — there is no runtime "DI container" in this codebase to
 * introspect (see platformOperationsLiveDeps.ts's header comment).
 *
 * Two capabilities (`crm-manual-write`, `audit-event-writes`) have NO boolean
 * kill-switch in the codebase — they are gated by actor identity/authorization
 * only, or are an unconditional side effect of every other governed write.
 * `deriveOperatorLaunchConsole` can only classify a capability as
 * enabled/disabled/blocked from flags; with zero required flags it reports
 * 'disabled' ("no required gate asserts this capability is on"). That
 * under-claims rather than over-claims — the safe direction — and the
 * `diState`/`auditSinkState` text on each spec below carries the real nuance
 * for a human reader instead of fabricating a flag that doesn't exist.
 */

import {
  AUTO_STAGE_ADVANCE_ENABLED,
  TASK_GENERATION_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  BORROWER_EMAIL_TRANSPORT_ENABLED,
  BORROWER_SMS_TRANSPORT_ENABLED,
  BORROWER_TWILIO_TRANSPORT_ENABLED,
  DOCUMENT_FILE_UPLOAD_ENABLED,
  BANKER_NEW_DEAL_CREATE_ENABLED,
} from '../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../deals/newDealCreateFeatureFlags';
import { BANKER_CREATE_PILOT_ENABLED } from '../deals/bankerCreatePilotConfig';
import { CRM_LIVE_PERSISTENCE_ENABLED } from '../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import { PORTFOLIO_BOARDING_ADMIN_LIVE_WRITE_ENABLED } from './adminPortfolioBoardingModel';
import { DOCUMENT_UPLOAD_ENABLED } from '../activation/documentUploadActivation';
import type { CapabilityControlInput } from '../access/operatorLaunchConsoleModel';
import type { SmokeCapability } from '../access/operatorSmokeEvidenceRegistry';

/** The subset of a spec the live-deps module fills in (smoke/write evidence). */
export type PlatformOperationsCapabilitySpec = Omit<
  CapabilityControlInput,
  'latestSmoke' | 'latestSuccessfulWrite' | 'latestFailedWrite' | 'enabledBy' | 'enabledOn'
> & { key: SmokeCapability };

export const PLATFORM_OPERATIONS_CAPABILITY_SPECS: readonly PlatformOperationsCapabilitySpec[] = [
  {
    key: 'new-deal-create',
    label: 'New Deal creation',
    category: 'deal',
    flags: [
      { name: 'BANKER_CREATE_PILOT_ENABLED', value: BANKER_CREATE_PILOT_ENABLED, required: true },
      { name: 'BANKER_NEW_DEAL_CREATE_ENABLED', value: BANKER_NEW_DEAL_CREATE_ENABLED, required: false },
      { name: 'NEW_DEAL_CREATE_ADAPTER_ENABLED', value: NEW_DEAL_CREATE_ADAPTER_ENABLED, required: false },
    ],
    routeState: 'Mounted — "+ New Deal" in BankerNewDealCreate.tsx, gated by bankerCreatePilotGateValues().',
    diState: 'Live write adapter wired: newDealCreateAdapter.ts (governed create, actor-resolved audit).',
    actorAuthorizationRequirement:
      'Resolved Dataverse systemuser + banker authorization; approved-production reference resolver must return Ready.',
    auditSinkState: "Writes audited via dealOriginationAudit.ts -> cr664_AuditEvent (cr664_ChangedBy bound to cr664_user).",
    rollback: 'Set BANKER_CREATE_PILOT_ENABLED = false in src/deals/bankerCreatePilotConfig.ts.',
  },
  {
    key: 'stage-progression',
    label: 'Stage advancement',
    category: 'stage',
    flags: [{ name: 'AUTO_STAGE_ADVANCE_ENABLED', value: AUTO_STAGE_ADVANCE_ENABLED, required: true }],
    routeState: 'Mounted — stage-advance controls on the deal workspace, gated by AUTO_STAGE_ADVANCE_ENABLED.',
    diState: 'Live write adapter wired: buildLiveStageAdvanceDeps.ts (governed advance, audited).',
    actorAuthorizationRequirement: 'Resolved actor identity + stage-transition authority per approvalAuthorityMatrix.ts.',
    auditSinkState: 'Writes audited via dealOriginationAudit.ts -> cr664_AuditEvent.',
    rollback: 'Set AUTO_STAGE_ADVANCE_ENABLED = false in src/deals/dealOriginationFeatureFlags.ts.',
  },
  {
    key: 'task-generation',
    label: 'Task generation',
    category: 'deal',
    flags: [{ name: 'TASK_GENERATION_ENABLED', value: TASK_GENERATION_ENABLED, required: true }],
    routeState: 'Mounted — task rows generated on deal-workflow triggers.',
    diState: 'Live write adapter wired: createDealTaskAction.ts / dealTaskActions.ts.',
    actorAuthorizationRequirement: 'Resolved actor identity; no additional role gate beyond deal access.',
    auditSinkState: 'Writes audited via dealOriginationAudit.ts -> cr664_AuditEvent.',
    rollback: 'Set TASK_GENERATION_ENABLED = false in src/deals/dealOriginationFeatureFlags.ts.',
  },
  {
    key: 'checklist-generation',
    label: 'Document requirement workflow',
    category: 'checklist',
    flags: [
      { name: 'DOCUMENT_CHECKLIST_GENERATION_ENABLED', value: DOCUMENT_CHECKLIST_GENERATION_ENABLED, required: true },
    ],
    routeState: 'Mounted — "Generate checklist" action in the Document Requirement workspace.',
    diState: 'Live write adapter wired: checklistLiveWriteDeps.ts / documentRequirementLiveDeps.ts.',
    actorAuthorizationRequirement: 'Resolved actor identity via the platform-user bridge (cr664_ChangedBy bind).',
    auditSinkState: 'Writes audited via dealOriginationAudit.ts -> cr664_AuditEvent.',
    rollback: 'Set DOCUMENT_CHECKLIST_GENERATION_ENABLED = false in src/deals/dealOriginationFeatureFlags.ts.',
  },
  {
    key: 'borrower-communication',
    label: 'Borrower email',
    category: 'comms',
    flags: [
      { name: 'BORROWER_MESSAGING_ENABLED', value: BORROWER_MESSAGING_ENABLED, required: true },
      { name: 'BORROWER_EMAIL_TRANSPORT_ENABLED', value: BORROWER_EMAIL_TRANSPORT_ENABLED, required: true },
    ],
    routeState: 'Mounted — send actions in DraftBorrowerUpdateModal.tsx / RequestDocumentModal.tsx.',
    diState:
      'Live write adapter wired: sendBorrowerUpdateEmail.ts / sendDocumentRequestEmail.ts (EMAIL_MODE governs live vs local-log transport).',
    actorAuthorizationRequirement: 'Resolved actor identity; recipient validated against the approved borrower contact.',
    auditSinkState: 'Writes audited via dealOriginationAudit.ts -> cr664_AuditEvent, plus a deal timeline entry.',
    rollback: 'Set BORROWER_MESSAGING_ENABLED / BORROWER_EMAIL_TRANSPORT_ENABLED = false in src/deals/dealOriginationFeatureFlags.ts.',
  },
  {
    key: 'borrower-sms',
    label: 'Borrower SMS',
    category: 'comms',
    flags: [
      { name: 'BORROWER_SMS_TRANSPORT_ENABLED', value: BORROWER_SMS_TRANSPORT_ENABLED, required: true },
      { name: 'BORROWER_TWILIO_TRANSPORT_ENABLED', value: BORROWER_TWILIO_TRANSPORT_ENABLED, required: false },
    ],
    blockers: ['No borrower SMS transport adapter exists in the codebase yet.'],
    routeState: 'Not mounted — no borrower SMS send action exists in the UI today.',
    diState: 'No live write adapter wired; no SMS transport (e.g. Twilio) integration exists yet.',
    actorAuthorizationRequirement: 'Not applicable — the capability has not been built.',
    auditSinkState: 'Not applicable — there is no write path to audit yet.',
    rollback: 'N/A — capability not built.',
  },
  {
    key: 'crm-manual-write',
    label: 'CRM manual writes',
    category: 'crm',
    flags: [],
    routeState: 'Mounted — CRM Hub write actions, gated only by actor authorization (no boolean flag).',
    diState:
      'Live write adapter wired: crmWriteAdapter.ts (buildLiveCrmWriteDeps). Gated by authGate(actor) — identity/authorization, not a global flag.',
    actorAuthorizationRequirement: 'actor.authorized === true and a resolved Dataverse systemuserid + email; fail-closed otherwise.',
    auditSinkState: 'Writes audited via crmWriteAdapter.ts buildAuditPayload -> cr664_AuditEvent.',
    rollback: 'N/A — no independent flag exists; disable by revoking the actor\'s CRM write authorization.',
  },
  {
    key: 'crm-writeback',
    label: 'CRM automated writeback',
    category: 'crm',
    flags: [{ name: 'CRM_LIVE_PERSISTENCE_ENABLED', value: CRM_LIVE_PERSISTENCE_ENABLED, required: true }],
    routeState: 'Not mounted for live persistence — CRM_ROUTE_ENABLED is off; CRM records render read-only.',
    diState: 'Adapter exists (crmControlledWritebackAdapter.ts) but is not invoked while the flag is off.',
    actorAuthorizationRequirement: 'Resolved actor identity + CRM write authorization, once enabled.',
    auditSinkState: 'No writes occur while disabled; would audit via the same cr664_AuditEvent pattern once enabled.',
    rollback: 'Already off. Keep CRM_LIVE_PERSISTENCE_ENABLED = false in src/crm/crmFeatureFlags.ts.',
  },
  {
    key: 'portfolio-boarding-manual',
    label: 'Portfolio manual boarding',
    category: 'portfolio',
    flags: [
      {
        name: 'PORTFOLIO_BOARDING_ADMIN_LIVE_WRITE_ENABLED',
        value: PORTFOLIO_BOARDING_ADMIN_LIVE_WRITE_ENABLED,
        required: true,
      },
    ],
    routeState: 'Mounted — PortfolioLoanBoardingForm.tsx in the Admin workspace.',
    diState: 'Live write adapter wired: portfolioLoanBoardingDataverseAdapter.ts.',
    actorAuthorizationRequirement: 'Admin workspace entitlement (adminWorkspaceEntitlementQuery.ts) + resolved actor identity.',
    auditSinkState: 'Writes audited via the dealOriginationAudit.ts pattern -> cr664_AuditEvent.',
    rollback: 'Set PORTFOLIO_BOARDING_ADMIN_LIVE_WRITE_ENABLED = false in src/admin/adminPortfolioBoardingModel.ts.',
  },
  {
    key: 'portfolio-boarding',
    label: 'Portfolio automatic boarding',
    category: 'portfolio',
    flags: [
      {
        name: 'PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED',
        value: PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED,
        required: true,
      },
      {
        name: 'PORTFOLIO_BOARDING_ROUTE_ENABLED',
        value: PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_ROUTE_ENABLED,
        required: true,
      },
    ],
    routeState: 'Not mounted — PORTFOLIO_BOARDING_ROUTE_ENABLED is off.',
    diState: 'Adapter exists but is not invoked while the flags are off.',
    actorAuthorizationRequirement: 'Resolved actor identity + boarding authorization, once enabled.',
    auditSinkState: 'No writes occur while disabled; would audit via the same cr664_AuditEvent pattern once enabled.',
    rollback:
      'Already off. Keep PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED / PORTFOLIO_BOARDING_ROUTE_ENABLED = false in src/portfolioBoarding/portfolioLoanBoardingFeatureFlags.ts.',
  },
  {
    key: 'document-upload',
    label: 'Document upload',
    category: 'document',
    flags: [
      { name: 'DOCUMENT_FILE_UPLOAD_ENABLED', value: DOCUMENT_FILE_UPLOAD_ENABLED, required: true },
      { name: 'DOCUMENT_UPLOAD_ENABLED', value: DOCUMENT_UPLOAD_ENABLED, required: false },
    ],
    routeState: 'Live file picker in ReceiveDocumentModal.tsx; explicit runtime config can still kill-switch it.',
    diState:
      'Live write adapter wired: documentUploadLiveDeps.ts / documentUploadAction.ts. Both launch constants are armed after live FileType metadata verification.',
    actorAuthorizationRequirement: 'Resolved actor identity via the platform-user bridge.',
    auditSinkState: 'Writes audited via dealOriginationAudit.ts -> cr664_AuditEvent.',
    rollback: 'Set DOCUMENT_FILE_UPLOAD_ENABLED = false in src/deals/dealOriginationFeatureFlags.ts.',
  },
  {
    key: 'audit-event-writes',
    label: 'Audit-event writes',
    category: 'observability',
    flags: [],
    routeState: 'Not applicable — audit writes have no independent UI entry point.',
    diState:
      'Emitted by every governed write adapter via dealOriginationAudit.ts -> Cr664_auditeventsService. No independent kill switch exists.',
    actorAuthorizationRequirement: "Same as the triggering write (resolved actor identity via the cr664_ChangedBy bind).",
    auditSinkState: 'IS the audit sink — see the Audit History live query for recent events.',
    rollback: 'N/A — no independent flag; disabling requires disabling the triggering capability itself.',
  },
];
