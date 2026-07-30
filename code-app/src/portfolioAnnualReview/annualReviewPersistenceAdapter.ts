/**
 * Annual-review persistence over the existing governed portfolio tables.
 *
 * One cr664_portfolioboardedloanreview row is the durable aggregate for a
 * loan/cycle. The full package is stored as versioned JSON in cr664_notes while
 * searchable completion fields remain first-class columns. Every mutation also
 * appends a cr664_portfolioboardedloanauditentry; audit failure is surfaced as a
 * partial failure and is never reported as success.
 */

import type {
  AnnualReviewCycle,
  AnnualReviewEscalation,
  AnnualReviewPackage,
  AnnualReviewRequirementStatus,
} from '../shared/annualReview/annualReviewTypes';
import type {
  AnnualReviewPersistenceAdapter,
  AnnualReviewPersistenceResult,
  AnnualReviewReadResult,
} from './annualReviewPersistenceTypes';
import {
  evaluateLifecycleBeforeWrite,
  type LifecycleGovernanceInvocation,
} from '../governance/lifecycleGovernanceIntegration';

const SERIALIZATION_KIND = 'commercial-los-annual-review';
const SERIALIZATION_VERSION = 1;
const REVIEW_TYPE = 'Annual review';
const COMPLETE_OUTCOME = 'Completed';

interface StoredEnvelope {
  kind: typeof SERIALIZATION_KIND;
  version: typeof SERIALIZATION_VERSION;
  package: AnnualReviewPackage;
}

interface ReviewRow {
  cr664_portfolioboardedloanreviewid?: string;
  cr664_reviewid?: string;
  cr664_notes?: string;
  cr664_outcome?: string;
  _cr664_portfolioboardedloan_value?: string;
}

export interface AnnualReviewLiveContext {
  readonly cycle: AnnualReviewCycle;
  readonly actor: string;
  readonly now?: () => Date;
  readonly lifecycleGovernance?: LifecycleGovernanceInvocation;
}

function ok(operation: string, recordId?: string): AnnualReviewPersistenceResult {
  return { ok: true, operation, recordId };
}

function failed(operation: string, errorCode: string, message: string, recordId?: string): AnnualReviewPersistenceResult {
  return { ok: false, operation, errorCode, message, recordId };
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function reviewId(cycleId: string, loanId: string): string {
  return `${cycleId}:${loanId}`;
}

function encodePackage(pkg: AnnualReviewPackage): string {
  const envelope: StoredEnvelope = {
    kind: SERIALIZATION_KIND,
    version: SERIALIZATION_VERSION,
    package: pkg,
  };
  return JSON.stringify(envelope);
}

function decodePackage(value: unknown): AnnualReviewPackage | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<StoredEnvelope>;
    return parsed.kind === SERIALIZATION_KIND &&
      parsed.version === SERIALIZATION_VERSION &&
      parsed.package &&
      typeof parsed.package.cycleId === 'string'
      ? parsed.package
      : undefined;
  } catch {
    return undefined;
  }
}

async function listReviews(filter?: string): Promise<{ ok: boolean; rows: ReviewRow[]; error?: string }> {
  const { Cr664_portfolioboardedloanreviewsService } = await import(
    '../generated/services/Cr664_portfolioboardedloanreviewsService'
  );
  const result = await Cr664_portfolioboardedloanreviewsService.getAll({
    select: [
      'cr664_portfolioboardedloanreviewid',
      'cr664_reviewid',
      'cr664_notes',
      'cr664_outcome',
      '_cr664_portfolioboardedloan_value',
    ],
    ...(filter ? { filter } : {}),
    maxPageSize: 500,
  });
  return result.success
    ? { ok: true, rows: (result.data ?? []) as unknown as ReviewRow[] }
    : { ok: false, rows: [], error: result.error?.message ?? 'Annual-review read failed.' };
}

async function findReview(cycleId: string, loanId: string): Promise<ReviewRow | undefined> {
  const id = escapeOData(reviewId(cycleId, loanId));
  const result = await listReviews(`cr664_reviewid eq '${id}' and statecode eq 0`);
  if (!result.ok) throw new Error(result.error);
  return result.rows[0];
}

async function writeAudit(input: {
  loanId: string;
  actor: string;
  action: string;
  timestamp: string;
  previous?: string;
  next?: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { Cr664_portfolioboardedloanauditentriesService } = await import(
    '../generated/services/Cr664_portfolioboardedloanauditentriesService'
  );
  const auditId = crypto.randomUUID();
  const result = await Cr664_portfolioboardedloanauditentriesService.create({
    cr664_name: `Annual review · ${input.action}`,
    cr664_auditid: auditId,
    cr664_action: input.action,
    cr664_actor: input.actor,
    cr664_timestamp: input.timestamp,
    cr664_fieldkey: 'annualReview',
    cr664_previousvaluesummary: input.previous,
    cr664_newvaluesummary: input.next,
    cr664_reason: input.reason,
    'cr664_PortfolioBoardedLoan@odata.bind': `/cr664_portfolioboardedloans(${input.loanId})`,
  } as never);
  return result.success
    ? { ok: true }
    : { ok: false, error: result.error?.message ?? 'Annual-review audit write failed.' };
}

async function persistPackage(
  pkg: AnnualReviewPackage,
  context: AnnualReviewLiveContext,
  operation: string,
  previous?: string,
): Promise<AnnualReviewPersistenceResult> {
  const loanId = pkg.loan.boardedLoanId;
  if (!loanId) return failed(operation, 'missing_loan_id', 'A boarded loan id is required.');
  const lifecycleGate = await evaluateLifecycleBeforeWrite(
    'renewal',
    context.lifecycleGovernance,
    { allowed: true, evidenceIds: ['legacy-annual-review-controls'] },
  );
  if (!lifecycleGate.allowed) {
    return failed(operation, 'governance_blocked', lifecycleGate.safeMessage);
  }
  const now = (context.now ?? (() => new Date()))().toISOString();
  const existing = await findReview(pkg.cycleId, loanId);
  const payload = {
    cr664_name: `Annual review ${context.cycle.reviewYear} · ${pkg.loan.loanNumber ?? loanId}`,
    cr664_reviewid: reviewId(pkg.cycleId, loanId),
    cr664_reviewtype: REVIEW_TYPE,
    cr664_reviewdate: now,
    cr664_nextreviewdate: `${context.cycle.reviewYear + 1}-12-31`,
    cr664_outcome: pkg.status === 'completed' ? COMPLETE_OUTCOME : pkg.status,
    cr664_reviewer: context.actor,
    cr664_evidencedocumentidsjson: JSON.stringify(
      pkg.requirements.flatMap((r) => (r.evidenceDocumentId ? [r.evidenceDocumentId] : [])),
    ),
    cr664_notes: encodePackage(pkg),
    'cr664_PortfolioBoardedLoan@odata.bind': `/cr664_portfolioboardedloans(${loanId})`,
  };
  const { Cr664_portfolioboardedloanreviewsService } = await import(
    '../generated/services/Cr664_portfolioboardedloanreviewsService'
  );
  const writeResult = existing?.cr664_portfolioboardedloanreviewid
    ? await Cr664_portfolioboardedloanreviewsService.update(
        existing.cr664_portfolioboardedloanreviewid,
        payload as never,
      )
    : await Cr664_portfolioboardedloanreviewsService.create(payload as never);
  if (!writeResult.success) {
    return failed(operation, 'dataverse_write_failed', writeResult.error?.message ?? 'Annual-review write failed.');
  }
  const recordId =
    existing?.cr664_portfolioboardedloanreviewid ??
    (writeResult.data as unknown as ReviewRow | undefined)?.cr664_portfolioboardedloanreviewid;
  const audit = await writeAudit({
    loanId,
    actor: context.actor,
    action: operation,
    timestamp: now,
    previous,
    next: pkg.status,
  });
  return audit.ok
    ? ok(operation, recordId)
    : failed(operation, 'audit_failed_partial_success', audit.error ?? 'Audit failed.', recordId);
}

export function createLiveAnnualReviewPersistenceAdapter(
  context: AnnualReviewLiveContext,
): AnnualReviewPersistenceAdapter {
  async function loadPackages(cycleId: string): Promise<AnnualReviewPackage[]> {
    const result = await listReviews('statecode eq 0');
    if (!result.ok) throw new Error(result.error);
    return result.rows
      .map((row) => decodePackage(row.cr664_notes))
      .filter((pkg): pkg is AnnualReviewPackage => pkg?.cycleId === cycleId);
  }

  async function mutateByLoan(
    operation: string,
    loanId: string,
    mutate: (pkg: AnnualReviewPackage) => AnnualReviewPackage | AnnualReviewPersistenceResult,
  ): Promise<AnnualReviewPersistenceResult> {
    try {
      const row = await findReview(context.cycle.cycleId, loanId);
      const pkg = decodePackage(row?.cr664_notes);
      if (!pkg) return failed(operation, 'not_found', 'No saved annual-review package exists for this loan and cycle.');
      const changed = mutate(pkg);
      if ('ok' in changed) return changed;
      return persistPackage(changed, context, operation, pkg.status);
    } catch (error) {
      return failed(operation, 'read_failed', error instanceof Error ? error.message : String(error));
    }
  }

  return {
    enabled: true,
    async readAnnualReviewCycle(cycleId): Promise<AnnualReviewReadResult<AnnualReviewCycle>> {
      return cycleId === context.cycle.cycleId
        ? { ok: true, data: context.cycle }
        : { ok: false, errorCode: 'not_found' };
    },
    async searchAnnualReviewPackages(cycleId) {
      try {
        return { ok: true, data: await loadPackages(cycleId) };
      } catch (error) {
        return { ok: false, errorCode: error instanceof Error ? error.message : String(error) };
      }
    },
    async saveAnnualReviewPackage(pkg) {
      try {
        return await persistPackage(pkg, context, 'saveAnnualReviewPackage');
      } catch (error) {
        return failed('saveAnnualReviewPackage', 'write_failed', error instanceof Error ? error.message : String(error));
      }
    },
    updateRequirementStatus(requirementId: string, status: AnnualReviewRequirementStatus) {
      return (async () => {
        const packages = await loadPackages(context.cycle.cycleId);
        const pkg = packages.find((p) => p.requirements.some((r) => r.requirementId === requirementId));
        if (!pkg) return failed('updateRequirementStatus', 'not_found', 'Requirement was not found.');
        return persistPackage(
          {
            ...pkg,
            requirements: pkg.requirements.map((r) =>
              r.requirementId === requirementId ? { ...r, status } : r,
            ),
          },
          context,
          'updateRequirementStatus',
          pkg.status,
        );
      })().catch((error) =>
        failed('updateRequirementStatus', 'write_failed', error instanceof Error ? error.message : String(error)),
      );
    },
    addReviewNote(loanId: string, note: string) {
      return mutateByLoan('addReviewNote', loanId, (pkg) => ({
        ...pkg,
        audit: [
          ...pkg.audit,
          { actor: context.actor, action: 'note_added', loanId, timestamp: new Date().toISOString(), reason: note },
        ],
      }));
    },
    addEscalation(loanId: string, escalation: AnnualReviewEscalation) {
      return mutateByLoan('addEscalation', loanId, (pkg) => ({
        ...pkg,
        status: 'escalated',
        escalations: [...pkg.escalations, escalation],
      }));
    },
    completeReview(loanId: string) {
      return mutateByLoan('completeReview', loanId, (pkg) => {
        if (!pkg.readiness.annualReviewReady) {
          return failed(
            'completeReview',
            'readiness_blocked',
            pkg.readiness.blockers.join('; ') || 'Annual review readiness is not satisfied.',
          );
        }
        return {
          ...pkg,
          status: 'completed',
          audit: [
            ...pkg.audit,
            {
              actor: context.actor,
              action: 'review_completed',
              loanId,
              timestamp: (context.now ?? (() => new Date()))().toISOString(),
            },
          ],
        };
      });
    },
  };
}

function notConfigured(operation: string): Promise<AnnualReviewPersistenceResult> {
  return Promise.resolve({
    ok: false,
    operation,
    errorCode: 'not_configured',
    message: 'Annual review persistence is not enabled.',
  });
}

function notConfiguredRead<T>(): Promise<AnnualReviewReadResult<T>> {
  return Promise.resolve({ ok: false, errorCode: 'not_configured' });
}

export function createDisabledAnnualReviewPersistenceAdapter(): AnnualReviewPersistenceAdapter {
  return {
    enabled: false,
    readAnnualReviewCycle: () => notConfiguredRead(),
    searchAnnualReviewPackages: () => notConfiguredRead(),
    saveAnnualReviewPackage: () => notConfigured('saveAnnualReviewPackage'),
    updateRequirementStatus: () => notConfigured('updateRequirementStatus'),
    addReviewNote: () => notConfigured('addReviewNote'),
    addEscalation: () => notConfigured('addEscalation'),
    completeReview: () => notConfigured('completeReview'),
  };
}
