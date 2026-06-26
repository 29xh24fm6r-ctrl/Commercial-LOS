import type { CSSProperties } from 'react';
import { useDealData } from '../deals/DealDataProvider';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { palette, radius, spacing, typography } from '../shared/theme';
import { derivePortfolioBoardingStatus } from './portfolioBoardingStatus';

/**
 * Phase 258 — Portfolio boarding status panel for the deal command center.
 *
 * Read-only: shows whether this loan is ready to board into the portfolio
 * (after funding) and links to the Portfolio workspace where boarding and
 * servicing happen. No writes, no fabricated boarded-loan record.
 */
export function DealPortfolioBoardingStatusPanel() {
  const { deal } = useDealData();
  const status = derivePortfolioBoardingStatus(deal.stage);
  return (
    <Card>
      <CardHeader
        title="Portfolio boarding status"
        subtitle="Where this loan sits relative to portfolio boarding."
        trailing={<Badge variant={status.phase === 'eligible' ? 'clear' : 'neutral'}>{status.label}</Badge>}
      />
      <p style={styles.note} data-portfolio-boarding-note>
        {status.note}
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
