import {
  deriveCapabilitySmokeReadiness,
  type SmokeEvidenceRegistryInput,
} from '../access/operatorSmokeEvidenceRegistry';
import { evaluateLaunchGates, type CapabilityReadiness } from './launchReadiness';

/**
 * Phase 222 — Borrower communications live-send certification.
 *
 * PURE and fail-closed. Communication surfaces are classified honestly; only an
 * intentionally-certified LIVE mode can send. The recipient is NEVER inferred from
 * a borrower/client name — it must be an explicitly entered address or a certified
 * borrower-contact field, and it must validate. Connector acceptance is NOT
 * delivery: this module reports only connector acceptance, never a delivery claim.
 * No test sends a live email.
 */

export type CommunicationMode = 'local-copy' | 'mailto-handoff' | 'outlook-connector' | 'future-automation';

/** Modes that actually transmit through a connector (others are local/handoff only). */
export function isConnectorSend(mode: CommunicationMode): boolean {
  return mode === 'outlook-connector';
}

export type RecipientSource = 'explicit-address' | 'certified-borrower-contact' | 'inferred-from-name' | 'none';

export interface RecipientResolution {
  readonly source: RecipientSource;
  readonly address: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RecipientReadiness =
  | { readonly ok: true; readonly address: string; readonly source: 'explicit-address' | 'certified-borrower-contact' }
  | { readonly ok: false; readonly reason: string };

/** A recipient is certified ONLY from an explicit address or a certified contact field. */
export function resolveCertifiedRecipient(resolution: RecipientResolution): RecipientReadiness {
  if (resolution.source === 'inferred-from-name') {
    return { ok: false, reason: 'Recipient inferred from name is not allowed; use an explicit or certified contact address.' };
  }
  if (resolution.source === 'none' || !resolution.address) {
    return { ok: false, reason: 'No recipient address supplied.' };
  }
  if (!EMAIL_RE.test(resolution.address.trim())) {
    return { ok: false, reason: 'Recipient address is not a valid email format.' };
  }
  return { ok: true, address: resolution.address.trim(), source: resolution.source };
}

export type CommunicationModeReady = 'EMAIL_LIVE' | 'CERTIFIED_LIVE';

export interface BorrowerCommsActivationInput {
  readonly mode: CommunicationMode;
  /** The certified live mode token (e.g. EMAIL_MODE=LIVE). */
  readonly liveMode?: CommunicationModeReady | null;
  readonly actorAuthorized: boolean;
  readonly recipient: RecipientResolution;
  readonly contentBorrowerSafe: boolean;
  readonly previewConfirmed: boolean;
  readonly auditWired: boolean;
  readonly timelineWired: boolean;
  /** Test sends must target a non-borrower diagnostic mailbox first. */
  readonly testRecipientIsDiagnostic: boolean;
  readonly singleRecordSmokeEnabled: boolean;
  readonly evidence: SmokeEvidenceRegistryInput;
}

export interface BorrowerCommsActivationReadiness {
  readonly readiness: CapabilityReadiness;
  readonly mode: CommunicationMode;
  readonly isConnectorSend: boolean;
  readonly recipient: RecipientReadiness;
  /** Honest delivery semantics — never claims delivery. */
  readonly deliveryClaim: string;
}

export function deriveBorrowerCommsActivation(input: BorrowerCommsActivationInput): BorrowerCommsActivationReadiness {
  const recipient = resolveCertifiedRecipient(input.recipient);
  const smoke = deriveCapabilitySmokeReadiness(input.evidence).find((r) => r.capability === 'borrower-communication')!;
  const connector = isConnectorSend(input.mode);

  const readiness = evaluateLaunchGates('borrower-communication', [
    { name: 'certified live mode', satisfied: input.liveMode === 'EMAIL_LIVE' || input.liveMode === 'CERTIFIED_LIVE', detail: 'EMAIL_MODE must be a certified LIVE mode' },
    { name: 'actor authorized', satisfied: input.actorAuthorized === true },
    { name: 'recipient certified (explicit or certified contact)', satisfied: recipient.ok, detail: recipient.ok ? undefined : recipient.reason },
    { name: 'content borrower-safe', satisfied: input.contentBorrowerSafe === true },
    { name: 'preview confirmed', satisfied: input.previewConfirmed === true },
    { name: 'audit sink present', satisfied: input.auditWired === true },
    { name: 'timeline sink present', satisfied: input.timelineWired === true },
    { name: 'test send targets diagnostic mailbox first', satisfied: input.testRecipientIsDiagnostic === true },
    { name: 'singleRecordSmokeEnabled', satisfied: input.singleRecordSmokeEnabled === true },
    { name: 'comms smoke passed + rollback verified', satisfied: !smoke.blocksGo, detail: smoke.blockReason ?? undefined },
  ]);

  const deliveryClaim = connector
    ? 'accepted by Outlook connector (not a delivery confirmation)'
    : 'local handoff only (no transmission performed)';

  return { readiness, mode: input.mode, isConnectorSend: connector, recipient, deliveryClaim };
}
