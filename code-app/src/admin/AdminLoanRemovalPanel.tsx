import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useAdmin } from './AdminContext';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  searchDeals,
  listRemovedDeals,
  searchPortfolioLoans,
  listRemovedPortfolioLoans,
  type DealSearchRow,
  type PortfolioLoanSearchRow,
} from './adminLoanLookup';
import {
  writeDealRemoval,
  buildLiveDealRemovalWriteDeps,
  type DealRemovalOutcome,
} from './dealRemovalWrite';
import {
  writePortfolioLoanRemoval,
  buildLivePortfolioLoanRemovalWriteDeps,
  type PortfolioLoanRemovalOutcome,
} from './portfolioLoanRemovalWrite';

/**
 * Admin → Loan Removal.
 *
 * The admin-facing "delete a loan" capability, for both a pipeline deal and a
 * loan already boarded into the portfolio. This system has no hard-delete
 * path anywhere (see dealRemovalWrite.ts / portfolioLoanRemovalWrite.ts for
 * why) — Remove is a governed, audited, REVERSIBLE action: the loan is set to
 * a terminal/inactive state and disappears from every active pipeline and
 * portfolio view in the app, while its full history (documents, tasks,
 * credit memo, audit trail) is preserved and an admin can Reinstate it.
 *
 * Fail-closed: when no Dataverse write identity is resolved the panel is
 * fully read-only with the exact reason. The whole admin route is already
 * identity-gated upstream (WorkspaceGate + AdminProvider).
 */

type Mode = 'deal' | 'portfolio';

export function AdminLoanRemovalPanel() {
  const { upn, systemUserId, writeDisabledReason } = useAdmin();
  const canWrite = !!systemUserId && !writeDisabledReason;

  const [mode, setMode] = useState<Mode>('deal');
  const [query, setQuery] = useState('');
  const [dealResults, setDealResults] = useState<DealSearchRow[] | null>(null);
  const [loanResults, setLoanResults] = useState<PortfolioLoanSearchRow[] | null>(null);
  const [removedDeals, setRemovedDeals] = useState<DealSearchRow[]>([]);
  const [removedLoans, setRemovedLoans] = useState<PortfolioLoanSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DealRemovalOutcome | PortfolioLoanRemovalOutcome | null>(null);

  const loadRemoved = useCallback(() => {
    listRemovedDeals().then((r) => r.success && setRemovedDeals([...(r.rows ?? [])]));
    listRemovedPortfolioLoans().then((r) => r.success && setRemovedLoans([...(r.rows ?? [])]));
  }, []);

  useEffect(() => {
    loadRemoved();
  }, [loadRemoved]);

  const runSearch = useCallback(async () => {
    setSearching(true);
    setSearchError(null);
    setOutcome(null);
    if (mode === 'deal') {
      const r = await searchDeals(query);
      setSearching(false);
      if (!r.success) return setSearchError(r.error ?? 'Search failed.');
      setDealResults([...(r.rows ?? [])]);
    } else {
      const r = await searchPortfolioLoans(query);
      setSearching(false);
      if (!r.success) return setSearchError(r.error ?? 'Search failed.');
      setLoanResults([...(r.rows ?? [])]);
    }
  }, [mode, query]);

  const removeDeal = useCallback(
    async (dealId: string) => {
      if (!canWrite) return;
      const reason = (reasonDraft[dealId] ?? '').trim();
      if (reason.length === 0) return;
      setBusyId(dealId);
      setOutcome(null);
      const result = await writeDealRemoval(
        { action: { kind: 'withdraw', dealId, reason }, actorEmail: upn, actorSystemUserId: systemUserId, authorized: true },
        buildLiveDealRemovalWriteDeps(),
      );
      setOutcome(result);
      setBusyId(null);
      if (result.kind === 'success') {
        setReasonDraft((s) => { const n = { ...s }; delete n[dealId]; return n; });
        setDealResults((rows) => rows?.filter((r) => r.id !== dealId) ?? rows);
        loadRemoved();
      }
    },
    [canWrite, upn, systemUserId, reasonDraft, loadRemoved],
  );

  const reinstateDeal = useCallback(
    async (dealId: string) => {
      if (!canWrite) return;
      setBusyId(dealId);
      setOutcome(null);
      const result = await writeDealRemoval(
        { action: { kind: 'reinstate', dealId }, actorEmail: upn, actorSystemUserId: systemUserId, authorized: true },
        buildLiveDealRemovalWriteDeps(),
      );
      setOutcome(result);
      setBusyId(null);
      if (result.kind === 'success') loadRemoved();
    },
    [canWrite, upn, systemUserId, loadRemoved],
  );

  const removeLoan = useCallback(
    async (loanId: string) => {
      if (!canWrite) return;
      const reason = (reasonDraft[loanId] ?? '').trim();
      if (reason.length === 0) return;
      setBusyId(loanId);
      setOutcome(null);
      const result = await writePortfolioLoanRemoval(
        { action: { kind: 'remove', loanId, reason }, actorEmail: upn, actorSystemUserId: systemUserId, authorized: true },
        buildLivePortfolioLoanRemovalWriteDeps(),
      );
      setOutcome(result);
      setBusyId(null);
      if (result.kind === 'success') {
        setReasonDraft((s) => { const n = { ...s }; delete n[loanId]; return n; });
        setLoanResults((rows) => rows?.filter((r) => r.id !== loanId) ?? rows);
        loadRemoved();
      }
    },
    [canWrite, upn, systemUserId, reasonDraft, loadRemoved],
  );

  const reinstateLoan = useCallback(
    async (loanId: string) => {
      if (!canWrite) return;
      setBusyId(loanId);
      setOutcome(null);
      const result = await writePortfolioLoanRemoval(
        { action: { kind: 'reinstate', loanId }, actorEmail: upn, actorSystemUserId: systemUserId, authorized: true },
        buildLivePortfolioLoanRemovalWriteDeps(),
      );
      setOutcome(result);
      setBusyId(null);
      if (result.kind === 'success') loadRemoved();
    },
    [canWrite, upn, systemUserId, loadRemoved],
  );

  return (
    <section style={styles.card} data-admin-loan-removal>
      <header style={styles.header}>
        <div>
          <h2 style={styles.title}>Loan Removal</h2>
          <p style={styles.subtitle}>
            Remove a deal or a boarded portfolio loan from every active view. This system never
            hard-deletes a loan record — bank recordkeeping requires the audit trail to survive —
            so Remove is a governed, audited, reversible withdrawal. The loan and its full history
            stay intact; Reinstate undoes it.
          </p>
        </div>
      </header>

      {!canWrite && (
        <div style={styles.readonlyBanner} role="note" data-admin-loan-removal-readonly>
          {writeDisabledReason ?? 'No Dataverse identity is available; this panel is read-only.'}
        </div>
      )}

      {outcome && <OutcomeBanner outcome={outcome} />}

      <div style={styles.modeRow}>
        <ModeButton active={mode === 'deal'} onClick={() => { setMode('deal'); setSearchError(null); }}>
          Pipeline deal
        </ModeButton>
        <ModeButton active={mode === 'portfolio'} onClick={() => { setMode('portfolio'); setSearchError(null); }}>
          Portfolio loan
        </ModeButton>
      </div>

      <div style={styles.searchRow}>
        <input
          aria-label={mode === 'deal' ? 'Search deals by name or id' : 'Search portfolio loans by name, loan number, borrower, or id'}
          placeholder={mode === 'deal' ? 'Deal name or id…' : 'Loan name, loan number, borrower, or id…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void runSearch(); }}
          style={styles.input}
        />
        <button type="button" style={styles.primaryBtn} disabled={searching || query.trim().length === 0} onClick={() => void runSearch()} data-admin-loan-removal-search>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {searchError && <div style={styles.errorBanner} role="alert">{searchError}</div>}

      {mode === 'deal' && dealResults && (
        <div style={styles.results} data-admin-loan-removal-results>
          {dealResults.length === 0 ? (
            <p style={styles.muted}>No matching deals.</p>
          ) : (
            dealResults.map((row) => (
              <DealRow
                key={row.id}
                row={row}
                canWrite={canWrite}
                busy={busyId === row.id}
                reason={reasonDraft[row.id] ?? ''}
                setReason={(v) => setReasonDraft((s) => ({ ...s, [row.id]: v }))}
                onRemove={() => void removeDeal(row.id)}
              />
            ))
          )}
        </div>
      )}
      {mode === 'portfolio' && loanResults && (
        <div style={styles.results} data-admin-loan-removal-results>
          {loanResults.length === 0 ? (
            <p style={styles.muted}>No matching portfolio loans.</p>
          ) : (
            loanResults.map((row) => (
              <LoanRow
                key={row.id}
                row={row}
                canWrite={canWrite}
                busy={busyId === row.id}
                reason={reasonDraft[row.id] ?? ''}
                setReason={(v) => setReasonDraft((s) => ({ ...s, [row.id]: v }))}
                onRemove={() => void removeLoan(row.id)}
              />
            ))
          )}
        </div>
      )}

      <div style={styles.removedSection}>
        <h3 style={styles.removedTitle}>Removed deals ({removedDeals.length})</h3>
        {removedDeals.length === 0 ? (
          <p style={styles.muted}>No deals have been removed.</p>
        ) : (
          <ul style={styles.removedList}>
            {removedDeals.map((row) => (
              <li key={row.id} style={styles.removedItem} data-admin-loan-removal-removed-deal={row.id}>
                <span>{row.name}</span>
                {canWrite && (
                  <button type="button" style={styles.linkBtn} disabled={busyId === row.id} onClick={() => void reinstateDeal(row.id)} data-admin-loan-removal-reinstate-deal={row.id}>
                    {busyId === row.id ? '…' : 'Reinstate'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <h3 style={styles.removedTitle}>Removed portfolio loans ({removedLoans.length})</h3>
        {removedLoans.length === 0 ? (
          <p style={styles.muted}>No portfolio loans have been removed.</p>
        ) : (
          <ul style={styles.removedList}>
            {removedLoans.map((row) => (
              <li key={row.id} style={styles.removedItem} data-admin-loan-removal-removed-loan={row.id}>
                <span>{row.name}{row.loanNumber ? ` (${row.loanNumber})` : ''}</span>
                {canWrite && (
                  <button type="button" style={styles.linkBtn} disabled={busyId === row.id} onClick={() => void reinstateLoan(row.id)} data-admin-loan-removal-reinstate-loan={row.id}>
                    {busyId === row.id ? '…' : 'Reinstate'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={active ? styles.modeBtnActive : styles.modeBtn} aria-pressed={active}>
      {children}
    </button>
  );
}

function DealRow({
  row,
  canWrite,
  busy,
  reason,
  setReason,
  onRemove,
}: {
  row: DealSearchRow;
  canWrite: boolean;
  busy: boolean;
  reason: string;
  setReason: (v: string) => void;
  onRemove: () => void;
}) {
  const alreadyBlocked = row.closed || (row.statusName ?? '').toLowerCase() === 'boarded';
  return (
    <div style={styles.row} data-admin-loan-removal-deal={row.id}>
      <div style={styles.rowMain}>
        <span style={styles.rowName}>{row.name}</span>
        <span style={styles.rowMeta}>{row.statusName ?? 'Unknown status'}{!row.active ? ' · Inactive' : ''}</span>
      </div>
      {canWrite && !alreadyBlocked && row.active && (
        <div style={styles.rowActions}>
          <input
            aria-label={`Reason for removing ${row.name}`}
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={styles.reasonInput}
            disabled={busy}
          />
          <button type="button" style={styles.dangerBtn} disabled={busy || reason.trim().length === 0} onClick={onRemove} data-admin-loan-removal-remove-deal={row.id}>
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      )}
      {alreadyBlocked && <span style={styles.note}>Boarded to the portfolio — remove the portfolio loan instead.</span>}
    </div>
  );
}

function LoanRow({
  row,
  canWrite,
  busy,
  reason,
  setReason,
  onRemove,
}: {
  row: PortfolioLoanSearchRow;
  canWrite: boolean;
  busy: boolean;
  reason: string;
  setReason: (v: string) => void;
  onRemove: () => void;
}) {
  return (
    <div style={styles.row} data-admin-loan-removal-loan={row.id}>
      <div style={styles.rowMain}>
        <span style={styles.rowName}>{row.name}{row.loanNumber ? ` (${row.loanNumber})` : ''}</span>
        <span style={styles.rowMeta}>{row.borrowerName ?? 'Unknown borrower'} · {row.loanStatus ?? 'Unknown status'}{!row.active ? ' · Inactive' : ''}</span>
      </div>
      {canWrite && row.active && (
        <div style={styles.rowActions}>
          <input
            aria-label={`Reason for removing ${row.name}`}
            placeholder="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={styles.reasonInput}
            disabled={busy}
          />
          <button type="button" style={styles.dangerBtn} disabled={busy || reason.trim().length === 0} onClick={onRemove} data-admin-loan-removal-remove-loan={row.id}>
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      )}
    </div>
  );
}

function OutcomeBanner({ outcome }: { outcome: DealRemovalOutcome | PortfolioLoanRemovalOutcome }) {
  const ok = outcome.kind === 'success';
  const text = ok
    ? outcome.label
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
      data-admin-loan-removal-outcome={outcome.kind}
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
  modeRow: { display: 'flex', gap: spacing.xs },
  modeBtn: { background: palette.surface, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.sm, cursor: 'pointer', fontFamily: typography.family },
  modeBtnActive: { background: palette.primary, color: palette.textInverse, border: `1px solid ${palette.primary}`, borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, cursor: 'pointer', fontFamily: typography.family },
  searchRow: { display: 'flex', gap: spacing.xs },
  input: { flex: '1 1 auto', padding: `${spacing.xxs} ${spacing.xs}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  primaryBtn: { background: palette.primary, color: palette.textInverse, border: 'none', borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, cursor: 'pointer', fontFamily: typography.family },
  dangerBtn: { background: palette.blocked, color: palette.textInverse, border: 'none', borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, cursor: 'pointer', fontFamily: typography.family },
  linkBtn: { background: 'transparent', color: palette.primary, border: 'none', padding: 0, fontSize: typography.size.sm, cursor: 'pointer', fontFamily: typography.family, fontWeight: typography.weight.medium },
  results: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  row: { display: 'flex', flexDirection: 'column', gap: spacing.xs, padding: spacing.sm, border: `1px solid ${palette.divider}`, borderRadius: radius.sm },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 2 },
  rowName: { color: palette.text, fontWeight: typography.weight.medium, fontSize: typography.size.sm },
  rowMeta: { color: palette.textSubtle, fontSize: typography.size.xs },
  rowActions: { display: 'flex', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' },
  reasonInput: { flex: '1 1 200px', minWidth: 160, padding: `${spacing.xxs} ${spacing.xs}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  note: { color: palette.textSubtle, fontSize: typography.size.xs, fontStyle: 'italic' },
  removedSection: { display: 'flex', flexDirection: 'column', gap: spacing.xs, borderTop: `1px solid ${palette.divider}`, paddingTop: spacing.sm },
  removedTitle: { margin: `${spacing.xs} 0 0`, fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: palette.text },
  removedList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  removedItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, padding: `${spacing.xxs} 0`, borderBottom: `1px solid ${palette.divider}`, fontSize: typography.size.sm },
};
