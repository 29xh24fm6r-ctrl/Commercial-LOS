/**
 * Phase 178A -- Borrower messaging adapter (DISABLED by default).
 *
 * Prepares (and only with an explicit, separate transport gate, sends) a
 * borrower message after a deal is created. Disabled by default. Email / SMS /
 * Graph / Twilio / external HTTP are NOT imported here (transport is injected)
 * and never run by default. Separate gates for messaging vs each transport.
 * Missing contact never fails create. Prepared and sent are distinct; no fake
 * send confirmation.
 */

import type { BorrowerMessagingOutcome } from './dealOriginationOutcomes';
import {
  resolveBorrowerMessagingMode,
  isAnyBorrowerTransportEnabled,
  type DealOriginationFeatureFlagConfig,
  type SendMode,
} from './dealOriginationFeatureFlags';

const MODULE = 'borrower-messaging';

export interface BorrowerMessagingInput {
  readonly dealId: string | undefined;
  readonly actorSystemUserId: string | undefined;
  readonly authorized: boolean;
  readonly correlationId: string;
  readonly config?: DealOriginationFeatureFlagConfig;
  readonly borrowerEmail?: string;
  readonly borrowerPhone?: string;
  /** Approved message template key. Absent -> skip. */
  readonly templateKey?: string;
  /** Test-only overrides. Production never sets them (uses config). */
  readonly modeOverride?: SendMode;
  readonly transportEnabledOverride?: boolean;
}

/** Injected transport; only called in send_enabled mode with a transport gate. */
export type RunBorrowerSend = (draft: {
  dealId: string;
  templateKey: string;
  correlationId: string;
}) => Promise<{ ok: boolean; error?: string }>;

export async function runBorrowerMessaging(
  input: BorrowerMessagingInput,
  runBorrowerSend?: RunBorrowerSend,
): Promise<BorrowerMessagingOutcome> {
  const mode = input.modeOverride ?? resolveBorrowerMessagingMode(input.config);
  if (mode === 'disabled') {
    return { module: MODULE, kind: 'disabled', detail: 'Borrower messaging gate is off.' };
  }
  if (!input.dealId) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No created deal id.' };
  }
  if (!input.authorized || !input.actorSystemUserId) {
    return { module: MODULE, kind: 'unauthorized', detail: 'Actor not authorized.' };
  }
  if (!input.templateKey || input.templateKey.trim().length === 0) {
    return { module: MODULE, kind: 'skipped_template_missing', detail: 'No approved message template.' };
  }
  const hasContact = Boolean(input.borrowerEmail?.trim() || input.borrowerPhone?.trim());
  if (!hasContact) {
    return { module: MODULE, kind: 'skipped_missing_contact', detail: 'No borrower contact; messaging skipped.' };
  }
  if (mode === 'prepare_only') {
    return { module: MODULE, kind: 'prepared_not_sent', detail: 'Message prepared (draft). No send performed.', correlationId: input.correlationId };
  }
  // send_enabled requires an explicit transport gate AND an injected transport.
  const transportEnabled = input.transportEnabledOverride ?? isAnyBorrowerTransportEnabled(input.config);
  if (!transportEnabled || !runBorrowerSend) {
    return { module: MODULE, kind: 'skipped_transport_disabled', detail: 'No transport enabled; not sent.' };
  }
  try {
    const res = await runBorrowerSend({
      dealId: input.dealId,
      templateKey: input.templateKey,
      correlationId: input.correlationId,
    });
    if (!res.ok) return { module: MODULE, kind: 'failed', detail: res.error ?? 'Borrower send failed.' };
    return { module: MODULE, kind: 'sent', correlationId: input.correlationId };
  } catch (err) {
    return { module: MODULE, kind: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}
