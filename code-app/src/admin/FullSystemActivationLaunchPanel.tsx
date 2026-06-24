import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import {
  deriveFullActivationLaunchCertification,
  type ActivationStatus,
} from './fullActivationLaunchCertificationModel';

const BADGE_BY_STATUS: Record<ActivationStatus, 'clear' | 'neutral' | 'atRisk'> = {
  enabled: 'clear',
  'ready-to-enable': 'neutral',
  blocked: 'atRisk',
};

const STATUS_LABEL: Record<ActivationStatus, string> = {
  enabled: 'Enabled',
  'ready-to-enable': 'Ready to enable',
  blocked: 'Blocked',
};

export function FullSystemActivationLaunchPanel() {
  const vm = deriveFullActivationLaunchCertification();

  return (
    <section aria-label="Full System Activation Launch Certification" data-full-system-activation-launch>
      <Card accentColor={palette.cobalt}>
        <CardHeader
          title={vm.title}
          subtitle={vm.subtitle}
          trailing={
            <Badge variant={vm.fullLaunchAchieved ? 'clear' : 'atRisk'}>
              {vm.fullLaunchAchieved
                ? 'Full launch achieved'
                : `Full launch not achieved · ${vm.enabledCount}/${vm.domains.length} enabled`}
            </Badge>
          }
        />

        <p style={styles.posture}>{vm.posture}</p>

        <div style={styles.grid}>
          {vm.domains.map((domain) => (
            <article key={domain.id} style={styles.domain} data-activation-domain={domain.id}>
              <div style={styles.domainHead}>
                <h3 style={styles.domainTitle}>{domain.label}</h3>
                <Badge variant={BADGE_BY_STATUS[domain.status]}>{STATUS_LABEL[domain.status]}</Badge>
              </div>
              <div style={styles.classRow}>
                <span style={styles.classTag} data-activation-classification={domain.classification}>
                  {domain.classification}
                </span>
                <span style={styles.flagState}>
                  {domain.flagNames[0]}: {domain.flagEnabled ? 'enabled' : 'gated'}
                </span>
              </div>

              <div style={styles.block}>
                <span style={styles.blockLabel}>Certification evidence</span>
                <ul style={styles.list}>
                  {domain.evidencePresent.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>

              <div style={styles.block}>
                <span style={styles.blockLabel}>Blockers</span>
                <ul style={styles.list}>
                  {domain.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>

              <p style={styles.next}>
                <strong>Next operator action:</strong> {domain.unblockActions[0]}
              </p>
            </article>
          ))}
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
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
  classRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  classTag: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
    color: palette.cobalt,
  },
  flagState: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
  },
  block: { display: 'flex', flexDirection: 'column', gap: 2 },
  blockLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: palette.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
  },
  list: {
    fontSize: typography.size.sm,
    color: palette.text,
    margin: 0,
    paddingLeft: spacing.lg,
  },
  next: {
    fontSize: typography.size.xs,
    color: palette.text,
    margin: 0,
    borderTop: `1px solid ${palette.panelBorder}`,
    paddingTop: spacing.sm,
  },
};
