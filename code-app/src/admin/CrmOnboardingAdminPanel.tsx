import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  CRM_ADMIN_CONNECTOR_MODE,
  CRM_LIVE_PERSISTENCE_DEFAULT,
  CRM_ONBOARDING_DISABLED_REASON,
  CRM_ONBOARDING_NEXT_STEPS,
  CRM_ONBOARDING_NO_RECORD_NOTE,
  CRM_ONBOARDING_READINESS,
  CRM_ONBOARDING_REQUIRED_DATA_GROUPS,
} from './adminCrmOnboardingModel';

/**
 * Phase 169E -- Admin CRM Onboarding panel (readiness / onboarding).
 *
 * Case B surface: the CRM stack is present but live persistence is disabled
 * by default and the external connector is disabled_by_default, so this
 * panel shows readiness, the required data groups, the disabled-by-default
 * reason, and the safe next steps. Every action (create / import / sync) is
 * a disabled placeholder. No record is created and no external sync occurs.
 * Rendered only inside the authorized branch of AdminOperationsConsole, so
 * it inherits the admin route gate.
 */
export function CrmOnboardingAdminPanel() {
  const liveEnabled = CRM_LIVE_PERSISTENCE_DEFAULT;
  const connectorEnabled = CRM_ADMIN_CONNECTOR_MODE !== 'disabled_by_default';
  return (
    <section
      style={styles.wrap}
      aria-label="CRM Onboarding"
      data-admin-crm-onboarding="panel"
    >
      <header style={styles.head}>
        <div style={styles.titleRow}>
          <h3 style={styles.title}>CRM Onboarding</h3>
          <Badge variant={liveEnabled ? 'clear' : 'neutral'} appearance="outline">
            {liveEnabled ? 'Live persistence ON' : 'Disabled by default'}
          </Badge>
        </div>
        <p style={styles.subtitle}>
          Onboard CRM organizations, people, contacts, and relationships. The
          CRM stack is present, but live persistence is disabled by default and
          no record is created or synced here.
        </p>
      </header>

      <div style={styles.note} role="note" data-admin-crm-disabled-reason>
        <strong>Disabled by default.</strong> {CRM_ONBOARDING_DISABLED_REASON}
      </div>

      <div style={styles.connectorRow} data-admin-crm-connector>
        <span style={styles.sectionTitle}>External CRM connector</span>
        <Badge variant={connectorEnabled ? 'clear' : 'neutral'} appearance="outline">
          {connectorEnabled ? CRM_ADMIN_CONNECTOR_MODE : 'Not configured (disabled by default)'}
        </Badge>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Readiness</div>
        <ul style={styles.readinessList} data-admin-crm-readiness>
          {CRM_ONBOARDING_READINESS.map((item) => (
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
        <div style={styles.sectionTitle}>Required onboarding data groups</div>
        <ul style={styles.groupGrid} data-admin-crm-data-groups>
          {CRM_ONBOARDING_REQUIRED_DATA_GROUPS.map((g) => (
            <li key={g.id} style={styles.groupTile}>
              <div style={styles.groupLabel}>{g.label}</div>
              <div style={styles.groupDesc}>{g.description}</div>
            </li>
          ))}
        </ul>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Next safe steps</div>
        <ol style={styles.steps} data-admin-crm-next-steps>
          {CRM_ONBOARDING_NEXT_STEPS.map((s) => (
            <li key={s.order} style={styles.stepRow}>
              <strong>{s.title}.</strong> {s.detail}
            </li>
          ))}
        </ol>
      </div>

      <div style={styles.actions}>
        <DisabledAction label="CRM create disabled" id="create" />
        <DisabledAction label="CRM import disabled" id="import" />
        <DisabledAction label="CRM sync disabled" id="sync" />
      </div>
      <p style={styles.footnote} data-admin-crm-no-record-note>
        {CRM_ONBOARDING_NO_RECORD_NOTE} No borrower outreach, upload links, or
        external sync occur in this phase.
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
      title={CRM_ONBOARDING_DISABLED_REASON}
      aria-label={label}
      data-admin-crm-action={id}
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
  connectorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
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
