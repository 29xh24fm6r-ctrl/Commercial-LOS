/**
 * Phase 141N — Annual review SMS delivery adapter seam.
 *
 * Disabled by default. `previewSms` may return preview-only text with a MASKED
 * contact; `sendSms` ALWAYS returns blocked. This file performs NO network call
 * and references NO SMS provider (Twilio / any messaging gateway) and no phone
 * transport.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No `fetch`, no SDK import, no SMS-provider call.
 *   - `sendSms` is blocked in this phase (SMS disabled + dry-run + send off).
 */

import type {
  AnnualReviewBorrowerRequestPackage,
  AnnualReviewBorrowerRequestRecipientDecision,
} from './annualReviewBorrowerRequestTypes';
import type {
  AnnualReviewSmsDeliveryRequest,
  AnnualReviewSmsDeliveryPreview,
  AnnualReviewDeliveryApproval,
  AnnualReviewDeliveryAdapterResult,
} from './annualReviewDeliveryTypes';
import {
  validateAnnualReviewDeliveryRequest,
  type ValidateAnnualReviewDeliveryInput,
} from './validateAnnualReviewDeliveryRequest';
import { buildAnnualReviewDeliveryAuditSummary } from './buildAnnualReviewDeliveryAuditSummary';
import {
  deriveAnnualReviewDeliveryFeatureFlagState,
  type AnnualReviewDeliveryFeatureFlagState,
} from './annualReviewDeliveryFeatureFlags';

export interface AnnualReviewSmsDeliveryAdapterInput {
  request: AnnualReviewSmsDeliveryRequest;
  package?: AnnualReviewBorrowerRequestPackage;
  recipientDecision: AnnualReviewBorrowerRequestRecipientDecision;
  approval: AnnualReviewDeliveryApproval;
}

export interface AnnualReviewSmsDeliveryAdapter {
  readonly enabled: boolean;
  previewSms(
    input: AnnualReviewSmsDeliveryAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewSmsDeliveryPreview>;
  sendSms(
    input: AnnualReviewSmsDeliveryAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewSmsDeliveryPreview>;
}

export interface AnnualReviewSmsDeliveryAdapterOptions {
  featureFlags?: AnnualReviewDeliveryFeatureFlagState;
  validationGate?: typeof validateAnnualReviewDeliveryRequest;
  /** Optional injected transport — never used to send in this phase. */
  transport?: unknown;
  clock?: () => string;
}

export function createAnnualReviewSmsDeliveryAdapter(
  options: AnnualReviewSmsDeliveryAdapterOptions = {},
): AnnualReviewSmsDeliveryAdapter {
  const flags = options.featureFlags ?? deriveAnnualReviewDeliveryFeatureFlagState();
  const validate = options.validationGate ?? validateAnnualReviewDeliveryRequest;
  const enabled = flags.ANNUAL_REVIEW_SMS_ADAPTER_ENABLED === true;

  function runValidation(input: AnnualReviewSmsDeliveryAdapterInput) {
    const validateInput: ValidateAnnualReviewDeliveryInput = {
      channel: 'sms',
      intent: input.request.intent,
      package: input.package,
      recipientDecision: input.recipientDecision,
      flags,
      approval: input.approval,
    };
    return validate(validateInput);
  }

  function previewSms(
    input: AnnualReviewSmsDeliveryAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewSmsDeliveryPreview> {
    const validation = runValidation(input);
    const decision = input.recipientDecision;
    const auditSummary = buildAnnualReviewDeliveryAuditSummary({
      channel: 'sms',
      intent: input.request.intent,
      approval: input.approval,
      validation,
      recipientDisplayName: decision.selectedDisplayName,
      recipientContact: decision.selectedContactValueMasked,
      blockedReason: validation.eligibleForPreview ? undefined : validation.errorCode,
    });

    if (!validation.eligibleForPreview) {
      return { ok: false, operation: 'previewSms', channel: 'sms', blocked: true, errorCode: validation.errorCode, auditSummary };
    }

    const preview: AnnualReviewSmsDeliveryPreview = {
      channel: 'sms',
      intent: input.request.intent,
      recipientContactMasked: decision.selectedContactValueMasked,
      textPreview:
        'Annual review document request notification (preview only). No message is sent and no provider is contacted in this phase.',
      auditSummary,
    };
    return { ok: true, operation: 'previewSms', channel: 'sms', blocked: false, data: preview, auditSummary };
  }

  function sendSms(
    input: AnnualReviewSmsDeliveryAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewSmsDeliveryPreview> {
    const validation = runValidation(input);
    const errorCode = !enabled ? 'delivery_sms_disabled' : validation.errorCode ?? 'delivery_dry_run_only';
    const auditSummary = buildAnnualReviewDeliveryAuditSummary({
      channel: 'sms',
      intent: input.request.intent,
      approval: input.approval,
      validation,
      recipientDisplayName: input.recipientDecision.selectedDisplayName,
      recipientContact: input.recipientDecision.selectedContactValueMasked,
      blockedReason: errorCode,
    });
    return {
      ok: false,
      operation: 'sendSms',
      channel: 'sms',
      blocked: true,
      errorCode,
      message: 'SMS delivery is disabled in this phase. No message was composed or sent.',
      auditSummary,
    };
  }

  return { enabled, previewSms, sendSms };
}

export function createDisabledAnnualReviewSmsDeliveryAdapter(): AnnualReviewSmsDeliveryAdapter {
  return createAnnualReviewSmsDeliveryAdapter({
    featureFlags: deriveAnnualReviewDeliveryFeatureFlagState(),
  });
}
