import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { DryRunWritebackPlanResult } from './externalDryRunWritebackPlan';

interface Props {
  result: DryRunWritebackPlanResult;
}

/**
 * Phase 154 — External Dry-Run Writeback Validation (read-only).
 *
 * Shows validation status, allowed/blocked fields, and proof ID.
 * No write affordance. No vendor names. Dry-run only.
 */
export function ExternalDryRunWritebackPanel({ result }: Props) {
  return (
    <Card>
      <CardHeader
        title="External Dry-Run Writeback Validation"
        subtitle={`Status: ${result.overallStatus.replace(/_/g, ' ')}`}
      />

      <div style={bannerStyle}>
        Dry-run validation only — no live write, transport call, or external system change occurs here.
      </div>

      <dl style={metaStyle}>
        <Row label="Dry run only" value={String(result.dryRunOnly)} />
        <Row label="Live write performed" value={String(result.liveWritePerformed)} />
        <Row label="External system changed" value={String(result.externalSystemChanged)} />
        <Row label="Allowed fields" value={String(result.allowedCount)} />
        <Row label="Blocked fields" value={String(result.blockedCount)} />
        <Row label="Status" value={result.overallStatus.replace(/_/g, ' ')} />
        <Row label="Proof ID" value={result.proofId} />
      </dl>

      {result.planRows.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Field plan</span>
          <ul style={listStyle}>
            {result.planRows.map((r, i) => (
              <li key={i} style={itemStyle}>
                {r.fieldKey} — {r.status} ({r.reason})
              </li>
            ))}
          </ul>
        </div>
      )}

      <CardFooter>
        <span>Read-only dry-run validation panel. No external platform write or mutation is initiated from this surface.</span>
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
