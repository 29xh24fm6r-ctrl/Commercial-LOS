import { describe, it, expect } from 'vitest';
import {
  isConnectorSend,
  resolveCertifiedRecipient,
  deriveBorrowerCommsActivation,
  type BorrowerCommsActivationInput,
} from './borrowerCommsActivation';
import type { OperatorSmokeEvidence, SmokeEvidenceRegistryInput } from '../access/operatorSmokeEvidenceRegistry';

function ev(records: OperatorSmokeEvidence[] = []): SmokeEvidenceRegistryInput {
  return { source: 'out-of-band', records };
}
function passedComms(): OperatorSmokeEvidence {
  return { capability: 'borrower-communication', outcome: 'passed', actorUpn: 'a@ogb.com', actorPlatformUserId: 'pu', timestamp: '2026-06-23T00:00:00Z', correlationId: 'c', environmentName: 'DEV', evidenceNote: 'test mailbox send', rollbackVerified: true };
}

describe('Phase 222 — mode classification + recipient certification', () => {
  it('only outlook-connector is a connector send', () => {
    expect(isConnectorSend('outlook-connector')).toBe(true);
    expect(isConnectorSend('local-copy')).toBe(false);
    expect(isConnectorSend('mailto-handoff')).toBe(false);
  });
  it('rejects a recipient inferred from name', () => {
    expect(resolveCertifiedRecipient({ source: 'inferred-from-name', address: 'guessed@x.com' }).ok).toBe(false);
  });
  it('accepts an explicit valid address', () => {
    const r = resolveCertifiedRecipient({ source: 'explicit-address', address: 'test@diagnostic.ogb.com' });
    expect(r.ok).toBe(true);
  });
  it('rejects an invalid email format', () => {
    expect(resolveCertifiedRecipient({ source: 'explicit-address', address: 'not-an-email' }).ok).toBe(false);
  });
});

function comms(over: Partial<BorrowerCommsActivationInput> = {}): BorrowerCommsActivationInput {
  return {
    mode: 'outlook-connector', liveMode: null, actorAuthorized: false,
    recipient: { source: 'none', address: null }, contentBorrowerSafe: false, previewConfirmed: false,
    auditWired: false, timelineWired: false, testRecipientIsDiagnostic: false, singleRecordSmokeEnabled: false, evidence: ev(),
    ...over,
  };
}

describe('Phase 222 — borrower comms activation readiness', () => {
  it('blocked by default; never claims delivery for a connector send', () => {
    const r = deriveBorrowerCommsActivation(comms());
    expect(r.readiness.level).toBe('blocked');
    expect(r.deliveryClaim).toMatch(/not a delivery confirmation/i);
    expect(r.deliveryClaim).not.toMatch(/delivered/i);
  });
  it('blocked when recipient is inferred from name even if all else is set', () => {
    const r = deriveBorrowerCommsActivation(comms({
      liveMode: 'EMAIL_LIVE', actorAuthorized: true, contentBorrowerSafe: true, previewConfirmed: true,
      auditWired: true, timelineWired: true, testRecipientIsDiagnostic: true, singleRecordSmokeEnabled: true,
      recipient: { source: 'inferred-from-name', address: 'guess@x.com' }, evidence: ev([passedComms()]),
    }));
    expect(r.readiness.level).toBe('blocked');
    expect(r.readiness.blockers.join(' ')).toMatch(/recipient/i);
  });
  it('launch-ready only when certified live mode + certified recipient + diagnostic test + passed smoke', () => {
    const r = deriveBorrowerCommsActivation(comms({
      liveMode: 'EMAIL_LIVE', actorAuthorized: true, contentBorrowerSafe: true, previewConfirmed: true,
      auditWired: true, timelineWired: true, testRecipientIsDiagnostic: true, singleRecordSmokeEnabled: true,
      recipient: { source: 'certified-borrower-contact', address: 'borrower@certified.ogb.com' }, evidence: ev([passedComms()]),
    }));
    expect(r.readiness.level).toBe('launch-ready');
  });
});
