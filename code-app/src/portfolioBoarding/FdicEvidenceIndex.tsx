import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { deriveEvidenceBinder } from '../shared/portfolioBoarding/portfolioLoanEvidenceBinder';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

/**
 * Phase 140P — evidence index across binder sections. Honest counts; no fake
 * evidence. Built from the pure evidence binder deriver.
 */
export function FdicEvidenceIndex({ package: pkg }: Props) {
  const sections = deriveEvidenceBinder(pkg);
  const evidenceLinks = pkg.evidenceLinks ?? [];
  return (
    <Card>
      <CardHeader title="Evidence index" subtitle={`${evidenceLinks.length} evidence link(s)`} />
      <div style={listStyle}>
        {sections.map((s) => (
          <div key={s.sectionKey} style={rowStyle}>
            <span style={labelStyle}>{s.label}</span>
            <span style={countStyle}>docs {s.documentCount}</span>
            <span style={missingStyle(s.missingCount)}>missing {s.missingCount}</span>
            <span style={missingStyle(s.staleCount)}>stale {s.staleCount}</span>
          </div>
        ))}
      </div>
      {evidenceLinks.length === 0 && (
        <p style={noneStyle}>No evidence links recorded.</p>
      )}
    </Card>
  );
}

const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', borderTop: `1px solid ${palette.border}`, padding: `${spacing.xs} 0` };
const labelStyle: CSSProperties = { flex: '1 0 160px', fontSize: typography.size.sm, color: palette.text };
const countStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, minWidth: 70 };
function missingStyle(n: number): CSSProperties {
  return { fontSize: typography.size.xs, color: n > 0 ? palette.blockedFg : palette.textSubtle, minWidth: 70 };
}
const noneStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
