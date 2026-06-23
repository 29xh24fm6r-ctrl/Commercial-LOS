import { describe, it, expect } from 'vitest';
import {
  resolveReferenceReadiness,
  deriveNewDealReferenceReadiness,
  deriveNewDealCreateActivation,
  type ReferenceRow,
  type NewDealCreateActivationInput,
} from './newDealCreateActivation';
import type { OperatorSmokeEvidence, SmokeEvidenceRegistryInput } from '../access/operatorSmokeEvidenceRegistry';

const prodStage: ReferenceRow = { id: 'stage-prod-1', name: 'Application', active: true, productionApproved: true };
const prodStatus: ReferenceRow = { id: 'status-prod-1', name: 'Open', active: true, productionApproved: true };
const testStage: ReferenceRow = { id: 'stage-test-1', name: 'TEST Application', active: true, productionApproved: false };

function evidence(records: OperatorSmokeEvidence[] = []): SmokeEvidenceRegistryInput {
  return { source: 'out-of-band', records };
}
function passedCreate(): OperatorSmokeEvidence {
  return {
    capability: 'new-deal-create', outcome: 'passed', actorUpn: 'b@ogb.com', actorPlatformUserId: 'pu',
    timestamp: '2026-06-23T12:00:00.000Z', correlationId: 'c', environmentName: 'DEV', evidenceNote: 'one deal', rollbackVerified: true,
  };
}

describe('Phase 213 — production reference readiness', () => {
  it('resolves exactly one active production row as ready-production', () => {
    const r = resolveReferenceReadiness('Stage', [prodStage]);
    expect(r.kind).toBe('ready-production');
    expect(r.resolvedProductionId).toBe('stage-prod-1');
  });
  it('fails closed on duplicate active production rows', () => {
    const r = resolveReferenceReadiness('Stage', [prodStage, { ...prodStage, id: 'stage-prod-2' }]);
    expect(r.kind).toBe('blocked');
    expect(r.blockers.join(' ')).toMatch(/duplicate/i);
  });
  it('fails closed when production reference is inactive', () => {
    const r = resolveReferenceReadiness('Stage', [{ ...prodStage, active: false }]);
    expect(r.kind).toBe('blocked');
    expect(r.blockers.join(' ')).toMatch(/inactive/i);
  });
  it('TEST-only rows are ready-test, never ready-production', () => {
    const r = resolveReferenceReadiness('Stage', [testStage]);
    expect(r.kind).toBe('ready-test');
    expect(r.resolvedProductionId).toBeNull();
  });
  it('no rows / service error fail closed', () => {
    expect(resolveReferenceReadiness('Stage', []).kind).toBe('blocked');
    expect(resolveReferenceReadiness('Stage', [prodStage], { serviceError: true }).kind).toBe('blocked');
  });
  it('production approved only when BOTH stage and status resolve production', () => {
    expect(deriveNewDealReferenceReadiness({ stageRows: [prodStage], statusRows: [prodStatus] }).productionReferencesApproved).toBe(true);
    expect(deriveNewDealReferenceReadiness({ stageRows: [testStage], statusRows: [prodStatus] }).productionReferencesApproved).toBe(false);
  });
});

function activation(over: Partial<NewDealCreateActivationInput> = {}): NewDealCreateActivationInput {
  return {
    singleRecordSmokeEnabled: false,
    actorSystemUserResolved: false,
    actorAuthorized: false,
    auditWired: false,
    payloadValid: false,
    references: { stageRows: [prodStage], statusRows: [prodStatus] },
    evidence: evidence(),
    ...over,
  };
}

describe('Phase 214 — controlled New Deal create readiness', () => {
  it('is blocked by default even with production references approved', () => {
    const r = deriveNewDealCreateActivation(activation());
    expect(r.references.productionReferencesApproved).toBe(true);
    expect(r.readiness.level).toBe('blocked');
    expect(r.readiness.blockers).toEqual(expect.arrayContaining(['NEW_DEAL_CREATE_ADAPTER_ENABLED']));
  });
  it('is launch-ready only when all gates + production refs + passed smoke align', () => {
    const r = deriveNewDealCreateActivation(
      activation({
        createAdapterEnabled: true, liveCreateEnabled: true, bankerCreateEnabled: true,
        singleRecordSmokeEnabled: true, actorSystemUserResolved: true, actorAuthorized: true,
        auditWired: true, payloadValid: true, evidence: evidence([passedCreate()]),
      }),
    );
    expect(r.readiness.level).toBe('launch-ready');
  });
  it('stays blocked when references are only TEST-ready', () => {
    const r = deriveNewDealCreateActivation(
      activation({
        createAdapterEnabled: true, liveCreateEnabled: true, bankerCreateEnabled: true,
        singleRecordSmokeEnabled: true, actorSystemUserResolved: true, actorAuthorized: true,
        auditWired: true, payloadValid: true, evidence: evidence([passedCreate()]),
        references: { stageRows: [testStage], statusRows: [prodStatus] },
      }),
    );
    expect(r.readiness.level).toBe('blocked');
    expect(r.readiness.blockers.join(' ')).toMatch(/production references/i);
  });
});
