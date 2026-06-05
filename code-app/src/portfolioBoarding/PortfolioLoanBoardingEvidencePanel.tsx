import type { CSSProperties } from 'react';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { deriveEvidenceBinder } from '../shared/portfolioBoarding/portfolioLoanEvidenceBinder';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

export function PortfolioLoanBoardingEvidencePanel({ package: pkg }: Props) {
  const sections = deriveEvidenceBinder(pkg);

  return (
    <Card>
      <CardHeader title="Evidence Binder" subtitle="Examiner-ready document sections" />
      {sections.map((s) => (
        <div key={s.sectionKey} style={sectionRowStyle}>
          <span style={sectionLabelStyle}>{s.label}</span>
          <span style={sectionCountStyle}>
            {s.documentCount} doc{s.documentCount !== 1 ? 's' : ''}
            {s.missingCount > 0 && <span style={missingStyle}> · {s.missingCount} missing</span>}
            {s.staleCount > 0 && <span style={staleStyle}> · {s.staleCount} stale</span>}
          </span>
        </div>
      ))}
      {pkg.evidenceLinks.length > 0 && (
        <div style={evidenceLinksStyle}>
          <span style={evidenceLabelStyle}>Evidence links: {pkg.evidenceLinks.length}</span>
        </div>
      )}
      <CardFooter>
        <span>Read-only evidence index. Missing and stale items are disclosed.</span>
      </CardFooter>
    </Card>
  );
}

const sectionRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const sectionLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const sectionCountStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const missingStyle: CSSProperties = { color: palette.blocked };
const staleStyle: CSSProperties = { color: palette.atRisk };
const evidenceLinksStyle: CSSProperties = { padding: `${spacing.sm} 0` };
const evidenceLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted };
