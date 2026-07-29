import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, spacing, typography, type SeverityKey } from '../shared/theme';
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
          <div style={styles.eyebrow}>Activation readiness</div>
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
  const tone = severityPalette[STATE_SEVERITY[state]];
  return (
    <span
      style={{
        ...styles.badge,
        borderColor: tone.bar,
        color: tone.fg,
        background: tone.bg,
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
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textMuted,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    margin: 0,
  },
  posture: {
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.snug,
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
    background: palette.panelBg,
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
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    margin: 0,
  },
  summary: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    margin: 0,
  },
  evidence: {
    fontSize: typography.size.xs,
    margin: 0,
    paddingLeft: spacing.lg,
    color: palette.text,
  },
  next: {
    fontSize: typography.size.xs,
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
    background: palette.panelBg,
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
  footer: {
    fontSize: typography.size.xs,
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm,
    color: palette.textMuted,
    borderTop: `1px solid ${palette.border}`,
    paddingTop: spacing.md,
  },
  badge: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    border: '1px solid',
    borderRadius: radius.pill,
    padding: '0.2rem 0.55rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  },
};
