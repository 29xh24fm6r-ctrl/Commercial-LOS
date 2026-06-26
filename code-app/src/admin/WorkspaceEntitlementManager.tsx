import { useEffect, useState, type CSSProperties } from 'react';
import { useAdmin } from './AdminContext';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  loadWorkspaceEntitlementData,
  type EntitlementUserRow,
  type WorkspaceEntitlementData,
  type WorkspaceOption,
} from './adminWorkspaceEntitlementManagement';
import {
  changePrimaryWorkspace,
  buildLiveChangeWorkspaceDeps,
  type ChangeWorkspaceInput,
  type ChangeWorkspaceOutcome,
} from './workspaceEntitlementWrite';

/**
 * Phase 257 — governed workspace-entitlement management.
 *
 * Replaces the static, read-only workspace display with a governed dropdown
 * per app user. Options come from real workspace records; applying a change
 * runs the governed write adapter (resolved-actor audit, Dataverse update,
 * readback verification, Succeeded/Failed audit). Fail-closed: the controls
 * are disabled when no Dataverse write identity is available, and every
 * non-success outcome is surfaced honestly (never reported as applied).
 */

type PerformChange = (input: ChangeWorkspaceInput) => Promise<ChangeWorkspaceOutcome>;

async function defaultPerformChange(input: ChangeWorkspaceInput): Promise<ChangeWorkspaceOutcome> {
  return changePrimaryWorkspace(input, buildLiveChangeWorkspaceDeps());
}

interface Props {
  /** Injected for tests; defaults to the live governed read. */
  loadData?: () => Promise<WorkspaceEntitlementData>;
  /** Injected for tests; defaults to the live governed write. */
  performChange?: PerformChange;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: WorkspaceEntitlementData }
  | { kind: 'failed'; message: string };

type RowStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; outcome: ChangeWorkspaceOutcome };

export function WorkspaceEntitlementManager({
  loadData = loadWorkspaceEntitlementData,
  performChange = defaultPerformChange,
}: Props = {}) {
  const { fullName, upn, systemUserId, writeDisabledReason } = useAdmin();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, RowStatus>>({});

  const writeEnabled = !writeDisabledReason && Boolean(systemUserId);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadData()
      .then((data) => {
        if (cancelled) return;
        setState({ kind: 'ready', data });
        const initial: Record<string, string> = {};
        for (const u of data.users) {
          if (u.currentWorkspaceId) initial[u.id] = u.currentWorkspaceId;
        }
        setSelection(initial);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function onApply(user: EntitlementUserRow, workspaces: readonly WorkspaceOption[]) {
    const targetId = selection[user.id];
    const target = workspaces.find((w) => w.id === targetId);
    if (!target) return;
    setStatus((s) => ({ ...s, [user.id]: { kind: 'saving' } }));
    const outcome = await performChange({
      platformUserId: user.id,
      userDisplayName: user.fullName,
      targetWorkspaceId: target.id,
      targetWorkspaceName: target.name,
      actorEmail: upn,
      actorSystemUserId: systemUserId,
      authorized: writeEnabled,
    });
    setStatus((s) => ({ ...s, [user.id]: { kind: 'done', outcome } }));
    if (outcome.kind === 'success') {
      // Reflect the verified new value locally.
      setState((prev) => {
        if (prev.kind !== 'ready') return prev;
        return {
          kind: 'ready',
          data: {
            workspaces: prev.data.workspaces,
            users: prev.data.users.map((u) =>
              u.id === user.id ? { ...u, currentWorkspaceId: target.id } : u,
            ),
          },
        };
      });
    }
  }

  return (
    <section style={styles.wrap} aria-label="Workspace entitlement management" data-admin-workspace-entitlement="manager">
      <header style={styles.head}>
        <h3 style={styles.title}>Workspace entitlement</h3>
        <p style={styles.subtitle}>
          Set each user's primary workspace. Changes are governed: attributed to
          you, written to Dataverse, verified by readback, and audited.
        </p>
      </header>

      {!writeEnabled && (
        <div style={styles.disabledNote} role="note" data-entitlement-write-disabled>
          <strong>Read-only:</strong>{' '}
          {writeDisabledReason ??
            'No Dataverse identity is available for your session, so entitlement changes are disabled.'}
        </div>
      )}

      {state.kind === 'loading' && <div style={styles.muted}>Loading users…</div>}
      {state.kind === 'failed' && (
        <div style={styles.failNote} role="alert" data-entitlement-load-failure>
          Workspace entitlement data is not available. {state.message} Refresh to retry.
        </div>
      )}

      {state.kind === 'ready' && state.data.users.length === 0 && (
        <div style={styles.muted}>No app-level users found.</div>
      )}

      {state.kind === 'ready' && state.data.users.length > 0 && (
        <table style={styles.table} data-entitlement-table>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Primary workspace</th>
              <th style={styles.th}>Apply</th>
            </tr>
          </thead>
          <tbody>
            {state.data.users.map((u) => {
              const rowStatus = status[u.id] ?? { kind: 'idle' };
              const selected = selection[u.id] ?? '';
              const dirty = selected.length > 0 && selected !== (u.currentWorkspaceId ?? '');
              return (
                <tr key={u.id}>
                  <td style={styles.td}>{u.fullName}</td>
                  <td style={styles.td}>{u.email}</td>
                  <td style={styles.td}>
                    <select
                      style={styles.select}
                      aria-label={`Primary workspace for ${u.fullName}`}
                      data-entitlement-select={u.id}
                      value={selected}
                      disabled={!writeEnabled || rowStatus.kind === 'saving'}
                      onChange={(e) =>
                        setSelection((s) => ({ ...s, [u.id]: e.target.value }))
                      }
                    >
                      <option value="" disabled>
                        Select workspace…
                      </option>
                      {state.data.workspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={styles.td}>
                    <button
                      type="button"
                      style={!writeEnabled || !dirty || rowStatus.kind === 'saving' ? styles.applyDisabled : styles.apply}
                      disabled={!writeEnabled || !dirty || rowStatus.kind === 'saving'}
                      data-entitlement-save={u.id}
                      onClick={() => void onApply(u, state.data.workspaces)}
                    >
                      {rowStatus.kind === 'saving' ? 'Applying…' : 'Apply'}
                    </button>
                    <OutcomeLine userId={u.id} status={rowStatus} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function OutcomeLine({ userId, status }: { userId: string; status: RowStatus }) {
  if (status.kind !== 'done') return null;
  const o = status.outcome;
  if (o.kind === 'success') {
    return (
      <div style={styles.ok} role="status" data-entitlement-outcome={userId} data-entitlement-result="success">
        <Badge variant="clear" appearance="outline">Applied</Badge>{' '}
        Primary workspace set to {o.workspaceName}. Verified and audited (ref {o.correlationId}).
      </div>
    );
  }
  return (
    <div style={styles.err} role="alert" data-entitlement-outcome={userId} data-entitlement-result={o.kind}>
      {describeFailure(o)}
    </div>
  );
}

function describeFailure(o: Exclude<ChangeWorkspaceOutcome, { kind: 'success' }>): string {
  switch (o.kind) {
    case 'unauthorized':
      return `Not applied — ${o.reason}`;
    case 'identity-unresolved':
      return `Not applied — ${o.reason}`;
    case 'invalid-input':
      return `Not applied — ${o.reason}`;
    case 'write-failed':
      return `Not applied — the change could not be written. ${o.error}`;
    case 'readback-mismatch':
      return 'Not applied — the change did not verify on readback. No confirmed change; please retry.';
    case 'audit-failed':
      return 'The workspace was changed but its audit record failed — an operator must reattempt the audit. This is not a clean success.';
    default:
      return o.message;
  }
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
  },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  disabledNote: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
  muted: { color: palette.textMuted, fontSize: typography.size.sm, fontStyle: 'italic', padding: `${spacing.sm} 0` },
  failNote: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.borderStrong}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm },
  th: {
    textAlign: 'left',
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.textSubtle,
    textTransform: 'uppercase',
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    borderBottom: `1px solid ${palette.divider}`,
  },
  td: { padding: `${spacing.sm} ${spacing.sm}`, color: palette.text, borderBottom: `1px solid ${palette.divider}`, verticalAlign: 'top' },
  select: {
    padding: `${spacing.xs} ${spacing.sm}`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    fontFamily: typography.family,
    background: palette.surface,
    color: palette.text,
    minWidth: 200,
  },
  apply: {
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
  applyDisabled: {
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
  ok: { marginTop: spacing.xs, color: palette.text, fontSize: typography.size.xs, lineHeight: typography.lineHeight.snug },
  err: { marginTop: spacing.xs, color: palette.atRisk, fontSize: typography.size.xs, lineHeight: typography.lineHeight.snug },
};
