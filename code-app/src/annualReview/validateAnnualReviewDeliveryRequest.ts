/**
 * Phase 141N — Annual review delivery validation gate.
 *
 * PURE, fail-closed. Decides whether a delivery PREVIEW is allowed (recipient
 * gate) and reports the primary reason a live send/generation is blocked. In
 * this phase a live send is ALWAYS blocked (send disabled + dry-run only), so
 * `safeForSend` is structurally false.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. Reads only the passed package, recipient decision, flags, approval.
 *   - Do-not-contact / restricted-use / missing authorization / missing contact
 *     point block preview. Approval + send-disabled + dry-run block live send.
 */

import type {
  AnnualReviewBorrowerRequestPackage,
  AnnualReviewBorrowerRequestRecipientDecision,
  AnnualReviewBorrowerRecipientCandidate,
} from './annualReviewBorrowerRequestTypes';
import type {
  AnnualReviewDeliveryChannel,
  AnnualReviewDeliveryIntent,
  AnnualReviewDeliveryApproval,
  AnnualReviewDeliveryValidationResult,
  AnnualReviewDeliveryBlocker,
  AnnualReviewDeliveryErrorCode,
} from './annualReviewDeliveryTypes';
import type { AnnualReviewDeliveryFeatureFlagState } from './annualReviewDeliveryFeatureFlags';

export interface ValidateAnnualReviewDeliveryInput {
  channel: AnnualReviewDeliveryChannel;
  intent: AnnualReviewDeliveryIntent;
  package?: AnnualReviewBorrowerRequestPackage;
  recipientDecision: AnnualReviewBorrowerRequestRecipientDecision;
  flags: AnnualReviewDeliveryFeatureFlagState;
  approval: AnnualReviewDeliveryApproval;
}

// Precedence: most fundamental reason first.
const ERROR_PRECEDENCE: readonly AnnualReviewDeliveryErrorCode[] = [
  'delivery_unsupported_channel',
  'delivery_validation_failed',
  'delivery_do_not_contact',
  'delivery_restricted_use',
  'delivery_recipient_not_authorized',
  'delivery_contact_preference_blocked',
  'delivery_missing_contact_point',
  'delivery_approval_required',
  'delivery_not_approved',
  'delivery_send_disabled',
  'delivery_dry_run_only',
];

const CHANNELS: readonly AnnualReviewDeliveryChannel[] = ['upload_link', 'email', 'sms'];

function selectedCandidate(
  decision: AnnualReviewBorrowerRequestRecipientDecision,
): AnnualReviewBorrowerRecipientCandidate | undefined {
  return decision.candidates.find((c) => c.personId === decision.selectedRecipientId);
}

function intentAuthorized(
  candidate: AnnualReviewBorrowerRecipientCandidate,
  intent: AnnualReviewDeliveryIntent,
): boolean {
  if (intent === 'annual_review_general_follow_up') {
    return candidate.authorizationFlags.loanNotices;
  }
  return candidate.authorizationFlags.financialRequests;
}

export function validateAnnualReviewDeliveryRequest(
  input: ValidateAnnualReviewDeliveryInput,
): AnnualReviewDeliveryValidationResult {
  const { channel, intent, recipientDecision: decision, flags, approval } = input;
  const blockers: AnnualReviewDeliveryBlocker[] = [];
  const add = (code: AnnualReviewDeliveryErrorCode, message: string): void => {
    blockers.push({ code, message });
  };

  if (!CHANNELS.includes(channel)) {
    add('delivery_unsupported_channel', `Unsupported delivery channel: ${channel}.`);
  }

  // --- Recipient gate (blocks preview AND send) -------------------------
  let recipientGatePassed = false;
  if (!input.package) {
    add('delivery_validation_failed', 'No request package to deliver.');
  } else if (decision.decision === 'blocked_do_not_contact') {
    add('delivery_do_not_contact', 'Recipient is marked do-not-contact.');
  } else if (decision.decision === 'blocked_restricted_use') {
    add('delivery_restricted_use', 'Recipient contact is restricted for this purpose.');
  } else if (decision.decision === 'blocked_no_authorized_contact') {
    add('delivery_recipient_not_authorized', 'Recipient is not authorized for this request.');
  } else if (decision.decision === 'blocked_missing_contact_point') {
    add('delivery_missing_contact_point', 'Recipient has no usable contact point.');
  } else if (decision.decision !== 'ready_for_human_approval') {
    add('delivery_validation_failed', 'No single ready recipient.');
  } else {
    // Recipient is ready — run channel + intent checks against the selection.
    const candidate = selectedCandidate(decision);
    if (!candidate) {
      add('delivery_validation_failed', 'Selected recipient candidate is missing.');
    } else {
      if (!intentAuthorized(candidate, intent)) {
        add('delivery_recipient_not_authorized', 'Recipient is not authorized for this intent.');
      }
      if (candidate.communicationPreferences.doNotContact) {
        add('delivery_do_not_contact', 'Recipient is marked do-not-contact.');
      }
      if (candidate.communicationPreferences.restrictedUse) {
        add('delivery_restricted_use', 'Recipient contact is restricted for this purpose.');
      }
      const prohibited = candidate.communicationPreferences.prohibitedMethods;
      if (channel === 'email') {
        if (prohibited.includes('email')) add('delivery_contact_preference_blocked', 'Email is prohibited for this recipient.');
        else if (!candidate.contactPoints.some((c) => c.channel === 'email' && c.usable)) add('delivery_missing_contact_point', 'No usable email contact point.');
      } else if (channel === 'sms') {
        if (prohibited.includes('phone')) add('delivery_contact_preference_blocked', 'SMS/phone is prohibited for this recipient.');
        else if (!candidate.contactPoints.some((c) => c.channel === 'phone' && c.usable)) add('delivery_missing_contact_point', 'No usable phone contact point.');
      } else if (channel === 'upload_link') {
        if (!candidate.authorizationFlags.uploadLinks) add('delivery_recipient_not_authorized', 'Recipient is not authorized for upload links.');
      }
      // The recipient gate passes when no preview-blocking reason was added.
      recipientGatePassed = blockers.length === 0;
    }
  }

  // --- Send gate (always blocks a live action in this phase) ------------
  const approvalSatisfied = approval.state === 'approved_not_sent';
  if (flags.ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED && !approvalSatisfied) {
    if (approval.state === 'rejected' || approval.state === 'cancelled') {
      add('delivery_not_approved', `Delivery approval is ${approval.state}.`);
    } else {
      add('delivery_approval_required', 'Human approval is required before any live action.');
    }
  }
  if (!flags.ANNUAL_REVIEW_DELIVERY_SEND_ENABLED) {
    add('delivery_send_disabled', 'Live send is disabled in this phase.');
  }
  if (flags.ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY) {
    add('delivery_dry_run_only', 'Delivery is dry-run only in this phase.');
  }

  const codes = new Set(blockers.map((b) => b.code));
  const errorCode = ERROR_PRECEDENCE.find((c) => codes.has(c));

  return {
    channel,
    intent,
    eligibleForPreview: recipientGatePassed,
    safeForSend: false,
    approvalSatisfied,
    blockers,
    errorCode,
  };
}
