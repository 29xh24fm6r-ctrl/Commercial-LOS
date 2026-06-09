import { type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { CompetitiveReferencePlatformSummary } from './executiveStrategyTypes';
import { REFERENCE_PLATFORMS } from './deriveExecutiveProductStrategyDashboard';

interface Props {
  platforms?: readonly CompetitiveReferencePlatformSummary[];
}

/**
 * Phase 142H — Competitive reference platform panel (read-only).
 *
 * Compares Salesforce/nCino and open-source references (DigiFi/getsan4u, OpenCBS,
 * Frappe Lending, Twenty CRM, Corteza). Read-only: NO external links, iframe,
 * fetch, repo scraping, or competitor overclaim. Unknowns are caveated.
 */
export function CompetitiveReferencePlatformPanel({ platforms = REFERENCE_PLATFORMS }: Props) {
  return (
    <Card>
      <CardHeader title="Competitive reference platforms" subtitle="Read-only comparison — caveated, no external links" />

      <div style={bannerStyle}>
        Read-only comparison from public product / repository documentation only — no external links, iframe, fetch, or repository scraping. Unknowns are caveated, not overclaimed.
      </div>

      <div style={listStyle}>
        {platforms.map((p) => (
          <details key={p.platformKey} style={platformStyle}>
            <summary style={summaryStyle}>
              <span style={nameStyle}>{p.name}</span>
              <span style={typeChipStyle}>{p.platformType}</span>
            </summary>
            <dl style={metaListStyle}>
              <Row label="OGB adoption status" value={p.ogbAdoptionStatus} />
              <Row label="Capability overlap" value={p.capabilityOverlap} />
              <Row label="Recommended use" value={p.recommendedUse} />
            </dl>
            <div style={sectionStyle}>
              <span style={sectionTitleStyle}>Strongest lessons</span>
              <ul style={ulStyle}>
                {p.strongestLessons.map((l) => (
                  <li key={l} style={itemStyle}>{l}</li>
                ))}
              </ul>
            </div>
            <div style={sectionStyle}>
              <span style={sectionTitleStyle}>Limitations / caveats</span>
              <ul style={ulStyle}>
                {p.limitations.map((l) => (
                  <li key={l} style={caveatStyle}>{l}</li>
                ))}
              </ul>
            </div>
          </details>
        ))}
      </div>

      <CardFooter>
        <span>Reference comparison only — informs the roadmap; no competitor claim is made without caveat.</span>
      </CardFooter>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value}</dd>
    </div>
  );
}

const bannerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.atRiskFg, background: palette.atRiskBg, padding: spacing.sm, borderRadius: 4 };
const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs };
const platformStyle: CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: 4, padding: spacing.xs };
const summaryStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', cursor: 'pointer' };
const nameStyle: CSSProperties = { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text };
const typeChipStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const metaListStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: `${spacing.xs} 0` };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 170, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.xs };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const caveatStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
