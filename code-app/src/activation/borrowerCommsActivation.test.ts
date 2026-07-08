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
    const r = deriveBorrowerCommsActivation(comms(allSet()));
    expect(r.readiness.level).toBe('launch-ready');
  });
});

/** The fully-satisfied input — every gate green. Isolated negatives flip exactly one. */
function allSet(): Partial<BorrowerCommsActivationInput> {
  return {
    liveMode: 'EMAIL_LIVE', actorAuthorized: true, contentBorrowerSafe: true, previewConfirmed: true,
    auditWired: true, timelineWired: true, testRecipientIsDiagnostic: true, singleRecordSmokeEnabled: true,
    recipient: { source: 'certified-borrower-contact', address: 'borrower@certified.ogb.com' }, evidence: ev([passedComms()]),
  };
}

describe('Phase 222 — each borrower-send gate blocks in isolation (highest-risk domain)', () => {
  // Flipping any ONE gate off must block the send — proving no single gate can silently
  // become always-pass. This is the guard the aggregate happy/blocked tests do not give.
  const cases: ReadonlyArray<[string, Partial<BorrowerCommsActivationInput>, RegExp]> = [
    ['certified live mode', { liveMode: null }, /live mode/i],
    ['actor authorized', { actorAuthorized: false }, /actor authorized/i],
    ['recipient certified', { recipient: { source: 'none', address: null } }, /recipient/i],
    ['content borrower-safe', { contentBorrowerSafe: false }, /borrower-safe/i],
    ['preview confirmed', { previewConfirmed: false }, /preview confirmed/i],
    ['audit sink present', { auditWired: false }, /audit sink/i],
    ['timeline sink present', { timelineWired: false }, /timeline sink/i],
    ['diagnostic test recipient first', { testRecipientIsDiagnostic: false }, /diagnostic mailbox/i],
    ['single-record smoke enabled', { singleRecordSmokeEnabled: false }, /singleRecordSmokeEnabled/i],
    ['comms smoke passed', { evidence: ev() }, /smoke/i],
  ];
  for (const [label, off, blocker] of cases) {
    it(`blocked when "${label}" is not satisfied (and only that gate is off)`, () => {
      const r = deriveBorrowerCommsActivation(comms({ ...allSet(), ...off }));
      expect(r.readiness.level).toBe('blocked');
      expect(r.readiness.blockers.join(' | ')).toMatch(blocker);
    });
  }
});
