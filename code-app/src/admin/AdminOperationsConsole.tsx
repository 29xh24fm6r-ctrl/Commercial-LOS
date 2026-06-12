import type { CSSProperties } from 'react';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import { useAdmin } from './AdminContext';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { UserAccessManagementPanel } from './UserAccessManagementPanel';
import { NewDealIntakePanel } from './NewDealIntakePanel';
import { PortfolioBoardingAdminPanel } from './PortfolioBoardingAdminPanel';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';
import {
  ADMIN_CONSOLE_MODULES,
  ADMIN_CONSOLE_SECURITY_DISCLAIMER,
  isAdminConsoleAuthorized,
  type AdminConsoleModule,
  type AdminConsoleModuleStatus,
} from './adminOperationsConsoleModel';

/**
 * Phase 169A -- Admin Operations Console (read-only shell).
 *
 * A governed, admin-only status surface for the administrative workflows
 * the team needs (user/access, new-deal intake, portfolio boarding, CRM
 * onboarding, security roles). Phase 169A is READ-ONLY: every module
 * renders its honest status, blocker, and next safe step, and every
 * action is a disabled placeholder. No writes, no Dataverse calls, no
 * network access, no fabricated data.
 *
 * Authorization: the surrounding AdminWorkspace is already gated by
 * WorkspaceGate. This component re-derives admin authorization from the
 * bootstrap-resolved route and fails closed if it cannot be proven.
 */
export function AdminOperationsConsole() {
  const { route } = useBootstrap();
  const { writeDisabledReason } = useAdmin();

  if (!isAdminConsoleAuthorized(route)) {
    return (
      <section
        style={styles.deniedWrap}
        role="alert"
        aria-label="Admin Operations Console access denied"
        data-admin-ops-console="denied"
      >
        <div style={styles.deniedTitle}>Admin access could not be verified</div>
        <p style={styles.deniedBody}>
          The Operations Console is available only to administrators. Your
          session did not resolve to the admin workspace, so this surface is
          closed. No administrative data is shown.
        </p>
      </section>
    );
  }

  return (
    <section
      style={styles.wrap}
      aria-label="Admin Operations Console"
      data-admin-ops-console="ready"
    >
      <header style={styles.head}>
        <div style={styles.eyebrow}>Commercial Lending · Administration</div>
        <h2 style={styles.title}>Operations Console</h2>
        <p style={styles.subtitle}>
          Add people, grant app-level rights, and onboard deals, portfolio
          loans, and CRM records. Read-only in this release: each module shows
          its current status and the next safe step. No write actions are
          enabled yet.
        </p>
      </header>

      <div style={styles.disclaimer} role="note" data-admin-ops-disclaimer>
        <strong>App-level only.</strong> {ADMIN_CONSOLE_SECURITY_DISCLAIMER}
        {writeDisabledReason ? (
          <>
            {' '}
            Write attribution is currently unavailable: {writeDisabledReason}
          </>
        ) : null}
      </div>

      <div style={styles.grid} data-admin-ops-grid>
        {ADMIN_CONSOLE_MODULES.map((module) => (
          <ModuleCard key={module.id} module={module} />
        ))}
      </div>

      <UserAccessManagementPanel />
      <NewDealIntakePanel />
      <PortfolioBoardingAdminPanel />
    </section>
  );
}

function ModuleCard({ module }: { module: AdminConsoleModule }) {
  const tone = STATUS_TONE[module.status];
  return (
    <Card accentColor={undefined} style={styles.card}>
      <CardHeader
        title={module.title}
        trailing={
          <Badge variant={tone.variant} appearance="outline">
            {tone.label}
          </Badge>
        }
      />
      <div style={styles.cardBody}>
        <p style={styles.statusLine}>{module.statusLine}</p>
        <dl style={styles.detailList}>
          <div style={styles.detailRow}>
            <dt style={styles.detailLabel}>Blocker</dt>
            <dd style={styles.detailValue}>{module.blocker}</dd>
          </div>
          <div style={styles.detailRow}>
            <dt style={styles.detailLabel}>Next safe step</dt>
            <dd style={styles.detailValue}>{module.nextStep}</dd>
          </div>
        </dl>
        <button
          type="button"
          disabled
          aria-disabled="true"
          style={styles.disabledAction}
          title="Not yet available. Live write surfaces arrive in a later, separately-gated phase."
          aria-label={`${module.title}: management not yet available`}
          data-admin-ops-action={module.id}
        >
          Manage (not yet available)
        </button>
      </div>
    </Card>
  );
}

const STATUS_TONE: Record<
  AdminConsoleModuleStatus,
  { label: string; variant: SeverityKey }
> = {
  'read-only': { label: 'Read-only', variant: 'neutral' },
  blocked: { label: 'Blocked', variant: 'atRisk' },
  disabled: { label: 'Disabled', variant: 'neutral' },
  preview: { label: 'Info', variant: 'neutral' },
};

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
    marginBottom: spacing.lg,
  },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.primary,
    fontWeight: typography.weight.semibold,
  },
  title: {
    margin: 0,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.heading,
  },
  subtitle: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.snug,
    maxWidth: 760,
  },
  disclaimer: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: spacing.lg,
  },
  card: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: `${spacing.md} 0 0`,
  },
  statusLine: {
    margin: 0,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  detailList: { margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm },
  detailRow: { display: 'flex', flexDirection: 'column', gap: 2 },
  detailLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  detailValue: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  disabledAction: {
    alignSelf: 'flex-start',
    marginTop: 'auto',
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
  deniedWrap: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
    marginBottom: spacing.lg,
  },
  deniedTitle: {
    fontWeight: typography.weight.semibold,
    color: palette.text,
    fontSize: typography.size.lg,
  },
  deniedBody: {
    margin: `${spacing.xs} 0 0`,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
    maxWidth: 620,
  },
};
