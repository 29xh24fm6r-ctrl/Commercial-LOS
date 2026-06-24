import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import {
  deriveV1GoLiveReleaseCertification,
  type CertGateStatus,
} from './v1GoLiveReleaseCertificationModel';

const BADGE_BY_STATUS: Record<CertGateStatus, 'clear' | 'neutral' | 'atRisk'> = {
  green: 'clear',
  gated: 'neutral',
  'verify-required': 'atRisk',
};

const STATUS_LABEL: Record<CertGateStatus, string> = {
  green: 'green',
  gated: 'gated',
  'verify-required': 'verify',
};

export function V1GoLiveReleaseCertificationPanel() {
  const vm = deriveV1GoLiveReleaseCertification();

  return (
    <section aria-label="V1.0 Go-Live Release Certification" data-v1-go-live-release-certification>
      <Card accentColor={palette.cobalt}>
        <CardHeader
          title={vm.title}
          subtitle={vm.subtitle}
          trailing={
            <Badge variant={vm.operatingRestartReady ? 'clear' : 'atRisk'}>
              {vm.operatingRestartReady ? 'Operating restart ready' : 'Verify required'}
            </Badge>
          }
        />

        <p style={styles.statement}>{vm.restartStatement}</p>

        <div style={styles.postureRow}>
          <span style={styles.postureItem} data-cert-posture="operating-restart">
            <Badge variant={vm.operatingRestartReady ? 'clear' : 'atRisk'} appearance="outline">
              {vm.operatingRestartReady ? 'Ready for operating restart' : 'Operating restart: verify'}
            </Badge>
          </span>
          <span style={styles.postureItem} data-cert-posture="live-mutation">
            <Badge variant={vm.liveMutationExpansionReady ? 'atRisk' : 'neutral'} appearance="outline">
              {vm.liveMutationExpansionReady
                ? 'Live mutation expansion: enabled'
                : 'Live-write expansion gated'}
            </Badge>
          </span>
        </div>

        <div style={styles.grid}>
          {vm.gates.map((gate) => (
            <article key={gate.id} style={styles.gate} data-cert-gate={gate.id}>
              <div style={styles.gateHead}>
                <h3 style={styles.gateTitle}>{gate.label}</h3>
                <Badge variant={BADGE_BY_STATUS[gate.status]}>{STATUS_LABEL[gate.status]}</Badge>
              </div>
              <p style={styles.gateDetail}>{gate.detail}</p>
            </article>
          ))}
        </div>

        <section style={styles.panel} aria-label="Intentionally gated live-write categories">
          <h3 style={styles.panelTitle}>
            Intentionally gated live-write categories ({vm.gatedLiveWriteCategories.length})
          </h3>
          <ul style={styles.list}>
            {vm.gatedLiveWriteCategories.map((category) => (
              <li key={category}>{category}</li>
            ))}
          </ul>
          <p style={styles.note}>
            Operator action queue active — {vm.operatorActionsOpen} open operator action
            {vm.operatorActionsOpen === 1 ? '' : 's'} remain before any live gate is cleared.
          </p>
        </section>

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
  statement: {
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.snug,
    color: palette.textMuted,
    margin: 0,
    marginBottom: spacing.md,
    maxWidth: 1100,
  },
  postureRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  postureItem: { display: 'inline-flex' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: spacing.md,
  },
  gate: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    padding: spacing.md,
  },
  gateHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  gateTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    margin: 0,
  },
  gateDetail: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    margin: 0,
    lineHeight: typography.lineHeight.snug,
  },
  panel: {
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
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
  note: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    margin: 0,
    marginTop: spacing.sm,
  },
};
