/**
 * Phase 259 — governed "Add Existing Loan" (manual existing-portfolio-loan boarding).
 *
 * Boards a loan that already exists in the bank's portfolio (NOT originated
 * through the LOS) into the full portfolio boarding schema: the root
 * cr664_portfolioboardedloan plus any related child records the operator
 * entered (additional borrowers, collateral, guarantors, covenants, ticklers,
 * insurance, documents, exceptions, reviews, examiner notes). Marks the record
 * boardingsource = "Manual Existing Loan Entry". Does NOT require an originated
 * cr664_loandeal link; an optional originated-deal link is supported.
 *
 * Same governed discipline as every other write in this app: fail-closed
 * authorization + identity, required-field validation, duplicate-loan-number
 * guard, root create, readback verification, a domain audit entry (operator +
 * timestamp + correlation id + source), and best-effort child creates whose
 * failures are surfaced honestly (the loan is boarded; partial child failures
 * are reported, never hidden).
 *
 * Pure over injected dependencies (SDK-free static graph); a live factory wires
 * the generated services via dynamic import.
 */

import { newCorrelationId } from '../shared/governance/correlationId';
import {
  EXTENDED_LOAN_ATTRIBUTES_PERSISTENCE_ENABLED,
  EXTENDED_LOAN_ATTRIBUTES_COLUMN,
  buildExtendedLoanAttributes,
  serializeExtendedLoanAttributes,
} from './extendedLoanAttributes';

/** The boardingsource marker for a manually-entered existing portfolio loan. */
export const MANUAL_EXISTING_LOAN_BOARDING_SOURCE = 'Manual Existing Loan Entry';

/** Child collections supported by the manual-entry form. */
export type ExistingLoanChildKey =
  | 'borrowers'
  | 'collateral'
  | 'guarantors'
  | 'covenants'
  | 'ticklers'
  | 'insurance'
  | 'documents'
  | 'exceptions'
  | 'reviews'
  | 'examinerNotes';

export const EXISTING_LOAN_CHILD_KEYS: readonly ExistingLoanChildKey[] = Object.freeze([
  'borrowers',
  'collateral',
  'guarantors',
  'covenants',
  'ticklers',
  'insurance',
  'documents',
  'exceptions',
  'reviews',
  'examinerNotes',
]);

/** Child entity-set logical names (for the @odata path), keyed by collection. */
export const EXISTING_LOAN_CHILD_ENTITY_SETS: Readonly<Record<ExistingLoanChildKey, string>> = Object.freeze({
  borrowers: 'cr664_portfolioboardedloanborrowers',
  collateral: 'cr664_portfolioboardedloancollaterals',
  guarantors: 'cr664_portfolioboardedloanguarantors',
  covenants: 'cr664_portfolioboardedloancovenants',
  ticklers: 'cr664_portfolioboardedloanticklers',
  insurance: 'cr664_portfolioboardedloaninsurances',
  documents: 'cr664_portfolioboardedloandocuments',
  exceptions: 'cr664_portfolioboardedloanexceptions',
  reviews: 'cr664_portfolioboardedloanreviews',
  examinerNotes: 'cr664_portfolioboardedloanexaminernotes',
});

export const PORTFOLIO_BOARDED_LOAN_ENTITY_SET = 'cr664_portfolioboardedloans';
export const PORTFOLIO_BOARDED_LOAN_ROOT_BIND = 'cr664_PortfolioBoardedLoan@odata.bind';

/** A single child row the operator entered (a named related record). */
export interface ExistingLoanChildInput {
  /** The related record's name/label (cr664_name). */
  readonly name: string;
}

export interface ExistingLoanInput {
  // --- required ---
  readonly loanNumber: string;
  readonly borrowerLegalName: string;

  // --- optional loan-level fields ---
  readonly borrowerDba?: string;
  readonly relationshipName?: string;
  readonly loanStatus?: string;
  readonly legacySystemId?: string;
  readonly coreSystemLoanId?: string;
  readonly originalCommitmentAmount?: number;
  readonly currentOutstandingPrincipal?: number;
  readonly availableBalance?: number;
  readonly interestRateType?: string;
  /** Phase 262 — variable-rate pricing (these columns exist on the entity). */
  readonly index?: string;
  readonly spread?: number;
  readonly floor?: number;
  readonly ceiling?: number;
  readonly paymentFrequency?: string;
  readonly amortizationMonths?: number;
  readonly termMonths?: number;
  readonly bookingDate?: string;
  readonly maturityDate?: string;
  readonly currentRiskRating?: string;
  readonly nextReviewDate?: string;
  readonly watchlistFlag?: boolean;
  readonly accrualStatus?: string;
  readonly pastDueDays?: number;
  // --- Phase 2 extended attributes (round-trip via cr664_extendedloanattributes when enabled) ---
  readonly product?: string;
  readonly loanOfficer?: string;
  readonly branch?: string;
  readonly purpose?: string;
  readonly currentNoteRate?: number;
  readonly firstResetDate?: string;
  readonly firstResetPaymentNumber?: number;
  readonly resetFrequency?: string;
  readonly nextRateChangeDate?: string;
  readonly payment61Reset?: boolean;
  /** Optional originated-deal link; the manual path works WITHOUT it. */
  readonly originatedDealId?: string;

  // --- child collections (optional) ---
  readonly borrowers?: readonly ExistingLoanChildInput[];
  readonly collateral?: readonly ExistingLoanChildInput[];
  readonly guarantors?: readonly ExistingLoanChildInput[];
  readonly covenants?: readonly ExistingLoanChildInput[];
  readonly ticklers?: readonly ExistingLoanChildInput[];
  readonly insurance?: readonly ExistingLoanChildInput[];
  readonly documents?: readonly ExistingLoanChildInput[];
  readonly exceptions?: readonly ExistingLoanChildInput[];
  readonly reviews?: readonly ExistingLoanChildInput[];
  readonly examinerNotes?: readonly ExistingLoanChildInput[];

  // --- governance ---
  readonly actorEmail?: string;
  readonly actorSystemUserId?: string;
  readonly authorized: boolean;
}

export interface ChildError {
  readonly collection: ExistingLoanChildKey;
  readonly name: string;
  readonly error: string;
}

export type BoardExistingLoanOutcome =
  | {
      kind: 'success';
      loanId: string;
      loanNumber: string;
      correlationId: string;
      childCreated: number;
      childErrors: readonly ChildError[];
      auditId: string | undefined;
    }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'duplicate'; reason: string; loanNumber: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | { kind: 'readback-mismatch'; expectedLoanNumber: string; actualLoanNumber: string | undefined; correlationId: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string; loanId: string }
  | { kind: 'unknown'; message: string };

export interface WriteResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: { readonly message?: string };
}

export interface ReadResult {
  readonly success: boolean;
  readonly data?: { readonly cr664_loannumber?: string };
  readonly error?: { readonly message?: string };
}

export interface ExistingLoanDeps {
  /** True iff a boarded loan with this loan number already exists. */
  readonly loanNumberExists: (loanNumber: string) => Promise<boolean>;
  /** Create the root cr664_portfolioboardedloan record. */
  readonly createRoot: (payload: Record<string, unknown>) => Promise<WriteResult>;
  /** Read back the root record's loan number for verification. */
  readonly readRoot: (id: string) => Promise<ReadResult>;
  /** Create one child record in the given entity set. */
  readonly createChild: (collection: ExistingLoanChildKey, payload: Record<string, unknown>) => Promise<WriteResult>;
  /** Emit a domain audit-entry child for the boarding. */
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<WriteResult>;
}

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

function num(v: number | undefined): number | undefined {
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

/** Drop undefined keys so we never POST empty fields. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function buildRootPayload(
  input: ExistingLoanInput,
  persistExtended: boolean = EXTENDED_LOAN_ATTRIBUTES_PERSISTENCE_ENABLED,
): Record<string, unknown> {
  const loanNumber = trimmed(input.loanNumber);
  const borrower = trimmed(input.borrowerLegalName);
  const payload: Record<string, unknown> = {
    cr664_name: `${loanNumber} — ${borrower}`,
    cr664_loannumber: loanNumber,
    cr664_borrowerlegalname: borrower,
    cr664_boardingsource: MANUAL_EXISTING_LOAN_BOARDING_SOURCE,
    cr664_borrowerdba: trimmed(input.borrowerDba) || undefined,
    cr664_relationshipname: trimmed(input.relationshipName) || undefined,
    cr664_loanstatus: trimmed(input.loanStatus) || undefined,
    cr664_legacysystemid: trimmed(input.legacySystemId) || undefined,
    cr664_coresystemloanid: trimmed(input.coreSystemLoanId) || undefined,
    cr664_originalcommitmentamount: num(input.originalCommitmentAmount),
    cr664_currentoutstandingprincipal: num(input.currentOutstandingPrincipal),
    cr664_availablebalance: num(input.availableBalance),
    cr664_interestratetype: trimmed(input.interestRateType) || undefined,
    cr664_index: trimmed(input.index) || undefined,
    cr664_spread: num(input.spread),
    cr664_floor: num(input.floor),
    cr664_ceiling: num(input.ceiling),
    cr664_paymentfrequency: trimmed(input.paymentFrequency) || undefined,
    cr664_amortizationmonths: num(input.amortizationMonths),
    cr664_termmonths: num(input.termMonths),
    cr664_bookingdate: trimmed(input.bookingDate) || undefined,
    cr664_maturitydate: trimmed(input.maturityDate) || undefined,
    cr664_currentriskrating: trimmed(input.currentRiskRating) || undefined,
    cr664_nextreviewdate: trimmed(input.nextReviewDate) || undefined,
    cr664_watchlistflag: input.watchlistFlag === true ? true : input.watchlistFlag === false ? false : undefined,
    cr664_accrualstatus: trimmed(input.accrualStatus) || undefined,
    cr664_pastduedays: num(input.pastDueDays),
  };
  const dealId = trimmed(input.originatedDealId);
  if (dealId.length > 0) {
    payload['cr664_OriginatedLoanDeal@odata.bind'] = `/cr664_loandeals(${dealId})`;
  }
  // Phase 2 — persist the extended attributes blob ONLY when the (default-off) flag is on.
  // Until the operator provisions cr664_extendedloanattributes + enables the flag, these
  // fields are captured in the UI and visibly marked non-persisted (never silently dropped).
  if (persistExtended) {
    const blob = serializeExtendedLoanAttributes(
      buildExtendedLoanAttributes({
        product: input.product,
        loanOfficer: input.loanOfficer,
        branch: input.branch,
        purpose: input.purpose,
        currentNoteRate: input.currentNoteRate,
        firstResetDate: input.firstResetDate,
        firstResetPaymentNumber: input.firstResetPaymentNumber,
        resetFrequency: input.resetFrequency,
        nextRateChangeDate: input.nextRateChangeDate,
        payment61Reset: input.payment61Reset,
      }),
    );
    if (blob !== null) payload[EXTENDED_LOAN_ATTRIBUTES_COLUMN] = blob;
  }
  return compact(payload);
}

function buildAuditPayload(opts: {
  rootId: string;
  loanNumber: string;
  actorEmail: string;
  correlationId: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    cr664_name: `Boarded existing loan ${opts.loanNumber}`,
    cr664_actor: opts.actorEmail,
    cr664_action: 'manual-existing-loan-entry',
    cr664_timestamp: opts.nowIso,
    cr664_reason: `Manual Existing Loan Entry · correlation ${opts.correlationId}`,
    [PORTFOLIO_BOARDED_LOAN_ROOT_BIND]: `/${PORTFOLIO_BOARDED_LOAN_ENTITY_SET}(${opts.rootId})`,
  };
}

function childItems(input: ExistingLoanInput, key: ExistingLoanChildKey): readonly ExistingLoanChildInput[] {
  return (input[key] as readonly ExistingLoanChildInput[] | undefined) ?? [];
}

/**
 * Governed manual existing-loan boarding. Pure over `deps`.
 */
export async function boardExistingLoan(
  input: ExistingLoanInput,
  deps: ExistingLoanDeps,
  options: { readonly persistExtended?: boolean } = {},
): Promise<BoardExistingLoanOutcome> {
  const persistExtended = options.persistExtended ?? EXTENDED_LOAN_ATTRIBUTES_PERSISTENCE_ENABLED;
  // 1. Fail-closed authorization.
  if (!input.authorized) {
    return { kind: 'unauthorized', reason: 'You are not authorized to board portfolio loans.' };
  }

  // 2. Required-field validation.
  const loanNumber = trimmed(input.loanNumber);
  const borrower = trimmed(input.borrowerLegalName);
  if (loanNumber.length === 0) {
    return { kind: 'invalid-input', reason: 'Loan number is required.' };
  }
  if (borrower.length === 0) {
    return { kind: 'invalid-input', reason: 'Borrower legal name is required.' };
  }

  // 3. Governed write requires a Dataverse identity + audit actor.
  if (trimmed(input.actorSystemUserId).length === 0 || trimmed(input.actorEmail).length === 0) {
    return {
      kind: 'identity-unresolved',
      reason: 'No Dataverse identity is available for the signed-in operator; the loan was not boarded.',
    };
  }
  const actorEmail = trimmed(input.actorEmail);
  const correlationId = newCorrelationId('xl');

  // 4. Duplicate loan-number guard.
  let exists: boolean;
  try {
    exists = await deps.loanNumberExists(loanNumber);
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (exists) {
    return {
      kind: 'duplicate',
      reason: `A portfolio loan with number ${loanNumber} already exists. No record was created.`,
      loanNumber,
    };
  }

  // 5. Create the root boarded-loan record.
  let root: WriteResult;
  try {
    root = await deps.createRoot(buildRootPayload(input, persistExtended));
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!root.success || !root.id) {
    return { kind: 'write-failed', error: root.error?.message ?? 'Boarded-loan create returned non-success.', correlationId };
  }
  const loanId = root.id;

  // 6. Readback verification.
  let readback: ReadResult;
  try {
    readback = await deps.readRoot(loanId);
  } catch (err: unknown) {
    return {
      kind: 'readback-mismatch',
      expectedLoanNumber: loanNumber,
      actualLoanNumber: undefined,
      correlationId,
    };
  }
  const actualLoanNumber = trimmed(readback.data?.cr664_loannumber);
  if (!readback.success || actualLoanNumber !== loanNumber) {
    return {
      kind: 'readback-mismatch',
      expectedLoanNumber: loanNumber,
      actualLoanNumber: actualLoanNumber || undefined,
      correlationId,
    };
  }

  // 7. Create the entered child records (best-effort; failures surfaced).
  const childErrors: ChildError[] = [];
  let childCreated = 0;
  for (const key of EXISTING_LOAN_CHILD_KEYS) {
    for (const item of childItems(input, key)) {
      const name = trimmed(item.name);
      if (name.length === 0) continue;
      const payload = {
        cr664_name: name,
        [PORTFOLIO_BOARDED_LOAN_ROOT_BIND]: `/${PORTFOLIO_BOARDED_LOAN_ENTITY_SET}(${loanId})`,
      };
      try {
        const res = await deps.createChild(key, payload);
        if (res.success) childCreated += 1;
        else childErrors.push({ collection: key, name, error: res.error?.message ?? 'child create non-success' });
      } catch (err: unknown) {
        childErrors.push({ collection: key, name, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  // 8. Domain audit entry (operator + timestamp + correlation + source).
  const nowIso = new Date().toISOString();
  let audit: WriteResult;
  try {
    audit = await deps.emitAudit(buildAuditPayload({ rootId: loanId, loanNumber, actorEmail, correlationId, nowIso }));
  } catch (err: unknown) {
    return { kind: 'audit-failed', auditError: err instanceof Error ? err.message : String(err), correlationId, loanId };
  }
  if (!audit.success) {
    return { kind: 'audit-failed', auditError: audit.error?.message ?? 'Audit entry returned non-success.', correlationId, loanId };
  }

  return {
    kind: 'success',
    loanId,
    loanNumber,
    correlationId,
    childCreated,
    childErrors,
    auditId: audit.id,
  };
}

// ---------------------------------------------------------------------------
// Live dependencies (dynamic imports keep the SDK out of the static graph)
// ---------------------------------------------------------------------------

export function buildLiveExistingLoanDeps(): ExistingLoanDeps {
  return {
    loanNumberExists: async (loanNumber) => {
      const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
      const escaped = loanNumber.replace(/'/g, "''");
      const res = await Cr664_portfolioboardedloansService.getAll({
        select: ['cr664_portfolioboardedloanid', 'cr664_loannumber'],
        filter: `cr664_loannumber eq '${escaped}'`,
        top: 1,
      });
      return res.success === true && (res.data ?? []).length > 0;
    },
    createRoot: async (payload) => {
      const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
      const res = await Cr664_portfolioboardedloansService.create(
        payload as unknown as Parameters<typeof Cr664_portfolioboardedloansService.create>[0],
      );
      return { success: res.success, id: res.data?.cr664_portfolioboardedloanid, error: res.error ?? undefined };
    },
    readRoot: async (id) => {
      const { Cr664_portfolioboardedloansService } = await import('../generated/services/Cr664_portfolioboardedloansService');
      const res = await Cr664_portfolioboardedloansService.get(id, { select: ['cr664_loannumber'] });
      return { success: res.success, data: res.data ?? undefined, error: res.error ?? undefined };
    },
    createChild: async (collection, payload) => {
      const res = await createChildLive(collection, payload);
      return res;
    },
    emitAudit: async (payload) => {
      const { Cr664_portfolioboardedloanauditentriesService } = await import('../generated/services/Cr664_portfolioboardedloanauditentriesService');
      const res = await Cr664_portfolioboardedloanauditentriesService.create(
        payload as unknown as Parameters<typeof Cr664_portfolioboardedloanauditentriesService.create>[0],
      );
      return { success: res.success, id: res.data?.cr664_portfolioboardedloanauditentryid, error: res.error ?? undefined };
    },
  };
}

async function createChildLive(collection: ExistingLoanChildKey, payload: Record<string, unknown>): Promise<WriteResult> {
  switch (collection) {
    case 'borrowers': {
      const { Cr664_portfolioboardedloanborrowersService: s } = await import('../generated/services/Cr664_portfolioboardedloanborrowersService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_portfolioboardedloanborrowerid, error: r.error ?? undefined };
    }
    case 'collateral': {
      const { Cr664_portfolioboardedloancollateralsService: s } = await import('../generated/services/Cr664_portfolioboardedloancollateralsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_portfolioboardedloancollateralid, error: r.error ?? undefined };
    }
    case 'guarantors': {
      const { Cr664_portfolioboardedloanguarantorsService: s } = await import('../generated/services/Cr664_portfolioboardedloanguarantorsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_portfolioboardedloanguarantorid, error: r.error ?? undefined };
    }
    case 'covenants': {
      const { Cr664_portfolioboardedloancovenantsService: s } = await import('../generated/services/Cr664_portfolioboardedloancovenantsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_portfolioboardedloancovenantid, error: r.error ?? undefined };
    }
    case 'ticklers': {
      const { Cr664_portfolioboardedloanticklersService: s } = await import('../generated/services/Cr664_portfolioboardedloanticklersService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_portfolioboardedloanticklerid, error: r.error ?? undefined };
    }
    case 'insurance': {
      const { Cr664_portfolioboardedloaninsurancesService: s } = await import('../generated/services/Cr664_portfolioboardedloaninsurancesService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_portfolioboardedloaninsuranceid, error: r.error ?? undefined };
    }
    case 'documents': {
      const { Cr664_portfolioboardedloandocumentsService: s } = await import('../generated/services/Cr664_portfolioboardedloandocumentsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_portfolioboardedloandocumentid, error: r.error ?? undefined };
    }
    case 'exceptions': {
      const { Cr664_portfolioboardedloanexceptionsService: s } = await import('../generated/services/Cr664_portfolioboardedloanexceptionsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_portfolioboardedloanexceptionid, error: r.error ?? undefined };
    }
    case 'reviews': {
      const { Cr664_portfolioboardedloanreviewsService: s } = await import('../generated/services/Cr664_portfolioboardedloanreviewsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_portfolioboardedloanreviewid, error: r.error ?? undefined };
    }
    case 'examinerNotes': {
      const { Cr664_portfolioboardedloanexaminernotesService: s } = await import('../generated/services/Cr664_portfolioboardedloanexaminernotesService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_portfolioboardedloanexaminernoteid, error: r.error ?? undefined };
    }
  }
}
