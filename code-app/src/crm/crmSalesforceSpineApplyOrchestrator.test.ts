import { describe, it, expect } from 'vitest';
import {
  runCrmSpineApply,
  inspectCrmSpineSchema,
  planCrmSpineSchema,
  type CrmSchemaApplyExecutor,
} from './crmSalesforceSpineApplyOrchestrator';
import { CRM_SPINE_SCHEMA_APPLY_ACK, type CrmSpineLiveGateConfig } from './crmSalesforceSpineLiveGates';

/** Phase 193 — apply orchestrator (dry-run + gated live apply). */

const satisfiedGate: CrmSpineLiveGateConfig = {
  schemaApplyEnabled: 'true',
  livePersistenceEnabled: 'true',
  acknowledgement: CRM_SPINE_SCHEMA_APPLY_ACK,
  targetEnvironmentPresent: true,
  operatorAuthorized: true,
};

function okExecutor(): CrmSchemaApplyExecutor {
  return {
    createTable: async () => ({ ok: true }),
    createColumn: async () => ({ ok: true }),
    createRelationship: async () => ({ ok: true }),
  };
}

describe('inspect/plan are delegated to 189K and stay stable', () => {
  it('re-exports inspect + plan', () => {
    expect(inspectCrmSpineSchema({ snapshot: [] }).mode).toBe('inspect');
    expect(planCrmSpineSchema({ snapshot: [] }).mode).toBe('plan');
  });
});

describe('dry-run apply', () => {
  it('simulates every step and executes nothing', async () => {
    const r = await runCrmSpineApply({ mode: 'dry-run-apply', snapshot: [], actor: 'op', correlationId: 'c1' });
    expect(r.executed).toBe(false);
    expect(r.schemaMutated).toBe(false);
    expect(r.overallOutcome).toBe('dry_run_complete');
    expect(r.steps.every((s) => s.outcome === 'dry-run-simulated')).toBe(true);
    expect(r.audit[0].dryRun).toBe(true);
  });
});

describe('live apply is gated and requires an executor', () => {
  it('blocks with no gate', async () => {
    const r = await runCrmSpineApply({ mode: 'live-apply', snapshot: [], actor: 'op', correlationId: 'c2', executor: okExecutor() });
    expect(r.executed).toBe(false);
    expect(r.schemaMutated).toBe(false);
    expect(r.overallOutcome).toBe('blocked_gate_not_satisfied');
  });

  it('blocks when the gate is satisfied but no executor is wired', async () => {
    const r = await runCrmSpineApply({ mode: 'live-apply', snapshot: [], actor: 'op', correlationId: 'c3', gate: satisfiedGate });
    expect(r.executed).toBe(false);
    expect(r.overallOutcome).toBe('blocked_gate_not_satisfied');
    expect(r.blockedReason).toMatch(/executor/i);
  });

  it('runs the plan when gate satisfied + executor wired (created)', async () => {
    const r = await runCrmSpineApply({ mode: 'live-apply', snapshot: [], actor: 'op', correlationId: 'c4', gate: satisfiedGate, executor: okExecutor() });
    expect(r.executed).toBe(true);
    expect(r.gateSatisfied).toBe(true);
    expect(r.schemaMutated).toBe(true);
    expect(r.created).toBeGreaterThan(0);
    expect(r.failed).toBe(0);
    expect(r.overallOutcome).toBe('created');
    expect(r.audit.length).toBe(r.created);
    expect(r.audit.every((a) => a.dryRun === false)).toBe(true);
  });

  it('returns partial_success when some steps fail', async () => {
    let n = 0;
    const flaky: CrmSchemaApplyExecutor = {
      createTable: async () => {
        n += 1;
        return n === 1 ? { ok: false, error: 'dv_error' } : { ok: true };
      },
      createColumn: async () => ({ ok: true }),
      createRelationship: async () => ({ ok: true }),
    };
    const r = await runCrmSpineApply({ mode: 'live-apply', snapshot: [], actor: 'op', correlationId: 'c5', gate: satisfiedGate, executor: flaky });
    expect(r.failed).toBeGreaterThan(0);
    expect(r.created).toBeGreaterThan(0);
    expect(r.overallOutcome).toBe('partial_success');
  });

  it('is idempotent/resumable — already-applied targets are skipped', async () => {
    const plan = planCrmSpineSchema({ snapshot: [] });
    const targets = plan.steps.map((s) => s.target);
    const r = await runCrmSpineApply({
      mode: 'live-apply', snapshot: [], actor: 'op', correlationId: 'c6', gate: satisfiedGate, executor: okExecutor(),
      alreadyAppliedTargets: targets,
    });
    expect(r.skipped).toBe(plan.steps.length);
    expect(r.created).toBe(0);
    expect(r.schemaMutated).toBe(false);
    expect(r.overallOutcome).toBe('no_changes_needed');
  });
});
