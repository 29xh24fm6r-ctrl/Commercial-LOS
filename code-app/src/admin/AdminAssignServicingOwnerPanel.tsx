import { useCallback, useState, type CSSProperties } from 'react';
import { useAdmin } from './AdminContext';
import { palette, radius, spacing, typography } from '../shared/theme';
import { searchServicingOwnerLoans } from './assignServicingOwnerWrite';
import type { ServicingOwnerLoanRow } from './assignServicingOwnerWrite';
import {
  writeAssignServicingOwner,
  buildLiveAssignServicingOwnerWriteDeps,
  type AssignServicingOwnerOutcome,
} from './assignServicingOwnerWrite';
import { loadPortfolioManagerOptions, type PortfolioManagerOption } from '../portfolioBoarding/portfolioManagerOptions';

/**
 * Admin -> Assign Servicing Owner (Final LOS Completion arc, Workstream 146-E).
 *
 * Closes the total write-side gap for `cr664_AssignedServicingOwner` -- the systemuser lookup
 * BOARDED:servicing_owner (loanWorkflowRequirementEngine.ts, via boardingHandoffReadiness.ts) has
 * always read, but nothing has ever written. Same governed-write discipline as the sibling Loan
 * Removal panel: fail-closed on a missing Dataverse identity, search-then-act rather than a blind
 * id field, and an honest outcome banner (never a silent success assumption).
 *
 * The servicing-owner picker reuses portfolioManagerOptions.ts's EXISTING systemuser resolver
 * (loadPortfolioManagerOptions) -- both cr664_PortfolioManager and cr664_AssignedServicingOwner
 * target the same systemuser entity, so the same real/enabled/interactive-user filter applies.
 */
export function AdminAssignServicingOwnerPanel() {
  const { upn, systemUserId, writeDisabledReason } = useAdmin();
  const canWrite = !!systemUserId && !writeDisabledReason;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ServicingOwnerLoanRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [owners, setOwners] = useState<PortfolioManagerOption[] | null>(null);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AssignServicingOwnerOutcome | null>(null);

  const ensureOwnersLoaded = useCallback(() => {
    if (owners !== null || ownersError) return;
    loadPortfolioManagerOptions()
      .then((rows) => setOwners([...rows]))
      .catch((err: unknown) => setOwnersError(err instanceof Error ? err.message : String(err)));
  }, [owners, ownersError]);

  const runSearch = useCallback(async () => {
    setSearching(true);
    setSearchError(null);
    setOutcome(null);
    ensureOwnersLoaded();
    const r = await searchServicingOwnerLoans(query);
    setSearching(false);
    if (!r.success) return setSearchError(r.error ?? 'Search failed.');
    setResults([...(r.rows ?? [])]);
  }, [query, ensureOwnersLoaded]);

  const assign = useCallback(
    async (loanId: string) => {
      if (!canWrite) return;
      const ownerId = (selectedOwnerId[loanId] ?? '').trim();
      if (ownerId.length === 0) return;
      const owner = owners?.find((o) => o.id === ownerId);
      setBusyId(loanId);
      setOutcome(null);
      const result = await writeAssignServicingOwner(
        {
          loanId,
          servicingOwnerId: ownerId,
          servicingOwnerName: owner?.name ?? ownerId,
          actorEmail: upn,
          actorSystemUserId: systemUserId,
          authorized: true,
        },
        buildLiveAssignServicingOwnerWriteDeps(),
      );
      setOutcome(result);
      setBusyId(null);
      if (result.kind === 'success') {
        setResults((rows) =>
          rows?.map((r) =>
            r.id === loanId
              ? { ...r, currentServicingOwnerId: result.servicingOwnerId, currentServicingOwnerName: result.servicingOwnerName }
              : r,
          ) ?? rows,
        );
      }
    },
    [canWrite, upn, systemUserId, selectedOwnerId, owners],
  );

  return (
    <section style={styles.card} data-admin-assign-servicing-owner>
      <header style={styles.header}>
        <div>
          <h2 style={styles.title}>Assign Servicing Owner</h2>
          <p style={styles.subtitle}>
            Set or reassign the real, resolvable Dataverse systemuser responsible for a boarded
            portfolio loan's ongoing servicing. This is the durable fact the Stage Map's Boarded
            exit gate (BOARDED:servicing_owner) checks for -- an assignment made here reads back
            immediately across the deal, portfolio, and admin views.
          </p>
        </div>
      </header>

      {!canWrite && (
        <div style={styles.readonlyBanner} role="note" data-admin-assign-servicing-owner-readonly>
          {writeDisabledReason ?? 'No Dataverse identity is available; this panel is read-only.'}
        </div>
      )}

      {outcome && <OutcomeBanner outcome={outcome} />}
      {ownersError && (
        <div style={styles.errorBanner} role="alert">
          Could not load assignable servicing owners: {ownersError}
        </div>
      )}

      <div style={styles.searchRow}>
        <input
          aria-label="Search boarded portfolio loans by name, loan number, borrower, or id"
          placeholder="Loan name, loan number, borrower, or id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
          style={styles.input}
        />
        <button
          type="button"
          style={styles.primaryBtn}
          disabled={searching || query.trim().length === 0}
          onClick={() => void runSearch()}
          data-admin-assign-servicing-owner-search
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {searchError && <div style={styles.errorBanner} role="alert">{searchError}</div>}

      {results && (
        <div style={styles.results} data-admin-assign-servicing-owner-results>
          {results.length === 0 ? (
            <p style={styles.muted}>No matching boarded portfolio loans.</p>
          ) : (
            results.map((row) => (
              <LoanRow
                key={row.id}
                row={row}
                canWrite={canWrite}
                busy={busyId === row.id}
                owners={owners ?? []}
                selectedOwnerId={selectedOwnerId[row.id] ?? ''}
                setSelectedOwnerId={(v) => setSelectedOwnerId((s) => ({ ...s, [row.id]: v }))}
                onAssign={() => void assign(row.id)}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function LoanRow({
  row,
  canWrite,
  busy,
  owners,
  selectedOwnerId,
  setSelectedOwnerId,
  onAssign,
}: {
  row: ServicingOwnerLoanRow;
  canWrite: boolean;
  busy: boolean;
  owners: readonly PortfolioManagerOption[];
  selectedOwnerId: string;
  setSelectedOwnerId: (v: string) => void;
  onAssign: () => void;
}) {
  return (
    <div style={styles.row} data-admin-assign-servicing-owner-loan={row.id}>
      <div style={styles.rowMain}>
        <span style={styles.rowName}>{row.name}{row.loanNumber ? ` (${row.loanNumber})` : ''}</span>
        <span style={styles.rowMeta}>
          {row.borrowerName ?? 'Unknown borrower'} · Current servicing owner:{' '}
          {row.currentServicingOwnerName ?? row.currentServicingOwnerId ?? 'Unassigned'}
        </span>
      </div>
      {canWrite && (
        <div style={styles.rowActions}>
          <select
            aria-label={`Servicing owner for ${row.name}`}
            value={selectedOwnerId}
            onChange={(e) => setSelectedOwnerId(e.target.value)}
            style={styles.select}
            disabled={busy}
            data-admin-assign-servicing-owner-select={row.id}
          >
            <option value="">Select a servicing owner…</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <button
            type="button"
            style={styles.primaryBtn}
            disabled={busy || selectedOwnerId.trim().length === 0}
            onClick={onAssign}
            data-admin-assign-servicing-owner-assign={row.id}
          >
            {busy ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      )}
    </div>
  );
}

function OutcomeBanner({ outcome }: { outcome: AssignServicingOwnerOutcome }) {
  const ok = outcome.kind === 'success';
  const text = ok
    ? `Servicing owner set to ${outcome.servicingOwnerName}.`
    : 'reason' in outcome
      ? outcome.reason
      : 'error' in outcome
        ? `The change did not save. ${outcome.error}`
        : outcome.kind === 'audit-failed'
          ? `Saved, but the audit entry failed (${outcome.auditError ?? 'unknown'}). An operator must reattempt the audit; do not retry.`
          : 'The action did not complete.';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      style={{ ...styles.outcomeBanner, ...(ok ? styles.outcomeOk : styles.outcomeBad) }}
      data-admin-assign-servicing-owner-outcome={outcome.kind}
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
  header: { display: 'flex', justifyContent: 'space-between', gap: spacing.lg, alignItems: 'flex-start', flexWrap: 'wrap' },
  title: { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text },
  subtitle: { margin: `${spacing.xs} 0 0`, fontSize: typography.size.sm, color: palette.textMuted, maxWidth: 720, lineHeight: typography.lineHeight.snug },
  readonlyBanner: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: spacing.sm, fontSize: typography.size.sm, color: palette.text },
  errorBanner: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: spacing.sm, fontSize: typography.size.sm, color: palette.text },
  outcomeBanner: { borderRadius: radius.sm, padding: spacing.sm, fontSize: typography.size.sm, border: '1px solid' },
  outcomeOk: { background: palette.clearBg, borderColor: palette.clear, color: palette.text },
  outcomeBad: { background: palette.atRiskBg, borderColor: palette.atRisk, color: palette.text },
  muted: { color: palette.textSubtle, fontSize: typography.size.sm, fontStyle: 'italic', margin: 0 },
  searchRow: { display: 'flex', gap: spacing.xs },
  input: { flex: '1 1 auto', padding: `${spacing.xxs} ${spacing.xs}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  primaryBtn: { background: palette.primary, color: palette.textInverse, border: 'none', borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, cursor: 'pointer', fontFamily: typography.family },
  results: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  row: { display: 'flex', flexDirection: 'column', gap: spacing.xs, padding: spacing.sm, border: `1px solid ${palette.divider}`, borderRadius: radius.sm },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 2 },
  rowName: { color: palette.text, fontWeight: typography.weight.medium, fontSize: typography.size.sm },
  rowMeta: { color: palette.textSubtle, fontSize: typography.size.xs },
  rowActions: { display: 'flex', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' },
  select: { flex: '1 1 200px', minWidth: 160, padding: `${spacing.xxs} ${spacing.xs}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
};
