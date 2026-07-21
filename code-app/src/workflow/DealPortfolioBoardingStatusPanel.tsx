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
  // Keyed result, not a tri-state 'loading' flag: the effect below only calls setState from its
  // async callback (never synchronously in the effect body — no react-hooks/set-state-in-effect
  // violation). "Loading" is DERIVED by comparing the current (deal.id, deal.stage) key against
  // the key the latest committed result belongs to, rather than tracked via an explicit
  // synchronous setState('loading') kickoff.
  const [handoffResult, setHandoffResult] = useState<{ key: string; status: PortfolioBoardingStatus } | null>(null);
  const handoffKey = `${deal.id}::${deal.stage ?? ''}`;

  useEffect(() => {
    if (!claimsBoarded) return;
    let cancelled = false;
    void loadHandoff(deal.id, deal.stage).then((handoff) => {
      if (!cancelled) setHandoffResult({ key: handoffKey, status: deriveBoardedHandoffStatus(handoff) });
    });
    return () => {
      cancelled = true;
    };
  }, [claimsBoarded, deal.id, deal.stage, handoffKey, loadHandoff]);

  const hasFreshHandoffResult = claimsBoarded && handoffResult?.key === handoffKey;
  const status: PortfolioBoardingStatus =
    hasFreshHandoffResult && handoffResult
      ? handoffResult.status
      : derivePortfolioBoardingStatus(deal.stage);
  const loadingHandoffProof = claimsBoarded && !hasFreshHandoffResult;

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
      {/* Note: this deal-workflow panel is constrained by the Phase-142A strategy-purity governance
          (no react-router import in src/workflow/*). It therefore uses a plain anchor rather than a
          router Link; the admin/banker workspace-switch buttons (the P0-3 audit target) use <Link>. */}
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
    case 'ready':
    case 'boarded':
      return 'clear';
    case 'requires-completion':
    case 'failed':
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
