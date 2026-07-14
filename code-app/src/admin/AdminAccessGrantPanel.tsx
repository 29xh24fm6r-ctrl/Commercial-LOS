import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAdmin } from './AdminContext';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  loadCurrentAdminAccessTier,
  listAdminEntitlementRows,
  listGrantablePlatformUsers,
  type AdminAccessTier,
  type AdminEntitlementListRow,
  type PlatformUserOption,
} from './adminAccessGrantLookup';
import {
  writeAdminAccessGrant,
  buildLiveAdminAccessGrantDeps,
  type GrantableAccessLevel,
  type AdminAccessGrantOutcome,
} from './adminAccessGrantWrite';

/**
 * Admin → Grant / Revoke Admin Access.
 *
 * Of the five workspaces, Admin is the only one whose additional access is
 * actually checked anywhere in the app (see adminAccessGrantWrite.ts) — so
 * this is the meaningful "add a user to Admin" control, distinct from
 * creating a brand-new platform-user identity (still an external, operator
 * provisioning step; see the guidance above this panel).
 *
 * Only an admin whose OWN entitlement is Admin-tier (not just Full) can
 * grant or revoke here; a Full-tier admin sees an explanatory read-only
 * banner. An admin can never revoke their own access through this panel.
 */
export function AdminAccessGrantPanel() {
  const { upn, fullName, systemUserId, writeDisabledReason } = useAdmin();
  const identityOk = !!systemUserId && !writeDisabledReason;

  const [tier, setTier] = useState<{ kind: 'loading' } | { kind: 'ready'; tier: AdminAccessTier; message?: string }>({ kind: 'loading' });
  const [users, setUsers] = useState<readonly PlatformUserOption[]>([]);
  const [rows, setRows] = useState<readonly AdminEntitlementListRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<GrantableAccessLevel>('Full');
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AdminAccessGrantOutcome | null>(null);

  const reload = useCallback(() => {
    listAdminEntitlementRows().then((r) => {
      if (r.success) {
        setRows([...(r.rows ?? [])]);
        setRowsError(null);
      } else {
        setRows(null);
        setRowsError(r.error ?? 'Could not load current admin access.');
      }
    });
  }, []);

  useEffect(() => {
    if (!identityOk) return;
    let cancelled = false;
    loadCurrentAdminAccessTier(upn, fullName).then((r) => {
      if (cancelled) return;
      setTier({ kind: 'ready', tier: r.tier, message: r.message });
      if (r.tier === 'admin') {
        listGrantablePlatformUsers().then((u) => {
          if (!cancelled && u.success) setUsers([...(u.rows ?? [])]);
        });
        reload();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identityOk, upn, fullName, reload]);

  const grant = useCallback(async () => {
    const target = users.find((u) => u.id === selectedUserId);
    if (!target) return;
    setBusy('grant');
    setOutcome(null);
    const result = await writeAdminAccessGrant(
      {
        action: { kind: 'grant', targetPlatformUserId: target.id, targetUpn: target.upn, targetFullName: target.fullName, accessLevel: selectedLevel },
        actorEmail: upn,
        actorFullName: fullName,
        actorSystemUserId: systemUserId,
        actorAccessTier: tier.kind === 'ready' ? tier.tier : 'failed',
        authorized: true,
      },
      buildLiveAdminAccessGrantDeps(),
    );
    setOutcome(result);
    setBusy(null);
    if (result.kind === 'success') {
      setSelectedUserId('');
      reload();
    }
  }, [users, selectedUserId, selectedLevel, upn, fullName, systemUserId, tier, reload]);

  const revoke = useCallback(
    async (row: AdminEntitlementListRow) => {
      setBusy(row.id);
      setOutcome(null);
      const result = await writeAdminAccessGrant(
        {
          action: { kind: 'revoke', entitlementId: row.id, entitlementName: row.entitlementName },
          actorEmail: upn,
          actorFullName: fullName,
          actorSystemUserId: systemUserId,
          actorAccessTier: tier.kind === 'ready' ? tier.tier : 'failed',
          authorized: true,
        },
        buildLiveAdminAccessGrantDeps(),
      );
      setOutcome(result);
      setBusy(null);
      if (result.kind === 'success') reload();
    },
    [upn, fullName, systemUserId, tier, reload],
  );

  return (
    <section style={styles.card} data-admin-access-grant>
      <header>
        <h2 style={styles.title}>Grant / Revoke Admin Access</h2>
        <p style={styles.subtitle}>
          Grant an existing platform user Admin-workspace access, or revoke it. Only an
          admin with the Admin access tier (not Full) can grant or revoke — you cannot
          revoke your own access here. Every change is verified and audited.
        </p>
      </header>

      {!identityOk && (
        <div style={styles.readonlyBanner} role="note" data-admin-access-grant-readonly>
          {writeDisabledReason ?? 'No Dataverse identity is available; this panel is read-only.'}
        </div>
      )}

      {identityOk && tier.kind === 'loading' && <div style={styles.muted}>Checking your access tier…</div>}

      {identityOk && tier.kind === 'ready' && tier.tier !== 'admin' && (
        <div style={styles.readonlyBanner} role="note" data-admin-access-grant-tier-blocked={tier.tier}>
          {tier.tier === 'full'
            ? 'You have Full admin access — you can use every other admin tool, but only an Admin-tier admin can grant or revoke access here.'
            : tier.tier === 'failed'
              ? `Your access tier could not be confirmed (${tier.message ?? 'read failed'}); granting/revoking is blocked until it can be.`
              : 'No admin-shaped entitlement was found for your account.'}
        </div>
      )}

      {outcome && <OutcomeBanner outcome={outcome} />}

      {identityOk && tier.kind === 'ready' && tier.tier === 'admin' && (
        <>
          <div style={styles.grantRow} data-admin-access-grant-form>
            <select
              aria-label="User to grant access to"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={styles.select}
              disabled={busy === 'grant'}
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.upn})
                </option>
              ))}
            </select>
            <select
              aria-label="Access level"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value as GrantableAccessLevel)}
              style={styles.selectLevel}
              disabled={busy === 'grant'}
            >
              <option value="Full">Full</option>
              <option value="Admin">Admin</option>
            </select>
            <button
              type="button"
              style={styles.primaryBtn}
              disabled={busy === 'grant' || selectedUserId.length === 0}
              onClick={() => void grant()}
              data-admin-access-grant-submit
            >
              {busy === 'grant' ? 'Granting…' : 'Grant access'}
            </button>
          </div>

          <div style={styles.rowsSection}>
            <h3 style={styles.rowsTitle}>Current admin access</h3>
            {rowsError && <div style={styles.errorBanner} role="alert">{rowsError}</div>}
            {rows === null && !rowsError && <div style={styles.muted}>Loading…</div>}
            {rows !== null && rows.length === 0 && <p style={styles.muted}>No active admin-shaped entitlements.</p>}
            {rows !== null && rows.length > 0 && (
              <ul style={styles.rowsList}>
                {rows.map((row) => (
                  <li key={row.id} style={styles.rowItem} data-admin-access-grant-row={row.id}>
                    <span style={styles.rowName}>{row.entitlementName}</span>
                    <span style={styles.rowLevel}>{row.accessLevelKind}</span>
                    <button
                      type="button"
                      style={styles.linkBtn}
                      disabled={busy === row.id}
                      onClick={() => void revoke(row)}
                      data-admin-access-grant-revoke={row.id}
                    >
                      {busy === row.id ? '…' : 'Revoke'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function OutcomeBanner({ outcome }: { outcome: AdminAccessGrantOutcome }) {
  const ok = outcome.kind === 'success';
  const text = ok
    ? outcome.label
    : outcome.kind === 'write-failed'
      ? `The change did not save. ${outcome.error}`
      : outcome.kind === 'audit-failed'
        ? `Saved, but the audit entry failed (${outcome.auditError ?? 'unknown'}). An operator must reattempt the audit; do not retry.`
        : 'reason' in outcome
          ? outcome.reason
          : 'The action did not complete.';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      style={{ ...styles.outcomeBanner, ...(ok ? styles.outcomeOk : styles.outcomeBad) }}
      data-admin-access-grant-outcome={outcome.kind}
    >
      {text}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    padding: `${spacing.lg} ${spacing.xl}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    fontFamily: typography.family,
  },
  title: { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text },
  subtitle: { margin: `${spacing.xs} 0 0`, fontSize: typography.size.sm, color: palette.textMuted, maxWidth: 720, lineHeight: typography.lineHeight.snug },
  readonlyBanner: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: spacing.sm, fontSize: typography.size.sm, color: palette.text },
  errorBanner: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: spacing.sm, fontSize: typography.size.sm, color: palette.text },
  outcomeBanner: { borderRadius: radius.sm, padding: spacing.sm, fontSize: typography.size.sm, border: '1px solid' },
  outcomeOk: { background: palette.clearBg, borderColor: palette.clear, color: palette.text },
  outcomeBad: { background: palette.atRiskBg, borderColor: palette.atRisk, color: palette.text },
  muted: { color: palette.textSubtle, fontSize: typography.size.sm, fontStyle: 'italic', margin: 0 },
  grantRow: { display: 'flex', gap: spacing.xs, flexWrap: 'wrap', alignItems: 'center' },
  select: { flex: '1 1 260px', minWidth: 200, padding: `${spacing.xxs} ${spacing.xs}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  selectLevel: { width: 110, padding: `${spacing.xxs} ${spacing.xs}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  primaryBtn: { background: palette.primary, color: palette.textInverse, border: 'none', borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, cursor: 'pointer', fontFamily: typography.family },
  linkBtn: { background: 'transparent', color: palette.primary, border: 'none', padding: 0, fontSize: typography.size.sm, cursor: 'pointer', fontFamily: typography.family, fontWeight: typography.weight.medium },
  rowsSection: { display: 'flex', flexDirection: 'column', gap: spacing.xs, borderTop: `1px solid ${palette.divider}`, paddingTop: spacing.sm },
  rowsTitle: { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: palette.text },
  rowsList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  rowItem: { display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.xxs} 0`, borderBottom: `1px solid ${palette.divider}`, fontSize: typography.size.sm },
  rowName: { flex: '1 1 auto', color: palette.text, fontWeight: typography.weight.medium },
  rowLevel: { color: palette.textSubtle, fontSize: typography.size.xs, textTransform: 'uppercase' },
};
