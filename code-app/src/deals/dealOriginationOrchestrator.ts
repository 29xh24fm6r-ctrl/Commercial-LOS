/**
 * Phase 171-180 -- Deal origination orchestrator (controlled pipeline).
 *
 * One governed pipeline, not scattered side-effect calls:
 *   pre-create duplicate detection (warn) -> governed create -> create audit ->
 *   evaluate each downstream gate one by one -> complete typed result.
 *
 * Every downstream module is independently gated and DISABLED by default, so
 * creating a deal never secretly performs every automation. The governed create
 * itself is INJECTED (the controller's gated submit); downstream IO is injected
 * too, so nothing runs while disabled and no generated service / SDK is pulled
 * into this module. Partial failures are never hidden; a created deal whose
 * audit failed returns audit_failed_partial (never success), and downstream is
 * not run in that case (fail-closed).
 */

import { newCorrelationId } from '../shared/governance/correlationId';
import type { NewDealCreateOutcome } from './newDealCreateAdapter';
import {
  type DealOriginationFeatureFlagConfig,
} from './dealOriginationFeatureFlags';
import {
  type DealOriginationResult,
  type DealOriginationTopOutcomeKind,
  type CrmAutomationOutcome,
  type BorrowerInviteOutcome,
  type AutoStageAdvanceOutcome,
  type TaskGenerationOutcome,
  type DocumentChecklistOutcome,
  type PortfolioSideEffectsOutcome,
  type BorrowerMessagingOutcome,
  type DuplicateOutcome,
  type CreateStepOutcome,
  type AuditStepOutcome,
  isFailureKind,
} from './dealOriginationOutcomes';
import { runDealCrmAutomation, type RunCrmLink } from './dealCrmAutomationAdapter';
import { runBorrowerInviteAutomation, type RunInviteSend } from './borrowerInviteAutomationAdapter';
import { runAutoStageAdvance, type RunStageAdvance } from './autoStageAdvanceAdapter';
import { runNewDealTaskGeneration, type RunCreateTask } from './newDealTaskGenerationAdapter';
import { runNewDealChecklistGeneration, type RunCreateChecklistRow } from './newDealChecklistGenerationAdapter';
import { runNewDealPortfolioSideEffects, type RunPortfolioWrite } from './newDealPortfolioSideEffectsAdapter';
import { runBorrowerMessaging, type RunBorrowerSend } from './borrowerMessagingAdapter';
import {
  detectNewDealDuplicates,
  exactDuplicateBlocksCreate,
  type ExistingDealSignal,
} from './newDealDuplicateDetection';
import {
  evaluateCrmIntakeGate,
  crmIntakeGatePasses,
  crmIntakeBlockerMessage,
} from './newDealCrmIntakeGate';
import {
  evaluateLifecycleBeforeWrite,
  type LifecycleGovernanceInvocation,
} from '../governance/lifecycleGovernanceIntegration';

export interface DealOriginationFormInput {
  readonly dealName: string;
  readonly assignedBankerId: string;
  readonly actorSystemUserId: string;
  /** Actor email (UPN) -- used only to resolve the audit's cr664_ChangedBy
   *  cr664_user bind; never affects the loan-deal create. */
  readonly actorEmail?: string;
  readonly amount?: number;
  /** Selected EXISTING cr664_clientrelationship id -> cr664_Client at create. */
  readonly existingClientId?: string;
  /** Selected EXISTING cr664_team id -> cr664_Team at create. */
  readonly existingTeamId?: string;
}

export interface DealOriginationContext {
  readonly authorized?: boolean;
  readonly stageLabel?: string;
  readonly statusLabel?: string;
  // CRM-first intake gate (Step 1: CRM Client)
  /** Enforce the CRM client requirement before create. Default (unset) is the
   *  governed posture: required. Set false only for legacy/non-CRM callers. */
  readonly requireCrmClient?: boolean;
  /** Admin/gate allowance to create a deal with no CRM client (audited). */
  readonly allowCreateWithoutClient?: boolean;
  /** Whether ANY cr664_clientrelationships row exists (drives blocker copy). */
  readonly clientRelationshipsExist?: boolean;
  // borrower
  readonly borrowerEmail?: string;
  readonly borrowerPhone?: string;
  readonly borrowerProfilePresent?: boolean;
  readonly messagingTemplateKey?: string;
  // crm
  readonly crmLinkSupported?: boolean;
  // tasks / checklist
  readonly templateTaskNames?: readonly string[];
  readonly existingTaskNames?: readonly string[];
  readonly templateDocumentNames?: readonly string[];
  readonly existingDocumentNames?: readonly string[];
  // portfolio
  readonly portfolioDerivesFromDeal?: boolean;
  readonly explicitMappingApproved?: boolean;
  // auto-stage
  readonly currentStageCode?: string;
  readonly approvedSourceStageCode?: string;
  readonly targetStageBind?: string;
  readonly stageReadinessMet?: boolean;
  readonly stagePolicyAllows?: boolean;
  // duplicate
  readonly existingDeals?: readonly ExistingDealSignal[];
  readonly exactDuplicateBlocks?: boolean;
  /** Test-only detection-gate override. Production never sets it. */
  readonly detectionEnabledOverride?: boolean;
}

export interface DealOriginationInput {
  readonly form: DealOriginationFormInput;
  readonly config?: DealOriginationFeatureFlagConfig;
  readonly context?: DealOriginationContext;
}

/** Injected governed create (the controller's gated submit). */
export type RunGovernedCreate = (
  form: DealOriginationFormInput,
) => Promise<NewDealCreateOutcome>;

export interface DealOriginationDeps {
  /** Default: returns { kind: 'disabled' } -- no create. */
  readonly runGovernedCreate?: RunGovernedCreate;
  readonly runCrmLink?: RunCrmLink;
  readonly runInviteSend?: RunInviteSend;
  readonly runStageAdvance?: RunStageAdvance;
  readonly runCreateTask?: RunCreateTask;
  readonly runCreateChecklistRow?: RunCreateChecklistRow;
  readonly runPortfolioWrite?: RunPortfolioWrite;
  readonly runBorrowerSend?: RunBorrowerSend;
  readonly correlationId?: () => string;
  /** Optional PR 5 configurable-governance injection. Omitted is LEGACY_ONLY. */
  readonly lifecycleGovernance?: LifecycleGovernanceInvocation;
  /**
   * Test-only: inject a downstream module's whole outcome to exercise the
   * top-level determination. Production never sets these (the real adapters,
   * gated and disabled, run instead).
   */
  readonly modules?: {
    readonly crm?: () => Promise<CrmAutomationOutcome>;
    readonly invite?: () => Promise<BorrowerInviteOutcome>;
    readonly stage?: () => Promise<AutoStageAdvanceOutcome>;
    readonly task?: () => Promise<TaskGenerationOutcome>;
    readonly checklist?: () => Promise<DocumentChecklistOutcome>;
    readonly portfolio?: () => Promise<PortfolioSideEffectsOutcome>;
    readonly messaging?: () => Promise<BorrowerMessagingOutcome>;
  };
}

const DISABLED_CREATE: RunGovernedCreate = async () => ({
  kind: 'disabled',
  reason: 'Governed create is disabled by default.',
});

function skipped<K extends string>(module: string, kind: K): { module: string; kind: K; detail: string } {
  return { module, kind, detail: `${module} not run (create did not succeed or gate off).` };
}

const MODULE_RAN = new Set([
  'success',
  'sent',
  'prepared_not_sent',
  'partial_success',
  'merge_prepared_not_applied',
]);

export async function orchestrateDealOrigination(
  input: DealOriginationInput,
  deps: DealOriginationDeps = {},
): Promise<DealOriginationResult> {
  const correlationId = (deps.correlationId ?? (() => newCorrelationId('do')))();
  const ctx = input.context ?? {};
  const config = input.config;
  const operatorNotes: string[] = [];

  // Default (not-run) downstream outcomes.
  const crmOutcome: CrmAutomationOutcome = skipped('crm-automation', 'disabled') as CrmAutomationOutcome;
  const inviteOutcome: BorrowerInviteOutcome = skipped('borrower-invite', 'disabled') as BorrowerInviteOutcome;
  const stageOutcome: AutoStageAdvanceOutcome = skipped('auto-stage-advance', 'disabled') as AutoStageAdvanceOutcome;
  const taskOutcome: TaskGenerationOutcome = skipped('task-generation', 'disabled') as TaskGenerationOutcome;
  const checklistOutcome: DocumentChecklistOutcome = skipped('document-checklist', 'disabled') as DocumentChecklistOutcome;
  const portfolioOutcome: PortfolioSideEffectsOutcome = skipped('portfolio-side-effects', 'disabled') as PortfolioSideEffectsOutcome;
  const messagingOutcome: BorrowerMessagingOutcome = skipped('borrower-messaging', 'disabled') as BorrowerMessagingOutcome;

  // Pre-create duplicate detection (warning; never writes).
  const duplicateOutcome: DuplicateOutcome = detectNewDealDuplicates({
    config,
    candidateDealName: input.form.dealName,
    candidateBankerId: input.form.assignedBankerId,
    candidateAmount: input.form.amount,
    existing: ctx.existingDeals ?? [],
    exactDuplicateBlocks: ctx.exactDuplicateBlocks,
    detectionEnabledOverride: ctx.detectionEnabledOverride,
  });
  operatorNotes.push(`duplicate: ${duplicateOutcome.kind}`);

  const baseResult = (
    kind: DealOriginationTopOutcomeKind,
    createOutcome: CreateStepOutcome,
    auditOutcome: AuditStepOutcome,
    userFacingMessage: string,
    overrides: Partial<DealOriginationResult> = {},
  ): DealOriginationResult => ({
    kind,
    correlationId,
    actorSystemUserId: input.form.actorSystemUserId || undefined,
    dealName: input.form.dealName || undefined,
    stageLabel: ctx.stageLabel,
    statusLabel: ctx.statusLabel,
    createOutcome,
    auditOutcome,
    crmOutcome,
    borrowerInviteOutcome: inviteOutcome,
    stageAdvanceOutcome: stageOutcome,
    taskGenerationOutcome: taskOutcome,
    documentChecklistOutcome: checklistOutcome,
    portfolioOutcome,
    borrowerMessagingOutcome: messagingOutcome,
    duplicateOutcome,
    userFacingMessage,
    operatorNotes,
    ...overrides,
  });

  // Policy: an exact duplicate can block create only when policy says so.
  if (exactDuplicateBlocksCreate(duplicateOutcome, ctx.exactDuplicateBlocks)) {
    return baseResult(
      'downstream_blocked_by_policy',
      { kind: 'skipped' },
      { kind: 'skipped' },
      'An exact duplicate deal already exists; create was blocked by policy. No record has been created.',
    );
  }

  // CRM-first intake gate (Step 1: CRM Client). Fail-closed BEFORE any create,
  // so a missing client is an honest blocker before deal creation, not after.
  // The CRM-first surface opts in (requireCrmClient: true); a client is then
  // required unless an admin/gate allows a client-less deal.
  if (ctx.requireCrmClient === true) {
    const gate = evaluateCrmIntakeGate({
      selectedClientId: input.form.existingClientId,
      clientRelationshipsExist: ctx.clientRelationshipsExist,
      allowCreateWithoutClient: ctx.allowCreateWithoutClient,
    });
    if (!crmIntakeGatePasses(gate)) {
      operatorNotes.push(`crm-intake-gate: ${gate.kind}`);
      return baseResult(
        'client_required',
        { kind: 'skipped' },
        { kind: 'skipped' },
        crmIntakeBlockerMessage(gate),
      );
    }
  }

  const lifecycleGate = await evaluateLifecycleBeforeWrite(
    'origination',
    deps.lifecycleGovernance,
    { allowed: true, evidenceIds: ['legacy-origination-prechecks'] },
  );
  operatorNotes.push(
    `bank-credit-governance: ${lifecycleGate.trace.mode}/${lifecycleGate.allowed ? 'permit' : 'block'}`,
  );
  if (!lifecycleGate.allowed) {
    return baseResult(
      'unauthorized',
      { kind: 'skipped' },
      { kind: 'skipped' },
      lifecycleGate.safeMessage,
    );
  }

  // Governed create (gated; default disabled).
  const runCreate = deps.runGovernedCreate ?? DISABLED_CREATE;
  const create = await runCreate(input.form);

  switch (create.kind) {
    case 'disabled':
      return baseResult('disabled', { kind: 'skipped' }, { kind: 'skipped' },
        'New Deal creation is not enabled in this environment. No record has been created.');
    case 'validation_error':
      return baseResult('validation_error', { kind: 'skipped' }, { kind: 'skipped' },
        `Please fix the ${create.field} field. No record has been created.`);
    case 'unauthorized':
      return baseResult('unauthorized', { kind: 'skipped' }, { kind: 'skipped' },
        'You are not authorized to create deals here. No record has been created.');
    case 'client_required':
      return baseResult('client_required', { kind: 'skipped' }, { kind: 'skipped' }, create.reason);
    case 'resolver_not_ready':
      // Factory Arc Phase 11 — propagate the adapter's own specific reason
      // (missing/inactive/duplicate reference data vs. a Dataverse read
      // failure — resolverDetail() in newDealCreateAdapter.ts) instead of
      // one generic sentence for every cause.
      return baseResult('resolver_not_ready', { kind: 'skipped' }, { kind: 'skipped' },
        `${create.detail} No record has been created.`);
    case 'create_failed':
      return baseResult('create_failed', { kind: 'failed', error: create.error }, { kind: 'skipped' },
        'The deal could not be created. No record has been created.');
    case 'link_readback_mismatch':
      // The deal was created but its CRM client/team link did not verify on
      // readback -> honest partial; downstream does NOT run (fail-closed).
      operatorNotes.push(`link_readback_mismatch: ${create.detail}`);
      return baseResult(
        'link_readback_mismatch',
        { kind: 'success', dealId: create.dealId },
        { kind: 'failed', error: create.detail },
        'The deal was created, but its CRM client/team link could not be verified. An operator must confirm the link. Downstream automation did not run.',
        { createdDealId: create.dealId },
      );
    case 'audit_failed_partial':
      // Created, but audit failed -> honest partial; downstream does NOT run.
      operatorNotes.push(`audit_failed_partial: ${create.auditError}`);
      return baseResult(
        'audit_failed_partial',
        { kind: 'success', dealId: create.dealId },
        { kind: 'failed', error: create.auditError },
        'The deal was created, but its audit record failed. An operator must reattempt the audit. Downstream automation did not run.',
        { createdDealId: create.dealId },
      );
    case 'success':
      break;
    default:
      return baseResult('config_invalid', { kind: 'skipped' }, { kind: 'skipped' },
        'New Deal creation returned an unknown state; failing closed.');
  }

  // create.kind === 'success' beyond this point.
  const dealId = create.dealId;
  const createOutcome: CreateStepOutcome = { kind: 'success', dealId };
  const auditOutcome: AuditStepOutcome = { kind: 'success' };

  const downstreamBase = {
    dealId,
    actorSystemUserId: input.form.actorSystemUserId,
    authorized: ctx.authorized === true,
    correlationId,
    config,
  };

  const m = deps.modules ?? {};
  const ran = {
    crm: m.crm
      ? await m.crm()
      : await runDealCrmAutomation({ ...downstreamBase, crmLinkSupported: ctx.crmLinkSupported }, deps.runCrmLink),
    invite: m.invite
      ? await m.invite()
      : await runBorrowerInviteAutomation(
          { ...downstreamBase, borrowerEmail: ctx.borrowerEmail, borrowerPhone: ctx.borrowerPhone, borrowerProfilePresent: ctx.borrowerProfilePresent },
          deps.runInviteSend,
        ),
    stage: m.stage
      ? await m.stage()
      : await runAutoStageAdvance(
          {
            ...downstreamBase,
            currentStageCode: ctx.currentStageCode,
            approvedSourceStageCode: ctx.approvedSourceStageCode,
            targetStageBind: ctx.targetStageBind,
            readinessMet: ctx.stageReadinessMet,
            policyAllows: ctx.stagePolicyAllows,
          },
          deps.runStageAdvance,
        ),
    task: m.task
      ? await m.task()
      : await runNewDealTaskGeneration(
          { ...downstreamBase, templateTaskNames: ctx.templateTaskNames, existingTaskNames: ctx.existingTaskNames },
          deps.runCreateTask,
        ),
    checklist: m.checklist
      ? await m.checklist()
      : await runNewDealChecklistGeneration(
          { ...downstreamBase, templateDocumentNames: ctx.templateDocumentNames, existingDocumentNames: ctx.existingDocumentNames },
          deps.runCreateChecklistRow,
        ),
    portfolio: m.portfolio
      ? await m.portfolio()
      : await runNewDealPortfolioSideEffects(
          { ...downstreamBase, portfolioDerivesFromDeal: ctx.portfolioDerivesFromDeal, explicitMappingApproved: ctx.explicitMappingApproved },
          deps.runPortfolioWrite,
        ),
    messaging: m.messaging
      ? await m.messaging()
      : await runBorrowerMessaging(
          { ...downstreamBase, borrowerEmail: ctx.borrowerEmail, borrowerPhone: ctx.borrowerPhone, templateKey: ctx.messagingTemplateKey },
          deps.runBorrowerSend,
        ),
  };

  const modules = [ran.crm, ran.invite, ran.stage, ran.task, ran.checklist, ran.portfolio, ran.messaging];
  for (const m of modules) operatorNotes.push(`${m.module}: ${m.kind}`);

  const anyFailure = modules.some((m) => isFailureKind(m.kind));
  const anyRan = modules.some((m) => MODULE_RAN.has(m.kind));

  let top: DealOriginationTopOutcomeKind;
  let message: string;
  if (anyFailure) {
    top = 'created_with_downstream_partial_failure';
    message = 'The deal was created. One or more optional automations did not complete; see details.';
  } else if (anyRan) {
    top = 'success_created_with_automation';
    message = 'The deal was created and the enabled automations ran.';
  } else {
    top = 'success_created_only';
    message = 'The deal was created. No downstream automation was enabled.';
  }

  return baseResult(top, createOutcome, auditOutcome, message, {
    createdDealId: dealId,
    crmOutcome: ran.crm,
    borrowerInviteOutcome: ran.invite,
    stageAdvanceOutcome: ran.stage,
    taskGenerationOutcome: ran.task,
    documentChecklistOutcome: ran.checklist,
    portfolioOutcome: ran.portfolio,
    borrowerMessagingOutcome: ran.messaging,
  });
}
