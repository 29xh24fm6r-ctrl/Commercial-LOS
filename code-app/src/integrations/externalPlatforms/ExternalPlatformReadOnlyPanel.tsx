import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { ReadOnlyAdapterResult } from './externalPlatformReadOnlyAdapter';

interface Props {
  result: ReadOnlyAdapterResult | undefined;
}

/**
 * Phase 151 — External Platform Read-Only Pull (read-only).
 *
 * Shows read-only pull status, records, and audit summary.
 * No write affordance. No vendor names. No live write.
 */
export function ExternalPlatformReadOnlyPanel({ result }: Props) {
  if (!result) {
    return (
      <Card>
        <CardHeader title="External Platform Read-Only Pull" />
        <div style={bannerStyle}>Read-only connector not configured.</div>
        <CardFooter>
          <span>No external data pull is active. This surface is display-only.</span>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="External Platform Read-Only Pull"
        subtitle={`Status: ${result.status.replace(/_/g, ' ')}`}
      />

      <div style={bannerStyle}>
        Read-only pull — no write, update, or delete occurs against the external platform from this surface.
      </div>

      <dl style={metaStyle}>
        <Row label="Status" value={result.status.replace(/_/g, ' ')} />
        <Row label="Live read performed" value={String(result.liveReadPerformed)} />
        <Row label="Live write performed" value={String(result.liveWritePerformed)} />
        <Row label="External system changed" value={String(result.externalSystemChanged)} />
        <Row label="Record count" value={String(result.records.length)} />
        <Row label="Audit summary" value={result.auditSummary} />
      </dl>

      {result.records.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Records</span>
          <ul style={listStyle}>
            {result.records.map((r, i) => (
              <li key={i} style={itemStyle}>
                {r.displayName ?? r.externalRecordLabel} — {r.entityKind.replace(/_/g, ' ')} ({r.sourceConfidence})
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Warnings</span>
          <ul style={listStyle}>
            {result.warnings.map((w, i) => (
              <li key={i} style={itemStyle}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <CardFooter>
        <span>Read-only external pull panel. No external platform write or mutation is initiated from this surface.</span>
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
