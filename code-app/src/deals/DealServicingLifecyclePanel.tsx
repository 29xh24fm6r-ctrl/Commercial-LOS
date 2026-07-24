import { useEffect, useState, type CSSProperties } from 'react';
import { useDealData } from './DealDataProvider';
import { ServicingLifecyclePanel } from '../servicing/ServicingLifecyclePanel';
import type { ServicingLifecycleSnapshot } from '../servicing/servicingLifecycleTypes';
import { loadServicingLifecycleSnapshotForLoan, type ServicingLifecycleLoadResult } from './loadServicingLifecycleSnapshotForLoan';
import { recognizeCanonicalStage } from '../workflow/stageOrderingContract';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';

/**
 * PR 111 — mounts the servicing lifecycle deriver family (src/servicing/*, Phase 142E, 7 pure
 * derivers + the snapshot deriver — previously entirely unmounted; no live loader existed for any
 * of it) against real Dataverse data via `loadServicingLifecycleSnapshotForLoan`. Fully live: this
 * is a READ-ONLY decision-support surface with no persistence gap, so — unlike the funding /
 * closing-document panels — nothing here is session-scoped or local-only.
 *
 * Fetch is gated on the deal's stage claiming BOARDED, same efficiency-conscious convention
 * `DealPortfolioBoardingStatusPanel` already uses in this cockpit: most deals never reach BOARDED,
 * so this avoids an extra portfolio-boarded-loan query on every deal page. The loader itself still
 * verifies against the REAL handoff record (never trusts the stage string alone), so a genuinely
 * boarded loan is found even if the stage claim is stale or premature.
 */
export function DealServicingLifecyclePanel({
  loadSnapshot = loadServicingLifecycleSnapshotForLoan,
}: {
  /** Injected for testability; defaults to the live SDK-backed loader. */
  loadSnapshot?: typeof loadServicingLifecycleSnapshotForLoan;
} = {}) {
  const { deal } = useDealData();
  const claimsBoarded = recognizeCanonicalStage(deal.stage)?.code === 'BOARDED';
  const [result, setResult] = useState<{ key: string; result: ServicingLifecycleLoadResult } | null>(null);
  const resultKey = `${deal.id}::${deal.stage ?? ''}`;

  useEffect(() => {
    if (!claimsBoarded) return;
    let cancelled = false;
    void loadSnapshot(deal.id, deal.stage, { borrowerName: deal.effectiveClientName ?? deal.clientName }).then((res) => {
      if (!cancelled) setResult({ key: resultKey, result: res });
    });
    return () => {
      cancelled = true;
    };
  }, [claimsBoarded, deal.id, deal.stage, deal.effectiveClientName, deal.clientName, resultKey, loadSnapshot]);

  if (!claimsBoarded) return null;

  const hasFreshResult = result?.key === resultKey;
  if (!hasFreshResult) {
    return (
      <Card>
        <CardHeader title="Servicing lifecycle" subtitle="Loading real servicing evidence…" />
      </Card>
    );
  }

  const loaded = result.result;
  if (loaded.kind === 'not_boarded') return null;

  if (loaded.kind === 'unavailable') {
    return (
      <Card>
        <CardHeader title="Servicing lifecycle" />
        <p style={styles.error} role="alert" data-servicing-lifecycle-unavailable>
          {loaded.message}
        </p>
      </Card>
    );
  }

  return <ServicingLifecyclePanel snapshot={loaded.snapshot as ServicingLifecycleSnapshot} />;
}

const styles: Record<string, CSSProperties> = {
  error: { margin: 0, color: palette.blocked, fontSize: typography.size.sm, padding: spacing.sm },
};
