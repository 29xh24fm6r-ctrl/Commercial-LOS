/**
 * Phase 61: Outlook send adapter implementations.
 *
 * Two adapters today:
 *
 *   - dryRunAdapter: validates inputs locally, never touches the
 *     network, returns 'accepted' with `providerMessageId: undefined`.
 *     This is the operational default until the Office 365 Outlook
 *     connector is registered for the Code App.
 *
 *   - liveAdapter: today returns a permanent-failure with a clear
 *     "connector not yet registered" reason. The Office 365 Outlook
 *     connector (which would generate Office365_*Service in
 *     src/generated/services/) is NOT yet registered for this Code
 *     App; until it is, LIVE sends cannot leave the client. When the
 *     connector lands, replace the stub body of `liveAdapter.send`
 *     with the typed connector call (SendEmailV2 or equivalent) — no
 *     other changes are needed: the OutlookEmailPort contract and
 *     OutlookSendResult union are stable.
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

import { EMAIL_MODE } from './emailMode';
import type {
  OutlookEmailInput,
  OutlookEmailPort,
  OutlookSendResult,
} from './outlookEmailPort';

const LIVE_CONNECTOR_NOT_REGISTERED =
  'Office 365 Outlook connector is not yet registered for this Code App. ' +
  'LIVE mode is wired end-to-end (audit + timeline + outcome union); ' +
  'the missing piece is the connector registration + SDK regeneration. ' +
  'See docs/PHASE_61_OUTLOOK_EMAIL_DELIVERY.md for the unblock checklist.';

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

export const liveAdapter: OutlookEmailPort = {
  mode: 'LIVE',
  async send(input: OutlookEmailInput): Promise<OutlookSendResult> {
    if (!isLikelyValidEmail(input.recipient)) {
      return {
        kind: 'invalid-recipient',
        reason: `Recipient does not look like an email address: ${input.recipient}`,
      };
    }
    // PHASE 61 LIVE STUB:
    //   The Office 365 Outlook connector is not yet registered for
    //   this Code App, so no typed Office365_*Service is generated in
    //   src/generated/services/. Returning a permanent-failure with a
    //   clear reason is the honest contract: the request itself has
    //   been recorded by the prior governed write, and the audit row
    //   for THIS write captures the LIVE attempt + failure precisely.
    //
    //   Unblock path (single file change once the SDK regenerates):
    //     import { Office365EmailService } from
    //       '../../generated/services/Office365EmailService';
    //     const result = await Office365EmailService.sendEmailV2({
    //       to: input.recipient,
    //       subject: input.subject,
    //       body: input.body,
    //       importance: 'Normal',
    //     });
    //     return result.success
    //       ? { kind: 'accepted', providerMessageId: result.data?.id }
    //       : classifyTransportError(result.error);
    return {
      kind: 'permanent-failure',
      reason: LIVE_CONNECTOR_NOT_REGISTERED,
    };
  },
};

export function getEmailAdapter(): OutlookEmailPort {
  return EMAIL_MODE === 'LIVE' ? liveAdapter : dryRunAdapter;
}
