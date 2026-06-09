import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { AnnualReviewFinancialAnalysisSnapshot } from './annualReviewFinancialTypes';

interface Props {
  snapshot: AnnualReviewFinancialAnalysisSnapshot;
}

/**
 * Phase 141O — Annual review financial & covenant panel (read-only).
 *
 * Displays the evidence-backed financial analysis: readiness, key spread
 * metrics, covenant test results (as findings), evidence references, blockers,
 * and board/FDIC readiness caveats. There is NO approve-credit / waive-covenant /
 * override / send / upload affordance. It loads no data and writes nothing.
 */
export function AnnualReviewFinancialCovenantPanel({ snapshot }: Props) {
  return (
    <Card>
      <CardHeader title="Financial & covenant analysis" subtitle={label(snapshot.overallFinancialReadiness)} />

      <dl style={metaStyle}>
        <Row label="Readiness" value={label(snapshot.overallFinancialReadiness)} />
        <Row label="Spread status" value={label(snapshot.spreadStatus)} />
        <Row label="Covenant status" value={label(snapshot.covenantStatus)} />
        <Row label="Board package" value={snapshot.boardPackageReady ? 'Draft-ready (caveats apply)' : 'Not ready'} />
        <Row label="FDIC package" value={snapshot.fdicPackageReady ? 'Draft-ready (caveats apply)' : 'Not ready'} />
      </dl>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Key metrics</span>
        {snapshot.keyMetrics.length === 0 ? (
          <span style={noneStyle}>No spread metrics available.</span>
        ) : (
          <ul style={ulStyle}>
            {snapshot.keyMetrics.map((m) => (
              <li key={m.metricKey} style={itemStyle}>
                {m.label}: {m.status === 'available' && m.value !== null ? `${m.value} (${m.unit})` : `unknown (${m.status})`}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Covenant findings</span>
        {snapshot.covenantResults.length === 0 ? (
          <span style={noneStyle}>No covenants resolved for testing.</span>
        ) : (
          <ul style={ulStyle}>
            {snapshot.covenantResults.map((r) => (
              <li key={r.covenantId} style={r.status === 'fail' ? blockerItemStyle : itemStyle}>
                {r.label}: {r.status} — {r.result}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Evidence references</span>
        <span style={itemStyle}>
          {snapshot.evidenceSummary.factIds.length} fact(s), {snapshot.evidenceSummary.documentIds.length} document(s)
        </span>
      </div>

      {snapshot.primaryBlockers.length > 0 && (
        <div style={sectionStyle}>
          <span style={blockerTitleStyle}>Blockers</span>
          <ul style={ulStyle}>
            {snapshot.primaryBlockers.map((b, i) => (
              <li key={i} style={blockerItemStyle}>{b.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Memo readiness</span>
        <ul style={ulStyle}>
          {snapshot.memoReadySections.map((s) => (
            <li key={s.key} style={itemStyle}>{s.title}: {s.draftReady ? 'draft-ready' : 'not ready'}</li>
          ))}
        </ul>
      </div>

      <CardFooter>
        <span>
          Read-only analysis. No credit decision, covenant waiver, or borrower outreach occurs here.
          {snapshot.nextBestActions[0] ? ` Next: ${snapshot.nextBestActions[0].label}` : ''}
        </span>
      </CardFooter>
    </Card>
  );
}

function label(s: string): string {
  return s.replace(/_/g, ' ');
}

function Row({ label: l, value }: { label: string; value: string | undefined }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{l}</dt>
      <dd style={ddStyle}>{value ?? 'Not set'}</dd>
    </div>
  );
}

const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 140, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const blockerTitleStyle: CSSProperties = { ...sectionTitleStyle, color: palette.blockedFg };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
