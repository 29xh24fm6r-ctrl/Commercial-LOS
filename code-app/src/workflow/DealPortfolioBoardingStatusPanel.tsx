import { useEffect, useState, type CSSProperties } from 'react';
import { useDealData } from '../deals/DealDataProvider';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';
import { derivePortfolioBoardingStatus, deriveBoardedHandoffStatus, type PortfolioBoardingStatus } from './portfolioBoardingStatus';
import { recognizeCanonicalStage } from './stageOrderingContract';
import { loadBoardingHandoffForDeal } from '../deals/loadBoardingHandoffForDeal';

/**
 * Phase 258 — Portfolio boarding status panel for the deal command center.
 * WFLOW-H — once the deal's stage claims BOARDED, the stage string alone is
 * not proof (a deal can read BOARDED with no servicing record behind it).
 * This panel then loads the real portfolio boarded-loan evidence and
 * reconciles it via `evaluateBoardingHandoff` instead of trusting the claim.
 *
 * Read-only: shows whether this loan is ready to board into the portfolio
 * (after funding) and links to the Portfolio workspace where boarding and
 * servicing happen. No writes, no fabricated boarded-loan record.
 */
export function DealPortfolioBoardingStatusPanel({
  loadHandoff = loadBoardingHandoffForDeal,
}: {
  /** Injected for testability; defaults to the live SDK-backed loader. */
  loadHandoff?: typeof loadBoardingHandoffForDeal;
} = {}) {
  const { deal } = useDealData();
  const claimsBoarded = recognizeCanonicalStage(deal.stage)?.code === 'BOARDED';
  const [handoffStatus, setHandoffStatus] = useState<PortfolioBoardingStatus | 'loading' | null>(null);

  useEffect(() => {
    if (!claimsBoarded) {
      setHandoffStatus(null);
      return;
    }
    let cancelled = false;
    setHandoffStatus('loading');
    void loadHandoff(deal.id, deal.stage).then((handoff) => {
      if (!cancelled) setHandoffStatus(deriveBoardedHandoffStatus(handoff));
    });
    return () => {
      cancelled = true;
    };
  }, [claimsBoarded, deal.id, deal.stage, loadHandoff]);

  const status: PortfolioBoardingStatus =
    claimsBoarded && handoffStatus && handoffStatus !== 'loading'
      ? handoffStatus
      : derivePortfolioBoardingStatus(deal.stage);
  const loadingHandoffProof = claimsBoarded && handoffStatus === 'loading';

  return (
    <Card>
      <CardHeader
        title="Portfolio boarding status"
        subtitle="Where this loan sits relative to portfolio boarding."
        trailing={
          loadingHandoffProof ? (
            <Badge variant="neutral">Verifying…</Badge>
          ) : (
            <Badge variant={badgeVariantFor(status.phase)}>{status.label}</Badge>
          )
        }
      />
      <p style={styles.note} data-portfolio-boarding-note>
        {loadingHandoffProof ? 'Confirming the portfolio handoff record for this boarded deal…' : status.note}
      </p>
      <a href={WORKSPACE_ROUTES.manager} className="cc-link" style={styles.link} data-portfolio-boarding-open>
        Open Portfolio workspace
      </a>
      <CardFooter>
        <span>Boarding and servicing are governed in the Portfolio workspace.</span>
      </CardFooter>
    </Card>
  );
}

function badgeVariantFor(phase: PortfolioBoardingStatus['phase']): SeverityKey {
  switch (phase) {
    case 'eligible':
    case 'boarded':
      return 'clear';
    case 'unverified-handoff':
      return 'blocked';
    default:
      return 'neutral';
  }
}

const styles: Record<string, CSSProperties> = {
  note: { margin: 0, color: palette.text, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  link: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    display: 'inline-block',
    padding: `${spacing.xs} ${spacing.md}`,
    background: palette.primary,
    color: palette.surface,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    textDecoration: 'none',
  },
};
