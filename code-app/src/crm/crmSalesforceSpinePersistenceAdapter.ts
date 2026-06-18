/**
 * Phase 193 — Salesforce CRM spine LIVE PERSISTENCE ADAPTER.
 *
 * Creates/updates CRM spine records once the schema exists. Pure orchestration
 * over an INJECTED guarded transport (`crmLiveDataverseTransport`) — it performs
 * no `fetch` and imports no SDK. Default behavior is dry-run/no-write.
 *
 * Discipline (pinned by tests):
 *   - Fabricates NO records. Only operator/authorized-source fields provided by
 *     the caller are persisted; missing required fields are REJECTED
 *     (`skipped_missing_required_data`), never defaulted/invented.
 *   - Live writes require the persistence gate to be satisfied AND a transport;
 *     otherwise every request is `blocked_gate_not_satisfied`.
 *   - Each request carries provenance (`sourceFacts`) and emits an audit payload.
 *   - No delete exists anywhere.
 *   - Outcomes are structured: created | updated | skipped_missing_required_data
 *     | blocked_gate_not_satisfied | failed_dataverse | partial_success | dry_run.
 */

import { crmTargetColumnsForTable } from './crmDataverseSchemaPlan';
import { crmEntitySetForLogicalName, type CrmDataverseTransport } from './crmLiveDataverseTransport';
import { evaluateCrmSpinePersistenceGate, type CrmSpineLiveGateConfig } from './crmSalesforceSpineLiveGates';
import {
  buildCrmSpineAuditPayload,
  type CrmSpineAuditPayload,
  type CrmSpineSourceFactRef,
} from './crmSalesforceSpineAudit';

/** The spine entities that map to an allow-listed Dataverse entity set today. */
export type CrmSpinePersistableEntity =
  | 'account'
  | 'contact'
  | 'accountContactRelationship'
  | 'relationshipRole'
  | 'activity';

const ENTITY_TABLE: Record<CrmSpinePersistableEntity, string> = {
  account: 'cr664_crmorganization',
  contact: 'cr664_crmperson',
  accountContactRelationship: 'cr664_crmrelationship',
  relationshipRole: 'cr664_crmroleassignment',
  activity: 'cr664_crmtimelineevent',
};

export type CrmSpineRecordOutcome =
  | 'created'
  | 'updated'
  | 'skipped_missing_required_data'
  | 'blocked_gate_not_satisfied'
  | 'failed_dataverse'
  | 'dry_run';

export type CrmSpinePersistMode = 'dry-run' | 'live';

export interface CrmSpineWriteRequest {
  entity: CrmSpinePersistableEntity;
  /** Present → update; absent → create. */
  recordId?: string;
  /** Operator/authorized-source field values. Never defaulted by the adapter. */
  fields: Record<string, unknown>;
  /** Provenance — required; an empty list rejects the write. */
  sourceFacts: CrmSpineSourceFactRef[];
}

export interface CrmSpineRecordResult {
  entity: CrmSpinePersistableEntity;
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
  | 'dry_run'
  | 'no_requests';

export interface CrmSpinePersistInput {
  mode: CrmSpinePersistMode;
  requests: readonly CrmSpineWriteRequest[];
  actor: string;
  correlationId: string;
  gate?: CrmSpineLiveGateConfig;
  /** Required for live mode; absent → blocked. */
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

/** Required-for-create columns for a spine table (from the schema plan). */
export function requiredFieldsFor(entity: CrmSpinePersistableEntity): string[] {
  return crmTargetColumnsForTable(ENTITY_TABLE[entity])
    .filter((c) => c.requiredForCreate)
    .map((c) => c.logicalName);
}

function missingRequired(req: CrmSpineWriteRequest): string[] {
  // Provenance is mandatory; treat its absence as a missing requirement.
  const missing: string[] = [];
  if (!req.sourceFacts || req.sourceFacts.length === 0) missing.push('sourceFacts');
  // On create, every required-for-create column must be present and non-empty.
  if (!req.recordId) {
    for (const f of requiredFieldsFor(req.entity)) {
      const v = req.fields[f];
      if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
        missing.push(f);
      }
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
  const action = req.recordId ? 'record-update' : 'record-create';
  return buildCrmSpineAuditPayload({
    correlationId: input.correlationId,
    actor: input.actor,
    targetEntity: ENTITY_TABLE[req.entity],
    targetRecordId: req.recordId ?? null,
    action: outcome === 'skipped_missing_required_data' ? 'record-skip' : action,
    outcome,
    dryRun: input.mode === 'dry-run',
    sourceFacts: req.sourceFacts ?? [],
    occurredAt: input.occurredAt ?? null,
    error,
  });
}

export async function persistCrmSpineRecords(
  input: CrmSpinePersistInput,
): Promise<CrmSpinePersistResult> {
  const results: CrmSpineRecordResult[] = [];
  const gate = evaluateCrmSpinePersistenceGate(input.gate);
  const liveAllowed = input.mode === 'live' && gate.satisfied && input.transport != null;

  for (const req of input.requests) {
    // Validate required data first — never invent defaults.
    const missing = missingRequired(req);
    if (missing.length > 0) {
      const error = `Missing required data: ${missing.join(', ')}.`;
      results.push({ entity: req.entity, recordId: req.recordId ?? null, outcome: 'skipped_missing_required_data', error, audit: audit(input, req, 'skipped_missing_required_data', error) });
      continue;
    }

    if (input.mode === 'dry-run') {
      results.push({ entity: req.entity, recordId: req.recordId ?? null, outcome: 'dry_run', error: null, audit: audit(input, req, 'dry_run', null) });
      continue;
    }

    // Live mode beyond this point.
    if (!liveAllowed) {
      const error = gate.satisfied ? 'No transport wired for live persistence.' : `Persistence gate not satisfied: ${gate.blockers.join('; ')}.`;
      results.push({ entity: req.entity, recordId: req.recordId ?? null, outcome: 'blocked_gate_not_satisfied', error, audit: audit(input, req, 'blocked_gate_not_satisfied', error) });
      continue;
    }

    const entitySet = crmEntitySetForLogicalName(ENTITY_TABLE[req.entity]);
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
  if (results.length === 0) {
    overallOutcome = 'no_requests';
  } else if (input.mode === 'dry-run') {
    overallOutcome = skipped > 0 && skipped === results.length ? 'skipped_missing_required_data' : 'dry_run';
  } else if (blocked === results.length) {
    overallOutcome = 'blocked_gate_not_satisfied';
  } else if (skipped === results.length) {
    overallOutcome = 'skipped_missing_required_data';
  } else if (succeeded > 0 && (failed > 0 || skipped > 0 || blocked > 0)) {
    overallOutcome = 'partial_success';
  } else if (failed > 0 && succeeded === 0) {
    overallOutcome = 'failed_dataverse';
  } else if (created > 0) {
    overallOutcome = 'created';
  } else {
    overallOutcome = 'updated';
  }

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
