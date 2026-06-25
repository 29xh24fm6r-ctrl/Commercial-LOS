import { describe, it, expect } from 'vitest';
import {
  CRM_SPINE_SCHEMA_BINDINGS,
  CRM_SPINE_SCHEMA_DEFAULT_MODE,
  CRM_SPINE_SEED_DISABLED_BY_DEFAULT,
  inspectCrmSpineSchema,
  planCrmSpineSchema,
  runCrmSpineSchemaAdapter,
  runCrmSpineSchemaSeed,
  type CrmLiveTableSnapshot,
} from './crmSalesforceSpineSchemaAdapter';

/**
 * Phase 189K — Salesforce CRM spine SCHEMA ADAPTER behavior.
 *
 * Proves inspect + plan work, and that NO mode executes a live write/schema
 * mutation — the seed mode is gated and inert.
 */

const SPINE_TABLE_ENTITIES = ['account', 'contact', 'accountContactRelationship', 'relationshipRole', 'activity', 'task'] as const;

/** A snapshot in which a given table exists with all planned columns + rels. */
function fullPresentSnapshot(entity: string): CrmLiveTableSnapshot {
  const b = CRM_SPINE_SCHEMA_BINDINGS.find((x) => x.entity === entity)!;
  return {
    logicalName: b.table!.logicalName,
    exists: true,
    presentColumns: b.columns.map((c) => c.logicalName),
    presentRelationships: b.relationships.map((r) => r.relationshipSchemaName),
  };
}

describe('entity → schema bindings cover all 11 launch entities', () => {
  it('binds the spine-table entities to cr664_crm* tables (incl. the new task table)', () => {
    const byEntity = new Map(CRM_SPINE_SCHEMA_BINDINGS.map((b) => [b.entity, b]));
    expect(byEntity.get('account')!.table!.logicalName).toBe('cr664_crmorganization');
    expect(byEntity.get('contact')!.table!.logicalName).toBe('cr664_crmperson');
    expect(byEntity.get('accountContactRelationship')!.table!.logicalName).toBe('cr664_crmrelationship');
    expect(byEntity.get('relationshipRole')!.table!.logicalName).toBe('cr664_crmroleassignment');
    expect(byEntity.get('activity')!.table!.logicalName).toBe('cr664_crmtimelineevent');
    expect(byEntity.get('task')!.table!.logicalName).toBe('cr664_crmtask');
    expect(byEntity.get('task')!.columns.length).toBeGreaterThan(0);
  });

  it('treats derived + meta entities as needing no schema', () => {
    const byEntity = new Map(CRM_SPINE_SCHEMA_BINDINGS.map((b) => [b.entity, b]));
    for (const e of ['coverageTeamMember', 'dealRelationship', 'relationshipHealth'] as const) {
      expect(byEntity.get(e)!.schemaKind).toBe('derived-no-schema');
      expect(byEntity.get(e)!.table).toBeNull();
    }
    for (const e of ['sourceFact', 'visibilityRequirement'] as const) {
      expect(byEntity.get(e)!.schemaKind).toBe('meta-no-schema');
    }
  });
});

describe('inspect mode', () => {
  it('reports every spine table missing against an empty snapshot, and mutates nothing', () => {
    const r = inspectCrmSpineSchema({ snapshot: [] });
    expect(r.mode).toBe('inspect');
    expect(r.liveWritePerformed).toBe(false);
    expect(r.schemaMutated).toBe(false);
    expect(r.tablesMissing).toEqual(
      expect.arrayContaining(['cr664_crmorganization', 'cr664_crmperson', 'cr664_crmtask']),
    );
    expect(r.recommendedNextAction).toBe('plan-schema');
    // Derived/meta entities are not-applicable, not "missing".
    const derived = r.entities.find((e) => e.entity === 'coverageTeamMember')!;
    expect(derived.status).toBe('not-applicable');
  });

  it('reports a fully-present table as present', () => {
    const r = inspectCrmSpineSchema({ snapshot: [fullPresentSnapshot('account')] });
    const account = r.entities.find((e) => e.entity === 'account')!;
    expect(account.status).toBe('present');
    expect(account.columnsMissing).toEqual([]);
    expect(r.tablesPresent).toContain('cr664_crmorganization');
  });

  it('reports a partial table when columns are missing', () => {
    const r = inspectCrmSpineSchema({
      snapshot: [{ logicalName: 'cr664_crmperson', exists: true, presentColumns: ['cr664_name'] }],
    });
    const contact = r.entities.find((e) => e.entity === 'contact')!;
    expect(contact.status).toBe('partial');
    expect(contact.columnsMissing.length).toBeGreaterThan(0);
  });

  it('flags a conflicting table and recommends resolving conflicts', () => {
    const r = inspectCrmSpineSchema({
      snapshot: [{ logicalName: 'cr664_crmorganization', exists: true, conflicting: true }],
    });
    expect(r.entities.find((e) => e.entity === 'account')!.status).toBe('conflict');
    expect(r.tableConflicts).toContain('cr664_crmorganization');
    expect(r.recommendedNextAction).toBe('resolve-conflicts');
  });
});

describe('plan mode — deterministic create steps, executes nothing', () => {
  it('plans create-table steps for all spine tables against an empty snapshot', () => {
    const p = planCrmSpineSchema({ snapshot: [] });
    expect(p.mode).toBe('plan');
    expect(p.executed).toBe(false);
    expect(p.liveWritePerformed).toBe(false);
    expect(p.schemaMutated).toBe(false);
    expect(p.requiresExplicitSeedGate).toBe(true);
    expect(p.createTableCount).toBe(SPINE_TABLE_ENTITIES.length);
    expect(p.createColumnCount).toBeGreaterThan(0);
    expect(p.createRelationshipCount).toBeGreaterThan(0);
  });

  it('is deterministic — re-planning the same input yields identical steps', () => {
    const a = planCrmSpineSchema({ snapshot: [] });
    const b = planCrmSpineSchema({ snapshot: [] });
    expect(a.steps).toEqual(b.steps);
    // Sequential 1..N ordering.
    expect(a.steps.map((s) => s.order)).toEqual(a.steps.map((_, i) => i + 1));
  });

  it('emits no create-table step for an already-present table', () => {
    const p = planCrmSpineSchema({ snapshot: [fullPresentSnapshot('account')] });
    const accountTableSteps = p.steps.filter((s) => s.kind === 'create-table' && s.table === 'cr664_crmorganization');
    expect(accountTableSteps).toEqual([]);
  });
});

describe('seed mode — disabled and inert', () => {
  const plan = planCrmSpineSchema({ snapshot: [] });

  it('is disabled by default and runs no write without a gate', () => {
    expect(CRM_SPINE_SEED_DISABLED_BY_DEFAULT).toBe(true);
    const r = runCrmSpineSchemaSeed(plan);
    expect(r.gateSatisfied).toBe(false);
    expect(r.executed).toBe(false);
    expect(r.liveWritePerformed).toBe(false);
    expect(r.schemaMutated).toBe(false);
    expect(r.blockedReason).toMatch(/not satisfied/i);
    expect(r.stepsThatWouldRun).toBe(plan.steps.length);
  });

  it('still performs NO live write even when the gate is fully satisfied this phase', () => {
    const r = runCrmSpineSchemaSeed(plan, {
      explicitlyConfirmed: true,
      acknowledgement: 'operator acknowledges irreversible live seed',
      liveCrmPersistenceEnabled: true,
    });
    expect(r.gateSatisfied).toBe(true);
    expect(r.executed).toBe(false);
    expect(r.liveWritePerformed).toBe(false);
    expect(r.schemaMutated).toBe(false);
    expect(r.blockedReason).toMatch(/not implemented/i);
  });

  it('a partial gate (confirmed but no live persistence) is not satisfied', () => {
    // Phase 256B flipped the build-time CRM_LIVE_PERSISTENCE_ENABLED to true, so the
    // "no live persistence" condition is now made explicit; the seed gate still
    // fails closed without it.
    const r = runCrmSpineSchemaSeed(plan, {
      explicitlyConfirmed: true,
      acknowledgement: 'ok',
      liveCrmPersistenceEnabled: false,
    });
    expect(r.gateSatisfied).toBe(false);
    expect(r.executed).toBe(false);
  });
});

describe('dispatcher defaults to inspect and never executes a write', () => {
  it('defaults to inspect mode', () => {
    expect(CRM_SPINE_SCHEMA_DEFAULT_MODE).toBe('inspect');
    const r = runCrmSpineSchemaAdapter();
    expect(r.mode).toBe('inspect');
  });

  it('routes plan and seed, with seed inert', () => {
    expect(runCrmSpineSchemaAdapter({ mode: 'plan' }).mode).toBe('plan');
    const seed = runCrmSpineSchemaAdapter({ mode: 'seed' });
    expect(seed.mode).toBe('seed');
    if (seed.mode === 'seed') {
      expect(seed.executed).toBe(false);
      expect(seed.liveWritePerformed).toBe(false);
    }
  });
});
