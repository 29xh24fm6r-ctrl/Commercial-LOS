import { useEffect, useMemo, useState } from 'react';
import type { BoardedLoanRow } from '../../portfolioBoarding/boardedLoansList';
import { mapBusinessSafeError } from '../../shared/errors/businessSafeErrorMapping';
import {
  deriveMigrationReconciliation,
  type MigrationControl,
} from './bookReconciliation';
import { MigrationReconciliationPanel } from './BookReconciliationPanel';
import { loadMigrationControls } from './migrationReconciliationDataverseAdapter';

type State =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly controls: readonly MigrationControl[] };

export function LiveMigrationReconciliationPanel({
  loans,
  loadControls = loadMigrationControls,
}: {
  readonly loans: readonly BoardedLoanRow[];
  readonly loadControls?: () => Promise<readonly MigrationControl[]>;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadControls()
      .then((controls) => {
        if (!cancelled) setState({ kind: 'ready', controls });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const safe = mapBusinessSafeError(
          error instanceof Error ? error.message : String(error),
        );
        setState({ kind: 'failed', message: safe.safeMessage });
      });
    return () => {
      cancelled = true;
    };
  }, [loadControls]);

  const latest = state.kind === 'ready' ? state.controls[0] : undefined;
  const reconciliation = useMemo(
    () =>
      latest
        ? deriveMigrationReconciliation(
            latest,
            loans.map((loan) => ({
              loanNumber: loan.loanNumber,
              outstanding: loan.outstanding,
              migrationBatchId: loan.migrationBatchId,
              segment: loan.portfolioManager,
            })),
          )
        : undefined,
    [latest, loans],
  );

  if (state.kind === 'loading') {
    return <p role="status">Loading migration control totals…</p>;
  }
  if (state.kind === 'failed') {
    return (
      <section role="alert" aria-label="Book tie-out unavailable">
        <h3>Book tie-out unavailable</h3>
        <p>{state.message}</p>
      </section>
    );
  }
  return (
    <MigrationReconciliationPanel
      reconciliation={reconciliation}
      batchLabel={latest?.sourceDescription ?? latest?.batchId}
    />
  );
}
