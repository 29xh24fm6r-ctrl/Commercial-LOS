import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { ExternalEntityMatchResult } from './externalEntityMatchAgainstLiveRecords';

interface Props {
  result: ExternalEntityMatchResult;
}

/**
 * Phase 152 — External Entity Match Review (read-only).
 *
 * Shows match status, candidates, conflicts, and recommended step.
 * No auto-link. No write affordance. No vendor names.
 */
export function ExternalEntityMatchReviewPanel({ result }: Props) {
  return (
    <Card>
      <CardHeader
        title="External Entity Match Review"
        subtitle={`Status: ${result.matchStatus.replace(/_/g, ' ')}`}
      />

      <div style={bannerStyle}>
        Read-only match review — no auto-link, merge, or external write occurs from this surface.
      </div>

      <dl style={metaStyle}>
        <Row label="Match status" value={result.matchStatus.replace(/_/g, ' ')} />
        <Row label="Confidence" value={result.confidenceBand} />
        <Row label="Candidates" value={String(result.candidateRows.length)} />
        <Row label="Conflicts" value={String(result.conflicts.length)} />
        <Row label="Auto-linked" value={String(result.autoLinked)} />
        <Row label="External system changed" value={String(result.externalSystemChanged)} />
        <Row label="Recommended step" value={result.recommendedReviewStep} />
      </dl>

      {result.candidateRows.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Candidates</span>
          <ul style={listStyle}>
            {result.candidateRows.map((c, i) => (
              <li key={i} style={itemStyle}>
                {c.displayName ?? c.externalRecordLabel} — {c.confidenceBand} ({c.matchReason})
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.conflicts.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Conflicts</span>
          <ul style={listStyle}>
            {result.conflicts.map((c, i) => (
              <li key={i} style={itemStyle}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <CardFooter>
        <span>Read-only entity match review. No link, merge, or external platform mutation is initiated from this surface.</span>
      </CardFooter>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value}</dd>
    </>
  );
}

const bannerStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textMuted,
  padding: `${spacing.xs} ${spacing.sm}`,
  background: palette.surfaceSubtle,
  borderRadius: 4,
};

const metaStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: `${spacing.xxs} ${spacing.md}`,
  fontSize: typography.size.sm,
  color: palette.text,
  margin: 0,
};

const dtStyle: CSSProperties = {
  fontWeight: typography.weight.medium,
  color: palette.textMuted,
};

const ddStyle: CSSProperties = {
  margin: 0,
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xxs,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: typography.size.xs,
  fontWeight: typography.weight.semibold,
  color: palette.textMuted,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: spacing.lg,
  fontSize: typography.size.sm,
};

const itemStyle: CSSProperties = {
  color: palette.text,
};
