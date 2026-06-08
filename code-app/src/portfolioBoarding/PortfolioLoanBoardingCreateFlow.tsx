import { useState, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { spacing, typography, palette } from '../shared/theme';
import {
  createEmptyPortfolioLoanBoardingPackage,
  type PortfolioLoanBoardingPackage,
} from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import type { PortfolioBoardingLivePersistenceAdapter } from './portfolioLoanBoardingLivePersistence';
import { usePortfolioLoanBoardingPersistence } from './usePortfolioLoanBoardingPersistence';
import { PortfolioLoanBoardingEditor } from './PortfolioLoanBoardingEditor';
import { PortfolioLoanBoardingValidationSummary } from './PortfolioLoanBoardingValidationSummary';
import { PortfolioLoanBoardingSaveBar } from './PortfolioLoanBoardingSaveBar';

interface Props {
  adapter: PortfolioBoardingLivePersistenceAdapter;
  /** Optional starting package. Defaults to a structurally-empty package. */
  initialPackage?: PortfolioLoanBoardingPackage;
}

/**
 * Phase 140M — create/edit flow. Starts from a DATA-EMPTY package (no fake
 * values), surfaces validation, and saves only through the injected adapter.
 */
export function PortfolioLoanBoardingCreateFlow({ adapter, initialPackage }: Props) {
  // The starting package seeds NO values — missing stays missing.
  const [pkg] = useState<PortfolioLoanBoardingPackage>(
    () => initialPackage ?? createEmptyPortfolioLoanBoardingPackage(),
  );
  const persistence = usePortfolioLoanBoardingPersistence(adapter);

  return (
    <Card>
      <CardHeader
        title="Create boarded loan"
        subtitle="Manually board a closed / legacy loan"
      />
      <p style={noteStyle}>
        An empty package is initialized with no values. Enter data by section; nothing is
        auto-filled.
      </p>
      <div style={stackStyle}>
        <PortfolioLoanBoardingEditor package={pkg} />
        <PortfolioLoanBoardingValidationSummary package={pkg} />
        <PortfolioLoanBoardingSaveBar
          enabled={persistence.enabled}
          state={persistence.state}
          onSave={() => {
            void persistence.create(pkg);
          }}
        />
      </div>
      <CardFooter>
        <span>Saves go only through the governed adapter. No fake values are created.</span>
      </CardFooter>
    </Card>
  );
}

const stackStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const noteStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle };
