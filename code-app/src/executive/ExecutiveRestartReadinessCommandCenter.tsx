import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import {
  deriveExecutiveRestartReadinessModel,
  type ExecutiveRestartState,
} from './executiveRestartReadinessModel';

const BADGE_BY_STATE: Record<ExecutiveRestartState, 'clear' | 'neutral' | 'atRisk'> = {
  operating: 'clear',
  'gated-activation': 'neutral',
  blocked: 'atRisk',
};

const OVERALL_LABEL: Record<ExecutiveRestartState, string> = {
  operating: 'Operating readiness',
  'gated-activation': 'Gated activation',
  blocked: 'Blocked',
};

export function ExecutiveRestartReadinessCommandCenter() {
  const vm = deriveExecutiveRestartReadinessModel();

  return (
    <section
      aria-label="Executive Restart Readiness Command Center"
      data-executive-restart-readiness-command-center
    >
      <Card accentColor={palette.cobalt}>
        <CardHeader
          title={vm.title}
          subtitle={vm.subtitle}
          trailing={<Badge variant={BADGE_BY_STATE[vm.overallState]}>{OVERALL_LABEL[vm.overallState]}</Badge>}
        />

        <p style={styles.posture}>{vm.restartPosture}</p>

        <div style={styles.grid}>
          {vm.domains.map((domain) => (
            <article key={domain.id} style={styles.domain} data-restart-domain={domain.id}>
              <div style={styles.domainHead}>
                <h3 style={styles.domainTitle}>{domain.label}</h3>
                <Badge variant={BADGE_BY_STATE[domain.state]}>{domain.headline}</Badge>
              </div>
              <p style={styles.summary}>{domain.detail}</p>
            </article>
          ))}
        </div>

        <div style={styles.twoCol}>
          <section style={styles.panel} aria-label="Gated activation categories">
            <h3 style={styles.panelTitle}>Gated activation categories</h3>
            <ul style={styles.list}>
              {vm.gatedActivationCategories.map((category) => (
                <li key={category}>{category}</li>
              ))}
            </ul>
          </section>

          <section style={styles.panel} aria-label="Leadership assurances">
            <h3 style={styles.panelTitle}>Leadership assurances</h3>
            <ul style={styles.list}>
              {vm.leadershipAssurances.map((assurance) => (
                <li key={assurance}>{assurance}</li>
              ))}
            </ul>
          </section>
        </div>

        <CardFooter>
          <span>No hidden writes are enabled by this restart readiness view.</span>
          <span>No external Salesforce or nCino dependency is implied.</span>
        </CardFooter>
      </Card>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  posture: {
    fontSize: typography.size.md,
    color: palette.textMuted,
    margin: 0,
    marginBottom: spacing.lg,
    maxWidth: 1100,
    lineHeight: typography.lineHeight.snug,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
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
  summary: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    margin: 0,
    lineHeight: typography.lineHeight.snug,
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
    color: palette.text,
    margin: 0,
    paddingLeft: spacing.lg,
  },
};
