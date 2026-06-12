import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../../shared/Card';
import { palette, spacing, typography } from '../../shared/theme';
import type { AllowlistedWritePilotResult } from './externalAllowlistedWritePilot';

interface Props {
  result: AllowlistedWritePilotResult;
}

/**
 * Phase 155 — External Write Pilot (Disabled) (read-only).
 *
 * Shows pilot status, allowed/blocked counts, and next activation gate.
 * No write affordance. No vendor names. Disabled by default.
 */
export function ExternalAllowlistedWritePilotPanel({ result }: Props) {
  return (
    <Card>
      <CardHeader
        title="External Write Pilot (Disabled)"
        subtitle={`Status: ${result.status.replace(/_/g, ' ')}`}
      />

      <div style={bannerStyle}>
        Write pilot is disabled. No live write, push, or external system mutation occurs from this surface.
      </div>

      <dl style={metaStyle}>
        <Row label="Status" value={result.status.replace(/_/g, ' ')} />
        <Row label="Live write pilot enabled" value={String(result.liveWritePilotEnabled)} />
        <Row label="Live write performed" value={String(result.liveWritePerformed)} />
        <Row label="External system changed" value={String(result.externalSystemChanged)} />
        <Row label="Allowed fields" value={String(result.allowedFieldCount)} />
        <Row label="Blocked fields" value={String(result.blockedFieldCount)} />
        <Row label="Proof ID" value={result.pilotProofId} />
        <Row label="Next activation gate" value={result.nextActivationGate} />
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
        <span>Write pilot is disabled by default. No external platform write or mutation is initiated from this surface.</span>
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
