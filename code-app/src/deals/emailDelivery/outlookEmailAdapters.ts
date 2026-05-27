/**
 * Phase 61/104: Outlook send adapter implementations.
 *
 * Two adapters today:
 *
 *   - dryRunAdapter: validates inputs locally, never touches the
 *     network, returns 'accepted' with `providerMessageId: undefined`.
 *     This is the operational default until the operator flips
 *     `VITE_EMAIL_MODE=LIVE` (Phase 61 EMAIL_MODE discipline).
 *
 *   - liveAdapter: as of Phase 104, calls the typed
 *     Office365OutlookService.SendEmailV2 connector method. The
 *     connector is registered for this Code App and the SDK is
 *     regenerated; the LIVE path now exits the browser for the
 *     document-request email flow only (the only governed write that
 *     consumes this adapter today — see GOVERNED_WRITES.deal-document-
 *     request-email). Outcome classification:
 *       success                       → 'accepted' (providerMessageId
 *                                       undefined; SendEmailV2 returns
 *                                       void).
 *       408 / 429 / 5xx / no status   → 'transient-failure' (the caller
 *                                       may surface a "try again"
 *                                       affordance).
 *       other 4xx                     → 'permanent-failure' (do not
 *                                       retry without operator action).
 *       thrown / non-IOperationResult → 'transient-failure' (the
 *                                       runtime did not produce a
 *                                       structured outcome; conservative
 *                                       to treat as transient and let
 *                                       the audit row carry the message
 *                                       verbatim).
 *
 * The adapter never claims delivery. The action layer uses
 * "send request accepted" copy; "accepted" here means the connector
 * acknowledged the request for handoff — not that the borrower
 * received the message.
 *
 * Recipient shape check (`isLikelyValidEmail`):
 *   - Local-only structural check (one `@`, a local part with at
 *     least one character, a domain with at least one `.`, length
 *     bounds, no embedded whitespace).
 *   - Deliberately NOT a full RFC-5322 validator. The transport is
 *     the source of truth for what addresses Outlook accepts; this
 *     check exists only to catch obvious typos before consuming a
 *     network call slot.
 */

import { Office365OutlookService } from '../../generated/services/Office365OutlookService';
import type { ClientSendHtmlMessage } from '../../generated/models/Office365OutlookModel';
import { EMAIL_MODE } from './emailMode';
import type {
  OutlookEmailInput,
  OutlookEmailPort,
  OutlookSendResult,
} from './outlookEmailPort';

export function isLikelyValidEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 5 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at <= 0) return false;
  if (at !== v.lastIndexOf('@')) return false;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length === 0) return false;
  if (domain.length < 3) return false;
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  return true;
}

export const dryRunAdapter: OutlookEmailPort = {
  mode: 'DRY_RUN',
  async send(input: OutlookEmailInput): Promise<OutlookSendResult> {
    if (!isLikelyValidEmail(input.recipient)) {
      return {
        kind: 'invalid-recipient',
        reason: `Recipient does not look like an email address: ${input.recipient}`,
      };
    }
    if (input.subject.trim().length === 0) {
      return {
        kind: 'invalid-recipient',
        reason: 'Subject must not be empty.',
      };
    }
    if (input.body.trim().length === 0) {
      return {
        kind: 'invalid-recipient',
        reason: 'Body must not be empty.',
      };
    }
    return { kind: 'accepted', providerMessageId: undefined };
  },
};

// Phase 104: 408 / 429 are transient by HTTP convention; 5xx is transient;
// any other 4xx is treated as permanent. No status (e.g. network drop) is
// transient so the banker can retry.
function classifyHttpStatus(
  status: number | undefined,
): 'transient-failure' | 'permanent-failure' {
  if (status === undefined) return 'transient-failure';
  if (status === 408 || status === 429) return 'transient-failure';
  if (status >= 500 && status <= 599) return 'transient-failure';
  if (status >= 400 && status <= 499) return 'permanent-failure';
  return 'transient-failure';
}

function describeError(error: unknown): {
  message: string;
  status: number | undefined;
} {
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; status?: unknown };
    const message =
      typeof e.message === 'string' && e.message.length > 0
        ? e.message
        : 'Outlook connector reported a failure without a message.';
    const status = typeof e.status === 'number' ? e.status : undefined;
    return { message, status };
  }
  return {
    message: 'Outlook connector reported a non-structured failure.',
    status: undefined,
  };
}

export const liveAdapter: OutlookEmailPort = {
  mode: 'LIVE',
  async send(input: OutlookEmailInput): Promise<OutlookSendResult> {
    if (!isLikelyValidEmail(input.recipient)) {
      return {
        kind: 'invalid-recipient',
        reason: `Recipient does not look like an email address: ${input.recipient}`,
      };
    }
    const message: ClientSendHtmlMessage = {
      To: input.recipient,
      Subject: input.subject,
      Body: input.body,
      Importance: 'Normal',
    };
    try {
      const result = await Office365OutlookService.SendEmailV2(message);
      if (result.success) {
        return { kind: 'accepted', providerMessageId: undefined };
      }
      const { message: reason, status } = describeError(result.error);
      const kind = classifyHttpStatus(status);
      return { kind, reason };
    } catch (err) {
      const { message: reason } = describeError(err);
      return { kind: 'transient-failure', reason };
    }
  },
};

export function getEmailAdapter(): OutlookEmailPort {
  return EMAIL_MODE === 'LIVE' ? liveAdapter : dryRunAdapter;
}
