import { describe, it, expect } from 'vitest';
import {
  CRM_SPINE_SCHEMA_APPLY_ACK,
  CRM_SPINE_PERSISTENCE_ACK,
  evaluateCrmSpineSchemaApplyGate,
  evaluateCrmSpinePersistenceGate,
  type CrmSpineLiveGateConfig,
} from './crmSalesforceSpineLiveGates';

/** Phase 193 — live gate evaluation (fail-closed). */

const fullSchemaApply: CrmSpineLiveGateConfig = {
  schemaApplyEnabled: 'true',
  livePersistenceEnabled: 'true',
  acknowledgement: CRM_SPINE_SCHEMA_APPLY_ACK,
  targetEnvironmentPresent: true,
  operatorAuthorized: true,
};

describe('schema-apply gate', () => {
  it('fails closed with an empty config and lists every blocker', () => {
    const g = evaluateCrmSpineSchemaApplyGate();
    expect(g.satisfied).toBe(false);
    expect(g.blockers.length).toBe(5);
  });

  it('is satisfied only when every hard gate passes', () => {
    expect(evaluateCrmSpineSchemaApplyGate(fullSchemaApply).satisfied).toBe(true);
  });

  it('requires the string "true", not a boolean or "false"', () => {
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, schemaApplyEnabled: 'false' }).satisfied).toBe(false);
    // A non-"true" string fails closed.
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, livePersistenceEnabled: 'TRUE' }).satisfied).toBe(false);
  });

  it('requires the exact acknowledgement phrase', () => {
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, acknowledgement: 'apply' }).satisfied).toBe(false);
    expect(CRM_SPINE_SCHEMA_APPLY_ACK).toBe('APPLY_CRM_SPINE_SCHEMA');
  });

  it('requires environment present and operator authorized', () => {
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, targetEnvironmentPresent: false }).satisfied).toBe(false);
    expect(evaluateCrmSpineSchemaApplyGate({ ...fullSchemaApply, operatorAuthorized: false }).satisfied).toBe(false);
  });
});

describe('persistence gate', () => {
  it('fails closed empty', () => {
    expect(evaluateCrmSpinePersistenceGate().satisfied).toBe(false);
  });

  it('is satisfied with the persistence ack + flags + env + operator', () => {
    const g = evaluateCrmSpinePersistenceGate({
      livePersistenceEnabled: 'true',
      acknowledgement: CRM_SPINE_PERSISTENCE_ACK,
      targetEnvironmentPresent: true,
      operatorAuthorized: true,
    });
    expect(g.satisfied).toBe(true);
  });

  it('does not accept the schema-apply ack for persistence', () => {
    const g = evaluateCrmSpinePersistenceGate({
      livePersistenceEnabled: 'true',
      acknowledgement: CRM_SPINE_SCHEMA_APPLY_ACK,
      targetEnvironmentPresent: true,
      operatorAuthorized: true,
    });
    expect(g.satisfied).toBe(false);
  });
});
