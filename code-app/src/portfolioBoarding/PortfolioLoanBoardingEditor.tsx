import { useState, type CSSProperties } from 'react';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import { derivePortfolioLoanBoardingFormState } from './derivePortfolioLoanBoardingFormState';
import { BOARDING_FORM_SECTIONS } from './portfolioLoanBoardingFormModel';
import type { PortfolioLoanBoardingWriteAdapter } from './portfolioLoanBoardingWriteAdapter';

interface Props {
  package: PortfolioLoanBoardingPackage;
  writeAdapter?: PortfolioLoanBoardingWriteAdapter;
}

export function PortfolioLoanBoardingEditor({ package: pkg, writeAdapter }: Props) {
  const [activeSection, setActiveSection] = useState(BOARDING_FORM_SECTIONS[0].key);
  const formState = derivePortfolioLoanBoardingFormState(pkg);
  const adapterEnabled = writeAdapter?.enabled === true;

  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader
          title="Portfolio Loan Boarding Editor"
          subtitle={adapterEnabled ? 'Save adapter connected' : 'Save adapter not configured'}
        />
        {!adapterEnabled && (
          <div role="status" style={notConfiguredStyle}>
            <p style={notConfiguredTitleStyle}>Save adapter not configured</p>
            <p style={notConfiguredDetailStyle}>
              The portfolio boarding write adapter has not been registered for this
              environment. Edits cannot be persisted until the adapter is configured.
            </p>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Sections" />
        <div style={sectionNavStyle}>
          {BOARDING_FORM_SECTIONS.map((s) => {
            const missing = formState.missingFieldsBySection[s.key];
            return (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                style={{
                  ...sectionButtonStyle,
                  ...(activeSection === s.key ? sectionButtonActiveStyle : {}),
                }}
              >
                {s.label}
                {missing.length > 0 && (
                  <span style={missingBadgeStyle}>{missing.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader
          title={BOARDING_FORM_SECTIONS.find((s) => s.key === activeSection)?.label ?? ''}
          subtitle={BOARDING_FORM_SECTIONS.find((s) => s.key === activeSection)?.description}
        />
        <p style={placeholderStyle}>
          Form fields for the {activeSection} section will render here when
          the section editor components are wired.
        </p>
      </Card>

      <Card>
        <CardHeader title="Readiness" />
        <div style={readinessRowStyle}>
          <ReadinessFlag label="FDIC" ready={formState.fdicReady} />
          <ReadinessFlag label="Board" ready={formState.boardReady} />
          <ReadinessFlag label="Portfolio" ready={formState.portfolioMonitoringReady} />
        </div>
        {formState.blockers.length > 0 && (
          <ul style={blockerListStyle}>
            {formState.blockers.slice(0, 5).map((b, i) => (
              <li key={i} style={blockerItemStyle}>{b}</li>
            ))}
          </ul>
        )}
        <CardFooter>
          <span>Readiness is fail-closed. All required fields and documents must be present.</span>
          <span>{adapterEnabled ? 'Save adapter connected.' : 'Save adapter not configured. Read-only mode.'}</span>
        </CardFooter>
      </Card>
    </div>
  );
}

function ReadinessFlag({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div style={readinessFlagStyle}>
      <span style={readinessLabelStyle}>{label}</span>
      <span style={ready ? readyStyle : notReadyStyle}>{ready ? 'Ready' : 'Not ready'}</span>
    </div>
  );
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const notConfiguredStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm, padding: spacing.lg, textAlign: 'center' };
const notConfiguredTitleStyle: CSSProperties = { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: palette.text };
const notConfiguredDetailStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textMuted };
const sectionNavStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: spacing.xs };
const sectionButtonStyle: CSSProperties = { padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.xs, color: palette.text, background: palette.surfaceAlt, border: `1px solid ${palette.border}`, borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: spacing.xs };
const sectionButtonActiveStyle: CSSProperties = { background: palette.primaryBg, borderColor: palette.primary, color: palette.primary, fontWeight: typography.weight.semibold };
const missingBadgeStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.blockedFg, background: palette.blockedBg, padding: '0 4px', borderRadius: '8px', fontWeight: typography.weight.bold, minWidth: 16, textAlign: 'center' };
const placeholderStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const readinessRowStyle: CSSProperties = { display: 'flex', gap: spacing.xl, flexWrap: 'wrap' };
const readinessFlagStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 };
const readinessLabelStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const readyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.clearFg, background: palette.clearBg, padding: `2px ${spacing.sm}`, borderRadius: '4px', fontWeight: typography.weight.semibold, textAlign: 'center' };
const notReadyStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg, background: palette.blockedBg, padding: `2px ${spacing.sm}`, borderRadius: '4px', fontWeight: typography.weight.semibold, textAlign: 'center' };
const blockerListStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
