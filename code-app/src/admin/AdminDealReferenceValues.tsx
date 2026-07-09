import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAdmin } from './AdminContext';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  DEAL_REFERENCE_CATEGORIES,
  DEAL_REFERENCE_CATEGORY_LABEL,
  type DealReferenceCategory,
} from '../shared/governance/dealReferenceCategories';
import {
  loadLiveDealReferenceAdminRows,
  type DealReferenceAdminResult,
} from './dealReferenceAdminQueries';
import {
  writeDealReferenceValue,
  buildLiveDealReferenceWriteDeps,
  type DealReferenceAdminRow,
  type DealReferenceWriteAction,
  type DealReferenceWriteOutcome,
} from './dealReferenceValueWrite';

/**
 * Phase 4A â€” Admin â†’ Deal Reference Values.
 *
 * The admin surface for the Product Type / Loan Structure / Pricing Type dropdown
 * values (rows in cr664_producttypereference, separated by cr664_category). Lists
 * values by category (with an inactive toggle), and adds / edits / deactivates /
 * reactivates them through the governed writeDealReferenceValue adapter (fail-
 * closed, readback-verified, audited). Deactivate is preferred over delete â€”
 * there is no delete affordance.
 *
 * Fail-closed: when no Dataverse write identity is resolved the panel is fully
 * read-only with the exact reason. The whole admin route is already identity-gated
 * upstream (WorkspaceGate + AdminProvider).
 */

interface Draft {
  name: string;
  code: string;
  sortOrder: string;
}

const EMPTY_DRAFT: Draft = { name: '', code: '', sortOrder: '' };

export function AdminDealReferenceValues() {
  const { upn, systemUserId, writeDisabledReason } = useAdmin();
  const canWrite = !!systemUserId && !writeDisabledReason;

  const [state, setState] = useState<{ kind: 'loading' } | DealReferenceAdminResult>({ kind: 'loading' });
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DealReferenceWriteOutcome | null>(null);
  const mountedRef = useRef(false);
  // Per-row edit drafts + per-category add drafts.
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  const [adding, setAdding] = useState<Partial<Record<DealReferenceCategory, Draft>>>({});

  // Fetch without a synchronous setState (state starts as `loading`), so it is
  // safe to call from the mount effect.
  const loadRows = useCallback(() => {
    loadLiveDealReferenceAdminRows()
      .then((nextState) => {
        if (mountedRef.current) {
          setState(nextState);
        }
      })
      .catch((err: unknown) => {
        if (mountedRef.current) {
          setState({ kind: 'unavailable', reason: err instanceof Error ? err.message : String(err) });
        }
      });
  }, []);

  // Reload after a write: flash the loading state (event handler, not an effect).
  const reload = useCallback(() => {
    setState({ kind: 'loading' });
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    mountedRef.current = true;
    loadRows();

    return () => {
      mountedRef.current = false;
    };
  }, [loadRows]);

  const runWrite = useCallback(
    async (action: DealReferenceWriteAction, busyKey: string) => {
      if (!canWrite) return;
      setBusy(busyKey);
      setOutcome(null);
      const result = await writeDealReferenceValue(
        { action, actorEmail: upn, actorSystemUserId: systemUserId, authorized: true },
        buildLiveDealReferenceWriteDeps(),
      );
      setOutcome(result);
      setBusy(null);
      if (result.kind === 'success') {
        setEditing({});
        setAdding({});
        reload();
      }
    },
    [canWrite, upn, systemUserId, reload],
  );

  return (
    <section style={styles.card} data-admin-deal-reference-values>
      <header style={styles.header}>
        <div>
          <h2 style={styles.title}>Deal Reference Values</h2>
          <p style={styles.subtitle}>
            Manage the Product Type, Loan Structure, and Pricing Type values bankers
            pick on the Deal Profile. Deactivate hides a value from new deals without
            deleting history. Every change is verified and audited.
          </p>
        </div>
        <label style={styles.inactiveToggle}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </header>

      {!canWrite && (
        <div style={styles.readonlyBanner} role="note" data-admin-deal-reference-readonly>
          {writeDisabledReason ?? 'No Dataverse identity is available; this panel is read-only.'}
        </div>
      )}

      {outcome && <OutcomeBanner outcome={outcome} />}

      {state.kind === 'loading' && <div style={styles.muted}>Loading reference valuesâ€¦</div>}
      {state.kind === 'unavailable' && (
        <div style={styles.errorBanner} role="alert" data-admin-deal-reference-unavailable>
          {state.reason}
        </div>
      )}

      {state.kind === 'ready' && (
        <div style={styles.categories}>
          {DEAL_REFERENCE_CATEGORIES.map((category) => (
            <CategorySection
              key={category}
              category={category}
              rows={state.data.byCategory[category]}
              showInactive={showInactive}
              canWrite={canWrite}
              busy={busy}
              editing={editing}
              setEditing={setEditing}
              adding={adding[category]}
              setAdding={(d) => setAdding((s) => ({ ...s, [category]: d }))}
              runWrite={runWrite}
            />
          ))}
          {state.data.uncategorized.length > 0 && (
            <div style={styles.uncategorized} data-admin-deal-reference-uncategorized>
              <h3 style={styles.categoryTitle}>Uncategorized (legacy)</h3>
              <p style={styles.muted}>
                {state.data.uncategorized.length} row(s) have no category and do not appear in any
                dropdown. Assign them a category via the seed/import (see DEAL_REFERENCE_VALUES_SETUP.md).
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CategorySection({
  category,
  rows,
  showInactive,
  canWrite,
  busy,
  editing,
  setEditing,
  adding,
  setAdding,
  runWrite,
}: {
  category: DealReferenceCategory;
  rows: readonly DealReferenceAdminRow[];
  showInactive: boolean;
  canWrite: boolean;
  busy: string | null;
  editing: Record<string, Draft>;
  setEditing: React.Dispatch<React.SetStateAction<Record<string, Draft>>>;
  adding: Draft | undefined;
  setAdding: (d: Draft | undefined) => void;
  runWrite: (action: DealReferenceWriteAction, busyKey: string) => void;
}) {
  const visible = rows.filter((r) => showInactive || r.active);
  const parseSort = (s: string): number | undefined => {
    const n = Number(s.trim());
    return s.trim().length > 0 && Number.isFinite(n) ? n : undefined;
  };

  return (
    <div style={styles.category} data-admin-deal-reference-category={category}>
      <h3 style={styles.categoryTitle}>{DEAL_REFERENCE_CATEGORY_LABEL[category]}</h3>
      {visible.length === 0 && <div style={styles.muted}>No values yet.</div>}
      <div style={styles.rows}>
        {visible.map((row) => {
          const draft = editing[row.id];
          const rowBusy = busy === row.id;
          if (draft) {
            return (
              <div key={row.id} style={styles.editRow} data-admin-deal-reference-editrow={row.id}>
                <input
                  aria-label="Name"
                  value={draft.name}
                  onChange={(e) => setEditing((s) => ({ ...s, [row.id]: { ...draft, name: e.target.value } }))}
                  style={styles.input}
                  disabled={rowBusy}
                />
                <input
                  aria-label="Code"
                  value={draft.code}
                  onChange={(e) => setEditing((s) => ({ ...s, [row.id]: { ...draft, code: e.target.value } }))}
                  style={styles.inputCode}
                  disabled={rowBusy}
                />
                <input
                  aria-label="Sort order"
                  value={draft.sortOrder}
                  onChange={(e) => setEditing((s) => ({ ...s, [row.id]: { ...draft, sortOrder: e.target.value } }))}
                  style={styles.inputSort}
                  disabled={rowBusy}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  style={styles.primaryBtn}
                  disabled={rowBusy}
                  data-admin-deal-reference-save={row.id}
                  onClick={() =>
                    runWrite(
                      { kind: 'update', id: row.id, name: draft.name, code: draft.code, sortOrder: parseSort(draft.sortOrder) },
                      row.id,
                    )
                  }
                >
                  {rowBusy ? 'Savingâ€¦' : 'Save'}
                </button>
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  disabled={rowBusy}
                  onClick={() => setEditing((s) => { const n = { ...s }; delete n[row.id]; return n; })}
                >
                  Cancel
                </button>
              </div>
            );
          }
          return (
            <div key={row.id} style={styles.row} data-admin-deal-reference-row={row.id} data-active={row.active}>
              <span style={styles.rowName}>{row.name}</span>
              <span style={styles.rowCode}>{row.code}</span>
              <span style={styles.rowSort}>{row.sortOrder ?? 'â€”'}</span>
              <span style={row.active ? styles.activeBadge : styles.inactiveBadge}>
                {row.active ? 'Active' : 'Inactive'}
              </span>
              {canWrite && (
                <span style={styles.rowActions}>
                  <button
                    type="button"
                    style={styles.linkBtn}
                    disabled={rowBusy}
                    data-admin-deal-reference-edit={row.id}
                    onClick={() =>
                      setEditing((s) => ({
                        ...s,
                        [row.id]: { name: row.name, code: row.code, sortOrder: row.sortOrder != null ? String(row.sortOrder) : '' },
                      }))
                    }
                  >
                    Edit
                  </button>
                  {row.active ? (
                    <button
                      type="button"
                      style={styles.linkBtn}
                      disabled={rowBusy}
                      data-admin-deal-reference-deactivate={row.id}
                      onClick={() => runWrite({ kind: 'deactivate', id: row.id }, row.id)}
                    >
                      {rowBusy ? 'â€¦' : 'Deactivate'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={styles.linkBtn}
                      disabled={rowBusy}
                      data-admin-deal-reference-reactivate={row.id}
                      onClick={() => runWrite({ kind: 'reactivate', id: row.id }, row.id)}
                    >
                      {rowBusy ? 'â€¦' : 'Reactivate'}
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {canWrite && (
        <div style={styles.addRow} data-admin-deal-reference-addrow={category}>
          <input
            aria-label="New name"
            placeholder="Display name"
            value={adding?.name ?? ''}
            onChange={(e) => setAdding({ ...(adding ?? EMPTY_DRAFT), name: e.target.value })}
            style={styles.input}
            disabled={busy === `new-${category}`}
          />
          <input
            aria-label="New code"
            placeholder="CODE"
            value={adding?.code ?? ''}
            onChange={(e) => setAdding({ ...(adding ?? EMPTY_DRAFT), code: e.target.value })}
            style={styles.inputCode}
            disabled={busy === `new-${category}`}
          />
          <input
            aria-label="New sort order"
            placeholder="Sort"
            value={adding?.sortOrder ?? ''}
            onChange={(e) => setAdding({ ...(adding ?? EMPTY_DRAFT), sortOrder: e.target.value })}
            style={styles.inputSort}
            disabled={busy === `new-${category}`}
            inputMode="numeric"
          />
          <button
            type="button"
            style={styles.primaryBtn}
            disabled={busy === `new-${category}` || !(adding?.name && adding?.code)}
            data-admin-deal-reference-add={category}
            onClick={() =>
              runWrite(
                { kind: 'create', category, name: adding?.name ?? '', code: adding?.code ?? '', sortOrder: parseSort(adding?.sortOrder ?? '') },
                `new-${category}`,
              )
            }
          >
            {busy === `new-${category}` ? 'Addingâ€¦' : 'Add value'}
          </button>
        </div>
      )}
    </div>
  );
}

function OutcomeBanner({ outcome }: { outcome: DealReferenceWriteOutcome }) {
  const ok = outcome.kind === 'success';
  const text =
    outcome.kind === 'success'
      ? `${labelForAction(outcome.action)} â€” ${outcome.label}.`
      : outcome.kind === 'duplicate'
        ? outcome.reason
        : outcome.kind === 'invalid-input'
          ? outcome.reason
          : outcome.kind === 'unauthorized' || outcome.kind === 'identity-unresolved'
            ? outcome.reason
            : outcome.kind === 'not-found'
              ? outcome.reason
              : outcome.kind === 'write-failed'
                ? `The change did not save. ${outcome.error}`
                : outcome.kind === 'readback-mismatch'
                  ? `The change could not be confirmed. ${outcome.reason}`
                  : `Saved, but the audit entry failed (${outcome.auditError ?? 'unknown'}). An operator must reattempt the audit; do not retry.`;
  return (
    <div
      role={ok ? 'status' : 'alert'}
      style={{ ...styles.outcomeBanner, ...(ok ? styles.outcomeOk : styles.outcomeBad) }}
      data-admin-deal-reference-outcome={outcome.kind}
    >
      {text}
    </div>
  );
}

function labelForAction(action: string): string {
  switch (action) {
    case 'create': return 'Value added';
    case 'update': return 'Value updated';
    case 'deactivate': return 'Value deactivated';
    case 'reactivate': return 'Value reactivated';
    default: return 'Done';
  }
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
  subtitle: { margin: `${spacing.xs} 0 0`, fontSize: typography.size.sm, color: palette.textMuted, maxWidth: 640, lineHeight: typography.lineHeight.snug },
  inactiveToggle: { display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: typography.size.sm, color: palette.textMuted },
  readonlyBanner: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: spacing.sm, fontSize: typography.size.sm, color: palette.text },
  errorBanner: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.sm, padding: spacing.sm, fontSize: typography.size.sm, color: palette.text },
  outcomeBanner: { borderRadius: radius.sm, padding: spacing.sm, fontSize: typography.size.sm, border: '1px solid' },
  outcomeOk: { background: palette.clearBg, borderColor: palette.clear, color: palette.text },
  outcomeBad: { background: palette.atRiskBg, borderColor: palette.atRisk, color: palette.text },
  muted: { color: palette.textSubtle, fontSize: typography.size.sm, fontStyle: 'italic' },
  categories: { display: 'flex', flexDirection: 'column', gap: spacing.lg },
  category: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  uncategorized: { display: 'flex', flexDirection: 'column', gap: spacing.xs, borderTop: `1px solid ${palette.divider}`, paddingTop: spacing.sm },
  categoryTitle: { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: palette.text },
  rows: { display: 'flex', flexDirection: 'column', gap: 2 },
  row: { display: 'grid', gridTemplateColumns: '1fr 160px 60px 90px auto', alignItems: 'center', gap: spacing.sm, padding: `${spacing.xxs} 0`, borderBottom: `1px solid ${palette.divider}`, fontSize: typography.size.sm },
  editRow: { display: 'flex', gap: spacing.xs, alignItems: 'center', padding: `${spacing.xxs} 0`, flexWrap: 'wrap' },
  rowName: { color: palette.text, fontWeight: typography.weight.medium },
  rowCode: { color: palette.textMuted, fontFamily: 'monospace', fontSize: typography.size.xs },
  rowSort: { color: palette.textSubtle, textAlign: 'right' },
  activeBadge: { color: palette.clear, fontSize: typography.size.xs, fontWeight: typography.weight.semibold },
  inactiveBadge: { color: palette.textSubtle, fontSize: typography.size.xs, fontStyle: 'italic' },
  rowActions: { display: 'flex', gap: spacing.sm, justifyContent: 'flex-end' },
  addRow: { display: 'flex', gap: spacing.xs, alignItems: 'center', marginTop: spacing.xs, flexWrap: 'wrap' },
  input: { flex: '1 1 160px', minWidth: 120, padding: `${spacing.xxs} ${spacing.xs}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  inputCode: { width: 140, padding: `${spacing.xxs} ${spacing.xs}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: 'monospace' },
  inputSort: { width: 70, padding: `${spacing.xxs} ${spacing.xs}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm, fontSize: typography.size.sm, fontFamily: typography.family },
  primaryBtn: { background: palette.primary, color: palette.textInverse, border: 'none', borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, cursor: 'pointer', fontFamily: typography.family },
  secondaryBtn: { background: palette.surface, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xxs} ${spacing.sm}`, fontSize: typography.size.sm, cursor: 'pointer', fontFamily: typography.family },
  linkBtn: { background: 'transparent', color: palette.primary, border: 'none', padding: 0, fontSize: typography.size.sm, cursor: 'pointer', fontFamily: typography.family, fontWeight: typography.weight.medium },
};

