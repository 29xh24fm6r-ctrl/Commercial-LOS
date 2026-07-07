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
 *   - a unified-readiness header (the CRM-B model) — the single source of readiness truth,
 *     reconciling the live identity-gated CRM Hub with the flag-gated spine, and
 *   - the built read-only CRM intelligence cockpit below it.
 *
 * Read-only: renders status + intelligence only. Live create/edit stay in the identity-gated
 * CRM Hub; this route never performs a write. There is no second readiness story.
 */
export function CrmCommandCenterRoute() {
  const readiness = deriveUnifiedCrmReadiness();
  const blocked = readiness.dimensions.filter((d) => d.status === 'blocked');

  return (
    <div style={rootStyle}>
      <header style={headerStyle}>
        <h2 style={titleStyle}>CRM Command Center</h2>
        <p style={subtitleStyle}>
          Unified CRM readiness — the live identity-gated CRM Hub and the flag-gated spine, one story.
          Live create and edit happen in the CRM Hub (Banker workspace); this routed surface is read-only.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Team readiness"
          subtitle={
            readiness.teamReady
              ? 'CRM is team-ready across all dimensions.'
              : `${readiness.readyCount}/${readiness.totalCount} readiness dimensions ready — ${blocked.length} outstanding.`
          }
        />
        <ul style={listStyle}>
          {readiness.dimensions.map((d) => (
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
