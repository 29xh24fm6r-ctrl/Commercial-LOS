import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import {
  deriveBankerOperatingCommandCenterModel,
  type BankerOperatingDomainState,
} from './bankerOperatingCommandCenterModel';

const BADGE_BY_STATE: Record<BankerOperatingDomainState, 'clear' | 'neutral' | 'atRisk'> = {
  operational: 'clear',
  review: 'neutral',
  gated: 'atRisk',
};

export function BankerOperatingCommandCenter() {
  const vm = deriveBankerOperatingCommandCenterModel();

  return (
    <section aria-label="Banker Operating Command Center" data-banker-operating-command-center>
      <Card accentColor={palette.cobalt}>
        <CardHeader
          title={vm.title}
          subtitle={vm.subtitle}
          trailing={<Badge variant="clear">CRM + LOS active</Badge>}
        />

        <p style={styles.posture}>{vm.posture}</p>

        <div style={styles.grid}>
          {vm.domains.map((domain) => (
            <article key={domain.id} style={styles.domain} data-operating-domain={domain.id}>
              <div style={styles.domainHead}>
                <h3 style={styles.domainTitle}>{domain.label}</h3>
                <Badge variant={BADGE_BY_STATE[domain.state]}>{domain.state}</Badge>
              </div>
              <div style={styles.value} data-domain-value>{domain.value}</div>
              <p style={styles.summary}>{domain.summary}</p>
              <p style={styles.next}>
                <strong>Next:</strong> {domain.nextAction}
              </p>
            </article>
          ))}
        </div>

        <div style={styles.twoCol}>
          <section style={styles.panel} aria-label="Today banker actions">
            <h3 style={styles.panelTitle}>Today banker actions</h3>
            <ul style={styles.list}>
              {vm.todayActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </section>

          <section style={styles.panel} aria-label="Deal cockpit anchors">
            <h3 style={styles.panelTitle}>Deal cockpit anchors</h3>
            <ul style={styles.list}>
              {vm.dealCockpitAnchors.map((anchor) => (
                <li key={anchor}>{anchor}</li>
              ))}
            </ul>
          </section>
        </div>

        <CardFooter>
          {vm.certifications.map((cert) => (
            <span key={cert}>{cert}</span>
          ))}
        </CardFooter>
      </Card>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  posture: {
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.snug,
    color: palette.textMuted,
    margin: 0,
    marginBottom: spacing.lg,
    maxWidth: 1100,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: spacing.md,
  },
  domain: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    padding: spacing.md,
  },
  domainHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  domainTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    margin: 0,
  },
  value: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: palette.cobalt,
  },
  summary: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    margin: 0,
  },
  next: {
    fontSize: typography.size.xs,
    color: palette.text,
    margin: 0,
    borderTop: `1px solid ${palette.panelBorder}`,
    paddingTop: spacing.sm,
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  panel: {
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  panelTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    marginTop: 0,
  },
  list: {
    fontSize: typography.size.sm,
    margin: 0,
    paddingLeft: spacing.lg,
  },
};