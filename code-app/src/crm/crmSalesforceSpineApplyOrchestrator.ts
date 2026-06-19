/**
 * Phase 193A — Salesforce CRM spine APPLY ORCHESTRATOR.
 *
 * Extends the Phase 189K inspect/plan adapter into a unified inspect → plan →
 * dry-run apply → live apply orchestrator. Inspect/plan are delegated unchanged
 * to 189K. The apply paths:
 *
 *   - dry-run apply : simulates every plan step, executes NOTHING.
 *   - live apply    : runs the plan against an INJECTED metadata executor, ONLY
 *                     when the schema-apply gate is fully satisfied (incl. a
 *                     deterministic correlation id) AND an executor is wired.
 *
 * Default behavior is no-write. The live path is deterministic (plan order),
 * idempotent (already-present artifacts skipped), and resumable
 * (`alreadyAppliedTargets`). No step "succeeds" without a real executor response;
 * there is no delete operation anywhere.
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

export type CrmSpineOrchestratorMode = 'inspect' | 'plan' | 'dry-run-apply' | 'live-apply';

export type CrmSpineApplyOutcome =
  | 'inspect_completed'
  | 'plan_generated'
  | 'dry_run_completed'
  | 'blocked_gate_not_satisfied'
  | 'apply_completed'
  | 'partial_success'
  | 'failed_dataverse';

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

export interface CrmSpineApplyAuditEntry {
  correlationId: string;
  actor: string;
  action: 'schema-inspect' | 'schema-plan' | 'schema-dry-run-apply' | 'schema-live-apply';
  target: string;
  outcome: string;
  error: string | null;
}

export interface CrmSchemaApplyExecutor {
  createTable(table: string): Promise<{ ok: boolean; error?: string }>;
  createColumn(table: string, column: string): Promise<{ ok: boolean; error?: string }>;
  createRelationship(table: string, relationship: string): Promise<{ ok: boolean; error?: string }>;
}

export interface CrmSpineOrchestratorRequest {
  mode: CrmSpineOrchestratorMode;
  correlationId: string;
  actor?: string;
  snapshot?: readonly CrmLiveTableSnapshot[];
  report?: CrmSpineSchemaInspectionReport;
  plan?: CrmSpineSchemaPlan;
  gate?: CrmSpineLiveGateConfig;
  executor?: CrmSchemaApplyExecutor;
  alreadyAppliedTargets?: readonly string[];
}

export interface CrmSpineOrchestratorResult {
  mode: CrmSpineOrchestratorMode;
  outcome: CrmSpineApplyOutcome;
  correlationId: string;
  executed: boolean;
  schemaMutated: boolean;
  gateSatisfied: boolean;
  report: CrmSpineSchemaInspectionReport | null;
  plan: CrmSpineSchemaPlan | null;
  steps: CrmSpineApplyStepResult[];
  created: number;
  skipped: number;
  failed: number;
  blockedReason: string | null;
  audit: CrmSpineApplyAuditEntry[];
}

function resolveReport(req: CrmSpineOrchestratorRequest): CrmSpineSchemaInspectionReport {
  return req.report ?? inspectCrmSpineSchema({ snapshot: req.snapshot });
}

function resolvePlan(req: CrmSpineOrchestratorRequest, report: CrmSpineSchemaInspectionReport): CrmSpineSchemaPlan {
  return req.plan ?? planCrmSpineSchema({ report });
}

async function runStep(executor: CrmSchemaApplyExecutor, step: CrmSpineSchemaStep): Promise<{ ok: boolean; error?: string }> {
  switch (step.kind) {
    case 'create-table':
      return executor.createTable(step.table);
    case 'create-column':
      return executor.createColumn(step.table, step.target);
    case 'create-relationship':
      return executor.createRelationship(step.table, step.target);
  }
}

export async function runCrmSpineSchemaOrchestrator(
  req: CrmSpineOrchestratorRequest,
): Promise<CrmSpineOrchestratorResult> {
  const actor = req.actor ?? 'unknown-operator';
  const base = {
    correlationId: req.correlationId,
    executed: false,
    schemaMutated: false,
    gateSatisfied: false,
    report: null as CrmSpineSchemaInspectionReport | null,
    plan: null as CrmSpineSchemaPlan | null,
    steps: [] as CrmSpineApplyStepResult[],
    created: 0,
    skipped: 0,
    failed: 0,
    blockedReason: null as string | null,
    audit: [] as CrmSpineApplyAuditEntry[],
  };

  if (req.mode === 'inspect') {
    const report = resolveReport(req);
    return {
      ...base, mode: 'inspect', outcome: 'inspect_completed', report,
      audit: [{ correlationId: req.correlationId, actor, action: 'schema-inspect', target: 'cr664_crm-spine', outcome: 'inspect_completed', error: null }],
    };
  }

  if (req.mode === 'plan') {
    const report = resolveReport(req);
    const plan = resolvePlan(req, report);
    return {
      ...base, mode: 'plan', outcome: 'plan_generated', report, plan,
      audit: [{ correlationId: req.correlationId, actor, action: 'schema-plan', target: 'cr664_crm-spine', outcome: 'plan_generated', error: null }],
    };
  }

  const report = resolveReport(req);
  const plan = resolvePlan(req, report);
  const applied = new Set(req.alreadyAppliedTargets ?? []);

  if (req.mode === 'dry-run-apply') {
    const steps: CrmSpineApplyStepResult[] = plan.steps.map((s) => ({
      order: s.order, kind: s.kind, operation: s.operation, table: s.table, target: s.target,
      outcome: applied.has(s.target) ? 'skipped-present' : 'dry-run-simulated', error: null,
    }));
    return {
      ...base, mode: 'dry-run-apply', outcome: 'dry_run_completed', report, plan, steps,
      skipped: steps.filter((s) => s.outcome === 'skipped-present').length,
      audit: [{ correlationId: req.correlationId, actor, action: 'schema-dry-run-apply', target: 'cr664_crm-spine', outcome: 'dry_run_completed', error: null }],
    };
  }

  // live-apply — gated + requires an injected executor.
  const gate = evaluateCrmSpineSchemaApplyGate({ ...req.gate, correlationId: req.gate?.correlationId ?? req.correlationId });
  if (!gate.satisfied || !req.executor) {
    const blockedReason = !gate.satisfied
      ? `Schema-apply gate not satisfied: ${gate.blockers.join('; ')}.`
      : 'No schema-apply executor is wired; live apply stays blocked.';
    return {
      ...base, mode: 'live-apply', outcome: 'blocked_gate_not_satisfied', report, plan,
      gateSatisfied: gate.satisfied, blockedReason,
      steps: plan.steps.map((s) => ({ order: s.order, kind: s.kind, operation: s.operation, table: s.table, target: s.target, outcome: 'blocked-gate-not-satisfied', error: null })),
      audit: [{ correlationId: req.correlationId, actor, action: 'schema-live-apply', target: 'cr664_crm-spine', outcome: 'blocked_gate_not_satisfied', error: blockedReason }],
    };
  }

  const executor = req.executor;
  const steps: CrmSpineApplyStepResult[] = [];
  const audit: CrmSpineApplyAuditEntry[] = [];
  let created = 0, skipped = 0, failed = 0, schemaMutated = false;

  for (const s of plan.steps) {
    if (applied.has(s.target)) {
      steps.push({ order: s.order, kind: s.kind, operation: s.operation, table: s.table, target: s.target, outcome: 'skipped-present', error: null });
      skipped += 1;
      continue;
    }
    const res = await runStep(executor, s);
    const outcome: CrmSpineStepOutcome = res.ok ? 'created' : 'failed';
    if (res.ok) { created += 1; schemaMutated = true; } else { failed += 1; }
    steps.push({ order: s.order, kind: s.kind, operation: s.operation, table: s.table, target: s.target, outcome, error: res.error ?? null });
    audit.push({ correlationId: req.correlationId, actor, action: 'schema-live-apply', target: `${s.table}:${s.target}`, outcome, error: res.error ?? null });
  }

  let outcome: CrmSpineApplyOutcome;
  if (plan.steps.length === 0 || (failed === 0 && created === 0)) {
    outcome = 'apply_completed';
  } else if (failed > 0 && created > 0) {
    outcome = 'partial_success';
  } else if (failed > 0 && created === 0) {
    outcome = 'failed_dataverse';
  } else {
    outcome = 'apply_completed';
  }

  return {
    ...base, mode: 'live-apply', outcome, report, plan, steps, created, skipped, failed,
    executed: true, schemaMutated, gateSatisfied: true, audit,
  };
}

export { inspectCrmSpineSchema, planCrmSpineSchema } from './crmSalesforceSpineSchemaAdapter';
export type { CrmLiveTableSnapshot, CrmSpineSchemaInspectionReport, CrmSpineSchemaPlan } from './crmSalesforceSpineSchemaAdapter';
