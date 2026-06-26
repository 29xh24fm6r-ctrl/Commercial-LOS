import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  PORTFOLIO_BOARDING_DISABLED_REASON,
  PORTFOLIO_BOARDING_LIVE_PERSISTENCE_DEFAULT,
  PORTFOLIO_BOARDING_NEXT_STEPS,
  PORTFOLIO_BOARDING_NO_RECORD_NOTE,
  PORTFOLIO_BOARDING_READINESS,
  PORTFOLIO_BOARDING_REQUIRED_DATA_GROUPS,
} from './adminPortfolioBoardingModel';

/**
 * Phase 169D / 257 -- Admin Portfolio Boarding panel (readiness / onboarding).
 *
 * Internal portfolio boarding is active through governed Dataverse persistence
 * (Phase 256B flipped the live-persistence flag on after the GO smoke). Boarding
 * and servicing happen in the Portfolio workspace, not this console, so the
 * action here is a direct link to that workspace. If the flag is ever turned
 * off the panel falls back to the honest disabled-by-default state. Rendered
 * only inside the authorized branch of AdminOperationsConsole.
 */
export function PortfolioBoardingAdminPanel() {
  const liveEnabled = PORTFOLIO_BOARDING_LIVE_PERSISTENCE_DEFAULT;
  return (
    <section
      style={styles.wrap}
      aria-label="Portfolio Boarding"
      data-admin-portfolio-boarding="panel"
    >
      <header style={styles.head}>
        <div style={styles.titleRow}>
          <h3 style={styles.title}>Portfolio Boarding</h3>
          <Badge variant={liveEnabled ? 'clear' : 'neutral'} appearance="outline">
            {liveEnabled ? 'Active' : 'Disabled by default'}
          </Badge>
        </div>
        <p style={styles.subtitle}>
          {liveEnabled
            ? 'Board and service closed / legacy loans into the LOS. Internal portfolio boarding is active through governed, audited Dataverse persistence; boarding is performed from the Portfolio workspace.'
            : 'Load / board portfolio loans. The boarding stack is present, but live persistence is disabled by default and no record is created here.'}
        </p>
      </header>

      <div style={styles.note} role="note" data-admin-portfolio-status-note>
        {liveEnabled ? (
          <>
            <strong>Active.</strong> Internal portfolio boarding writes are
            governed and audited. No external boarding sync is enabled; runtime
            writes additionally require an authorized operator and verified state.
          </>
        ) : (
          <>
            <strong>Disabled by default.</strong> {PORTFOLIO_BOARDING_DISABLED_REASON}
          </>
        )}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Readiness</div>
        <ul style={styles.readinessList} data-admin-portfolio-readiness>
          {PORTFOLIO_BOARDING_READINESS.map((item) => (
            <li key={item.label} style={styles.readinessRow}>
              <Badge variant={item.present ? 'clear' : 'neutral'} appearance="outline">
                {item.present ? 'Present' : 'Off'}
              </Badge>
              <span>
                <strong>{item.label}.</strong> {item.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Required data groups</div>
        <ul style={styles.groupGrid} data-admin-portfolio-data-groups>
          {PORTFOLIO_BOARDING_REQUIRED_DATA_GROUPS.map((g) => (
            <li key={g.id} style={styles.groupTile}>
              <div style={styles.groupLabel}>{g.label}</div>
              <div style={styles.groupDesc}>{g.description}</div>
            </li>
          ))}
        </ul>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Next safe steps</div>
        <ol style={styles.steps} data-admin-portfolio-next-steps>
          {PORTFOLIO_BOARDING_NEXT_STEPS.map((s) => (
            <li key={s.order} style={styles.stepRow}>
              <strong>{s.title}.</strong> {s.detail}
            </li>
          ))}
        </ol>
      </div>

      <div style={styles.actions}>
        {liveEnabled ? (
          <a
            href={WORKSPACE_ROUTES.manager}
            style={styles.manageLink}
            data-admin-portfolio-action="open"
            aria-label="Open Portfolio workspace"
          >
            Open Portfolio workspace
          </a>
        ) : (
          <>
            <DisabledAction label="Portfolio create disabled" id="create" />
            <DisabledAction label="Import disabled" id="import" />
            <DisabledAction label="Document upload disabled" id="upload" />
          </>
        )}
      </div>
      <p style={styles.footnote} data-admin-portfolio-no-record-note>
        {liveEnabled
          ? 'Boarding, import, and document upload are performed from the Portfolio workspace, not this console. No external boarding sync is enabled.'
          : `${PORTFOLIO_BOARDING_NO_RECORD_NOTE} No document upload is available unless the upload adapter is present and explicitly gated.`}
      </p>
    </section>
  );
}

function DisabledAction({ label, id }: { label: string; id: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      style={styles.disabledAction}
      title={PORTFOLIO_BOARDING_DISABLED_REASON}
      aria-label={label}
      data-admin-portfolio-action={id}
    >
      {label}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
    marginBottom: spacing.lg,
  },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  titleRow: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  title: {
    margin: 0,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: palette.text,
  },
  subtitle: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  note: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  section: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  sectionTitle: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  readinessList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  readinessRow: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'baseline',
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  groupGrid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: spacing.sm,
  },
  groupTile: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  groupLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  groupDesc: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  steps: {
    margin: 0,
    paddingLeft: spacing.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  stepRow: { paddingLeft: spacing.xs },
  actions: { display: 'flex', gap: spacing.sm, flexWrap: 'wrap' },
  manageLink: {
    background: palette.primary,
    color: palette.surface,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    textDecoration: 'none',
    display: 'inline-block',
  },
  disabledAction: {
    background: palette.surfaceAlt,
    color: palette.textSubtle,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'not-allowed',
  },
  footnote: {
    margin: 0,
    color: palette.textSubtle,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.snug,
  },
};
