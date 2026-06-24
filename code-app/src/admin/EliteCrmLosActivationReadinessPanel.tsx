import type { CSSProperties } from 'react';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';
import {
  deriveEliteCrmLosActivationReadiness,
  type EliteReadinessState,
} from './eliteCrmLosActivationReadinessModel';

const STATE_SEVERITY: Record<EliteReadinessState, SeverityKey> = {
  ready: 'clear',
  gated: 'neutral',
  blocked: 'atRisk',
};

export function EliteCrmLosActivationReadinessPanel() {
  const vm = deriveEliteCrmLosActivationReadiness();

  return (
    <section
      aria-label="Elite CRM and LOS full activation readiness"
      data-elite-crm-los-activation-readiness
      style={styles.wrap}
    >
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Phase 231</div>
          <h2 style={styles.title}>{vm.title}</h2>
        </div>
        <Badge state={vm.goLiveState}>{vm.goLiveState === 'ready' ? 'Go-live ready' : vm.goLiveState === 'gated' ? 'Gated readiness' : 'Blocked'}</Badge>
      </header>

      <p style={styles.posture}>{vm.posture}</p>

      <div style={styles.grid}>
        {vm.domains.map((domain) => (
          <article key={domain.id} style={styles.card} data-elite-domain={domain.id}>
            <div style={styles.cardHead}>
              <h3 style={styles.cardTitle}>{domain.label}</h3>
              <Badge state={domain.state}>{domain.state}</Badge>
            </div>
            <p style={styles.summary}>{domain.summary}</p>
            <ul style={styles.evidence}>
              {domain.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <div style={styles.next}>
              <strong>Next action:</strong> {domain.nextAction}
            </div>
          </article>
        ))}
      </div>

      <div style={styles.columns}>
        <section style={styles.panel} aria-label="Remaining blockers">
          <h3 style={styles.panelTitle}>Remaining gated items</h3>
          <ul style={styles.list}>
            {vm.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>

        <section style={styles.panel} aria-label="Operator actions">
          <h3 style={styles.panelTitle}>Operator actions</h3>
          <ul style={styles.list}>
            {vm.operatorActions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      </div>

      <footer style={styles.footer}>
        {vm.certifications.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </footer>
    </section>
  );
}

function Badge({ state, children }: { state: EliteReadinessState; children: React.ReactNode }) {
  const severity = STATE_SEVERITY[state];
  const color =
    severity === 'clear'
      ? palette.clear
      : severity === 'atRisk'
        ? palette.atRisk
        : palette.neutral;
  return (
    <span
      style={{
        ...styles.badge,
        borderColor: color.border,
        color: color.text,
        background: color.background,
      }}
    >
      {children}
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder ?? palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  eyebrow: {
    ...typography.overline,
    color: palette.textMuted,
  },
  title: {
    ...typography.h2,
    margin: 0,
  },
  posture: {
    ...typography.body,
    margin: 0,
    color: palette.textMuted,
    maxWidth: 980,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: spacing.md,
  },
  card: {
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: spacing.md,
    background: palette.panel,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  cardHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  cardTitle: {
    ...typography.h3,
    margin: 0,
  },
  summary: {
    ...typography.bodySmall,
    color: palette.textMuted,
    margin: 0,
  },
  evidence: {
    ...typography.caption,
    margin: 0,
    paddingLeft: spacing.lg,
    color: palette.text,
  },
  next: {
    ...typography.caption,
    color: palette.text,
    borderTop: `1px solid ${palette.border}`,
    paddingTop: spacing.sm,
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: spacing.md,
  },
  panel: {
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: spacing.md,
    background: palette.panel,
  },
  panelTitle: {
    ...typography.h3,
    marginTop: 0,
  },
  list: {
    ...typography.bodySmall,
    margin: 0,
    paddingLeft: spacing.lg,
  },
  footer: {
    ...typography.caption,
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm,
    color: palette.textMuted,
    borderTop: `1px solid ${palette.border}`,
    paddingTop: spacing.md,
  },
  badge: {
    ...typography.caption,
    border: '1px solid',
    borderRadius: radius.full,
    padding: '0.2rem 0.55rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  },
};