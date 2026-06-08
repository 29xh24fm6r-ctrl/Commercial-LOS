/**
 * Phase 141N — Annual review delivery adapter resolver / orchestrator.
 *
 * Returns disabled upload-link / email / SMS adapters by default and exposes one
 * safe facade: `previewDelivery` (preview-only output) and `attemptDelivery`
 * (ALWAYS blocked in this phase — send disabled + dry-run only). No side effects,
 * no route registration, no component-level transport.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Disabled by default. `attemptDelivery` never sends in this phase.
 *   - No `fetch`, no SDK import, no network call.
 */

import type {
  AnnualReviewBorrowerRequestPackage,
  AnnualReviewBorrowerRequestRecipientDecision,
} from './annualReviewBorrowerRequestTypes';
import type {
  AnnualReviewDeliveryChannel,
  AnnualReviewDeliveryRequest,
  AnnualReviewUploadLinkRequest,
  AnnualReviewEmailDeliveryRequest,
  AnnualReviewSmsDeliveryRequest,
  AnnualReviewDeliveryApproval,
  AnnualReviewDeliveryAdapterResult,
} from './annualReviewDeliveryTypes';
import {
  createAnnualReviewUploadLinkAdapter,
  type AnnualReviewUploadLinkAdapter,
} from './annualReviewUploadLinkAdapter';
import {
  createAnnualReviewEmailDeliveryAdapter,
  type AnnualReviewEmailDeliveryAdapter,
} from './annualReviewEmailDeliveryAdapter';
import {
  createAnnualReviewSmsDeliveryAdapter,
  type AnnualReviewSmsDeliveryAdapter,
} from './annualReviewSmsDeliveryAdapter';
import {
  deriveAnnualReviewDeliveryFeatureFlagState,
  type AnnualReviewDeliveryFeatureFlagState,
} from './annualReviewDeliveryFeatureFlags';

export interface AnnualReviewDeliveryFacadeInput {
  request: AnnualReviewDeliveryRequest;
  package?: AnnualReviewBorrowerRequestPackage;
  recipientDecision: AnnualReviewBorrowerRequestRecipientDecision;
  approval: AnnualReviewDeliveryApproval;
}

export interface AnnualReviewDeliveryAdapterSet {
  uploadLinkAdapter: AnnualReviewUploadLinkAdapter;
  emailAdapter: AnnualReviewEmailDeliveryAdapter;
  smsAdapter: AnnualReviewSmsDeliveryAdapter;
  /** STRUCTURAL: live sending is never resolved in this phase. */
  live: false;
  previewDelivery(
    channel: AnnualReviewDeliveryChannel,
    input: AnnualReviewDeliveryFacadeInput,
  ): AnnualReviewDeliveryAdapterResult<unknown>;
  attemptDelivery(
    channel: AnnualReviewDeliveryChannel,
    input: AnnualReviewDeliveryFacadeInput,
  ): AnnualReviewDeliveryAdapterResult<unknown>;
}

export interface ResolveAnnualReviewDeliveryAdaptersOptions {
  flags?: AnnualReviewDeliveryFeatureFlagState;
}

function unsupported(channel: AnnualReviewDeliveryChannel, operation: string): AnnualReviewDeliveryAdapterResult<unknown> {
  return { ok: false, operation, channel, blocked: true, errorCode: 'delivery_unsupported_channel', message: `Unsupported delivery channel: ${channel}.` };
}

export function resolveAnnualReviewDeliveryAdapters(
  options: ResolveAnnualReviewDeliveryAdaptersOptions = {},
): AnnualReviewDeliveryAdapterSet {
  const flags = options.flags ?? deriveAnnualReviewDeliveryFeatureFlagState();

  const uploadLinkAdapter = createAnnualReviewUploadLinkAdapter({ featureFlags: flags });
  const emailAdapter = createAnnualReviewEmailDeliveryAdapter({ featureFlags: flags });
  const smsAdapter = createAnnualReviewSmsDeliveryAdapter({ featureFlags: flags });

  function previewDelivery(
    channel: AnnualReviewDeliveryChannel,
    input: AnnualReviewDeliveryFacadeInput,
  ): AnnualReviewDeliveryAdapterResult<unknown> {
    const base = { package: input.package, recipientDecision: input.recipientDecision, approval: input.approval };
    if (channel === 'upload_link') {
      return uploadLinkAdapter.previewUploadLinkRequest({ request: input.request as AnnualReviewUploadLinkRequest, ...base });
    }
    if (channel === 'email') {
      return emailAdapter.previewEmail({ request: input.request as AnnualReviewEmailDeliveryRequest, ...base });
    }
    if (channel === 'sms') {
      return smsAdapter.previewSms({ request: input.request as AnnualReviewSmsDeliveryRequest, ...base });
    }
    return unsupported(channel, 'previewDelivery');
  }

  function attemptDelivery(
    channel: AnnualReviewDeliveryChannel,
    input: AnnualReviewDeliveryFacadeInput,
  ): AnnualReviewDeliveryAdapterResult<unknown> {
    const base = { package: input.package, recipientDecision: input.recipientDecision, approval: input.approval };
    if (channel === 'upload_link') {
      return uploadLinkAdapter.createUploadLink({ request: input.request as AnnualReviewUploadLinkRequest, ...base });
    }
    if (channel === 'email') {
      return emailAdapter.sendEmail({ request: input.request as AnnualReviewEmailDeliveryRequest, ...base });
    }
    if (channel === 'sms') {
      return smsAdapter.sendSms({ request: input.request as AnnualReviewSmsDeliveryRequest, ...base });
    }
    return unsupported(channel, 'attemptDelivery');
  }

  return { uploadLinkAdapter, emailAdapter, smsAdapter, live: false, previewDelivery, attemptDelivery };
}
