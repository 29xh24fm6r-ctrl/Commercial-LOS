/**
 * Phase 176A -- Document checklist generation adapter (DISABLED by default).
 *
 * Generates expected document-checklist rows from an APPROVED template for a
 * new deal, only when enabled. Disabled by default; no document service is
 * imported (IO injected). Idempotent (no duplicate rows); rows bind to the
 * created deal; NO borrower document request is sent here. Distinguishes
 * "checklist generated" from "borrower requested".
 */

import type { DocumentChecklistOutcome } from './dealOriginationOutcomes';
import {
  isDocumentChecklistEnabled,
  type DealOriginationFeatureFlagConfig,
} from './dealOriginationFeatureFlags';

const MODULE = 'document-checklist';

/** Allow-listed checklist row payload keys (internal generation only). */
export const DOCUMENT_CHECKLIST_ALLOWED_FIELDS = Object.freeze([
  'cr664_documentname',
  'cr664_Deal@odata.bind',
  'cr664_correlationid',
] as const);

export interface DocumentChecklistInput {
  readonly dealId: string | undefined;
  readonly actorSystemUserId: string | undefined;
  readonly authorized: boolean;
  readonly correlationId: string;
  readonly config?: DealOriginationFeatureFlagConfig;
  /** Approved checklist template (document names). Absent -> skip. */
  readonly templateDocumentNames?: readonly string[];
  /** Existing checklist document names (for idempotency). */
  readonly existingDocumentNames?: readonly string[];
  /** Test-only gate override. Production never sets it (uses config). */
  readonly enabledOverride?: boolean;
}

export type RunCreateChecklistRow = (
  payload: Record<string, unknown>,
) => Promise<{ ok: boolean; error?: string }>;

export async function runNewDealChecklistGeneration(
  input: DocumentChecklistInput,
  runCreateChecklistRow?: RunCreateChecklistRow,
): Promise<DocumentChecklistOutcome> {
  const enabled = input.enabledOverride ?? isDocumentChecklistEnabled(input.config);
  if (!enabled) {
    return { module: MODULE, kind: 'disabled', detail: 'Checklist generation gate is off.' };
  }
  if (!input.dealId) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No created deal id.' };
  }
  if (!input.authorized || !input.actorSystemUserId) {
    return { module: MODULE, kind: 'unauthorized', detail: 'Actor not authorized.' };
  }
  const template = (input.templateDocumentNames ?? []).filter((d) => d.trim().length > 0);
  if (template.length === 0) {
    return { module: MODULE, kind: 'skipped_no_template', detail: 'No approved checklist template.' };
  }
  const existing = new Set((input.existingDocumentNames ?? []).map((d) => d.trim().toLowerCase()));
  const fresh = template.filter((d) => !existing.has(d.trim().toLowerCase()));
  if (fresh.length === 0) {
    return { module: MODULE, kind: 'skipped_duplicate_detected', detail: 'All checklist rows already exist.' };
  }
  if (!runCreateChecklistRow) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No document transport injected.' };
  }
  let created = 0;
  let failed = 0;
  for (const name of fresh) {
    const payload = {
      cr664_documentname: name,
      'cr664_Deal@odata.bind': `/cr664_loandeals(${input.dealId})`,
      cr664_correlationid: input.correlationId,
    };
    const stray = Object.keys(payload).filter(
      (k) => !(DOCUMENT_CHECKLIST_ALLOWED_FIELDS as readonly string[]).includes(k),
    );
    if (stray.length > 0) {
      return { module: MODULE, kind: 'failed', detail: `Disallowed checklist field(s): ${stray.join(', ')}.` };
    }
    try {
      const res = await runCreateChecklistRow(payload);
      if (res.ok) created += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  if (created === 0) return { module: MODULE, kind: 'failed', detail: 'No checklist rows created.' };
  if (failed > 0) {
    return { module: MODULE, kind: 'partial_success', detail: `${created} created, ${failed} failed.`, correlationId: input.correlationId };
  }
  return { module: MODULE, kind: 'success', detail: `${created} checklist row(s) created.`, correlationId: input.correlationId };
}
