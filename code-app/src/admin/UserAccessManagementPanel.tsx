import { useEffect, useState, type CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  loadAdminUserAccessSummary,
  type AdminUserAccessSummary,
} from './adminUserAccessQueries';
import {
  ADMIN_ACCESS_LEVELS,
  USER_ACCESS_SCOPE_DISCLAIMER,
  USER_ACCESS_WRITE_BLOCKER,
} from './adminUserAccessModel';
import {
  formatAdminAccessLevel,
  formatProfileReference,
  formatSafeReadWorkspaceName,
} from './adminUserAccessDisplay';
import { WorkspaceEntitlementManager } from './WorkspaceEntitlementManager';

/**
 * Phase 204N — read-only detail polish. The console explains WHY workspace/profile
 * display names are blank (safe-read contract), shows access levels as friendly
 * label + raw option-set value, and surfaces profile GUIDs honestly. No query
 * select list changed; no write path added.
 */
const SAFE_READ_EXPLANATION =
  'Workspace and profile display names are intentionally not selected from Dataverse. ' +
  'This console uses the live-safe entitlement fields only and shows raw profile IDs where available.';

const PHASE_204N_READONLY_NOTE =
  'Grant access is still disabled. This phase improves read-only visibility only. ' +
  'A future governed-write phase must add authorization, audit, correlation ID, ' +
  'fail-closed outcome handling, and a controlled single-record smoke test before ' +
  'any access grant can be created here.';

/**
 * Phase 169B -- User & Access Management panel (read-only + preview).
 *
 * Renders the real app-level user / workspace-entitlement records
 * (read-only), an always-visible app-level-vs-platform-security
 * disclaimer, and a PREVIEW-ONLY grant form whose submit is disabled
 * with the exact blocker. No live write is performed in this phase.
 *
 * This panel is rendered only inside the already admin-gated, authorized
 * branch of AdminOperationsConsole, so it inherits the route gate.
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; summary: AdminUserAccessSummary }
  | { kind: 'failed'; message: string };

export function UserAccessManagementPanel() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadAdminUserAccessSummary()
      .then((summary) => {
        if (!cancelled) setState({ kind: 'ready', summary });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      style={styles.wrap}
      aria-label="User and Access Management"
      data-admin-user-access="panel"
    >
      <header style={styles.head}>
        <h3 style={styles.title}>User &amp; Access Management</h3>
        <p style={styles.subtitle}>
          Existing LOS app-level users and workspace entitlements. Read-only in
          this release.
        </p>
      </header>

      <div style={styles.disclaimer} role="note" data-admin-user-access-disclaimer>
        <strong>App-level only.</strong> {USER_ACCESS_SCOPE_DISCLAIMER}
      </div>

      <SummaryCounts state={state} />
      {state.kind === 'failed' && (
        <div style={styles.failNote} role="alert" data-admin-user-access-failure>
          User &amp; Access data is not available. {failureCategory(state.message)} Refresh to retry.
        </div>
      )}
      <UsersTable state={state} />
      <EntitlementsTable state={state} />
      <WorkspaceEntitlementManager />
      <GrantAccessPreviewForm />
    </section>
  );
}

function SummaryCounts({ state }: { state: LoadState }) {
  return (
    <div style={styles.countRow} data-admin-user-access-counts>
      <CountTile
        label="App users"
        value={state.kind === 'ready' ? String(state.summary.userCount) : notAvailable(state)}
      />
      <CountTile
        label="Workspace entitlements"
        value={
          state.kind === 'ready'
            ? String(state.summary.entitlementCount)
            : notAvailable(state)
        }
      />
    </div>
  );
}

function notAvailable(state: LoadState): string {
  return state.kind === 'loading' ? 'Loading…' : 'Not available';
}

/**
 * Phase 204M — derive a SANITIZED failure category from the labeled read error so
 * the operator sees which read failed (platform-user vs entitlement) without any
 * raw payload. The labels are produced by loadAdminUserAccessSummary.
 */
function failureCategory(message: string): string {
  if (/platform-user read failed/i.test(message)) return 'Platform-user read failed.';
  if (/entitlement read failed/i.test(message)) return 'Entitlement read failed.';
  return 'Read failed.';
}

function CountTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.countTile}>
      <div style={styles.countLabel}>{label}</div>
      <div style={styles.countValue}>{value}</div>
    </div>
  );
}

function UsersTable({ state }: { state: LoadState }) {
  if (state.kind !== 'ready') {
    return (
      <div style={styles.muted} data-admin-user-access-users="unavailable">
        {state.kind === 'loading'
          ? 'Loading users…'
          : 'User list is not available. Refresh to retry.'}
      </div>
    );
  }
  if (state.summary.users.length === 0) {
    return <div style={styles.muted}>No app-level users found.</div>;
  }
  return (
    <table style={styles.table} data-admin-user-access-users="table">
      <thead>
        <tr>
          <th style={styles.th}>Name</th>
          <th style={styles.th}>Email</th>
          <th style={styles.th}>Primary workspace</th>
          <th style={styles.th}>Status</th>
        </tr>
      </thead>
      <tbody>
        {state.summary.users.map((u) => (
          <tr key={u.id}>
            <td style={styles.td}>{u.fullName}</td>
            <td style={styles.td}>{u.email}</td>
            <td style={styles.td}>{u.primaryWorkspaceName ?? 'Not selected'}</td>
            <td style={styles.td}>
              <Badge variant={u.active ? 'clear' : 'neutral'} appearance="outline">
                {u.active ? 'Active' : 'Inactive'}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EntitlementsTable({ state }: { state: LoadState }) {
  if (state.kind !== 'ready') return null;
  return (
    <>
      <div style={styles.safeReadNote} role="note" data-admin-user-access-safe-read-note>
        {SAFE_READ_EXPLANATION}
      </div>
      {state.summary.entitlements.length === 0 ? (
        <div style={styles.muted}>No workspace entitlement records found.</div>
      ) : (
        <table style={styles.table} data-admin-user-access-entitlements="table">
          <thead>
            <tr>
              <th style={styles.th}>Entitlement</th>
              <th style={styles.th}>Access level</th>
              <th style={styles.th}>Profile link</th>
              <th style={styles.th}>Workspace display</th>
            </tr>
          </thead>
          <tbody>
            {state.summary.entitlements.map((e) => (
              <tr key={e.id}>
                <td style={styles.td}>{e.entitlementName}</td>
                <td style={styles.td} data-admin-entitlement-access>
                  {formatAdminAccessLevel(e.accessLevel)}
                </td>
                <td style={styles.td} data-admin-entitlement-profile>
                  {formatProfileReference(e.profileName)}
                </td>
                <td style={styles.td} data-admin-entitlement-workspace>
                  {formatSafeReadWorkspaceName(e.workspaceName)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/**
 * Preview-only grant form. Inputs are editable so an admin can see the
 * required data, but submit is disabled and the exact blocker is shown.
 * No state is written anywhere.
 */
function GrantAccessPreviewForm() {
  return (
    <div style={styles.formWrap} data-admin-user-access-grant="preview">
      <div style={styles.formTitle}>Add user / grant access (preview)</div>
      <div style={styles.formGrid}>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Email / UPN</span>
          <input
            type="email"
            style={styles.input}
            placeholder="person@oldglorybank.com"
            data-admin-grant-field="email"
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Full name</span>
          <input
            type="text"
            style={styles.input}
            placeholder="Full name"
            data-admin-grant-field="fullName"
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Workspace to grant</span>
          <input
            type="text"
            style={styles.input}
            placeholder="Banker Workspace"
            data-admin-grant-field="workspace"
          />
        </label>
        <label style={styles.field}>
          <span style={styles.fieldLabel}>Access level</span>
          <select style={styles.input} data-admin-grant-field="accessLevel" defaultValue="ReadOnly">
            {ADMIN_ACCESS_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        disabled
        aria-disabled="true"
        style={styles.disabledSubmit}
        title={USER_ACCESS_WRITE_BLOCKER}
        aria-label="Grant access (not yet available)"
        data-admin-grant-submit
      >
        Grant access (not yet available)
      </button>
      <p style={styles.blocker} data-admin-user-access-blocker>
        <strong>Blocker:</strong> {USER_ACCESS_WRITE_BLOCKER}
      </p>
      <p style={styles.blocker} data-admin-user-access-readonly-note>
        {PHASE_204N_READONLY_NOTE}
      </p>
      <p style={styles.roleNotice} data-admin-user-access-role-notice>
        Dataverse security roles must be managed in the Power Platform admin
        center. This form would only manage LOS app-level entitlements.
      </p>
    </div>
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
  disclaimer: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  countRow: { display: 'flex', gap: spacing.md, flexWrap: 'wrap' },
  countTile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: `${spacing.sm} ${spacing.lg}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    minWidth: 160,
  },
  countLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  countValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    fontVariantNumeric: 'tabular-nums',
    color: palette.text,
  },
  muted: {
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
    padding: `${spacing.sm} 0`,
  },
  failNote: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  safeReadNote: {
    color: palette.textMuted,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.snug,
    fontStyle: 'italic',
    padding: `${spacing.xs} 0`,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: typography.size.sm,
  },
  th: {
    textAlign: 'left',
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.textSubtle,
    textTransform: 'uppercase',
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    borderBottom: `1px solid ${palette.divider}`,
  },
  td: {
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    borderBottom: `1px solid ${palette.divider}`,
  },
  formWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  formTitle: {
    fontWeight: typography.weight.semibold,
    color: palette.text,
    fontSize: typography.size.md,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: spacing.md,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 2 },
  fieldLabel: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  input: {
    padding: `${spacing.xs} ${spacing.sm}`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    fontFamily: typography.family,
    background: palette.surface,
    color: palette.text,
  },
  disabledSubmit: {
    alignSelf: 'flex-start',
    background: palette.surface,
    color: palette.textSubtle,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'not-allowed',
  },
  blocker: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  roleNotice: {
    margin: 0,
    color: palette.textSubtle,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.snug,
  },
};
