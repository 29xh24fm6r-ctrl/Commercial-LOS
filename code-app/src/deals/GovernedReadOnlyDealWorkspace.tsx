import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import type { Cr664_loandeals } from '../generated/models/Cr664_loandealsModel';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';
import { palette, radius, spacing, typography } from '../shared/theme';

type DealReadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly deal: Cr664_loandeals };

export type ReadOnlyDealRole = 'Executive' | 'Admin';

/**
 * Security-trimmed deal drill-through for executive and admin workspaces.
 * AuthGate and the workspace gate establish the role before this component is
 * mounted; Dataverse remains the record-level authorization authority. This
 * surface performs one read and intentionally exposes no mutation controls.
 */
export function GovernedReadOnlyDealWorkspace({
  dealId,
  role,
  returnTo,
}: {
  readonly dealId: string;
  readonly role: ReadOnlyDealRole;
  readonly returnTo: string;
}) {
  const [state, setState] = useState<DealReadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    Cr664_loandealsService.get(dealId, {
      select: [
        'cr664_loandealid',
        'cr664_dealname',
        'cr664_amount',
        'cr664_stagereferencename',
        'cr664_statusreferencename',
        'cr664_clientname',
        'cr664_assignedbankername',
        'cr664_producttypereferencename',
        'cr664_targetclosedate',
        'cr664_collateralsummary',
      ],
    })
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) {
          const safe = mapBusinessSafeError(
            result.error?.message ?? 'The deal read returned no record.',
          );
          setState({ kind: 'failed', message: safe.safeMessage });
          return;
        }
        setState({ kind: 'ready', deal: result.data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const safe = mapBusinessSafeError(
          error instanceof Error ? error.message : String(error),
        );
        setState({ kind: 'failed', message: safe.safeMessage });
      });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  return (
    <main style={styles.page} data-read-only-deal-workspace={role.toLowerCase()}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>{role.toUpperCase()} · SECURITY-TRIMMED VIEW</p>
          <h1 style={styles.title}>
            {state.kind === 'ready' ? state.deal.cr664_dealname : 'Deal detail'}
          </h1>
          <p style={styles.subtitle}>
            Read-only operational drill-through. Dataverse permissions determine record access.
          </p>
        </div>
        <Link to={returnTo} style={styles.backLink}>
          Back to {role} Workspace
        </Link>
      </header>

      {state.kind === 'loading' && <p role="status">Loading authorized deal details…</p>}
      {state.kind === 'failed' && (
        <section style={styles.error} role="alert">
          <h2 style={styles.sectionTitle}>Deal unavailable</h2>
          <p>{state.message}</p>
          <p>The record may be outside your Dataverse access scope.</p>
        </section>
      )}
      {state.kind === 'ready' && (
        <section style={styles.card} aria-label="Deal summary">
          <h2 style={styles.sectionTitle}>Deal summary</h2>
          <dl style={styles.grid}>
            <Fact label="Client" value={state.deal.cr664_clientname} />
            <Fact label="Stage" value={state.deal.cr664_stagereferencename} />
            <Fact label="Status" value={state.deal.cr664_statusreferencename} />
            <Fact label="Assigned banker" value={state.deal.cr664_assignedbankername} />
            <Fact label="Product" value={state.deal.cr664_producttypereferencename} />
            <Fact
              label="Loan amount"
              value={
                typeof state.deal.cr664_amount === 'number'
                  ? state.deal.cr664_amount.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 0,
                    })
                  : undefined
              }
            />
            <Fact label="Target close" value={state.deal.cr664_targetclosedate} />
            <Fact label="Collateral" value={state.deal.cr664_collateralsummary} />
          </dl>
          <p style={styles.readOnlyNote}>
            This workspace intentionally has no deal mutation controls.
          </p>
        </section>
      )}
    </main>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: unknown }) {
  const text =
    typeof value === 'string' && value.trim().length > 0 ? value : 'Not available';
  return (
    <div style={styles.fact}>
      <dt style={styles.factLabel}>{label}</dt>
      <dd style={styles.factValue}>{text}</dd>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', padding: spacing.xl, background: palette.pageBg, color: palette.text },
  header: { display: 'flex', justifyContent: 'space-between', gap: spacing.lg, alignItems: 'flex-start', marginBottom: spacing.lg },
  eyebrow: { margin: 0, color: palette.textMuted, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: typography.letterSpacing.label },
  title: { margin: `${spacing.xs} 0`, fontSize: typography.size.xxl },
  subtitle: { margin: 0, color: palette.textMuted },
  backLink: { color: palette.primary, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.md}`, textDecoration: 'none' },
  card: { background: palette.surface, border: `1px solid ${palette.panelBorder}`, borderRadius: radius.md, padding: spacing.lg },
  error: { background: palette.blockedBg, border: `1px solid ${palette.blocked}`, borderRadius: radius.md, padding: spacing.lg },
  sectionTitle: { marginTop: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: spacing.md },
  fact: { margin: 0 },
  factLabel: { color: palette.textMuted, fontSize: typography.size.xs },
  factValue: { margin: `${spacing.xs} 0 0`, fontWeight: typography.weight.semibold },
  readOnlyNote: { marginBottom: 0, color: palette.textMuted, fontSize: typography.size.sm },
};
