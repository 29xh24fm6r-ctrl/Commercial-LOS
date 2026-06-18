/**
 * Phase 193 — Salesforce CRM spine APPLY ORCHESTRATOR.
 *
 * Extends the Phase 189K inspect/plan adapter into a full inspect → plan →
 * dry-run apply → live apply orchestrator. Inspect and plan behavior is
 * delegated unchanged to 189K. The apply paths are:
 *
 *   - dry-run apply : simulates every plan step, executes NOTHING.
 *   - live apply    : runs the plan against an INJECTED metadata executor, but
 *                     ONLY when the schema-apply gate is fully satisfied AND an
 *                     executor is wired. Default behavior (no gate, no executor)
 *                     is no-write/blocked.
 *
 * The live path is deterministic (plan order), idempotent (steps whose artifact
 * is already present are skipped), and resumable (already-applied targets are
 * skipped). Every path emits deterministic audit payloads. No step "succeeds"
 * without a real executor response.
 */

import {
  inspectCrmSpineSchema,
  planCrmSpineSchema,
  type CrmLiveTableSnapshot,
  type CrmSpineSchemaInspectionReport,
  type CrmSpineSchemaPlan,
  type CrmSpineSchemaStep,
} from './crmSalesforceSpineSchemaAdapter';
import { evaluateCrmSpineSchemaApplyGate, type CrmSpineLiveGateConfig } from './crmSalesforceSpineLiveGates';
import { buildCrmSpineAuditPayload, type CrmSpineAuditPayload } from './crmSalesforceSpineAudit';

export type CrmSpineApplyMode = 'dry-run-apply' | 'live-apply';

export type CrmSpineStepOutcome =
  | 'dry-run-simulated'
  | 'created'
  | 'skipped-present'
  | 'failed'
  | 'blocked-gate-not-satisfied';

export interface CrmSpineApplyStepResult {
  order: number;
  kind: CrmSpineSchemaStep['kind'];
  operation: CrmSpineSchemaStep['operation'];
  table: string;
  target: string;
  outcome: CrmSpineStepOutcome;
  error: string | null;
}

export type CrmSpineApplyOverallOutcome =
  | 'dry_run_complete'
  | 'created'
  | 'no_changes_needed'
  | 'partial_success'
  | 'blocked_gate_not_satisfied'
  | 'failed_dataverse';

export interface CrmSpineApplyResult {
  mode: CrmSpineApplyMode;
  /** True only when a live executor actually ran under a satisfied gate. */
  executed: boolean;
  gateSatisfied: boolean;
  /** True only if at least one live create returned ok. */
  schemaMutated: boolean;
  steps: CrmSpineApplyStepResult[];
  created: number;
  skipped: number;
  failed: number;
  overallOutcome: CrmSpineApplyOverallOutcome;
  blockedReason: string | null;
  audit: CrmSpineAuditPayload[];
}

/**
 * Injected metadata executor. Exposes create-only operations — there is NO
 * delete and NO drop. Never wired by default; tests inject a stub so that "no
 * schema mutation in tests" holds (the stub touches nothing real).
 */
export interface CrmSchemaApplyExecutor {
  createTable(table: string): Promise<{ ok: boolean; error?: string }>;
  createColumn(table: string, column: string): Promise<{ ok: boolean; error?: string }>;
  createRelationship(table: string, relationship: string): Promise<{ ok: boolean; error?: string }>;
}

export interface CrmSpineApplyRequest {
  mode: CrmSpineApplyMode;
  correlationId: string;
  actor: string;
  snapshot?: readonly CrmLiveTableSnapshot[];
  report?: CrmSpineSchemaInspectionReport;
  plan?: CrmSpineSchemaPlan;
  /** Required (and must be satisfied) for live apply. */
  gate?: CrmSpineLiveGateConfig;
  /** Required for live apply; absent → live apply stays blocked. */
  executor?: CrmSchemaApplyExecutor;
  /** Resumability: step targets already applied in a prior run are skipped. */
  alreadyAppliedTargets?: readonly string[];
}

function resolvePlan(req: CrmSpineApplyRequest): CrmSpineSchemaPlan {
  if (req.plan) return req.plan;
  const report = req.report ?? inspectCrmSpineSchema({ snapshot: req.snapshot });
  return planCrmSpineSchema({ report });
}

async function runStep(
  executor: CrmSchemaApplyExecutor,
  step: CrmSpineSchemaStep,
): Promise<{ ok: boolean; error?: string }> {
  switch (step.kind) {
    case 'create-table':
      return executor.createTable(step.table);
    case 'create-column':
      return executor.createColumn(step.table, step.target);
    case 'create-relationship':
      return executor.createRelationship(step.table, step.target);
  }
}

export async function runCrmSpineApply(req: CrmSpineApplyRequest): Promise<CrmSpineApplyResult> {
  const plan = resolvePlan(req);
  const applied = new Set(req.alreadyAppliedTargets ?? []);

  // ----- dry-run apply: simulate everything, execute nothing -----
  if (req.mode === 'dry-run-apply') {
    const steps: CrmSpineApplyStepResult[] = plan.steps.map((s) => ({
      order: s.order,
      kind: s.kind,
      operation: s.operation,
      table: s.table,
      target: s.target,
      outcome: applied.has(s.target) ? 'skipped-present' : 'dry-run-simulated',
      error: null,
    }));
    return {
      mode: 'dry-run-apply',
      executed: false,
      gateSatisfied: false,
      schemaMutated: false,
      steps,
      created: 0,
      skipped: steps.filter((s) => s.outcome === 'skipped-present').length,
      failed: 0,
      overallOutcome: 'dry_run_complete',
      blockedReason: null,
      audit: [
        buildCrmSpineAuditPayload({
          correlationId: req.correlationId,
          actor: req.actor,
          targetEntity: 'cr664_crm-spine',
          action: 'schema-dry-run-apply',
          outcome: 'dry_run_complete',
          dryRun: true,
          sourceFacts: [
            { statement: `Dry-run apply over ${plan.steps.length} planned step(s).`, sourceLogicalName: null, sourceRecordId: null },
          ],
        }),
      ],
    };
  }

  // ----- live apply: gated + requires an injected executor -----
  const gate = evaluateCrmSpineSchemaApplyGate(req.gate);
  const audit: CrmSpineAuditPayload[] = [];

  if (!gate.satisfied || !req.executor) {
    const blockedReason = !gate.satisfied
      ? `Schema-apply gate not satisfied: ${gate.blockers.join('; ')}.`
      : 'No schema-apply executor is wired; live apply stays blocked.';
    audit.push(
      buildCrmSpineAuditPayload({
        correlationId: req.correlationId,
        actor: req.actor,
        targetEntity: 'cr664_crm-spine',
        action: 'schema-live-apply',
        outcome: 'blocked_gate_not_satisfied',
        dryRun: false,
        error: blockedReason,
        sourceFacts: [{ statement: blockedReason, sourceLogicalName: null, sourceRecordId: null }],
      }),
    );
    return {
      mode: 'live-apply',
      executed: false,
      gateSatisfied: gate.satisfied,
      schemaMutated: false,
      steps: plan.steps.map((s) => ({
        order: s.order,
        kind: s.kind,
        operation: s.operation,
        table: s.table,
        target: s.target,
        outcome: 'blocked-gate-not-satisfied',
        error: null,
      })),
      created: 0,
      skipped: 0,
      failed: 0,
      overallOutcome: 'blocked_gate_not_satisfied',
      blockedReason,
      audit,
    };
  }

  // Gate satisfied + executor wired: run deterministically, idempotently.
  const executor = req.executor;
  const steps: CrmSpineApplyStepResult[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let schemaMutated = false;

  for (const s of plan.steps) {
    if (applied.has(s.target)) {
      steps.push({ order: s.order, kind: s.kind, operation: s.operation, table: s.table, target: s.target, outcome: 'skipped-present', error: null });
      skipped += 1;
      continue;
    }
    const res = await runStep(executor, s);
    const outcome: CrmSpineStepOutcome = res.ok ? 'created' : 'failed';
    if (res.ok) {
      created += 1;
      schemaMutated = true;
    } else {
      failed += 1;
    }
    steps.push({ order: s.order, kind: s.kind, operation: s.operation, table: s.table, target: s.target, outcome, error: res.error ?? null });
    audit.push(
      buildCrmSpineAuditPayload({
        correlationId: req.correlationId,
        actor: req.actor,
        targetEntity: s.table,
        targetRecordId: s.target,
        action: 'schema-live-apply',
        outcome,
        dryRun: false,
        error: res.error ?? null,
        sourceFacts: [{ statement: `${s.operation} ${s.target} on ${s.table}.`, sourceLogicalName: s.table, sourceRecordId: null }],
      }),
    );
  }

  let overallOutcome: CrmSpineApplyOverallOutcome;
  if (plan.steps.length === 0) {
    overallOutcome = 'no_changes_needed';
  } else if (failed > 0 && created > 0) {
    overallOutcome = 'partial_success';
  } else if (failed > 0 && created === 0) {
    overallOutcome = 'failed_dataverse';
  } else if (created > 0) {
    overallOutcome = 'created';
  } else {
    overallOutcome = 'no_changes_needed';
  }

  return {
    mode: 'live-apply',
    executed: true,
    gateSatisfied: true,
    schemaMutated,
    steps,
    created,
    skipped,
    failed,
    overallOutcome,
    blockedReason: null,
    audit,
  };
}

// Re-export the stable 189K entry points so callers have a single orchestrator
// surface for inspect/plan without reaching into the adapter directly.
export { inspectCrmSpineSchema, planCrmSpineSchema } from './crmSalesforceSpineSchemaAdapter';
export type {
  CrmLiveTableSnapshot,
  CrmSpineSchemaInspectionReport,
  CrmSpineSchemaPlan,
} from './crmSalesforceSpineSchemaAdapter';
