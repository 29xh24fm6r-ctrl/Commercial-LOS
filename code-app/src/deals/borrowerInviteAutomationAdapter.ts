/**
 * Phase 173A -- Borrower invite automation adapter (DISABLED by default).
 *
 * Prepares (and only when an explicit transport gate is on, sends) a borrower
 * portal/upload invitation after a deal is created. Default disabled; prefers
 * prepared-not-sent. No email/SMS/Graph/Twilio/external HTTP is imported here
 * (transport is injected) and none runs by default. Missing borrower contact
 * never fails deal create -- it returns a skip. No portal link is fabricated.
 */

import type { BorrowerInviteOutcome } from './dealOriginationOutcomes';
import {
  resolveBorrowerInviteMode,
  isAnyBorrowerTransportEnabled,
  type DealOriginationFeatureFlagConfig,
  type SendMode,
} from './dealOriginationFeatureFlags';

const MODULE = 'borrower-invite';

export interface BorrowerInviteInput {
  readonly dealId: string | undefined;
  readonly actorSystemUserId: string | undefined;
  readonly authorized: boolean;
  readonly correlationId: string;
  readonly config?: DealOriginationFeatureFlagConfig;
  /** Borrower contact (email/phone). Absent -> skip, never fail create. */
  readonly borrowerEmail?: string;
  readonly borrowerPhone?: string;
  /** Whether a borrower profile exists to invite. */
  readonly borrowerProfilePresent?: boolean;
  /** Test-only overrides. Production never sets them (uses config). */
  readonly modeOverride?: SendMode;
  readonly transportEnabledOverride?: boolean;
}

/** Injected send transport; only called in send_enabled mode with a real gate. */
export type RunInviteSend = (draft: {
  dealId: string;
  correlationId: string;
}) => Promise<{ ok: boolean; error?: string }>;

export async function runBorrowerInviteAutomation(
  input: BorrowerInviteInput,
  runInviteSend?: RunInviteSend,
): Promise<BorrowerInviteOutcome> {
  const mode = input.modeOverride ?? resolveBorrowerInviteMode(input.config);
  if (mode === 'disabled') {
    return { module: MODULE, kind: 'disabled', detail: 'Borrower invite gate is off.' };
  }
  if (!input.dealId) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No created deal id.' };
  }
  if (!input.authorized || !input.actorSystemUserId) {
    return { module: MODULE, kind: 'unauthorized', detail: 'Actor not authorized.' };
  }
  if (input.borrowerProfilePresent === false) {
    return { module: MODULE, kind: 'skipped_no_borrower_profile', detail: 'No borrower profile to invite.' };
  }
  const hasContact = Boolean(input.borrowerEmail?.trim() || input.borrowerPhone?.trim());
  if (!hasContact) {
    return {
      module: MODULE,
      kind: 'skipped_missing_borrower_contact',
      detail: 'No borrower email/phone; invite skipped (deal create unaffected).',
    };
  }
  const transportEnabled = input.transportEnabledOverride ?? isAnyBorrowerTransportEnabled(input.config);
  // prepare_only, or send_enabled without an actual transport gate -> prepared.
  if (mode === 'prepare_only' || !transportEnabled || !runInviteSend) {
    return {
      module: MODULE,
      kind: 'prepared_not_sent',
      detail: 'Invite prepared (draft). No external send performed.',
      correlationId: input.correlationId,
    };
  }
  try {
    const res = await runInviteSend({ dealId: input.dealId, correlationId: input.correlationId });
    if (!res.ok) return { module: MODULE, kind: 'failed', detail: res.error ?? 'Invite send failed.' };
    return { module: MODULE, kind: 'sent', correlationId: input.correlationId };
  } catch (err) {
    return { module: MODULE, kind: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}
