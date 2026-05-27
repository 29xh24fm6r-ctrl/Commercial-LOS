import {
  getEmailAdapter,
  isLikelyValidEmail,
} from '../deals/emailDelivery/outlookEmailAdapters';
import type { EmailMode } from '../deals/emailDelivery/emailMode';
import type {
  OutlookEmailPort,
  OutlookSendResult,
} from '../deals/emailDelivery/outlookEmailPort';

/**
 * Phase 109: operator-facing Outlook LIVE email smoke-test helper.
 *
 * Purpose:
 *   Give release reviewers + admins a way to exercise the
 *   `getEmailAdapter().send()` path on the deployed environment
 *   before any banker workflow relies on LIVE Outlook sends. The
 *   helper is invoked ONLY from the Phase-109
 *   <EmailLiveDiagnostics /> admin card, and ONLY by an explicit
 *   operator click. It runs nothing automatically, on app load,
 *   or as part of any banker workflow.
 *
 * What this helper IS:
 *   - A thin wrapper around the existing Phase 104 adapter (the
 *     same one consumed by the Phase 61 / Phase 105 governed
 *     writes). No second `Office365OutlookService.SendEmailV2`
 *     call site is introduced — the helper reuses
 *     `getEmailAdapter()` exactly like the action layers do, and
 *     accepts an injected adapter for unit-test isolation.
 *   - Strictly minimal payload: the LIVE adapter constructs a
 *     `ClientSendHtmlMessage` from { To, Subject, Body,
 *     Importance: 'Normal' }. The smoke test uses the same shape
 *     (hard-coded subject + body — operators do not type these).
 *
 * What this helper IS NOT:
 *   - It is NOT a governed write. No audit row, no timeline row,
 *     no Dataverse touch. It does not import Cr664_auditeventsService
 *     or Cr664_dealtimelineeventsService.
 *   - It is NOT borrower-facing by default. The recipient field
 *     on the admin card is empty by default and operators are
 *     expected to type a test address (their own inbox or a
 *     non-borrower diagnostic mailbox).
 *   - It is NOT a banker workflow. The smoke send produces no
 *     deal / borrower / task / document state change.
 *   - It does NOT claim delivery. "Outlook accepted" is the
 *     positive outcome wording — meaning the connector accepted
 *     the request for handoff, NOT that the recipient received
 *     the message.
 *
 * Outcome union (Phase 106 conservative-copy vocabulary):
 *   - 'accepted'           — the adapter accepted the message.
 *   - 'invalid-input'      — the recipient failed local shape
 *                            validation OR the adapter reported
 *                            `invalid-recipient`. Operators retype
 *                            the address.
 *   - 'transient-failure'  — 408 / 429 / 5xx / no-status / thrown
 *                            rejection. Operators may retry.
 *   - 'permanent-failure'  — other 4xx. Operators investigate.
 *   - 'unknown'            — pre-flight rejection or unstructured
 *                            failure that does not fit the above.
 */

const SMOKE_SUBJECT = 'OGB LOS Outlook smoke test';

const SMOKE_BODY =
  'This is an operator-triggered smoke test from the Old Glory Bank ' +
  'Loan Origination System (Code App). It exercises the Outlook ' +
  'connector send path with no Dataverse, audit, or workflow ' +
  'context.\n\n' +
  'If you received this message in error, please discard it. No ' +
  'follow-up action is required.\n\n' +
  '— OGB LOS Admin Diagnostics';

export interface EmailLiveSmokeTestInput {
  /** Operator-supplied test recipient. Empty / malformed values
   *  short-circuit with kind: 'invalid-input'. */
  recipient: string;
}

export type EmailLiveSmokeTestOutcome =
  | { kind: 'accepted'; mode: EmailMode }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'transient-failure'; reason: string; mode: EmailMode }
  | { kind: 'permanent-failure'; reason: string; mode: EmailMode }
  | { kind: 'unknown'; message: string };

export interface EmailLiveSmokeTestDependencies {
  /** Adapter override — defaults to the mode-selected adapter from
   *  getEmailAdapter(). Tests inject a fake adapter to assert call
   *  shape without exercising the connector. */
  adapter?: OutlookEmailPort;
}

/**
 * Phase 109 smoke-test wording exposed for tests and the card's UI.
 * Marked as constants so a single source of truth produces both the
 * adapter payload AND the card's preview / outcome labels.
 */
export const EMAIL_LIVE_SMOKE_TEST_SUBJECT = SMOKE_SUBJECT;
export const EMAIL_LIVE_SMOKE_TEST_BODY = SMOKE_BODY;

function classifyAdapterResult(
  result: OutlookSendResult,
  mode: EmailMode,
): EmailLiveSmokeTestOutcome {
  switch (result.kind) {
    case 'accepted':
      return { kind: 'accepted', mode };
    case 'invalid-recipient':
      // Pre-flight should have caught this; fold to 'invalid-input'
      // for the operator-facing outcome shape so the diagnostic card
      // can render one uniform "fix the recipient" branch.
      return { kind: 'invalid-input', reason: result.reason };
    case 'transient-failure':
      return { kind: 'transient-failure', reason: result.reason, mode };
    case 'permanent-failure':
      return { kind: 'permanent-failure', reason: result.reason, mode };
  }
}

/**
 * Runs the operator-triggered smoke test against the
 * mode-selected (or injected) Outlook adapter. Caller is the
 * Phase 109 <EmailLiveDiagnostics /> card; do not invoke from
 * banker workflows, app bootstrap, or any automated path.
 */
export async function runEmailLiveSmokeTest(
  input: EmailLiveSmokeTestInput,
  deps: EmailLiveSmokeTestDependencies = {},
): Promise<EmailLiveSmokeTestOutcome> {
  const recipient = input.recipient.trim();
  if (recipient.length === 0) {
    return {
      kind: 'invalid-input',
      reason:
        'Test recipient is required. Type a non-borrower test address (e.g. your own inbox) before running the smoke test.',
    };
  }
  if (!isLikelyValidEmail(recipient)) {
    return {
      kind: 'invalid-input',
      reason: `Test recipient does not look like an email address: ${input.recipient}`,
    };
  }

  const adapter = deps.adapter ?? getEmailAdapter();

  try {
    const result = await adapter.send({
      recipient,
      subject: SMOKE_SUBJECT,
      body: SMOKE_BODY,
      // The smoke test does not coordinate with any audit/timeline
      // row, so the correlation id has no companion to join with.
      // We pass a stable label so the transport's own log lines can
      // be filtered by an operator if needed.
      correlationId: `phase-109-smoke-${Date.now().toString(36)}`,
    });
    return classifyAdapterResult(result, adapter.mode);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'unknown', message };
  }
}
