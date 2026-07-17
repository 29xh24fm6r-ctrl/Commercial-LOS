import type { CSSProperties } from 'react';
import { palette, spacing, typography } from '../../shared/theme';
import { Card, CardHeader } from '../../shared/Card';
import { CrmCommandCenter } from './CrmCommandCenter';
import { deriveUnifiedCrmReadiness } from '../readiness/unifiedCrmReadiness';

/**
 * CRM-C — routed CRM Command Center entry.
 *
 * The single standalone CRM destination (mounted at /surfaces/crm-command-center) for
 * authorized team users — so CRM no longer lives only as the hidden crm-hub BankerShell
 * tab. It tells ONE honest story:
 *   - a team-readiness header — the single source of readiness truth, and
 *   - the built read-only CRM intelligence cockpit below it (external sync status).
 *
 * Read-only: renders status + intelligence only. Live create/edit stay in the CRM Hub;
 * this route never performs a write. There is no second readiness story.
 *
 * Factory Arc Phase 12: `audience` controls which readiness dimensions are visible.
 * The `certification-attribution` dimension is release/launch-evidence attribution
 * data (see crmCertificationAttribution.ts), not a CRM operating fact a banker/team/
 * manager needs — it is shown only when `audience === 'admin'`. Non-admin counts are
 * computed from the filtered dimension list so the subtitle never overclaims (or
 * underclaims) based on a dimension the viewer can't see.
 */
export function CrmCommandCenterRoute({ audience = 'team' }: { audience?: 'team' | 'admin' }) {
  const readiness = deriveUnifiedCrmReadiness();
  const dimensions =
    audience === 'admin'
      ? readiness.dimensions
      : readiness.dimensions.filter((d) => d.key !== 'certification-attribution');
  const readyCount = dimensions.filter((d) => d.status === 'ready').length;
  const totalCount = dimensions.length;
  const teamReady = readyCount === totalCount;
  const blocked = dimensions.filter((d) => d.status === 'blocked');

  return (
    <div style={rootStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>CRM Command Center</h2>
        <p style={subtitleStyle}>
          Team CRM readiness and external sync status. Live create and edit happen in the CRM Hub
          (Banker workspace); this routed surface is read-only.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Team readiness"
          subtitle={
            teamReady
              ? 'CRM is team-ready across all dimensions.'
              : `${readyCount}/${totalCount} readiness dimensions ready — ${blocked.length} outstanding.`
          }
        />
        <ul style={listStyle}>
          {dimensions.map((d) => (
            <li key={d.key} style={rowStyle}>
              <span style={badgeStyle(d.status === 'ready')}>{d.status === 'ready' ? 'READY' : 'BLOCKED'}</span>
              <span style={labelStyle}>{d.label}</span>
              <span style={detailStyle}>{d.detail}</span>
            </li>
          ))}
        </ul>
      </Card>

      <CrmCommandCenter />
    </div>
  );
}

const rootStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.lg,
  padding: spacing.xl,
  background: palette.pageBg,
  minHeight: '100vh',
};
const headerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs };
const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.xl,
  fontWeight: typography.weight.bold,
  color: palette.text,
  letterSpacing: typography.letterSpacing.heading,
};
const subtitleStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs };
const rowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 320px 1fr', gap: spacing.md, alignItems: 'baseline', padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const labelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const detailStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
function badgeStyle(ok: boolean): CSSProperties {
  return {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.label,
    color: ok ? palette.clear : palette.blocked,
    minWidth: 64,
  };
}
