/**
 * Phase 261 (C) — portfolio bulk-import runner.
 *
 * Boards a batch of validated rows through the SAME governed
 * `boardExistingLoan` adapter used by single-loan manual entry — so every
 * imported loan gets the full discipline: fail-closed auth/identity, duplicate
 * guard, readback verification, and a per-loan audit entry. After the batch it
 * writes ONE import-summary audit record (operator, timestamp, file name, row
 * count, success count, failure count, correlation id). No fabricated records:
 * a row that fails to board is reported with its adapter outcome, never hidden.
 */

import {
  boardExistingLoan,
  buildLiveExistingLoanDeps,
  type ExistingLoanDeps,
  type ExistingLoanInput,
  type BoardExistingLoanOutcome,
} from './existingLoanEntryAdapter';
import { newCorrelationId } from '../shared/governance/correlationId';
import type { ParsedLoanRow } from './portfolioImportParser';
import { csvCell } from './portfolioImportColumns';

export interface ImportActor {
  readonly actorEmail: string | undefined;
  readonly actorSystemUserId: string | undefined;
  readonly authorized: boolean;
}

export interface ImportRowResult {
  readonly rowNumber: number;
  readonly loanNumber: string;
  readonly outcome: BoardExistingLoanOutcome;
  readonly boarded: boolean;
}

export interface ImportSummary {
  readonly correlationId: string;
  readonly fileName: string;
  readonly rowCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly results: readonly ImportRowResult[];
  /** True iff the import-summary audit record was written. */
  readonly auditWritten: boolean;
  readonly auditError: string | undefined;
}

export interface ImportAuditDep {
  /** Write the single file-level import-summary audit record. */
  readonly emitImportAudit: (payload: Record<string, unknown>) => Promise<{ success: boolean; id?: string; error?: { message?: string } }>;
}

export type ImportRunnerDeps = ExistingLoanDeps & ImportAuditDep;

function buildInput(row: ParsedLoanRow, actor: ImportActor): ExistingLoanInput {
  return {
    ...row.input,
    actorEmail: actor.actorEmail,
    actorSystemUserId: actor.actorSystemUserId,
    authorized: actor.authorized,
  };
}

function buildImportAuditPayload(s: {
  correlationId: string;
  fileName: string;
  rowCount: number;
  successCount: number;
  failureCount: number;
  actorEmail: string | undefined;
  nowIso: string;
}): Record<string, unknown> {
  return {
    cr664_name: `Portfolio import — ${s.fileName} (${s.successCount}/${s.rowCount} boarded)`,
    cr664_actor: s.actorEmail ?? 'unknown',
    cr664_action: 'portfolio-bulk-import',
    cr664_timestamp: s.nowIso,
    cr664_reason:
      `Bulk import of ${s.fileName}: ${s.rowCount} row(s), ${s.successCount} boarded, ` +
      `${s.failureCount} failed · correlation ${s.correlationId}`,
  };
}

/**
 * Run the import. Returns a full summary; the import is fail-closed at the
 * adapter level (an unauthorized/identity-unresolved actor boards nothing).
 * `boardFn` is injectable for tests; defaults to the governed adapter.
 */
export async function runPortfolioImport(
  rows: readonly ParsedLoanRow[],
  actor: ImportActor,
  deps: ImportRunnerDeps,
  fileName: string,
  boardFn: (input: ExistingLoanInput, deps: ExistingLoanDeps) => Promise<BoardExistingLoanOutcome> = boardExistingLoan,
): Promise<ImportSummary> {
  const correlationId = newCorrelationId('imp');
  const results: ImportRowResult[] = [];

  for (const row of rows) {
    const outcome = await boardFn(buildInput(row, actor), deps);
    results.push({ rowNumber: row.rowNumber, loanNumber: row.loanNumber, outcome, boarded: outcome.kind === 'success' });
  }

  const successCount = results.filter((r) => r.boarded).length;
  const failureCount = results.length - successCount;

  // File-level import-summary audit (best-effort: a failed summary audit does
  // not undo the per-loan governed audits already written).
  let auditWritten = false;
  let auditError: string | undefined;
  try {
    const res = await deps.emitImportAudit(
      buildImportAuditPayload({
        correlationId,
        fileName,
        rowCount: results.length,
        successCount,
        failureCount,
        actorEmail: actor.actorEmail,
        nowIso: new Date().toISOString(),
      }),
    );
    auditWritten = res.success === true;
    if (!res.success) auditError = res.error?.message ?? 'Import audit returned non-success.';
  } catch (err: unknown) {
    auditError = err instanceof Error ? err.message : String(err);
  }

  return { correlationId, fileName, rowCount: results.length, successCount, failureCount, results, auditWritten, auditError };
}

// ---------------------------------------------------------------------------
// Live dependencies
// ---------------------------------------------------------------------------

/** Single-source description of a per-row board outcome (on-screen + CSV export share this). */
export function describeImportOutcome(kind: BoardExistingLoanOutcome['kind']): string {
  switch (kind) {
    case 'duplicate': return 'Skipped — a loan with this number already exists.';
    case 'unauthorized': return 'Not boarded — you are not authorized.';
    case 'identity-unresolved': return 'Not boarded — no Dataverse identity available.';
    case 'invalid-input': return 'Not boarded — required fields were missing.';
    case 'write-failed': return 'Not boarded — the write failed; please retry.';
    case 'readback-mismatch': return 'Not boarded — the record did not verify on readback.';
    case 'audit-failed': return 'Boarded but its audit failed — an operator must reattempt the audit.';
    default: return 'Not boarded.';
  }
}

/**
 * Every failed row from a completed import run, one per row — never
 * truncated (Phase 264, P1). The on-screen result view previews the first 50;
 * this is the complete report for an operator correcting a real loan tape.
 */
export function buildImportFailureReportCsv(results: readonly ImportRowResult[]): string {
  const headers = ['Row', 'Loan Number', 'Reason'];
  const lines = results
    .filter((r) => !r.boarded)
    .map((r) => [String(r.rowNumber), r.loanNumber, describeImportOutcome(r.outcome.kind)].map(csvCell).join(','));
  return [headers.map(csvCell).join(','), ...lines].join('\n') + '\n';
}

export function buildLiveImportRunnerDeps(): ImportRunnerDeps {
  const base = buildLiveExistingLoanDeps();
  return {
    ...base,
    emitImportAudit: async (payload) => {
      const { Cr664_portfolioboardedloanauditentriesService } = await import(
        '../generated/services/Cr664_portfolioboardedloanauditentriesService'
      );
      const res = await Cr664_portfolioboardedloanauditentriesService.create(
        payload as unknown as Parameters<typeof Cr664_portfolioboardedloanauditentriesService.create>[0],
      );
      return { success: res.success, id: res.data?.cr664_portfolioboardedloanauditentryid, error: res.error ?? undefined };
    },
  };
}
