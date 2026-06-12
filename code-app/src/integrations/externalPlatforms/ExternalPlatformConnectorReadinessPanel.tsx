import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { ConnectorReadinessResult } from './externalPlatformConnectorReadiness';

interface Props {
  result: ConnectorReadinessResult;
}

/**
 * Phase 150 — External Platform Connector Readiness (read-only).
 *
 * Shows connector readiness status, blockers, warnings, and next step.
 * No write affordance. No vendor names. No live connection attempt.
 */
export function ExternalPlatformConnectorReadinessPanel({ result }: Props) {
  return (
    <Card>
      <CardHeader
        title="External Platform Connector Readiness"
        subtitle={`Status: ${result.status.replace(/_/g, ' ')}`}
      />

      <div style={bannerStyle}>
        Read-only readiness assessment — no live connection, credential storage, or external system change occurs here.
      </div>

      <dl style={metaStyle}>
        <Row label="Status" value={result.status.replace(/_/g, ' ')} />
        <Row label="Live connection attempted" value={String(result.liveConnectionAttempted)} />
        <Row label="Live write performed" value={String(result.liveWritePerformed)} />
        <Row label="Credentials stored in code" value={String(result.credentialsStoredInCode)} />
        <Row label="External system changed" value={String(result.externalSystemChanged)} />
        <Row label="Proof ID" value={result.readinessProofId} />
        <Row label="Next step" value={result.nextOperatorStep} />
      </dl>

      {result.blockers.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionTitleStyle}>Blockers</span>
          <ul style={listStyle}>
            {result.blockers.map((b, i) => (
              <li key={i} style={itemStyle}>{b}</li>
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
        <span>Read-only connector readiness panel. No external platform connection or write is initiated from this surface.</span>
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
