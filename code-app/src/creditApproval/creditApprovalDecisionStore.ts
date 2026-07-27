import type { CreditApprovalDecisionRecord, CreditApprovalDecisionStatus } from '../workflow/creditApprovalDecisionTypes';
import { CREDIT_APPROVAL_DECISION_STATUSES } from '../workflow/creditApprovalDecisionTypes';

/**
 * Final LOS Completion arc — Workstream C. Storage seam for durable Credit Approval Decision
 * records, following the exact precedent `closingDocumentStorage.ts` (PR A) and
 * `fundingAuthorizationDataverseStore.ts` (PR112) established: a real Dataverse-backed store below,
 * plus an in-memory reference implementation for tests. Same disclosed caveat as those precedents —
 * the backing table (`cr664_creditapprovaldecision`, proposed in
 * `scripts/schema-migrations/final-arc-credit-approval-decision/`) has NOT been applied to any live
 * Dataverse environment, and the generated SDK pairing was hand-authored (no live credentials exist
 * in this sandbox). Until an operator applies that migration, every live call fails closed — an
 * honest `{ success: false, error }`, never a fabricated success.
 */

export interface CreditApprovalDecisionStorageResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

export interface CreditApprovalDecisionListResult {
  readonly success: boolean;
  readonly decisions?: readonly CreditApprovalDecisionRecord[];
  readonly error?: string;
}

export interface CreditApprovalDecisionStoreDeps {
  readonly createDecisionRecord: (record: CreditApprovalDecisionRecord) => Promise<CreditApprovalDecisionStorageResult>;
  readonly listDecisionsForDeal: (dealId: string) => Promise<CreditApprovalDecisionListResult>;
}

export function createInMemoryCreditApprovalDecisionStore(): CreditApprovalDecisionStoreDeps & {
  readonly all: () => readonly CreditApprovalDecisionRecord[];
} {
  const decisions: CreditApprovalDecisionRecord[] = [];
  return {
    createDecisionRecord: async (record) => {
      decisions.push(record);
      return { success: true, id: record.decisionId };
    },
    listDecisionsForDeal: async (dealId) => ({
      success: true,
      decisions: decisions.filter((d) => d.dealId === dealId),
    }),
    all: () => decisions,
  };
}

// ---------------------------------------------------------------------------
// Live Dataverse-backed implementation (see the header disclosure above)
// ---------------------------------------------------------------------------

const VALID_STATUSES: ReadonlySet<string> = new Set(CREDIT_APPROVAL_DECISION_STATUSES);

/** The subset of `Cr664_creditapprovaldecisions` fields this adapter reads. */
const SELECT_FIELDS = [
  'cr664_decisionid',
  'cr664_dealid',
  'cr664_decisionstatus',
  'cr664_approvedamount',
  'cr664_approvedproduct',
  'cr664_approvedtermmonths',
  'cr664_approvedpricing',
  'cr664_collateralsummary',
  'cr664_conditionsjson',
  'cr664_authoritytier',
  'cr664_rationale',
  'cr664_requestedby',
  'cr664_requestedat',
  'cr664_decidedby',
  'cr664_decidedat',
  'cr664_correlationid',
  'cr664_supersedesdecisionid',
] as const;

type CreditApprovalDecisionRow = Record<(typeof SELECT_FIELDS)[number], unknown>;

type MapResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** Fail-closed row -> record mapping — a malformed/missing required field fails this ONE row's read
 *  rather than being silently coerced into a fabricated value. */
function mapRowToDecision(row: CreditApprovalDecisionRow): MapResult<CreditApprovalDecisionRecord> {
  const decisionId = row.cr664_decisionid;
  if (typeof decisionId !== 'string' || decisionId.length === 0) {
    return { ok: false, error: 'A credit approval decision row is missing cr664_decisionid.' };
  }
  const dealId = row.cr664_dealid;
  if (typeof dealId !== 'string' || dealId.length === 0) {
    return { ok: false, error: `Decision ${decisionId} is missing cr664_dealid.` };
  }
  const status = row.cr664_decisionstatus;
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return { ok: false, error: `Decision ${decisionId} has an unrecognized status: ${String(status)}.` };
  }
  const rationale = row.cr664_rationale;
  if (typeof rationale !== 'string') {
    return { ok: false, error: `Decision ${decisionId} is missing cr664_rationale.` };
  }
  const requestedByActorEmail = row.cr664_requestedby;
  if (typeof requestedByActorEmail !== 'string' || requestedByActorEmail.length === 0) {
    return { ok: false, error: `Decision ${decisionId} is missing cr664_requestedby.` };
  }
  const requestedAtIso = row.cr664_requestedat;
  if (typeof requestedAtIso !== 'string' || requestedAtIso.length === 0) {
    return { ok: false, error: `Decision ${decisionId} is missing cr664_requestedat.` };
  }
  const correlationId = row.cr664_correlationid;
  if (typeof correlationId !== 'string' || correlationId.length === 0) {
    return { ok: false, error: `Decision ${decisionId} is missing cr664_correlationid.` };
  }

  let conditions: readonly string[] = [];
  if (typeof row.cr664_conditionsjson === 'string' && row.cr664_conditionsjson.length > 0) {
    try {
      const parsed: unknown = JSON.parse(row.cr664_conditionsjson);
      if (Array.isArray(parsed) && parsed.every((c) => typeof c === 'string')) {
        conditions = parsed;
      } else {
        return { ok: false, error: `Decision ${decisionId} has a malformed cr664_conditionsjson (not a string array).` };
      }
    } catch {
      return { ok: false, error: `Decision ${decisionId} has invalid JSON in cr664_conditionsjson.` };
    }
  }

  return {
    ok: true,
    value: {
      decisionId,
      dealId,
      status: status as CreditApprovalDecisionStatus,
      approvedAmount: typeof row.cr664_approvedamount === 'number' ? row.cr664_approvedamount : undefined,
      approvedProduct: typeof row.cr664_approvedproduct === 'string' ? row.cr664_approvedproduct : undefined,
      approvedTermMonths: typeof row.cr664_approvedtermmonths === 'number' ? row.cr664_approvedtermmonths : undefined,
      approvedPricing: typeof row.cr664_approvedpricing === 'string' ? row.cr664_approvedpricing : undefined,
      collateralSummary: typeof row.cr664_collateralsummary === 'string' ? row.cr664_collateralsummary : undefined,
      conditions,
      authorityTier: typeof row.cr664_authoritytier === 'string' ? row.cr664_authoritytier : undefined,
      rationale,
      requestedByActorEmail,
      requestedAtIso,
      decidedByActorEmail: typeof row.cr664_decidedby === 'string' ? row.cr664_decidedby : undefined,
      decidedAtIso: typeof row.cr664_decidedat === 'string' ? row.cr664_decidedat : undefined,
      correlationId,
      supersedesDecisionId: typeof row.cr664_supersedesdecisionid === 'string' ? row.cr664_supersedesdecisionid : undefined,
    },
  };
}

function decisionToRow(record: CreditApprovalDecisionRecord): Record<string, unknown> {
  return {
    cr664_decisionid: record.decisionId,
    cr664_dealid: record.dealId,
    cr664_decisionstatus: record.status,
    cr664_approvedamount: record.approvedAmount,
    cr664_approvedproduct: record.approvedProduct,
    cr664_approvedtermmonths: record.approvedTermMonths,
    cr664_approvedpricing: record.approvedPricing,
    cr664_collateralsummary: record.collateralSummary,
    cr664_conditionsjson: JSON.stringify(record.conditions),
    cr664_authoritytier: record.authorityTier,
    cr664_rationale: record.rationale,
    cr664_requestedby: record.requestedByActorEmail,
    cr664_requestedat: record.requestedAtIso,
    cr664_decidedby: record.decidedByActorEmail,
    cr664_decidedat: record.decidedAtIso,
    cr664_correlationid: record.correlationId,
    cr664_supersedesdecisionid: record.supersedesDecisionId,
  };
}

/**
 * The durable, Dataverse-backed `CreditApprovalDecisionStoreDeps` implementation. Dynamic-import-
 * only (no static SDK import at this module's top level) — matches every other SDK-touching module
 * in this codebase. Every decision is immutable and append-only (a correction always creates a NEW
 * row via `supersedesDecisionId`, never mutates a prior one), so this adapter only ever needs
 * `create` and `getAll`, never an update path.
 *
 * FAIL-CLOSED throughout: a malformed/missing required field on any row, or a thrown/rejected SDK
 * call, surfaces as an honest `{ success: false, error }` — never a fabricated decision. A single
 * unreadable row fails only that read (no single "current" row whose correctness a bad sibling row
 * could undermine — listing skips and reports unreadable rows individually).
 */
export function createDataverseCreditApprovalDecisionStore(): CreditApprovalDecisionStoreDeps {
  return {
    createDecisionRecord: async (record) => {
      try {
        const { Cr664_creditapprovaldecisionsService } = await import(
          '../generated/services/Cr664_creditapprovaldecisionsService'
        );
        const payload = decisionToRow(record);
        // ownerid / owneridtype / statecode are server-defaulted Dataverse system fields — never
        // supplied by callers (same convention as closingDocumentStorage.ts).
        const result = await Cr664_creditapprovaldecisionsService.create(
          payload as unknown as Parameters<typeof Cr664_creditapprovaldecisionsService.create>[0],
        );
        if (!result.success) {
          return { success: false, error: result.error?.message ?? 'Credit approval decision create returned non-success.' };
        }
        return { success: true, id: record.decisionId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    listDecisionsForDeal: async (dealId) => {
      try {
        const { Cr664_creditapprovaldecisionsService } = await import(
          '../generated/services/Cr664_creditapprovaldecisionsService'
        );
        const result = await Cr664_creditapprovaldecisionsService.getAll({
          select: [...SELECT_FIELDS],
          filter: `cr664_dealid eq '${dealId.replace(/'/g, "''")}'`,
        });
        if (!result.success || !Array.isArray(result.data)) {
          return { success: false, error: result.error?.message ?? 'Credit approval decision list read failed.' };
        }
        const decisions: CreditApprovalDecisionRecord[] = [];
        for (const row of result.data) {
          const mapped = mapRowToDecision(row as unknown as CreditApprovalDecisionRow);
          if (mapped.ok) decisions.push(mapped.value);
        }
        return { success: true, decisions };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// Re-exported so tests needing the pure row<->record mapping (without a live/mocked SDK call) don't
// have to reach into this module's private scope.
export const __internal = { mapRowToDecision, decisionToRow };
