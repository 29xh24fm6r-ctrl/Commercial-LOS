/**
 * Phase 189K — Salesforce-style CRM spine SCHEMA ADAPTER (inspect / plan /
 * disabled-seed).
 *
 * Pure and FAIL-CLOSED. This module binds the Phase 189J launch entities to
 * their Dataverse `cr664_crm*` schema artifacts (tables / columns /
 * relationships) and exposes three modes:
 *
 *   - inspect : compares a read-only live snapshot against the plan and reports
 *               which tables/columns/relationships appear present or missing.
 *   - plan    : produces deterministic create-table / create-column /
 *               create-relationship steps — but executes NOTHING.
 *   - seed    : DISABLED by default. An explicit gate (confirmation +
 *               acknowledgement + live persistence) is required even to be
 *               considered, and even when the gate is satisfied this phase
 *               performs NO live write — the write path is intentionally absent.
 *
 * HARD rules (pinned by tests):
 *   - No live Dataverse write, no schema mutation, no fetch/SDK call — by
 *     default or otherwise. Plan steps are descriptive metadata, never executed.
 *   - No fabricated CRM records and no `CRM_LIVE_PERSISTENCE_ENABLED` flip.
 *   - Derived (coverage team / deal relationship / health) and meta (source fact
 *     / visibility) entities need no schema and emit no steps.
 */

import { CRM_LIVE_PERSISTENCE_ENABLED } from './crmFeatureFlags';
import {
  CRM_TARGET_RELATIONSHIPS,
  crmTargetColumnsForTable,
  getCrmTargetTable,
  type CrmTargetColumnPlan,
  type CrmTargetRelationshipPlan,
  type CrmTargetTablePlan,
} from './crmDataverseSchemaPlan';
import { CRM_SPINE_ENTITIES, type CrmSpineEntityKey } from './crmSalesforceSpineModel';

export const CRM_SPINE_SCHEMA_ADAPTER_VERSION = '189K.1';

export type CrmSpineSchemaMode = 'inspect' | 'plan' | 'seed';

/** Live mutation is disabled by default; the seed mode is gated and inert. */
export const CRM_SPINE_SCHEMA_DEFAULT_MODE: CrmSpineSchemaMode = 'inspect';
export const CRM_SPINE_SEED_DISABLED_BY_DEFAULT = true;

export type CrmSpineSchemaKind = 'spine-table' | 'derived-no-schema' | 'meta-no-schema';

// ---------------------------------------------------------------------------
// The cr664_crmtask table plan (not part of the 141J-K base schema plan).
// ---------------------------------------------------------------------------

const TASK_TABLE = 'cr664_crmtask';

export const CRM_TASK_TABLE_PLAN: CrmTargetTablePlan = Object.freeze({
  logicalName: TASK_TABLE,
  schemaName: 'cr664_Crmtask',
  displayName: 'CRM Task',
  pluralDisplayName: 'CRM Tasks',
  primaryNameColumn: 'cr664_name',
  ownershipType: 'UserOwned',
  description: 'CRM follow-up task against an account/contact/deal.',
  requiredForPhase: '189K',
  seedOrder: 11,
  sourceModelType: 'CrmTask',
  safetyNotes:
    'Inspect live metadata before any seed. Never create if a conflicting artifact already exists. No record data is ever seeded.',
});

function taskCol(
  shortName: string,
  displayName: string,
  dataType: CrmTargetColumnPlan['dataType'],
  extra: Partial<CrmTargetColumnPlan> = {},
): CrmTargetColumnPlan {
  return {
    tableLogicalName: TASK_TABLE,
    logicalName: `cr664_${shortName}`,
    schemaName: `cr664_${shortName.charAt(0).toUpperCase()}${shortName.slice(1)}`,
    displayName,
    dataType,
    requiredLevel: 'None',
    description: displayName,
    sourceModelPath: '',
    requiredForCreate: false,
    sensitive: false,
    safetyNotes: '',
    ...extra,
  };
}

const CRM_TASK_COLUMNS: readonly CrmTargetColumnPlan[] = Object.freeze([
  taskCol('name', 'Name', 'String', {
    requiredLevel: 'ApplicationRequired',
    requiredForCreate: true,
    maxLength: 200,
    description: 'Primary name (operator-supplied label).',
  }),
  taskCol('taskidtext', 'Task id (text)', 'String', { sourceModelPath: 'task.id' }),
  taskCol('subjectentitytype', 'Subject entity type', 'String', { sourceModelPath: 'task.subjectEntityType' }),
  taskCol('subjectentityid', 'Subject entity id', 'String', { sourceModelPath: 'task.subjectEntityId' }),
  taskCol('title', 'Title', 'String', { sourceModelPath: 'task.title' }),
  taskCol('status', 'Status', 'Picklist', { optionSetKey: 'crmTaskStatus', sourceModelPath: 'task.status' }),
  taskCol('duedate', 'Due date', 'DateTime', { sourceModelPath: 'task.dueDate' }),
  taskCol('notes', 'Notes', 'Memo'),
]);

function taskRel(
  relationshipSchemaName: string,
  fromColumn: string,
  toTable: string,
  description: string,
): CrmTargetRelationshipPlan {
  return {
    relationshipSchemaName,
    fromTable: TASK_TABLE,
    fromColumn,
    toTable,
    cardinality: 'ManyToOne',
    required: false,
    optional: true,
    cascadeBehavior: 'Referential',
    description,
  };
}

const CRM_TASK_RELATIONSHIPS: readonly CrmTargetRelationshipPlan[] = Object.freeze([
  taskRel('cr664_crmtask_organization', 'cr664_Organization', 'cr664_crmorganization', 'A task may reference an organization.'),
  taskRel('cr664_crmtask_person', 'cr664_Person', 'cr664_crmperson', 'A task may reference a person.'),
  taskRel('cr664_crmtask_originatedloandeal', 'cr664_OriginatedLoanDeal', 'cr664_loandeal', 'A task may reference an originated loan deal.'),
]);

// ---------------------------------------------------------------------------
// Entity → schema bindings
// ---------------------------------------------------------------------------

export interface CrmSpineEntitySchemaBinding {
  entity: CrmSpineEntityKey;
  schemaKind: CrmSpineSchemaKind;
  table: CrmTargetTablePlan | null;
  columns: readonly CrmTargetColumnPlan[];
  relationships: readonly CrmTargetRelationshipPlan[];
}

function bindingFor(key: CrmSpineEntityKey, backingTable: string | null, sourceKind: string): CrmSpineEntitySchemaBinding {
  if (sourceKind === 'policy') {
    return { entity: key, schemaKind: 'meta-no-schema', table: null, columns: [], relationships: [] };
  }
  if (backingTable === null) {
    // Derived from existing authorized facts — no schema of its own.
    return { entity: key, schemaKind: 'derived-no-schema', table: null, columns: [], relationships: [] };
  }
  if (backingTable === TASK_TABLE) {
    return {
      entity: key,
      schemaKind: 'spine-table',
      table: CRM_TASK_TABLE_PLAN,
      columns: CRM_TASK_COLUMNS,
      relationships: CRM_TASK_RELATIONSHIPS,
    };
  }
  const table = getCrmTargetTable(backingTable) ?? null;
  return {
    entity: key,
    schemaKind: 'spine-table',
    table,
    columns: table ? crmTargetColumnsForTable(backingTable) : [],
    relationships: CRM_TARGET_RELATIONSHIPS.filter((r) => r.fromTable === backingTable),
  };
}

export const CRM_SPINE_SCHEMA_BINDINGS: readonly CrmSpineEntitySchemaBinding[] = Object.freeze(
  CRM_SPINE_ENTITIES.map((e) => bindingFor(e.key, e.backingTable, e.sourceKind)),
);

// ---------------------------------------------------------------------------
// Inspect mode
// ---------------------------------------------------------------------------

export interface CrmLiveTableSnapshot {
  logicalName: string;
  exists: boolean;
  presentColumns?: readonly string[];
  /** Relationship schema names observed live. */
  presentRelationships?: readonly string[];
  /** A conflicting/legacy artifact occupies this name. */
  conflicting?: boolean;
}

export interface CrmSpineInspectInput {
  snapshot?: readonly CrmLiveTableSnapshot[];
}

export type CrmSpineEntityTableStatus =
  | 'present'
  | 'partial'
  | 'missing'
  | 'conflict'
  | 'not-applicable';

export interface CrmSpineEntityInspection {
  entity: CrmSpineEntityKey;
  schemaKind: CrmSpineSchemaKind;
  backingTable: string | null;
  status: CrmSpineEntityTableStatus;
  columnsExpected: number;
  columnsPresent: string[];
  columnsMissing: string[];
  relationshipsExpected: number;
  relationshipsPresent: string[];
  relationshipsMissing: string[];
}

export type CrmSpineInspectNextAction = 'plan-schema' | 'reuse-existing' | 'resolve-conflicts';

export interface CrmSpineSchemaInspectionReport {
  mode: 'inspect';
  adapterVersion: string;
  entities: CrmSpineEntityInspection[];
  tablesPresent: string[];
  tablesPartial: string[];
  tablesMissing: string[];
  tableConflicts: string[];
  totalColumnsMissing: number;
  totalRelationshipsMissing: number;
  // Safety literals — inspection performs no mutation.
  liveWritePerformed: false;
  schemaMutated: false;
  recommendedNextAction: CrmSpineInspectNextAction;
}

export function inspectCrmSpineSchema(
  input: CrmSpineInspectInput = {},
): CrmSpineSchemaInspectionReport {
  const snapshotByName = new Map<string, CrmLiveTableSnapshot>();
  for (const s of input.snapshot ?? []) snapshotByName.set(s.logicalName, s);

  const entities: CrmSpineEntityInspection[] = CRM_SPINE_SCHEMA_BINDINGS.map((b) => {
    const expectedColumns = b.columns.map((c) => c.logicalName);
    const expectedRels = b.relationships.map((r) => r.relationshipSchemaName);

    if (b.schemaKind !== 'spine-table' || b.table === null) {
      return {
        entity: b.entity,
        schemaKind: b.schemaKind,
        backingTable: null,
        status: 'not-applicable',
        columnsExpected: 0,
        columnsPresent: [],
        columnsMissing: [],
        relationshipsExpected: 0,
        relationshipsPresent: [],
        relationshipsMissing: [],
      };
    }

    const live = snapshotByName.get(b.table.logicalName);
    if (live?.conflicting === true) {
      return {
        entity: b.entity,
        schemaKind: b.schemaKind,
        backingTable: b.table.logicalName,
        status: 'conflict',
        columnsExpected: expectedColumns.length,
        columnsPresent: [],
        columnsMissing: expectedColumns,
        relationshipsExpected: expectedRels.length,
        relationshipsPresent: [],
        relationshipsMissing: expectedRels,
      };
    }

    if (!live || live.exists !== true) {
      return {
        entity: b.entity,
        schemaKind: b.schemaKind,
        backingTable: b.table.logicalName,
        status: 'missing',
        columnsExpected: expectedColumns.length,
        columnsPresent: [],
        columnsMissing: expectedColumns,
        relationshipsExpected: expectedRels.length,
        relationshipsPresent: [],
        relationshipsMissing: expectedRels,
      };
    }

    const presentColsLower = new Set((live.presentColumns ?? []).map((c) => c.toLowerCase()));
    const columnsPresent = expectedColumns.filter((c) => presentColsLower.has(c.toLowerCase()));
    const columnsMissing = expectedColumns.filter((c) => !presentColsLower.has(c.toLowerCase()));

    const presentRels = new Set(live.presentRelationships ?? []);
    const relationshipsPresent = expectedRels.filter((r) => presentRels.has(r));
    const relationshipsMissing = expectedRels.filter((r) => !presentRels.has(r));

    const status: CrmSpineEntityTableStatus =
      columnsMissing.length === 0 && relationshipsMissing.length === 0 ? 'present' : 'partial';

    return {
      entity: b.entity,
      schemaKind: b.schemaKind,
      backingTable: b.table.logicalName,
      status,
      columnsExpected: expectedColumns.length,
      columnsPresent,
      columnsMissing,
      relationshipsExpected: expectedRels.length,
      relationshipsPresent,
      relationshipsMissing,
    };
  });

  const tablesPresent = entities.filter((e) => e.status === 'present').map((e) => e.backingTable!);
  const tablesPartial = entities.filter((e) => e.status === 'partial').map((e) => e.backingTable!);
  const tablesMissing = entities.filter((e) => e.status === 'missing').map((e) => e.backingTable!);
  const tableConflicts = entities.filter((e) => e.status === 'conflict').map((e) => e.backingTable!);
  const totalColumnsMissing = entities.reduce((n, e) => n + e.columnsMissing.length, 0);
  const totalRelationshipsMissing = entities.reduce((n, e) => n + e.relationshipsMissing.length, 0);

  let recommendedNextAction: CrmSpineInspectNextAction;
  if (tableConflicts.length > 0) {
    recommendedNextAction = 'resolve-conflicts';
  } else if (tablesMissing.length > 0 || tablesPartial.length > 0) {
    recommendedNextAction = 'plan-schema';
  } else {
    recommendedNextAction = 'reuse-existing';
  }

  return {
    mode: 'inspect',
    adapterVersion: CRM_SPINE_SCHEMA_ADAPTER_VERSION,
    entities,
    tablesPresent,
    tablesPartial,
    tablesMissing,
    tableConflicts,
    totalColumnsMissing,
    totalRelationshipsMissing,
    liveWritePerformed: false,
    schemaMutated: false,
    recommendedNextAction,
  };
}

// ---------------------------------------------------------------------------
// Plan mode (deterministic steps; executes nothing)
// ---------------------------------------------------------------------------

export type CrmSpineSchemaStepKind = 'create-table' | 'create-column' | 'create-relationship';

/** Metadata operation a step WOULD perform — descriptive only, never invoked. */
export type CrmSpineMetadataOperation = 'CreateEntity' | 'CreateAttribute' | 'CreateRelationship';

export interface CrmSpineSchemaStep {
  order: number;
  kind: CrmSpineSchemaStepKind;
  operation: CrmSpineMetadataOperation;
  entity: CrmSpineEntityKey;
  table: string;
  target: string;
  detail: string;
}

export interface CrmSpineSchemaPlan {
  mode: 'plan';
  adapterVersion: string;
  steps: CrmSpineSchemaStep[];
  createTableCount: number;
  createColumnCount: number;
  createRelationshipCount: number;
  // Safety literals — planning executes nothing.
  executed: false;
  liveWritePerformed: false;
  schemaMutated: false;
  requiresExplicitSeedGate: true;
  conflictsBlockingPlan: string[];
  note: string;
}

export interface CrmSpinePlanInput {
  snapshot?: readonly CrmLiveTableSnapshot[];
  /** Reuse an existing inspection report instead of re-deriving. */
  report?: CrmSpineSchemaInspectionReport;
}

export function planCrmSpineSchema(input: CrmSpinePlanInput = {}): CrmSpineSchemaPlan {
  const report = input.report ?? inspectCrmSpineSchema({ snapshot: input.snapshot });
  const bindingByEntity = new Map(CRM_SPINE_SCHEMA_BINDINGS.map((b) => [b.entity, b] as const));

  const tableSteps: CrmSpineSchemaStep[] = [];
  const columnSteps: CrmSpineSchemaStep[] = [];
  const relationshipSteps: CrmSpineSchemaStep[] = [];

  // Deterministic: order by the table seedOrder so a re-plan is identical.
  const ordered = [...report.entities]
    .filter((e) => e.schemaKind === 'spine-table' && e.status !== 'not-applicable' && e.status !== 'conflict')
    .sort((a, b) => {
      const ta = bindingByEntity.get(a.entity)?.table?.seedOrder ?? 0;
      const tb = bindingByEntity.get(b.entity)?.table?.seedOrder ?? 0;
      return ta - tb;
    });

  for (const e of ordered) {
    const binding = bindingByEntity.get(e.entity);
    if (!binding || !binding.table) continue;
    const table = binding.table.logicalName;

    if (e.status === 'missing') {
      tableSteps.push({
        order: 0,
        kind: 'create-table',
        operation: 'CreateEntity',
        entity: e.entity,
        table,
        target: table,
        detail: `Create table ${table} (${binding.table.displayName}).`,
      });
    }
    for (const col of e.columnsMissing) {
      columnSteps.push({
        order: 0,
        kind: 'create-column',
        operation: 'CreateAttribute',
        entity: e.entity,
        table,
        target: col,
        detail: `Create column ${col} on ${table}.`,
      });
    }
    for (const rel of e.relationshipsMissing) {
      relationshipSteps.push({
        order: 0,
        kind: 'create-relationship',
        operation: 'CreateRelationship',
        entity: e.entity,
        table,
        target: rel,
        detail: `Create relationship ${rel} from ${table}.`,
      });
    }
  }

  const steps = [...tableSteps, ...columnSteps, ...relationshipSteps].map((s, i) => ({
    ...s,
    order: i + 1,
  }));

  return {
    mode: 'plan',
    adapterVersion: CRM_SPINE_SCHEMA_ADAPTER_VERSION,
    steps,
    createTableCount: tableSteps.length,
    createColumnCount: columnSteps.length,
    createRelationshipCount: relationshipSteps.length,
    executed: false,
    liveWritePerformed: false,
    schemaMutated: false,
    requiresExplicitSeedGate: true,
    conflictsBlockingPlan: report.tableConflicts,
    note:
      'Deterministic schema plan only. No metadata operation is executed. Conflicts must be resolved manually before any seed; the seed mode is gated and inert this phase.',
  };
}

// ---------------------------------------------------------------------------
// Disabled seed mode (gated + inert)
// ---------------------------------------------------------------------------

export interface CrmSpineSeedGate {
  /** Must be explicitly true to even consider a live path. */
  explicitlyConfirmed?: boolean;
  /** Operator acknowledgement of the irreversible nature of a live seed. */
  acknowledgement?: string;
  /** Live persistence flag (defaults to the build-time flag, which is false). */
  liveCrmPersistenceEnabled?: boolean;
}

export interface CrmSpineSeedResult {
  mode: 'seed';
  adapterVersion: string;
  gateRequired: true;
  gateSatisfied: boolean;
  // Safety literals — this phase performs NO live write under any input.
  executed: false;
  liveWritePerformed: false;
  schemaMutated: false;
  stepsThatWouldRun: number;
  blockedReason: string;
}

export function runCrmSpineSchemaSeed(
  plan: CrmSpineSchemaPlan,
  gate: CrmSpineSeedGate = {},
): CrmSpineSeedResult {
  const livePersistence = gate.liveCrmPersistenceEnabled ?? CRM_LIVE_PERSISTENCE_ENABLED;
  const gateSatisfied =
    gate.explicitlyConfirmed === true &&
    livePersistence === true &&
    typeof gate.acknowledgement === 'string' &&
    gate.acknowledgement.trim().length > 0;

  const blockedReason = gateSatisfied
    ? 'Seed gate satisfied, but the live schema-write path is intentionally not implemented in Phase 189K. No metadata operation is performed.'
    : 'Seed gate not satisfied. Explicit confirmation, an acknowledgement, and live persistence are all required — and even then no write runs this phase.';

  return {
    mode: 'seed',
    adapterVersion: CRM_SPINE_SCHEMA_ADAPTER_VERSION,
    gateRequired: true,
    gateSatisfied,
    executed: false,
    liveWritePerformed: false,
    schemaMutated: false,
    stepsThatWouldRun: plan.steps.length,
    blockedReason,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher (defaults to inspect; seed stays disabled)
// ---------------------------------------------------------------------------

export type CrmSpineSchemaAdapterRequest =
  | { mode?: 'inspect'; snapshot?: readonly CrmLiveTableSnapshot[] }
  | { mode: 'plan'; snapshot?: readonly CrmLiveTableSnapshot[] }
  | { mode: 'seed'; snapshot?: readonly CrmLiveTableSnapshot[]; gate?: CrmSpineSeedGate };

export type CrmSpineSchemaAdapterResult =
  | CrmSpineSchemaInspectionReport
  | CrmSpineSchemaPlan
  | CrmSpineSeedResult;

export function runCrmSpineSchemaAdapter(
  request: CrmSpineSchemaAdapterRequest = {},
): CrmSpineSchemaAdapterResult {
  const mode = request.mode ?? CRM_SPINE_SCHEMA_DEFAULT_MODE;
  if (mode === 'plan') {
    return planCrmSpineSchema({ snapshot: request.snapshot });
  }
  if (mode === 'seed') {
    const plan = planCrmSpineSchema({ snapshot: request.snapshot });
    const gate = 'gate' in request ? request.gate : undefined;
    return runCrmSpineSchemaSeed(plan, gate);
  }
  return inspectCrmSpineSchema({ snapshot: request.snapshot });
}
