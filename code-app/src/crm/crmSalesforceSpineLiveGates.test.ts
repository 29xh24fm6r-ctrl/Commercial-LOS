import { describe, it, expect } from 'vitest';
import {
  CRM_SPINE_SCHEMA_APPLY_ACK,
  CRM_SPINE_PERSISTENCE_ACK,
  evaluateCrmSpineSchemaApplyGate,
  evaluateCrmSpinePersistenceGate,
  type CrmSpineLiveGateConfig,
} from './crmSalesforceSpineLiveGates';

/** Phase 193A — fail-closed live gate evaluation. */

const fullSchemaApply: CrmSpineLiveGateConfig = {
  schemaApplyEnabled: 'true',
  livePersistenceEnabled: 'true',
  acknowledgement: CRM_SPINE_SCHEMA_APPLY_ACK,
  targetEnvironmentPresent: true,
  operatorAuthorized: true,
  correlationId: 'corr-1',
};

describe('schema-apply gate', () => {
  it('fails closed with an empty config and lists every blocker', () => {
    const g = evaluateCrmSpineSchemaApplyGate();
    expect(g.satisfied).toBe(false);
    expect(g.blockers.length).toBe(6);
  });

  it('is satisfied only when every hard gate passes (incl. correlation id)', () => {
    expect(evaluateCrmSpineSchemaApplyGate(fullSchemaApply).satisfied).toBe(true);
  });

  it('requires the literal string "true", a present env, an authorized operator, and the exact ack', () => {
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, schemaApplyEnabled: 'false' }).satisfied).toBe(false);
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, livePersistenceEnabled: 'TRUE' }).satisfied).toBe(false);
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, acknowledgement: 'apply' }).satisfied).toBe(false);
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, targetEnvironmentPresent: false }).satisfied).toBe(false);
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, operatorAuthorized: false }).satisfied).toBe(false);
  });

  it('requires a non-empty correlation id', () => {
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, correlationId: '' }).satisfied).toBe(false);
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, correlationId: undefined }).satisfied).toBe(false);
    expect(CRM_SPINE_SCHEMA_APPLY_ACK).toBe('APPLY_CRM_SPINE_SCHEMA');
  });
});

describe('persistence gate', () => {
  it('fails closed empty', () => {
    expect(evaluateCrmSpinePersistenceGate().satisfied).toBe(false);
  });

  it('is satisfied with the persistence ack + flags + env + operator + correlation id', () => {
    expect(
      evaluateCrmSpinePersistenceGate({
        livePersistenceEnabled: 'true',
        acknowledgement: CRM_SPINE_PERSISTENCE_ACK,
        targetEnvironmentPresent: true,
        operatorAuthorized: true,
        correlationId: 'c',
      }).satisfied,
    ).toBe(true);
  });

  it('does not accept the schema-apply ack for persistence', () => {
    expect(
      evaluateCrmSpinePersistenceGate({
        livePersistenceEnabled: 'true',
        acknowledgement: CRM_SPINE_SCHEMA_APPLY_ACK,
        targetEnvironmentPresent: true,
        operatorAuthorized: true,
        correlationId: 'c',
      }).satisfied,
    ).toBe(false);
  });
});
