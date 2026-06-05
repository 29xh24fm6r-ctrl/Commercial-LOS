import type { CSSProperties } from 'react';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { deriveFdicExaminerPackage } from '../shared/portfolioBoarding/fdicExaminerPackage';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

export function FdicExaminerPackagePreview({ package: pkg }: Props) {
  const examPkg = deriveFdicExaminerPackage(pkg);

  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader
          title="FDIC Examiner Package"
          subtitle={`${examPkg.loanName ?? 'Loan name not set'} — ${examPkg.borrowerName ?? 'Borrower not set'}`}
        />
        <div style={readinessRowStyle}>
          <ReadinessItem label="FDIC Ready" ready={examPkg.fdicReady} />
          <ReadinessItem label="Board Ready" ready={examPkg.boardReady} />
          <ReadinessItem label="Portfolio Monitoring" ready={examPkg.portfolioMonitoringReady} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Package Sections" />
        {examPkg.sections.map((s) => (
          <div key={s.sectionKey} style={sectionRowStyle}>
            <span style={sectionLabelStyle}>{s.label}</span>
            <span style={s.status === 'complete' ? statusCompleteStyle : s.status === 'incomplete' ? statusIncompleteStyle : statusNaStyle}>
              {s.status === 'complete' ? 'Complete' : s.status === 'incomplete' ? 'Incomplete' : 'N/A'}
            </span>
          </div>
        ))}
      </Card>

      {examPkg.missingDisclosure.length > 0 && (
        <Card accentColor={palette.blocked}>
          <CardHeader title="Missing Document Disclosure" />
          <ul style={disclosureListStyle}>
            {examPkg.missingDisclosure.map((d, i) => (
              <li key={i} style={disclosureItemStyle}>{d}</li>
            ))}
          </ul>
        </Card>
      )}

      {examPkg.staleDisclosure.length > 0 && (
        <Card accentColor={palette.atRisk}>
          <CardHeader title="Stale Document Disclosure" />
          <ul style={disclosureListStyle}>
            {examPkg.staleDisclosure.map((d, i) => (
              <li key={i} style={disclosureItemStyle}>{d}</li>
            ))}
          </ul>
        </Card>
      )}

      {examPkg.exceptionDisclosure.length > 0 && (
        <Card accentColor={palette.blocked}>
          <CardHeader title="Exception Disclosure" />
          <ul style={disclosureListStyle}>
            {examPkg.exceptionDisclosure.map((d, i) => (
              <li key={i} style={disclosureItemStyle}>{d}</li>
            ))}
          </ul>
        </Card>
      )}

      {examPkg.blockers.length > 0 && (
        <Card>
          <CardHeader title="Blockers" />
          <ul style={disclosureListStyle}>
            {examPkg.blockers.slice(0, 10).map((b, i) => (
              <li key={i} style={disclosureItemStyle}>{b}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Examiner Notes" />
        {pkg.examinerNotes.length === 0 && (
          <p style={emptyStyle}>No examiner notes on record.</p>
        )}
        {pkg.examinerNotes.map((n, i) => (
          <div key={i} style={noteRowStyle}>
            <span style={noteLabelStyle}>{n.responseStatus ?? 'Pending'}</span>
            <span style={noteTextStyle}>{n.note ?? ''}</span>
          </div>
        ))}
        <CardFooter>
          <span>Read-only FDIC examiner package preview. Missing, stale, and exception items are disclosed.</span>
        </CardFooter>
      </Card>
    </div>
  );
}

function ReadinessItem({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div style={readinessItemStyle}>
      <span style={readinessLblStyle}>{label}</span>
      <span style={ready ? readyBadgeStyle : notReadyBadgeStyle}>{ready ? 'Ready' : 'Not ready'}</span>
    </div>
  );
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const readinessRowStyle: CSSProperties = { display: 'flex', gap: spacing.xl, flexWrap: 'wrap' };
const readinessItemStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 };
const readinessLblStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const readyBadgeStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.clearFg, background: palette.clearBg, padding: `2px ${spacing.sm}`, borderRadius: '4px', fontWeight: typography.weight.semibold, textAlign: 'center' };
const notReadyBadgeStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg, background: palette.blockedBg, padding: `2px ${spacing.sm}`, borderRadius: '4px', fontWeight: typography.weight.semibold, textAlign: 'center' };
const sectionRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const sectionLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const statusCompleteStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.clearFg, fontWeight: typography.weight.semibold };
const statusIncompleteStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.blockedFg, fontWeight: typography.weight.semibold };
const statusNaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const disclosureListStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const disclosureItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const noteRowStyle: CSSProperties = { display: 'flex', gap: spacing.md, padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const noteLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted, fontWeight: typography.weight.semibold, textTransform: 'uppercase', minWidth: 80 };
const noteTextStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
