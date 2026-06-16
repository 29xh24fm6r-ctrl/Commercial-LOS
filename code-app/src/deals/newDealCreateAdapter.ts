/**
 * Phase 170M -- Governed in-app New Deal create adapter (DISABLED by default).
 *
 * Proof chain:
 *   - Phase 170K proved the minimal cr664_loandeal create payload works with
 *     resolved Stage/Status @odata.bind values (operator smoke).
 *   - Phase 170L brought the Banker read models to formatted-value parity so a
 *     created deal displays its Stage/Status correctly.
 *
 * This module is the production-grade governed create path -- typed outcome
 * union, allow-listed payload, fail-closed resolver dependency, and an audited
 * create that follows the SAME coordination pattern as the existing governed
 * writes (dealTaskActions / documentActions: create -> emit cr664_AuditEvent).
 *
 * It is OFF by default. `createGovernedNewDeal` refuses with `disabled` unless
 * its injected `enabled` gate is true. The app's default deps wire that gate to
 * NEW_DEAL_CREATE_ADAPTER_ENABLED (hard `false` this phase), and NO UI button
 * calls this adapter. + New Deal stays disabled; new-deal-create stays in
 * NOT_WIRED. The adapter never hardcodes a Stage/Status GUID -- the binds come
 * from the fail-closed resolver's verified active rows.
 */

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';
import {
  AUDIT_OUTCOME_SUCCEEDED,
  AUDIT_OUTCOME_FAILED,
} from '../shared/governance/auditEnums';
import { resolveConfiguredNewDealReferences } from './newDealReferenceReader';
import type { NewDealReferenceResolution } from './newDealReferenceResolver';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from './newDealCreateFeatureFlags';
import {
  buildNewDealAuditPayload,
  summarizeAuditPayloadShape,
} from './dealOriginationAudit';

/**
 * The ONLY keys allowed in the cr664_loandeals create body. The adapter
 * asserts the built payload's keys are a subset of this list and fails closed
 * otherwise -- no stray / guessed column can ever be written. ownerid /
 * statecode are deliberately absent: Dataverse defaults owner to the calling
 * user and state to Active on create.
 */
export const NEW_DEAL_CREATE_ALLOWED_FIELDS = Object.freeze([
  'cr664_dealname',
  'cr664_StageReference@odata.bind',
  'cr664_StatusReference@odata.bind',
  'cr664_AssignedBanker@odata.bind',
  'cr664_stageentrydate',
  'cr664_amount',
  'cr664_Client@odata.bind',
] as const);

/** Inputs for a governed New Deal create. */
export interface GovernedNewDealCreateInput {
  /** Deal primary name. Required, non-blank. */
  readonly dealName: string;
  /** cr664_bankers id for the cr664_AssignedBanker bind. Required. */
  readonly assignedBankerId: string;
  /** Authorized actor's Dataverse systemuserid (audit cr664_ChangedBy /
   *  ownerid). Its presence is the authorization proof -- an unauthenticated
   *  / unprovisioned caller has none and the adapter fails closed. */
  readonly actorSystemUserId: string;
  /** Optional loan amount. Included only when a finite, non-negative number. */
  readonly amount?: number;
  /** Optional EXISTING client relationship id for cr664_Client. Included only
   *  when provided. The adapter NEVER creates a client/borrower row. */
  readonly existingClientId?: string;
}

/** The allow-listed create payload (display/audit shape; values resolved). */
export interface NewDealCreatePayload {
  cr664_dealname: string;
  'cr664_StageReference@odata.bind': string;
  'cr664_StatusReference@odata.bind': string;
  'cr664_AssignedBanker@odata.bind': string;
  cr664_stageentrydate: string;
  cr664_amount?: number;
  'cr664_Client@odata.bind'?: string;
}

export type NewDealCreateOutcome =
  | { kind: 'success'; dealId: string; correlationId: string }
  | { kind: 'disabled'; reason: string }
  | { kind: 'validation_error'; field: string; message: string }
  | { kind: 'unauthorized'; reason: string }
  | {
      kind: 'resolver_not_ready';
      resolution: NewDealReferenceResolution['kind'];
      detail: string;
    }
  | { kind: 'create_failed'; error: string }
  | {
      kind: 'audit_failed_partial';
      dealId: string;
      correlationId: string;
      auditError: string;
    };

/** Result of the injected deal-create IO. */
export type CreateLoanDealResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Result of the injected audit-emit IO. */
export interface EmitAuditResult {
  ok: boolean;
  error?: string;
}

export interface EmitNewDealAuditInput {
  readonly input: GovernedNewDealCreateInput;
  readonly dealId: string;
  readonly correlationId: string;
  readonly outcome: number;
  readonly failureReason: string | undefined;
}

/**
 * Injected dependencies. Tests pass mocks so NO live Dataverse write ever
 * happens and no deal is created. The app's default deps
 * (`buildLiveNewDealCreateDeps`) wire the live services but keep `enabled`
 * off, so the adapter refuses before any IO.
 */
export interface GovernedNewDealCreateDeps {
  /** The disabled-by-default gate. Default deps set this to the hard-false
   *  NEW_DEAL_CREATE_ADAPTER_ENABLED constant. */
  readonly enabled: boolean;
  /** Resolve Stage/Status by code/name (fail-closed). Never returns a GUID. */
  readonly resolveReferences: () => Promise<NewDealReferenceResolution>;
  /** Create the cr664_loandeal. Only ever called after the enabled gate,
   *  validation, authorization, and a Ready resolver. */
  readonly createLoanDeal: (
    payload: NewDealCreatePayload,
  ) => Promise<CreateLoanDealResult>;
  /** Emit the governed cr664_AuditEvent for the create. */
  readonly emitAuditEvent: (opts: EmitNewDealAuditInput) => Promise<EmitAuditResult>;
  /** Correlation id factory (override for deterministic tests). */
  readonly correlationId?: () => string;
  /** ISO timestamp factory for cr664_stageentrydate (override in tests). */
  readonly now?: () => string;
}

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function resolverDetail(r: NewDealReferenceResolution): string {
  switch (r.kind) {
    case 'notConfigured':
      return r.reason;
    case 'serviceError':
      return r.message;
    case 'duplicateStage':
    case 'duplicateStatus':
      return `${r.kind} (count ${r.count})`;
    default:
      return r.kind;
  }
}

/**
 * Governed New Deal create. Pure given its injected deps -- the only IO is
 * `createLoanDeal` / `emitAuditEvent`, both gated behind the `enabled` flag,
 * non-blank validation, authorization, and a Ready resolver. Returns a typed
 * outcome for every branch; never throws for an expected failure.
 */
export async function createGovernedNewDeal(
  input: GovernedNewDealCreateInput,
  deps: GovernedNewDealCreateDeps,
): Promise<NewDealCreateOutcome> {
  // 1. Disabled by default -- refuse before any work or IO.
  if (!deps.enabled) {
    return {
      kind: 'disabled',
      reason:
        'The governed New Deal create adapter is disabled (NEW_DEAL_CREATE_ADAPTER_ENABLED=false). ' +
        '+ New Deal stays disabled until production references are approved and audit is certified.',
    };
  }

  // 2. Validate deal name.
  const dealName = (input.dealName ?? '').trim();
  if (dealName.length === 0) {
    return { kind: 'validation_error', field: 'dealName', message: 'Deal name must not be blank.' };
  }

  // 3. Authorization: a resolved actor systemuser is required (the caller must
  //    have established banker/admin write entitlement upstream).
  const actorSystemUserId = (input.actorSystemUserId ?? '').trim();
  if (actorSystemUserId.length === 0) {
    return {
      kind: 'unauthorized',
      reason:
        'No authorized actor (Dataverse systemuser) was provided. A banker/admin write-entitled identity is required.',
    };
  }

  // Required deal-banker bind target.
  const assignedBankerId = (input.assignedBankerId ?? '').trim();
  if (assignedBankerId.length === 0) {
    return {
      kind: 'validation_error',
      field: 'assignedBanker',
      message: 'Assigned banker id must not be blank.',
    };
  }

  // 4. Optional amount must be a finite, non-negative number when present.
  if (input.amount !== undefined && !isFiniteNonNegative(input.amount)) {
    return {
      kind: 'validation_error',
      field: 'amount',
      message: 'Amount must be a finite, non-negative number when provided.',
    };
  }

  // 5. Fail closed unless the Stage/Status resolver is Ready.
  const resolution = await deps.resolveReferences();
  if (resolution.kind !== 'ready') {
    return {
      kind: 'resolver_not_ready',
      resolution: resolution.kind,
      detail: resolverDetail(resolution),
    };
  }

  const now = (deps.now ?? (() => new Date().toISOString()))();
  const correlationId = (deps.correlationId ?? (() => newCorrelationId('nd')))();

  // 6. Build the allow-listed payload. Binds come from the resolver (verified
  //    active rows) -- never a hardcoded GUID.
  const payload: NewDealCreatePayload = {
    cr664_dealname: dealName,
    'cr664_StageReference@odata.bind': resolution.stageBind,
    'cr664_StatusReference@odata.bind': resolution.statusBind,
    'cr664_AssignedBanker@odata.bind': `/cr664_bankers(${assignedBankerId})`,
    cr664_stageentrydate: now,
  };
  if (input.amount !== undefined) payload.cr664_amount = input.amount;
  if (input.existingClientId && input.existingClientId.trim().length > 0) {
    payload['cr664_Client@odata.bind'] = `/cr664_clientrelationships(${input.existingClientId.trim()})`;
  }

  // Defense in depth: never write a key outside the allow-list.
  const allowed = new Set<string>(NEW_DEAL_CREATE_ALLOWED_FIELDS);
  const stray = Object.keys(payload).filter((k) => !allowed.has(k));
  if (stray.length > 0) {
    return {
      kind: 'validation_error',
      field: 'payload',
      message: `Refusing to create -- payload contains disallowed field(s): ${stray.join(', ')}.`,
    };
  }

  // 7. Create the deal.
  const created = await deps.createLoanDeal(payload);
  if (!created.ok) {
    // Best-effort Failed audit; never throws / blocks the outcome.
    await deps
      .emitAuditEvent({
        input,
        dealId: 'unknown',
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: created.error,
      })
      .catch(() => undefined);
    return { kind: 'create_failed', error: created.error };
  }

  // 8. Emit the success audit. A created deal with a failed audit is
  //    audit_failed_partial -- CRITICAL: the deal IS created; only the audit
  //    row must be reattempted (left to admin).
  const audit = await deps.emitAuditEvent({
    input,
    dealId: created.id,
    correlationId,
    outcome: AUDIT_OUTCOME_SUCCEEDED,
    failureReason: undefined,
  });
  if (!audit.ok) {
    return {
      kind: 'audit_failed_partial',
      dealId: created.id,
      correlationId,
      auditError: audit.error ?? 'Audit event create returned non-success.',
    };
  }

  return { kind: 'success', dealId: created.id, correlationId };
}

// ---------------------------------------------------------------------------
// Live default dependencies (wired but DISABLED by default).
// ---------------------------------------------------------------------------

async function liveCreateLoanDeal(
  payload: NewDealCreatePayload,
): Promise<CreateLoanDealResult> {
  try {
    const result = await Cr664_loandealsService.create(
      payload as unknown as Parameters<typeof Cr664_loandealsService.create>[0],
    );
    if (!result.success || !result.data?.cr664_loandealid) {
      return { ok: false, error: result.error?.message ?? 'LoanDeal create returned non-success.' };
    }
    return { ok: true, id: result.data.cr664_loandealid };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function liveEmitNewDealAuditEvent(
  opts: EmitNewDealAuditInput,
): Promise<EmitAuditResult> {
  const nowIso = new Date().toISOString();
  // THE single canonical builder. The ONLY user bind it emits is
  // cr664_ChangedBy -> /systemusers(<actor>); it never emits cr664_ActorUser /
  // cr664_user / ownerid / statecode.
  const payload = buildNewDealAuditPayload(
    {
      eventName: 'New Deal Created',
      dealId: opts.dealId,
      actorSystemUserId: opts.input.actorSystemUserId,
      correlationId: opts.correlationId,
      outcome: opts.outcome,
      sourceProcess: 'NewDealCreateAdapter/governed-create',
      notes: `Governed New Deal create for "${opts.input.dealName}".`,
      failureReason: opts.failureReason,
      fieldName: 'cr664_dealname',
      oldValue: '',
      newValue: opts.input.dealName,
      beforeState: 'No deal',
      afterState: 'Deal created',
    },
    nowIso,
  );
  // Sanitized payload-shape diagnostic (key names + bind target entity sets;
  // no ids/secrets) so any failure is conclusively traceable in the UI.
  const shape = summarizeAuditPayloadShape(payload);
  try {
    const result = await Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!result.success) {
      return {
        ok: false,
        error: `${result.error?.message ?? 'AuditEvent create returned non-success.'} | ${shape}`,
      };
    }
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `${msg} | ${shape}` };
  }
}

/**
 * App-default deps: live services, resolver over the live reader, and the
 * `enabled` gate wired to the hard-false NEW_DEAL_CREATE_ADAPTER_ENABLED
 * constant. With these deps `createGovernedNewDeal` always returns `disabled`
 * in this phase -- the live IO is never reached.
 */
export function buildLiveNewDealCreateDeps(): GovernedNewDealCreateDeps {
  return {
    enabled: NEW_DEAL_CREATE_ADAPTER_ENABLED,
    resolveReferences: () => resolveConfiguredNewDealReferences(),
    createLoanDeal: liveCreateLoanDeal,
    emitAuditEvent: liveEmitNewDealAuditEvent,
  };
}
