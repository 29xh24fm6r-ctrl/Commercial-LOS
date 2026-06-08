import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { deriveBoardLoanReviewPackage } from '../shared/portfolioBoarding/fdicExaminerPackage';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

/**
 * Phase 140P — board loan review package. Never claims "ready" when blockers
 * exist; discloses missing / stale / exception items.
 */
export function BoardLoanReviewPackagePreview({ package: pkg }: Props) {
  const board = deriveBoardLoanReviewPackage(pkg);
  const hasBlockers = board.blockers.length > 0;
  return (
    <Card>
      <CardHeader
        title="Board loan review package"
        subtitle={board.borrowerName ?? board.loanName ?? 'Boarded loan'}
      />
      <div style={readinessRowStyle}>
        <span style={board.boardReady && !hasBlockers ? okStyle : notStyle}>
          {board.boardReady && !hasBlockers ? 'Board ready' : 'Not board ready'}
        </span>
        <span style={metaStyle}>Risk rating: {board.riskRating ?? 'Not set'}</span>
      </div>
      {hasBlockers && (
        <Block title="Blockers" items={board.blockers} />
      )}
      <Block title="Missing" items={board.missingDisclosure} />
      <Block title="Stale" items={board.staleDisclosure} />
      <Block title="Exceptions" items={board.exceptionDisclosure} />
      <CardFooter>
        <span>Board readiness is fail-closed; blockers prevent a ready status.</span>
      </CardFooter>
    </Card>
  );
}

function Block({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div style={blockStyle}>
      <span style={blockTitleStyle}>{title}</span>
      {items.length === 0 ? (
        <span style={noneStyle}>None.</span>
      ) : (
        <ul style={ulStyle}>
          {items.map((it, i) => (
            <li key={i} style={itemStyle}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const readinessRowStyle: CSSProperties = { display: 'flex', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' };
const okStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.clearFg, fontWeight: typography.weight.semibold };
const notStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg, fontWeight: typography.weight.semibold };
const metaStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle };
const blockStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const blockTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
