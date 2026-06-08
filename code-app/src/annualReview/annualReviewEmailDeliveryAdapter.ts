/**
 * Phase 141N — Annual review email delivery adapter seam.
 *
 * Disabled by default. `previewEmail` may return preview-only subject/body with
 * a MASKED contact; `sendEmail` ALWAYS returns blocked. This file performs NO
 * network call and references NO external mail system (Outlook / Gmail / Graph /
 * Office365 / SMTP), no `mailto:`, and no `SendEmailV2`.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No `fetch`, no SDK import, no mail-provider call, no mailto.
 *   - `sendEmail` is blocked in this phase (email disabled + dry-run + send off).
 */

import type {
  AnnualReviewBorrowerRequestPackage,
  AnnualReviewBorrowerRequestRecipientDecision,
} from './annualReviewBorrowerRequestTypes';
import type {
  AnnualReviewEmailDeliveryRequest,
  AnnualReviewEmailDeliveryPreview,
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

export interface AnnualReviewEmailDeliveryAdapterInput {
  request: AnnualReviewEmailDeliveryRequest;
  package?: AnnualReviewBorrowerRequestPackage;
  recipientDecision: AnnualReviewBorrowerRequestRecipientDecision;
  approval: AnnualReviewDeliveryApproval;
}

export interface AnnualReviewEmailDeliveryAdapter {
  readonly enabled: boolean;
  previewEmail(
    input: AnnualReviewEmailDeliveryAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewEmailDeliveryPreview>;
  sendEmail(
    input: AnnualReviewEmailDeliveryAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewEmailDeliveryPreview>;
}

export interface AnnualReviewEmailDeliveryAdapterOptions {
  featureFlags?: AnnualReviewDeliveryFeatureFlagState;
  validationGate?: typeof validateAnnualReviewDeliveryRequest;
  /** Optional injected transport — never used to send in this phase. */
  transport?: unknown;
  clock?: () => string;
}

export function createAnnualReviewEmailDeliveryAdapter(
  options: AnnualReviewEmailDeliveryAdapterOptions = {},
): AnnualReviewEmailDeliveryAdapter {
  const flags = options.featureFlags ?? deriveAnnualReviewDeliveryFeatureFlagState();
  const validate = options.validationGate ?? validateAnnualReviewDeliveryRequest;
  const enabled = flags.ANNUAL_REVIEW_EMAIL_ADAPTER_ENABLED === true;

  function runValidation(input: AnnualReviewEmailDeliveryAdapterInput) {
    const validateInput: ValidateAnnualReviewDeliveryInput = {
      channel: 'email',
      intent: input.request.intent,
      package: input.package,
      recipientDecision: input.recipientDecision,
      flags,
      approval: input.approval,
    };
    return validate(validateInput);
  }

  function previewEmail(
    input: AnnualReviewEmailDeliveryAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewEmailDeliveryPreview> {
    const validation = runValidation(input);
    const decision = input.recipientDecision;
    const auditSummary = buildAnnualReviewDeliveryAuditSummary({
      channel: 'email',
      intent: input.request.intent,
      approval: input.approval,
      validation,
      recipientDisplayName: decision.selectedDisplayName,
      recipientContact: decision.selectedContactValueMasked,
      blockedReason: validation.eligibleForPreview ? undefined : validation.errorCode,
    });

    if (!validation.eligibleForPreview) {
      return { ok: false, operation: 'previewEmail', channel: 'email', blocked: true, errorCode: validation.errorCode, auditSummary };
    }

    const borrower = input.package?.borrowerName ?? 'the borrower';
    const preview: AnnualReviewEmailDeliveryPreview = {
      channel: 'email',
      intent: input.request.intent,
      recipientDisplayName: decision.selectedDisplayName,
      recipientContactMasked: decision.selectedContactValueMasked,
      subjectPreview: `Annual review document request — ${borrower}`,
      bodyPreview:
        'Preview only. Human approval is required and no email is sent in this phase. No external mail system is contacted.',
      auditSummary,
    };
    return { ok: true, operation: 'previewEmail', channel: 'email', blocked: false, data: preview, auditSummary };
  }

  function sendEmail(
    input: AnnualReviewEmailDeliveryAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewEmailDeliveryPreview> {
    const validation = runValidation(input);
    const errorCode = !enabled ? 'delivery_email_disabled' : validation.errorCode ?? 'delivery_dry_run_only';
    const auditSummary = buildAnnualReviewDeliveryAuditSummary({
      channel: 'email',
      intent: input.request.intent,
      approval: input.approval,
      validation,
      recipientDisplayName: input.recipientDecision.selectedDisplayName,
      recipientContact: input.recipientDecision.selectedContactValueMasked,
      blockedReason: errorCode,
    });
    return {
      ok: false,
      operation: 'sendEmail',
      channel: 'email',
      blocked: true,
      errorCode,
      message: 'Email delivery is disabled in this phase. No email was composed or sent.',
      auditSummary,
    };
  }

  return { enabled, previewEmail, sendEmail };
}

export function createDisabledAnnualReviewEmailDeliveryAdapter(): AnnualReviewEmailDeliveryAdapter {
  return createAnnualReviewEmailDeliveryAdapter({
    featureFlags: deriveAnnualReviewDeliveryFeatureFlagState(),
  });
}
