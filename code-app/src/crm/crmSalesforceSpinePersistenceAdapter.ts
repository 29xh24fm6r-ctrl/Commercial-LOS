/**
 * Phase 193B — Salesforce CRM spine LIVE PERSISTENCE ADAPTER.
 *
 * Creates/updates CRM spine records once the schema exists. Pure orchestration
 * over an INJECTED guarded transport (`crmLiveDataverseTransport`) — it performs
 * no `fetch` and imports no SDK. Default behavior is dry-run/no-write.
 *
 * Discipline (pinned by tests):
 *   - Fabricates NO records. Only operator/authorized-source fields provided by
 *     the caller are persisted; missing required fields (incl. provenance
 *     `sourceFacts`) are REJECTED (`skipped_missing_required_data`), never
 *     defaulted/invented.
 *   - Live writes require the persistence gate satisfied AND a transport;
 *     otherwise every request is `blocked_gate_not_satisfied`.
 *   - Idempotent upsert where safe: a request with a `recordId` updates; one
 *     without creates.
 *   - Each write emits an audit payload with provenance. No delete exists.
 *   - Outcomes: created | updated | skipped_missing_required_data |
 *     blocked_gate_not_satisfied | failed_dataverse | partial_success | dry_run_only.
 */

import { crmTargetColumnsForTable } from './crmDataverseSchemaPlan';
import { crmEntitySetForLogicalName, type CrmDataverseTransport } from './crmLiveDataverseTransport';
import { evaluateCrmSpinePersistenceGate, type CrmSpineLiveGateConfig } from './crmSalesforceSpineLiveGates';
import {
  buildCrmSpineAuditPayload,
  type CrmSpineAuditPayload,
  type CrmSpineSourceFactRef,
} from './crmSalesforceSpineAudit';
import type { CrmSpineEntityKey } from './crmSalesforceSpineModel';

/** Spine entities that map to an allow-listed Dataverse table today. */
export const CRM_SPINE_ENTITY_TABLE: Partial<Record<CrmSpineEntityKey, string>> = {
  account: 'cr664_crmorganization',
  contact: 'cr664_crmperson',
  accountContactRelationship: 'cr664_crmrelationship',
  dealRelationship: 'cr664_crmrelationship',
  relationshipRole: 'cr664_crmroleassignment',
  coverageTeamMember: 'cr664_crmroleassignment',
  activity: 'cr664_crmtimelineevent',
  sourceFact: 'cr664_crmauditentry',
};

/** Entities that are derived/policy and never directly persisted this phase. */
export const CRM_SPINE_NON_PERSISTED: ReadonlyArray<CrmSpineEntityKey> = Object.freeze([
  'task',
  'relationshipHealth',
  'visibilityRequirement',
]);

export type CrmSpineRecordOutcome =
  | 'created'
  | 'updated'
  | 'skipped_missing_required_data'
  | 'blocked_gate_not_satisfied'
  | 'failed_dataverse'
  | 'dry_run_only';

export type CrmSpinePersistMode = 'dry-run' | 'live';

export interface CrmSpineWriteRequest {
  entity: CrmSpineEntityKey;
  /** Present → update; absent → create. */
  recordId?: string;
  fields: Record<string, unknown>;
  /** Provenance — required; an empty list rejects the write. */
  sourceFacts: CrmSpineSourceFactRef[];
}

export interface CrmSpineRecordResult {
  entity: CrmSpineEntityKey;
  recordId: string | null;
  outcome: CrmSpineRecordOutcome;
  error: string | null;
  audit: CrmSpineAuditPayload;
}

export type CrmSpinePersistOverallOutcome =
  | 'created'
  | 'updated'
  | 'partial_success'
  | 'skipped_missing_required_data'
  | 'blocked_gate_not_satisfied'
  | 'failed_dataverse'
  | 'dry_run_only'
  | 'no_requests';

export interface CrmSpinePersistInput {
  mode: CrmSpinePersistMode;
  requests: readonly CrmSpineWriteRequest[];
  actor: string;
  correlationId: string;
  gate?: CrmSpineLiveGateConfig;
  transport?: CrmDataverseTransport;
  occurredAt?: string | null;
}

export interface CrmSpinePersistResult {
  mode: CrmSpinePersistMode;
  executed: boolean;
  gateSatisfied: boolean;
  results: CrmSpineRecordResult[];
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  blocked: number;
  overallOutcome: CrmSpinePersistOverallOutcome;
  audit: CrmSpineAuditPayload[];
}

export function isPersistableEntity(entity: CrmSpineEntityKey): boolean {
  return CRM_SPINE_ENTITY_TABLE[entity] !== undefined;
}

export function requiredFieldsFor(entity: CrmSpineEntityKey): string[] {
  const table = CRM_SPINE_ENTITY_TABLE[entity];
  if (!table) return [];
  return crmTargetColumnsForTable(table)
    .filter((c) => c.requiredForCreate)
    .map((c) => c.logicalName);
}

function missingRequired(req: CrmSpineWriteRequest): string[] {
  const missing: string[] = [];
  if (!req.sourceFacts || req.sourceFacts.length === 0) missing.push('sourceFacts');
  if (!req.recordId) {
    for (const f of requiredFieldsFor(req.entity)) {
      const v = req.fields[f];
      if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) missing.push(f);
    }
  }
  return missing;
}

function audit(
  input: CrmSpinePersistInput,
  req: CrmSpineWriteRequest,
  outcome: CrmSpineRecordOutcome,
  error: string | null,
): CrmSpineAuditPayload {
  const table = CRM_SPINE_ENTITY_TABLE[req.entity] ?? req.entity;
  const action = outcome === 'skipped_missing_required_data' ? 'record-skip' : req.recordId ? 'record-update' : 'record-create';
  return buildCrmSpineAuditPayload({
    correlationId: input.correlationId,
    actor: input.actor,
    targetEntity: table,
    targetRecordId: req.recordId ?? null,
    action,
    outcome,
    dryRun: input.mode === 'dry-run',
    sourceFacts: req.sourceFacts ?? [],
    occurredAt: input.occurredAt ?? null,
    error,
  });
}

export async function persistCrmSpineRecords(input: CrmSpinePersistInput): Promise<CrmSpinePersistResult> {
  const results: CrmSpineRecordResult[] = [];
  const gate = evaluateCrmSpinePersistenceGate({ ...input.gate, correlationId: input.gate?.correlationId ?? input.correlationId });
  const liveAllowed = input.mode === 'live' && gate.satisfied && input.transport != null;

  for (const req of input.requests) {
    // Non-persistable entities (derived/policy) are honestly skipped.
    if (!isPersistableEntity(req.entity)) {
      const error = `Entity "${req.entity}" is derived/policy and is not directly persisted.`;
      results.push({ entity: req.entity, recordId: req.recordId ?? null, outcome: 'skipped_missing_required_data', error, audit: audit(input, req, 'skipped_missing_required_data', error) });
      continue;
    }

    const missing = missingRequired(req);
    if (missing.length > 0) {
      const error = `Missing required data: ${missing.join(', ')}.`;
      results.push({ entity: req.entity, recordId: req.recordId ?? null, outcome: 'skipped_missing_required_data', error, audit: audit(input, req, 'skipped_missing_required_data', error) });
      continue;
    }

    if (input.mode === 'dry-run') {
      results.push({ entity: req.entity, recordId: req.recordId ?? null, outcome: 'dry_run_only', error: null, audit: audit(input, req, 'dry_run_only', null) });
      continue;
    }

    if (!liveAllowed) {
      const error = gate.satisfied ? 'No transport wired for live persistence.' : `Persistence gate not satisfied: ${gate.blockers.join('; ')}.`;
      results.push({ entity: req.entity, recordId: req.recordId ?? null, outcome: 'blocked_gate_not_satisfied', error, audit: audit(input, req, 'blocked_gate_not_satisfied', error) });
      continue;
    }

    const entitySet = crmEntitySetForLogicalName(CRM_SPINE_ENTITY_TABLE[req.entity]!);
    if (!entitySet) {
      const error = `No allow-listed entity set for ${req.entity}.`;
      results.push({ entity: req.entity, recordId: req.recordId ?? null, outcome: 'failed_dataverse', error, audit: audit(input, req, 'failed_dataverse', error) });
      continue;
    }

    const transport = input.transport!;
    const res = req.recordId
      ? await transport.updateRecord(entitySet, req.recordId, req.fields)
      : await transport.createRecord(entitySet, req.fields);

    if (res.ok) {
      const outcome: CrmSpineRecordOutcome = req.recordId ? 'updated' : 'created';
      results.push({ entity: req.entity, recordId: res.id ?? req.recordId ?? null, outcome, error: null, audit: audit(input, req, outcome, null) });
    } else {
      const error = res.error ?? 'dataverse_error';
      results.push({ entity: req.entity, recordId: req.recordId ?? null, outcome: 'failed_dataverse', error, audit: audit(input, req, 'failed_dataverse', error) });
    }
  }

  const created = results.filter((r) => r.outcome === 'created').length;
  const updated = results.filter((r) => r.outcome === 'updated').length;
  const skipped = results.filter((r) => r.outcome === 'skipped_missing_required_data').length;
  const failed = results.filter((r) => r.outcome === 'failed_dataverse').length;
  const blocked = results.filter((r) => r.outcome === 'blocked_gate_not_satisfied').length;
  const succeeded = created + updated;

  let overallOutcome: CrmSpinePersistOverallOutcome;
  if (results.length === 0) overallOutcome = 'no_requests';
  else if (input.mode === 'dry-run') overallOutcome = skipped === results.length ? 'skipped_missing_required_data' : 'dry_run_only';
  else if (blocked === results.length) overallOutcome = 'blocked_gate_not_satisfied';
  else if (skipped === results.length) overallOutcome = 'skipped_missing_required_data';
  else if (succeeded > 0 && (failed > 0 || skipped > 0 || blocked > 0)) overallOutcome = 'partial_success';
  else if (failed > 0 && succeeded === 0) overallOutcome = 'failed_dataverse';
  else if (created > 0) overallOutcome = 'created';
  else overallOutcome = 'updated';

  return {
    mode: input.mode,
    executed: liveAllowed && results.some((r) => r.outcome === 'created' || r.outcome === 'updated' || r.outcome === 'failed_dataverse'),
    gateSatisfied: gate.satisfied,
    results,
    created,
    updated,
    skipped,
    failed,
    blocked,
    overallOutcome,
    audit: results.map((r) => r.audit),
  };
}
