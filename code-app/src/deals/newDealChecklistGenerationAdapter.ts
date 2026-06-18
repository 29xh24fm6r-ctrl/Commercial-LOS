/**
 * Phase 176A / 188C -- Document checklist generation adapter (DISABLED by default).
 *
 * Generates expected document-checklist rows from an APPROVED template for a
 * deal, only when enabled. Disabled by default. Idempotent (no duplicate rows);
 * rows bind to the deal; NO borrower document request is sent here (no email /
 * SMS / Outlook / handoff import anywhere in this module). Distinguishes
 * "checklist generated" from "borrower requested".
 *
 * Phase 188C upgrades this from a pure row-writer into a runtime-capable,
 * AUDITED, fail-closed generator -- still gated OFF by default and still
 * SDK-free (every IO is injected; the live wiring lives in
 * `newDealChecklistGenerationLiveDeps.ts`). The audit reuses the shared
 * cr664_user actor resolver + `assertChangedByCoreUserBind` guard (binds
 * `/cr664_users(<CoreUser>)`, NEVER `/systemusers`), emits ONLY after every
 * intended row is created, and fails closed on partial/failed creates or a
 * failed audit -- never a fake success.
 */

import type { DocumentChecklistOutcome } from './dealOriginationOutcomes';
import {
  isDocumentChecklistEnabled,
  type DealOriginationFeatureFlagConfig,
} from './dealOriginationFeatureFlags';
import { newCorrelationId } from '../shared/governance/correlationId';
import {
  buildNewDealAuditPayload,
  summarizeAuditPayloadShape,
  AUDIT_OUTCOME_SUCCEEDED,
} from './dealOriginationAudit';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import type { ResolveActorChangedBy } from './newDealAuditActorResolver';

const MODULE = 'document-checklist';

/**
 * Allow-listed checklist row payload keys (internal generation only).
 *
 * Phase 188G: `cr664_correlationid` is NOT a column on cr664_documentchecklists
 * (the 188E live proof confirmed a POST of it is rejected), so it is excluded
 * from the row payload. The correlation id lives on the AUDIT event only.
 */
export const DOCUMENT_CHECKLIST_ALLOWED_FIELDS = Object.freeze([
  'cr664_documentname',
  'cr664_Deal@odata.bind',
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

// ---------------------------------------------------------------------------
// Phase 188C -- runtime-capable, AUDITED, fail-closed generator (disabled by
// default). Pure given its injected IO; the live wiring is in
// newDealChecklistGenerationLiveDeps.ts. NEVER imports a borrower-comms module.
// ---------------------------------------------------------------------------

/** The allow-listed checklist row create payload (Phase 188G: no correlationid). */
export interface ChecklistRowPayload {
  readonly cr664_documentname: string;
  readonly 'cr664_Deal@odata.bind': string;
}

/** Detail passed to the audit emitter once all intended rows are created. */
export interface ChecklistAuditEvent {
  readonly dealId: string;
  readonly createdNames: readonly string[];
  readonly skippedNames: readonly string[];
  readonly correlationId: string;
  /** Actor email -> resolved fail-closed to the cr664_ChangedBy cr664_user bind. */
  readonly actorEmail: string | undefined;
}

/** Injected IO for the audited generator. No IO touches a borrower. */
export interface AuditedChecklistDeps {
  /** Read existing checklist document names already on the deal (idempotency). */
  readonly listExistingChecklistRows: (
    dealId: string,
  ) => Promise<{ ok: boolean; names?: readonly string[]; error?: string }>;
  /** Create ONE cr664_documentchecklists row (allow-listed payload only). */
  readonly createChecklistRow: (
    payload: ChecklistRowPayload,
  ) => Promise<{ ok: boolean; id?: string; error?: string }>;
  /** Emit the success audit. Resolves the actor to /cr664_users + guards it. */
  readonly emitChecklistGenerationAudit: (
    event: ChecklistAuditEvent,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Correlation id factory (override for deterministic tests). */
  readonly correlationId?: () => string;
}

/** Inputs for the audited generator. */
export interface AuditedChecklistInput {
  readonly dealId: string | undefined;
  readonly authorized: boolean;
  readonly actorSystemUserId: string | undefined;
  /** Actor email used ONLY to resolve the audit cr664_ChangedBy cr664_user bind. */
  readonly actorEmail: string | undefined;
  /** Approved checklist template (document names). Absent -> skip. */
  readonly templateDocumentNames?: readonly string[];
  readonly config?: DealOriginationFeatureFlagConfig;
  /** Test-only gate override. Production never sets it (uses config). */
  readonly enabledOverride?: boolean;
}

/** Normalize a checklist name the same way 188B proved: trim + lower-case. */
function normalizeChecklistName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Runtime-capable, audited checklist generation. Disabled by default (gate +
 * optional test override). Reads existing rows (IO) for idempotency, creates the
 * allow-listed rows, then emits ONE audit ONLY after every intended row
 * succeeded. Fails closed on a read error, any create failure (partial or
 * total), or an audit failure -- never a fake success. Touches no borrower, no
 * stage/status/portfolio/CRM field, no cr664_documenttype.
 */
export async function generateAuditedDocumentChecklist(
  input: AuditedChecklistInput,
  deps: AuditedChecklistDeps,
): Promise<DocumentChecklistOutcome> {
  const enabled = input.enabledOverride ?? isDocumentChecklistEnabled(input.config);
  if (!enabled) {
    return { module: MODULE, kind: 'disabled', detail: 'Checklist generation gate is off.' };
  }
  if (!input.dealId) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No deal id.' };
  }
  if (!input.authorized || !input.actorSystemUserId) {
    return { module: MODULE, kind: 'unauthorized', detail: 'Actor not authorized.' };
  }

  // Approved template, de-duplicated case-insensitively (duplicate requested
  // names never create duplicate rows).
  const seen = new Set<string>();
  const uniqueTemplate = (input.templateDocumentNames ?? [])
    .filter((d) => d.trim().length > 0)
    .filter((d) => {
      const low = normalizeChecklistName(d);
      if (seen.has(low)) return false;
      seen.add(low);
      return true;
    });
  if (uniqueTemplate.length === 0) {
    return { module: MODULE, kind: 'skipped_no_template', detail: 'No approved checklist template.' };
  }

  // Read existing rows (IO). A read failure blocks -- NO creates, NO audit.
  const existingRes = await deps.listExistingChecklistRows(input.dealId);
  if (!existingRes.ok) {
    return { module: MODULE, kind: 'failed', detail: `Could not read existing checklist rows: ${existingRes.error ?? 'unknown'}. No rows created.` };
  }
  const existing = new Set((existingRes.names ?? []).map(normalizeChecklistName));

  const fresh = uniqueTemplate.filter((d) => !existing.has(normalizeChecklistName(d)));
  const skipped = uniqueTemplate
    .filter((d) => existing.has(normalizeChecklistName(d)))
    .map((d) => d.trim());
  if (fresh.length === 0) {
    return { module: MODULE, kind: 'skipped_duplicate_detected', detail: 'All checklist rows already exist.' };
  }

  const correlationId = (deps.correlationId ?? (() => newCorrelationId('dc')))();

  // Create rows. Allow-listed payload ONLY; the stored name is trimmed clean.
  // Fail closed on ANY failure (no audit).
  const created: string[] = [];
  for (const name of fresh) {
    const cleanName = name.trim();
    const payload: ChecklistRowPayload = {
      cr664_documentname: cleanName,
      'cr664_Deal@odata.bind': `/cr664_loandeals(${input.dealId})`,
    };
    const stray = Object.keys(payload).filter(
      (k) => !(DOCUMENT_CHECKLIST_ALLOWED_FIELDS as readonly string[]).includes(k),
    );
    if (stray.length > 0) {
      return { module: MODULE, kind: 'failed', detail: `Disallowed checklist field(s): ${stray.join(', ')}. No audit emitted.`, correlationId };
    }
    let res: { ok: boolean; id?: string; error?: string };
    try {
      res = await deps.createChecklistRow(payload);
    } catch (err) {
      res = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (!res.ok) {
      return created.length === 0
        ? { module: MODULE, kind: 'failed', detail: `Checklist row create failed: ${res.error ?? 'unknown'}. No rows persisted; no audit emitted.`, correlationId }
        : { module: MODULE, kind: 'partial_success', detail: `${created.length} created, then a create failed (${res.error ?? 'unknown'}). No audit emitted (not a clean success).`, correlationId };
    }
    created.push(cleanName);
  }

  // Every intended row created -> emit the success audit. Fail closed if the
  // actor cannot resolve to a cr664_user or the audit POST fails.
  const audit = await deps.emitChecklistGenerationAudit({
    dealId: input.dealId,
    createdNames: created,
    skippedNames: skipped,
    correlationId,
    actorEmail: input.actorEmail,
  });
  if (!audit.ok) {
    return { module: MODULE, kind: 'audit_failed_partial', detail: `${created.length} checklist row(s) created but the audit failed: ${audit.error ?? 'unknown'}. Not a clean success.`, correlationId };
  }
  return {
    module: MODULE,
    kind: 'success',
    detail: `${created.length} checklist row(s) created${skipped.length ? `, ${skipped.length} already present` : ''}.`,
    correlationId,
  };
}

/** Injected deps for the audit emitter factory (pure, SDK-free, testable). */
export interface ChecklistAuditEmitDeps {
  readonly resolveActorChangedBy: ResolveActorChangedBy;
  readonly createAudit: (
    payload: Record<string, unknown>,
  ) => Promise<{ success: boolean; error?: { message?: string } }>;
  readonly now?: () => string;
}

/**
 * Build the checklist-generation audit emitter. It resolves the actor email to a
 * `/cr664_users(<CoreUser>)` bind, HARD-asserts that bind via
 * `assertChangedByCoreUserBind` (throws on `/systemusers` or any non-cr664_users
 * target), builds the canonical audit payload (reusing the certified New Deal
 * builder + option-set values -- no second audit system), and POSTs it. Returns
 * a fail-closed reason when the actor can't resolve or the POST fails -- never a
 * fake success. SDK-free: all IO is injected.
 */
export function createChecklistGenerationAuditEmitter(
  deps: ChecklistAuditEmitDeps,
): (event: ChecklistAuditEvent) => Promise<{ ok: boolean; error?: string }> {
  return async (event) => {
    const resolution = await deps.resolveActorChangedBy(event.actorEmail);
    if (!resolution.ok || !resolution.changedByBind) {
      return {
        ok: false,
        error:
          'audit blocked: cr664_ChangedBy could not be resolved to a cr664_user -- ' +
          `${resolution.reason ?? 'no actor identity'}. No audit row written (fail-closed).`,
      };
    }
    // Hard backstop: never bind /systemusers (or any non-cr664_users target).
    assertChangedByCoreUserBind(resolution.changedByBind);

    const nowIso = (deps.now ?? (() => new Date().toISOString()))();
    const payload = buildNewDealAuditPayload(
      {
        eventName: 'Document Checklist Generated',
        dealId: event.dealId,
        changedByBind: resolution.changedByBind,
        correlationId: event.correlationId,
        outcome: AUDIT_OUTCOME_SUCCEEDED,
        sourceProcess: 'newDealChecklistGenerationAdapter/audited-generate',
        notes:
          `Document checklist generated for deal ${event.dealId}. ` +
          `Created: [${event.createdNames.join(', ')}]. ` +
          `Skipped existing: [${event.skippedNames.join(', ')}].`,
        fieldName: 'cr664_documentname',
        oldValue: '',
        newValue: event.createdNames.join(', '),
        beforeState: `${event.skippedNames.length} existing`,
        afterState: `${event.createdNames.length} created`,
      },
      nowIso,
    );
    const shape = summarizeAuditPayloadShape(payload);
    try {
      const result = await deps.createAudit(payload);
      if (!result.success) {
        return { ok: false, error: `${result.error?.message ?? 'AuditEvent create returned non-success.'} | ${shape}` };
      }
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `${msg} | ${shape}` };
    }
  };
}
