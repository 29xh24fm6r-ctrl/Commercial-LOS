import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import { useEntitledRoutes } from '../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { useAdmin } from './AdminContext';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { UserAccessManagementPanel } from './UserAccessManagementPanel';
import { NewDealIntakePanel } from './NewDealIntakePanel';
import { PortfolioBoardingAdminPanel } from './PortfolioBoardingAdminPanel';
import { CrmOnboardingAdminPanel } from './CrmOnboardingAdminPanel';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';
import {
  ADMIN_CONSOLE_MODULES,
  ADMIN_CONSOLE_SECURITY_DISCLAIMER,
  isAdminConsoleAuthorized,
  type AdminConsoleModule,
  type AdminConsoleModuleStatus,
} from './adminOperationsConsoleModel';

/**
 * Phase 169A -- Admin Operations Console (originally a read-only shell).
 *
 * A governed, admin-only status surface for the administrative workflows
 * the team needs (user/access, new-deal intake, portfolio boarding, CRM
 * onboarding, security roles). Every module renders its honest status,
 * blocker, and next safe step.
 *
 * Factory Arc Phase 15 -- corrected a stale claim: at Phase 169A every
 * action here really was a disabled placeholder with no writes. Phase 257
 * wired four of the five modules to real, already-proven governed write
 * paths (UserAccessManagementPanel's workspace-entitlement control,
 * NewDealIntakePanel, PortfolioBoardingAdminPanel, CrmOnboardingAdminPanel --
 * each links out to the live workspace where the actual governed, audited
 * write happens, per adminOperationsConsoleModel.ts's `manage` field). This
 * component itself still renders no fabricated data and performs no writes
 * directly -- only `security-roles` stays a true read-only placeholder
 * (external to this app, by design). See
 * docs/factory-arc/PR127_ADMIN_OPERATIONALIZATION.md.
 *
 * Authorization: the surrounding AdminWorkspace is already gated by
 * WorkspaceGate. This component re-derives admin authorization from the
 * bootstrap-resolved route and fails closed if it cannot be proven.
 */
export function AdminOperationsConsole() {
  const { route } = useBootstrap();
  // Phase 204 Ã¢â‚¬â€ admin is authorized when it is the primary route OR the user
  // holds a confirmed Admin-workspace entitlement (the same probe that let
  // WorkspaceGate admit them). Fail-closed: anything but `entitled` omits it.
  const adminEntitled = useEntitledRoutes().routes.includes(WORKSPACE_ROUTES.admin);
  const { writeDisabledReason } = useAdmin();

  if (!isAdminConsoleAuthorized(route, adminEntitled)) {
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
          Manage app-level access, deals, portfolio loans, and CRM. Each module
          shows its current status and where to manage it.
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
      <CrmOnboardingAdminPanel />
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
            <dt style={styles.detailLabel}>{module.status === 'preview' ? 'Limitation' : 'Scope'}</dt>
            <dd style={styles.detailValue}>{module.blocker}</dd>
          </div>
          <div style={styles.detailRow}>
            <dt style={styles.detailLabel}>How to manage</dt>
            <dd style={styles.detailValue}>{module.nextStep}</dd>
          </div>
        </dl>
        <ManageAffordance module={module} />
      </div>
    </Card>
  );
}

function ManageAffordance({ module }: { module: AdminConsoleModule }) {
  const m = module.manage;
  if (m.kind === 'external') {
    return (
      <span
        style={styles.manageExternal}
        data-admin-ops-action={module.id}
        data-admin-ops-manage="external"
      >
        {m.label}
      </span>
    );
  }
  // Remediation 2026-07-22 (Workstream C) — `route` kind must use the router's <Link>, not a raw
  // <a href>: a plain anchor forces a full browser navigation to that path, which the Power Apps
  // Code App host does not serve the SPA shell for, surfacing a raw RouteNotFound response instead
  // of navigating in-app (confirmed root cause of "Open Banker Workspace" breaking out of the
  // host). `in-console` stays a same-page hash anchor — that one is a real in-page jump, not a
  // route change, so it's safe as plain <a href="#...">.
  if (m.kind === 'route') {
    return (
      <Link
        to={m.route}
        style={styles.manageLink}
        data-admin-ops-action={module.id}
        data-admin-ops-manage={m.kind}
        aria-label={`${module.title}: ${m.label}`}
      >
        {m.label}
      </Link>
    );
  }
  return (
    <a
      href={`#${m.anchor}`}
      style={styles.manageLink}
      data-admin-ops-action={module.id}
      data-admin-ops-manage={m.kind}
      aria-label={`${module.title}: ${m.label}`}
    >
      {m.label}
    </a>
  );
}

const STATUS_TONE: Record<
  AdminConsoleModuleStatus,
  { label: string; variant: SeverityKey }
> = {
  active: { label: 'Active', variant: 'clear' },
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
  enabledAction: {
    alignSelf: 'flex-start',
    marginTop: 'auto',
    background: palette.primary,
    color: palette.surface,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'pointer',
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
  manageLink: {
    alignSelf: 'flex-start',
    marginTop: 'auto',
    background: palette.primary,
    color: palette.surface,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    textDecoration: 'none',
    cursor: 'pointer',
    display: 'inline-block',
  },
  manageExternal: {
    alignSelf: 'flex-start',
    marginTop: 'auto',
    color: palette.textSubtle,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
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
