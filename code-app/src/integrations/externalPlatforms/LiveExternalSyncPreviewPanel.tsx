import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { LiveSyncPreviewResult } from './liveExternalSyncPreview';

interface Props {
  result: LiveSyncPreviewResult;
}

/**
 * Phase 153 — External Sync Preview (read-only).
 *
 * Shows preview operations, blocked rows, and next step.
 * No write affordance. No vendor names. Preview only.
 */
export function LiveExternalSyncPreviewPanel({ result }: Props) {
  return (
    <Card>
      <CardHeader
        title="External Sync Preview"
        subtitle="Preview only — no sync executed"
      />

      <div style={bannerStyle}>
        Preview-only surface — no record creation, update, link, or external system change occurs here.
      </div>

      <dl style={metaStyle}>
        <Row label="Preview only" value={String(result.previewOnly)} />
        <Row label="Live read used" value={String(result.liveReadUsed)} />
        <Row label="Live write performed" value={String(result.liveWritePerformed)} />
        <Row label="External system changed" value={String(result.externalSystemChanged)} />
        <Row label="Operations" value={String(result.operationRows.length)} />
        <Row label="Blocked rows" value={String(result.blockedRows.length)} />
        <Row label="Next review step" value={result.nextReviewStep} />
      </dl>

      {result.operationRows.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Operations</span>
          <ul style={listStyle}>
            {result.operationRows.map((r, i) => (
              <li key={i} style={itemStyle}>
                {r.entityLabel} — {r.operation.replace(/_/g, ' ')} ({r.reason})
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.blockedRows.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Blocked rows</span>
          <ul style={listStyle}>
            {result.blockedRows.map((r, i) => (
              <li key={i} style={itemStyle}>
                {r.entityLabel} — {r.blockerReason ?? r.reason}
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
        <span>Read-only sync preview panel. No external platform record is created, updated, or linked from this surface.</span>
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
