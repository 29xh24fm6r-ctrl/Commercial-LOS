import { describe, it, expect } from 'vitest';
import {
  deriveStageReferenceReadiness,
  resolveNextStage,
  advanceStage,
  deriveStageProgressionActivation,
  ADVANCE_STAGE_WRITE_ENABLED,
  type AdvanceStageInput,
  type StageReferenceServiceFacts,
} from './stageProgressionActivation';
import type { OperatorSmokeEvidence, SmokeEvidenceRegistryInput } from '../access/operatorSmokeEvidenceRegistry';

const STAGES = [
  { id: 's1', name: 'Application', order: 10 },
  { id: 's2', name: 'Underwriting', order: 20 },
  { id: 's3', name: 'Closing', order: 30 },
];
function facts(over: Partial<StageReferenceServiceFacts> = {}): StageReferenceServiceFacts {
  return { serviceGenerated: true, modelHasOrderField: true, activeStages: STAGES, ...over };
}
function ev(records: OperatorSmokeEvidence[] = []): SmokeEvidenceRegistryInput {
  return { source: 'out-of-band', records };
}

describe('Phase 215 — stage reference readiness', () => {
  it('blocks when SDK service is missing, with remediation', () => {
    const r = deriveStageReferenceReadiness(facts({ serviceGenerated: false }));
    expect(r.orderingContractProven).toBe(false);
    expect(r.readiness.level).toBe('blocked');
    expect(r.remediation.join(' ')).toMatch(/regenerate the SDK/i);
  });
  it('blocks when the order field is missing', () => {
    expect(deriveStageReferenceReadiness(facts({ modelHasOrderField: false })).orderingContractProven).toBe(false);
  });
  it('blocks when ordering is not unique', () => {
    const r = deriveStageReferenceReadiness(facts({ activeStages: [{ id: 'a', name: 'A', order: 10 }, { id: 'b', name: 'B', order: 10 }] }));
    expect(r.orderingContractProven).toBe(false);
    expect(r.readiness.blockers.join(' ')).toMatch(/duplicate/i);
  });
  it('proves the contract for a unique generated sequence', () => {
    expect(deriveStageReferenceReadiness(facts()).orderingContractProven).toBe(true);
  });
});

describe('Phase 216 — resolveNextStage', () => {
  it('returns the next stage by order', () => {
    expect(resolveNextStage('s1', STAGES)).toMatchObject({ id: 's2' });
  });
  it('returns null at the terminal stage', () => {
    expect(resolveNextStage('s3', STAGES)).toBeNull();
  });
  it('returns ambiguous when two rows share the next order', () => {
    const dup = [{ id: 's1', name: 'A', order: 10 }, { id: 'x', name: 'X', order: 20 }, { id: 'y', name: 'Y', order: 20 }];
    expect(resolveNextStage('s1', dup)).toBe('ambiguous');
  });
});

function advInput(over: Partial<AdvanceStageInput> = {}): AdvanceStageInput {
  return {
    actorAuthorized: true, correlationId: 'c1', dealId: 'd1', currentStageId: 's1', rowVersion: 'v1', entryDateIso: '2026-06-23T00:00:00Z',
    stages: STAGES, orderingContractProven: true,
    transport: { updateDealStage: async () => ({ ok: true }) },
    auditSink: { write: async () => ({ ok: true }) },
    timelineSink: { write: async () => ({ ok: true }) },
    ...over,
  };
}

describe('Phase 216 — advanceStage adapter (no real writes)', () => {
  it('disabled by default', async () => {
    expect(ADVANCE_STAGE_WRITE_ENABLED).toBe(false);
    expect((await advanceStage(advInput())).outcome).toBe('disabled');
  });
  it('unauthorized when actor not authorized', async () => {
    expect((await advanceStage(advInput({ writeEnabled: true, actorAuthorized: false }))).outcome).toBe('unauthorized');
  });
  it('resolver_not_ready when ordering contract or sinks missing', async () => {
    expect((await advanceStage(advInput({ writeEnabled: true, orderingContractProven: false }))).outcome).toBe('resolver_not_ready');
    expect((await advanceStage(advInput({ writeEnabled: true, transport: undefined }))).outcome).toBe('resolver_not_ready');
  });
  it('no_next_stage at terminal stage', async () => {
    expect((await advanceStage(advInput({ writeEnabled: true, currentStageId: 's3' }))).outcome).toBe('no_next_stage');
  });
  it('stale_stage when transport reports stale', async () => {
    const out = await advanceStage(advInput({ writeEnabled: true, transport: { updateDealStage: async () => ({ ok: false, stale: true }) } }));
    expect(out.outcome).toBe('stale_stage');
  });
  it('update_failed surfaces transport failure', async () => {
    const out = await advanceStage(advInput({ writeEnabled: true, transport: { updateDealStage: async () => ({ ok: false, error: 'boom' }) } }));
    expect(out.outcome).toBe('update_failed');
  });
  it('audit_failed_partial_success when audit write fails after advance', async () => {
    const out = await advanceStage(advInput({ writeEnabled: true, auditSink: { write: async () => ({ ok: false }) } }));
    expect(out.outcome).toBe('audit_failed_partial_success');
  });
  it('timeline_failed_partial_success when timeline write fails', async () => {
    const out = await advanceStage(advInput({ writeEnabled: true, timelineSink: { write: async () => ({ ok: false }) } }));
    expect(out.outcome).toBe('timeline_failed_partial_success');
  });
  it('advanced on the full happy path', async () => {
    const out = await advanceStage(advInput({ writeEnabled: true }));
    expect(out.outcome).toBe('advanced');
    expect(out.nextStageId).toBe('s2');
  });
});

describe('Phase 216 — stage progression activation readiness', () => {
  it('blocked until contract proven + flags + smoke', () => {
    const r = deriveStageProgressionActivation({ stageFacts: facts({ serviceGenerated: false }), actorAuthorized: false, auditWired: false, timelineWired: false, evidence: ev() });
    expect(r.level).toBe('blocked');
  });
});
