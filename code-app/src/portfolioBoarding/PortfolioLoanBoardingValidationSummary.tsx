import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { derivePortfolioLoanBoardingFormState } from './derivePortfolioLoanBoardingFormState';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

/**
 * Phase 140M — surfaces missing required fields + readiness from the pure form
 * deriver. Honest: it shows what is missing, never autofills.
 */
export function PortfolioLoanBoardingValidationSummary({ package: pkg }: Props) {
  const state = derivePortfolioLoanBoardingFormState(pkg);
  const sectionsWithMissing = Object.entries(state.missingFieldsBySection).filter(
    ([, fields]) => fields.length > 0,
  );

  return (
    <Card>
      <CardHeader title="Validation" subtitle="Missing required fields · fail-closed readiness" />
      <div style={readinessRowStyle}>
        <span style={state.fdicReady ? okStyle : notStyle}>FDIC {state.fdicReady ? 'ready' : 'not ready'}</span>
        <span style={state.boardReady ? okStyle : notStyle}>Board {state.boardReady ? 'ready' : 'not ready'}</span>
        <span style={state.portfolioMonitoringReady ? okStyle : notStyle}>
          Portfolio {state.portfolioMonitoringReady ? 'ready' : 'not ready'}
        </span>
      </div>
      {sectionsWithMissing.length === 0 ? (
        <p style={noneStyle}>No missing required fields identified.</p>
      ) : (
        <ul style={listStyle}>
          {sectionsWithMissing.map(([section, fields]) => (
            <li key={section} style={itemStyle}>
              <span style={sectionLabelStyle}>{section}</span>: {fields.join(', ')}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const readinessRowStyle: CSSProperties = { display: 'flex', gap: spacing.md, flexWrap: 'wrap' };
const okStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.clearFg, fontWeight: typography.weight.semibold };
const notStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg, fontWeight: typography.weight.semibold };
const listStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const sectionLabelStyle: CSSProperties = { fontWeight: typography.weight.semibold };
const noneStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
