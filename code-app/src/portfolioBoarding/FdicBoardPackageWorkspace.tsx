import type { CSSProperties } from 'react';
import { spacing, typography, palette } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { FdicPackageSectionList } from './FdicPackageSectionList';
import { FdicEvidenceIndex } from './FdicEvidenceIndex';
import { BoardLoanReviewPackagePreview } from './BoardLoanReviewPackagePreview';
import { PortfolioManagerReviewPackagePreview } from './PortfolioManagerReviewPackagePreview';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

/**
 * Phase 140P — FDIC / board / portfolio review package surface. Pure,
 * read-only composition of the existing review derivers. Renders from the
 * provided package even when live persistence is disabled, and always
 * discloses missing / stale / exception items.
 */
export function FdicBoardPackageWorkspace({ package: pkg }: Props) {
  return (
    <section style={pageStyle} aria-label="FDIC / Board review package">
      <header style={headerStyle}>
        <h1 style={titleStyle}>FDIC / Board / Portfolio Review Package</h1>
        <p style={subtitleStyle}>
          Read-only evidence package. Missing, stale, and exception items are disclosed, not
          hidden.
        </p>
      </header>
      <FdicPackageSectionList package={pkg} />
      <FdicEvidenceIndex package={pkg} />
      <BoardLoanReviewPackagePreview package={pkg} />
      <PortfolioManagerReviewPackagePreview package={pkg} />
    </section>
  );
}

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg, padding: spacing.lg };
const headerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const titleStyle: CSSProperties = { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text };
const subtitleStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle };
