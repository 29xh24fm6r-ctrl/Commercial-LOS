/**
 * Phase 141N — Annual review upload-link adapter seam.
 *
 * Disabled by default. `previewUploadLinkRequest` may return safe preview
 * metadata (no token, no live URL); `createUploadLink` ALWAYS returns blocked.
 * This file performs NO network call and generates NO token / live URL.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No `fetch`, no SDK import, no token generation, no live URL.
 *   - `createUploadLink` is blocked in this phase (generation disabled +
 *     dry-run only + send disabled).
 */

import type {
  AnnualReviewBorrowerRequestPackage,
  AnnualReviewBorrowerRequestRecipientDecision,
} from './annualReviewBorrowerRequestTypes';
import type {
  AnnualReviewUploadLinkRequest,
  AnnualReviewUploadLinkPreview,
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

export interface AnnualReviewUploadLinkAdapterInput {
  request: AnnualReviewUploadLinkRequest;
  package?: AnnualReviewBorrowerRequestPackage;
  recipientDecision: AnnualReviewBorrowerRequestRecipientDecision;
  approval: AnnualReviewDeliveryApproval;
}

export interface AnnualReviewUploadLinkAdapter {
  readonly enabled: boolean;
  previewUploadLinkRequest(
    input: AnnualReviewUploadLinkAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewUploadLinkPreview>;
  createUploadLink(
    input: AnnualReviewUploadLinkAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewUploadLinkPreview>;
}

export interface AnnualReviewUploadLinkAdapterOptions {
  featureFlags?: AnnualReviewDeliveryFeatureFlagState;
  validationGate?: typeof validateAnnualReviewDeliveryRequest;
  /** Optional injected transport — never used to send in this phase. */
  transport?: unknown;
  clock?: () => string;
}

export function createAnnualReviewUploadLinkAdapter(
  options: AnnualReviewUploadLinkAdapterOptions = {},
): AnnualReviewUploadLinkAdapter {
  const flags = options.featureFlags ?? deriveAnnualReviewDeliveryFeatureFlagState();
  const validate = options.validationGate ?? validateAnnualReviewDeliveryRequest;
  const enabled = flags.ANNUAL_REVIEW_UPLOAD_LINK_ADAPTER_ENABLED === true;

  function runValidation(input: AnnualReviewUploadLinkAdapterInput) {
    const validateInput: ValidateAnnualReviewDeliveryInput = {
      channel: 'upload_link',
      intent: input.request.intent,
      package: input.package,
      recipientDecision: input.recipientDecision,
      flags,
      approval: input.approval,
    };
    return validate(validateInput);
  }

  function previewUploadLinkRequest(
    input: AnnualReviewUploadLinkAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewUploadLinkPreview> {
    const validation = runValidation(input);
    const decision = input.recipientDecision;
    const auditSummary = buildAnnualReviewDeliveryAuditSummary({
      channel: 'upload_link',
      intent: input.request.intent,
      approval: input.approval,
      validation,
      recipientDisplayName: decision.selectedDisplayName,
      recipientContact: decision.selectedContactValueMasked,
      blockedReason: validation.eligibleForPreview ? undefined : validation.errorCode,
    });

    if (!validation.eligibleForPreview) {
      return { ok: false, operation: 'previewUploadLinkRequest', channel: 'upload_link', blocked: true, errorCode: validation.errorCode, auditSummary };
    }

    const preview: AnnualReviewUploadLinkPreview = {
      channel: 'upload_link',
      intent: input.request.intent,
      recipientDisplayName: decision.selectedDisplayName,
      recipientContactMasked: decision.selectedContactValueMasked,
      instructionsPreview:
        'Secure upload instructions preview only. No upload link is generated and no token is created in this phase.',
      requestedValidityDays: input.request.requestedValidityDays,
      hasLiveUrl: false,
      hasToken: false,
      auditSummary,
    };
    return { ok: true, operation: 'previewUploadLinkRequest', channel: 'upload_link', blocked: false, data: preview, auditSummary };
  }

  function createUploadLink(
    input: AnnualReviewUploadLinkAdapterInput,
  ): AnnualReviewDeliveryAdapterResult<AnnualReviewUploadLinkPreview> {
    const validation = runValidation(input);
    // Live link generation is blocked in this phase regardless of inputs.
    const errorCode = !enabled
      ? 'delivery_upload_link_generation_disabled'
      : validation.errorCode ?? 'delivery_dry_run_only';
    const auditSummary = buildAnnualReviewDeliveryAuditSummary({
      channel: 'upload_link',
      intent: input.request.intent,
      approval: input.approval,
      validation,
      recipientDisplayName: input.recipientDecision.selectedDisplayName,
      recipientContact: input.recipientDecision.selectedContactValueMasked,
      blockedReason: errorCode,
    });
    return {
      ok: false,
      operation: 'createUploadLink',
      channel: 'upload_link',
      blocked: true,
      errorCode,
      message: 'Upload-link generation is disabled in this phase. No token or live URL was created.',
      auditSummary,
    };
  }

  return { enabled, previewUploadLinkRequest, createUploadLink };
}

export function createDisabledAnnualReviewUploadLinkAdapter(): AnnualReviewUploadLinkAdapter {
  return createAnnualReviewUploadLinkAdapter({
    featureFlags: deriveAnnualReviewDeliveryFeatureFlagState(),
  });
}
