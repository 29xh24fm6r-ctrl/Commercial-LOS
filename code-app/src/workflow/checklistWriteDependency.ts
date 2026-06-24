import type {
  WorkflowGenerationOutcome,
  WorkflowChecklistGenerationDeps,
} from './workflowGenerationActions';
import { DOCUMENT_CHECKLIST_GENERATION_ENABLED } from '../deals/dealOriginationFeatureFlags';

/**
 * Phase 237E — governed document-checklist write dependency.
 *
 * Implements the `WorkflowChecklistGenerationDeps.createMissingRows` seam that the
 * checklist action delegates to (the action already enforces authorization +
 * duplicate detection). This adapter is the certified live-safe WRITE path:
 *
 *   - DEFAULT-OFF (DOCUMENT_CHECKLIST_GENERATION_ENABLED) and fail-closed.
 *   - ALLOW-LISTED payload only: cr664_documentname + cr664_Deal@odata.bind. No
 *     other checklist column, no document-type, no cross-domain field.
 *   - Writes through an INJECTED transport (no direct SDK in the static graph), so
 *     it is fully unit-testable and performs no real write until an operator wires
 *     the live transport AND enables the gate.
 *   - Audits every row. A transport failure surfaces as `failed` (never a fake
 *     success), and the partial set already written is reported honestly.
 */

export interface ChecklistRow {
  /** Allow-listed: the checklist document name (cr664_documentname). */
  readonly documentName: string;
  /** Allow-listed: the parent deal lookup bind (cr664_Deal@odata.bind). */
  readonly dealBind: string;
}

export interface ChecklistRowTransport {
  createChecklistRow(row: ChecklistRow): Promise<{ ok: boolean; id?: string; error?: string }>;
}

export interface ChecklistWriteAuditSink {
  write(audit: {
    correlationId: string;
    dealId: string;
    documentName: string;
    outcome: 'created' | 'failed';
    error: string | null;
  }): Promise<{ ok: boolean; error?: string }>;
}

export interface ChecklistWriteDependencyConfig {
  /** Defaults to DOCUMENT_CHECKLIST_GENERATION_ENABLED (false). */
  readonly enabled?: boolean;
  readonly authorized: boolean;
  readonly dealId: string;
  readonly correlationId: string;
  readonly transport?: ChecklistRowTransport;
  readonly auditSink?: ChecklistWriteAuditSink;
}

/** The Dataverse entity-set the deal-lookup bind targets. Internal lending workflow. */
const DEAL_ENTITY_SET = 'cr664_loandeals';

export function createChecklistWriteDependency(
  config: ChecklistWriteDependencyConfig,
): WorkflowChecklistGenerationDeps {
  return {
    async createMissingRows(names: readonly string[]): Promise<WorkflowGenerationOutcome> {
      const enabled = config.enabled ?? Boolean(DOCUMENT_CHECKLIST_GENERATION_ENABLED);
      if (!enabled) {
        return { kind: 'dependency_not_ready', detail: 'DOCUMENT_CHECKLIST_GENERATION_ENABLED is false; generation stays fail-closed.' };
      }
      if (config.authorized !== true) {
        return { kind: 'unauthorized', detail: 'Actor is not authorized to write checklist rows.' };
      }
      if (!config.transport || !config.auditSink) {
        return { kind: 'dependency_not_ready', detail: 'No live checklist transport/audit sink is injected.' };
      }
      if (!config.dealId || !config.correlationId) {
        return { kind: 'failed', detail: 'Missing dealId or correlationId.' };
      }

      const valid = names.map((n) => n.trim()).filter((n) => n.length > 0);
      if (valid.length === 0) {
        return { kind: 'failed', detail: 'No valid checklist document names to create.' };
      }

      const dealBind = `/${DEAL_ENTITY_SET}(${config.dealId})`;
      let created = 0;
      for (const documentName of valid) {
        const res = await config.transport.createChecklistRow({ documentName, dealBind });
        if (!res.ok) {
          await config.auditSink.write({
            correlationId: config.correlationId,
            dealId: config.dealId,
            documentName,
            outcome: 'failed',
            error: res.error ?? 'checklist_row_create_failed',
          });
          // Fail closed: surface the failure, report what was written, never fake success.
          return {
            kind: 'failed',
            detail: `Checklist row "${documentName}" failed (${res.error ?? 'unknown'}); ${created} of ${valid.length} created before stop.`,
          };
        }
        await config.auditSink.write({
          correlationId: config.correlationId,
          dealId: config.dealId,
          documentName,
          outcome: 'created',
          error: null,
        });
        created += 1;
      }

      return { kind: 'success', detail: `Created ${created} checklist row(s).` };
    },
  };
}
