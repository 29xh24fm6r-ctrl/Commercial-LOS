import { describe, it, expect } from 'vitest';
import {
  runCrmSpineSchemaOrchestrator,
  type CrmSchemaApplyExecutor,
} from './crmSalesforceSpineApplyOrchestrator';
import { CRM_SPINE_SCHEMA_APPLY_ACK, type CrmSpineLiveGateConfig } from './crmSalesforceSpineLiveGates';

/** Phase 193A — apply orchestrator (inspect/plan/dry-run/live). */

const satisfiedGate: CrmSpineLiveGateConfig = {
  schemaApplyEnabled: 'true',
  livePersistenceEnabled: 'true',
  acknowledgement: CRM_SPINE_SCHEMA_APPLY_ACK,
  targetEnvironmentPresent: true,
  operatorAuthorized: true,
  correlationId: 'corr-live',
};

function okExecutor(): CrmSchemaApplyExecutor {
  return {
    createTable: async () => ({ ok: true }),
    createColumn: async () => ({ ok: true }),
    createRelationship: async () => ({ ok: true }),
  };
}

describe('inspect / plan modes', () => {
  it('inspect returns inspect_completed with a report and writes nothing', async () => {
    const r = await runCrmSpineSchemaOrchestrator({ mode: 'inspect', correlationId: 'c1', snapshot: [] });
    expect(r.outcome).toBe('inspect_completed');
    expect(r.report).not.toBeNull();
    expect(r.executed).toBe(false);
  });

  it('plan returns plan_generated with a plan', async () => {
    const r = await runCrmSpineSchemaOrchestrator({ mode: 'plan', correlationId: 'c2', snapshot: [] });
    expect(r.outcome).toBe('plan_generated');
    expect(r.plan).not.toBeNull();
    expect(r.executed).toBe(false);
  });
});

describe('dry-run apply', () => {
  it('returns dry_run_completed with simulated steps and executed:false', async () => {
    const r = await runCrmSpineSchemaOrchestrator({ mode: 'dry-run-apply', correlationId: 'c3', snapshot: [] });
    expect(r.outcome).toBe('dry_run_completed');
    expect(r.executed).toBe(false);
    expect(r.schemaMutated).toBe(false);
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.steps.every((s) => s.outcome === 'dry-run-simulated')).toBe(true);
  });
});

describe('live apply is gated and requires an executor', () => {
  it('blocks with no gate', async () => {
    const r = await runCrmSpineSchemaOrchestrator({ mode: 'live-apply', correlationId: 'c4', snapshot: [], executor: okExecutor() });
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
    expect(r.executed).toBe(false);
    expect(r.schemaMutated).toBe(false);
  });

  it('blocks when the gate is satisfied but no executor is wired', async () => {
    const r = await runCrmSpineSchemaOrchestrator({ mode: 'live-apply', correlationId: 'corr-live', snapshot: [], gate: satisfiedGate });
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
    expect(r.blockedReason).toMatch(/executor/i);
  });

  it('applies when gate satisfied + executor wired', async () => {
    const r = await runCrmSpineSchemaOrchestrator({ mode: 'live-apply', correlationId: 'corr-live', snapshot: [], gate: satisfiedGate, executor: okExecutor() });
    expect(r.outcome).toBe('apply_completed');
    expect(r.executed).toBe(true);
    expect(r.schemaMutated).toBe(true);
    expect(r.created).toBeGreaterThan(0);
    expect(r.audit.every((a) => a.correlationId === 'corr-live')).toBe(true);
  });

  it('returns partial_success when some steps fail', async () => {
    let n = 0;
    const flaky: CrmSchemaApplyExecutor = {
      createTable: async () => { n += 1; return n === 1 ? { ok: false, error: 'dv' } : { ok: true }; },
      createColumn: async () => ({ ok: true }),
      createRelationship: async () => ({ ok: true }),
    };
    const r = await runCrmSpineSchemaOrchestrator({ mode: 'live-apply', correlationId: 'corr-live', snapshot: [], gate: satisfiedGate, executor: flaky });
    expect(r.created).toBeGreaterThan(0);
    expect(r.failed).toBeGreaterThan(0);
    expect(r.outcome).toBe('partial_success');
  });

  it('is idempotent/resumable — already-applied targets are skipped', async () => {
    const planRun = await runCrmSpineSchemaOrchestrator({ mode: 'plan', correlationId: 'c', snapshot: [] });
    const targets = planRun.plan!.steps.map((s) => s.target);
    const r = await runCrmSpineSchemaOrchestrator({ mode: 'live-apply', correlationId: 'corr-live', snapshot: [], gate: satisfiedGate, executor: okExecutor(), alreadyAppliedTargets: targets });
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(targets.length);
    expect(r.schemaMutated).toBe(false);
    expect(r.outcome).toBe('apply_completed');
  });
});
