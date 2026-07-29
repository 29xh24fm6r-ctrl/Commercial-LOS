import { useEffect, useState } from 'react';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import {
  ADMIN_ENTITLEMENT_DIAGNOSTIC_ENABLED,
  loadAdminWorkspaceEntitlementDiagnostic,
  type AdminEntitlementDiagnostic,
} from './adminWorkspaceEntitlementQuery';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 204G — TEMPORARY, READ-ONLY admin-entitlement gate diagnostic.
 *
 * Renders the live admin probe's gate-by-gate outcome so an operator can see the
 * exact production value that fails. It changes NO authorization, performs NO
 * writes (no buttons, no forms, no actions), and shows only SANITIZED values —
 * the signed-in user's own UPN/full name (already shown in the app shell), counts,
 * and gate booleans; never a GUID or another user's identity.
 *
 * Hidden entirely unless ADMIN_ENTITLEMENT_DIAGNOSTIC_ENABLED is on. This card is
 * intended to be removed once the live gate failure is identified.
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; diagnostic: AdminEntitlementDiagnostic };

export function AdminEntitlementDiagnosticCard() {
  const { upn } = useBootstrap();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    if (!ADMIN_ENTITLEMENT_DIAGNOSTIC_ENABLED) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    loadAdminWorkspaceEntitlementDiagnostic(upn).then((diagnostic) => {
      if (!cancelled) setState({ kind: 'ready', diagnostic });
    });
    return () => {
      cancelled = true;
    };
  }, [upn]);

  if (!ADMIN_ENTITLEMENT_DIAGNOSTIC_ENABLED) return null;

  return (
    <section style={styles.card} aria-label="Admin access diagnostic">
      <div style={styles.title}>Admin access diagnostic</div>
      {/* Phase 204J/204K — visible build stamp so the live UI proves the deployed card is current. */}
      <div style={styles.buildStamp}>Read-only access check</div>
      <div style={styles.subtitle}>
        Read-only diagnostic of the live admin-workspace probe. No actions, no writes — sanitized values only.
      </div>
      {/* Phase 204K — workspace display name is not selectable on this table. */}
      <div style={styles.note}>Access is evaluated from the user&rsquo;s active workspace entitlements.</div>
      {state.kind === 'loading' && <div style={styles.muted}>Running probe…</div>}
      {state.kind === 'ready' && <DiagnosticBody diagnostic={state.diagnostic} />}
    </section>
  );
}

function DiagnosticBody({ diagnostic: d }: { diagnostic: AdminEntitlementDiagnostic }) {
  return (
    <div style={styles.body}>
      <dl style={styles.summary}>
        <Field label="Final result" value={d.finalResult} />
        <Field label="User record found" value={String(d.platformUserFound)} />
        <Field label="User record active" value={String(d.platformUserUsable)} />
        <Field label="Full name" value={d.platformUserFullName} />
        <Field label="Email (you)" value={d.platformUserEmail} />
        <Field label="Lending profiles" value={String(d.profileIdsCount)} />
        <Field label="Access check completed" value={String(d.entitlementQuerySuccess)} />
        <Field label="Rows returned" value={String(d.entitlementRowsReturned)} />
        {d.failureSummary.length > 0 && <Field label="Failure" value={d.failureSummary} />}
      </dl>

      {d.rows.length === 0 ? (
        <div style={styles.muted}>No active Admin/Full entitlement rows returned.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              {['Entitlement', 'AccessRaw', 'Kind', 'Active', 'Workspace', 'Profile label', 'AdminName', 'AdminWS', 'IdMatch', 'Reason', 'Eligible'].map(
                (h) => (
                  <th key={h} style={styles.th}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r, i) => (
              <tr key={i}>
                <td style={styles.td}>{r.entitlementName}</td>
                <td style={styles.td}>{r.accessLevelRaw}</td>
                <td style={styles.td}>{r.accessLevelKind}</td>
                <td style={styles.td}>{String(r.active)}</td>
                <td style={styles.td}>{r.workspaceName}</td>
                <td style={styles.td}>{r.losUserProfileName}</td>
                <td style={styles.td}>{String(r.hasAdminName)}</td>
                <td style={styles.td}>{String(r.hasAdminWorkspace)}</td>
                <td style={styles.td}>{String(r.identityMatched)}</td>
                <td style={styles.td}>{r.identityMatchReason}</td>
                <td style={styles.td}>{String(r.finalEligible)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.field}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value}</dd>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: palette.surfaceSubtle ?? palette.surface,
    border: `1px dashed ${palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.md} ${spacing.lg}`,
    margin: `${spacing.md} ${spacing.xxl}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    fontFamily: typography.family,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: palette.text,
  },
  buildStamp: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: palette.cobaltFg ?? palette.text,
    fontFamily: 'monospace',
  },
  subtitle: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
  },
  note: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic',
  },
  body: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  summary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: spacing.xs,
    margin: 0,
  },
  field: { display: 'flex', flexDirection: 'column' },
  dt: { fontSize: typography.size.xs, color: palette.textMuted },
  dd: { margin: 0, fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold },
  muted: { fontSize: typography.size.sm, color: palette.textMuted },
  table: { borderCollapse: 'collapse', width: '100%', fontSize: typography.size.xs },
  th: {
    textAlign: 'left',
    padding: `${spacing.xs} ${spacing.sm}`,
    borderBottom: `1px solid ${palette.divider}`,
    color: palette.textMuted,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: `${spacing.xs} ${spacing.sm}`,
    borderBottom: `1px solid ${palette.divider}`,
    color: palette.text,
    whiteSpace: 'nowrap',
  },
};
