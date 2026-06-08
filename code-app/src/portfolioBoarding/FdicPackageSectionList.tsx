import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { deriveFdicExaminerPackage } from '../shared/portfolioBoarding/fdicExaminerPackage';

interface Props {
  package: PortfolioLoanBoardingPackage;
  title?: string;
}

/**
 * Phase 140P — renders FDIC examiner package sections with explicit
 * required/received/missing/stale counts. Discloses, never hides.
 */
export function FdicPackageSectionList({ package: pkg, title = 'FDIC package sections' }: Props) {
  const fdic = deriveFdicExaminerPackage(pkg);
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={`FDIC ${fdic.fdicReady ? 'ready' : 'not ready'} · ${fdic.sections.length} section(s)`}
      />
      <div style={listStyle}>
        {fdic.sections.map((s) => (
          <div key={s.sectionKey} style={rowStyle}>
            <span style={labelStyle}>{s.label}</span>
            <span style={statusFor(s.status)}>{s.status}</span>
            <span style={countStyle}>req {s.requiredDocumentCount}</span>
            <span style={countStyle}>rcv {s.receivedDocumentCount}</span>
            <span style={missingCountStyle(s.missingDocumentCount)}>missing {s.missingDocumentCount}</span>
            <span style={missingCountStyle(s.staleDocumentCount)}>stale {s.staleDocumentCount}</span>
          </div>
        ))}
      </div>
      <Disclosure title="Missing (disclosed, not hidden)" items={fdic.missingDisclosure} />
      <Disclosure title="Stale (disclosed, not hidden)" items={fdic.staleDisclosure} />
      <Disclosure title="Exceptions (disclosed, not hidden)" items={fdic.exceptionDisclosure} />
      <Disclosure title="Blockers" items={fdic.blockers} />
    </Card>
  );
}

function Disclosure({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div style={disclosureStyle}>
      <span style={disclosureTitleStyle}>{title}</span>
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

function statusFor(status: string): CSSProperties {
  const base: CSSProperties = { fontSize: typography.size.xs, fontWeight: typography.weight.semibold, minWidth: 80 };
  if (status === 'complete') return { ...base, color: palette.clearFg };
  if (status === 'incomplete') return { ...base, color: palette.blockedFg };
  return { ...base, color: palette.textSubtle };
}

const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', borderTop: `1px solid ${palette.border}`, padding: `${spacing.xs} 0` };
const labelStyle: CSSProperties = { flex: '1 0 140px', fontSize: typography.size.sm, color: palette.text };
const countStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, minWidth: 56 };
function missingCountStyle(n: number): CSSProperties {
  return { fontSize: typography.size.xs, color: n > 0 ? palette.blockedFg : palette.textSubtle, minWidth: 70 };
}
const disclosureStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const disclosureTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
