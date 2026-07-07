import { useEffect, useMemo, useRef, useState } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';
import type { CrmLinkOption } from './dealCrmLinkOptions';
import type {
  DealCrmLinkTarget,
  LinkDealCrmEntityOutcome,
} from './write/linkDealCrmEntity';

/**
 * Search-and-select modal for linking an EXISTING canonical CRM entity to a
 * deal (client relationship or team). It lists real Dataverse records the
 * banker chooses from — it never creates a client/team/contact/activity.
 *
 * Reusable across both link targets via `targetKind`; the connected panel
 * injects the option loader and the governed link action.
 */

const COPY: Record<
  DealCrmLinkTarget,
  { title: string; eyebrow: string; entity: string; confirm: string }
> = {
  client: {
    title: 'Link CRM client',
    eyebrow: 'CRM relationship',
    entity: 'client',
    confirm: 'Link client',
  },
  team: {
    title: 'Assign owning team',
    eyebrow: 'CRM relationship',
    entity: 'team',
    confirm: 'Assign team',
  },
};

type ModalState =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'outcome'; outcome: LinkDealCrmEntityOutcome };

interface LinkDealCrmEntityModalProps {
  targetKind: DealCrmLinkTarget;
  /** Deal name for the header (display only). */
  dealName?: string | undefined;
  /** Loads the existing records to choose from. Injected for tests. */
  loadOptions: () => Promise<CrmLinkOption[]>;
  /** Performs the governed link write and returns the outcome. */
  onLink: (option: CrmLinkOption) => Promise<LinkDealCrmEntityOutcome>;
  /** Called when the link persisted (success or audit-failed) so the parent
   *  can optimistically reflect the confirmed link. */
  onLinked: (option: CrmLinkOption, outcome: LinkDealCrmEntityOutcome) => void;
  onClose: () => void;
}

export function LinkDealCrmEntityModal({
  targetKind,
  dealName,
  loadOptions,
  onLink,
  onLinked,
  onClose,
}: LinkDealCrmEntityModalProps) {
  const copy = COPY[targetKind];
  const [options, setOptions] = useState<readonly CrmLinkOption[] | null>(null);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [state, setState] = useState<ModalState>({ kind: 'editing' });
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = `link-crm-${targetKind}-title`;

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && state.kind !== 'submitting') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, state.kind]);

  useEffect(() => {
    let cancelled = false;
    loadOptions()
      .then((opts) => {
        if (!cancelled) setOptions(opts);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadFailed(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [loadOptions]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = options ?? [];
    if (q.length === 0) return all;
    return all.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.sublabel ? o.sublabel.toLowerCase().includes(q) : false),
    );
  }, [options, filter]);

  const selected = useMemo(
    () => (options ?? []).find((o) => o.id === selectedId) ?? null,
    [options, selectedId],
  );

  const inProgress = state.kind === 'submitting';
  const canSubmit = state.kind === 'editing' && selected !== null;

  async function handleConfirm() {
    if (!selected) return;
    setState({ kind: 'submitting' });
    let outcome: LinkDealCrmEntityOutcome;
    try {
      outcome = await onLink(selected);
    } catch (err: unknown) {
      outcome = {
        kind: 'write-failed',
        error: err instanceof Error ? err.message : String(err),
        correlationId: 'n/a',
      };
    }
    if (outcome.kind === 'success' || outcome.kind === 'audit-failed') {
      onLinked(selected, outcome);
    }
    setState({ kind: 'outcome', outcome });
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={styles.overlay}>
      <div style={styles.card} data-link-crm-modal={targetKind}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>
              {copy.eyebrow}
              {dealName ? ` · ${dealName}` : ''}
            </div>
            <h2 id={titleId} style={styles.title}>
              {copy.title}
            </h2>
          </div>
        </header>

        {state.kind === 'outcome' ? (
          <OutcomeBlock outcome={state.outcome} entity={copy.entity} />
        ) : (
          <div style={styles.body}>
            <label style={styles.label}>
              Search existing {copy.entity}s
              <input
                ref={searchRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                disabled={inProgress}
                placeholder={`Filter ${copy.entity}s by name`}
                style={styles.input}
                data-link-crm-search
                aria-label={`Search existing CRM ${copy.entity}s`}
              />
            </label>

            {loadFailed ? (
              <div role="alert" style={styles.loadError} data-link-crm-load-error>
                Could not load {copy.entity}s: {loadFailed}
              </div>
            ) : options === null ? (
              <div style={styles.helperLine}>Loading {copy.entity}s…</div>
            ) : filtered.length === 0 ? (
              <div style={styles.helperLine} data-link-crm-empty>
                No matching {copy.entity}s. Only existing CRM records can be linked here.
              </div>
            ) : (
              <ul style={styles.optionList} role="listbox" aria-label={`Existing ${copy.entity}s`}>
                {filtered.map((o) => {
                  const isSel = o.id === selectedId;
                  return (
                    <li key={o.id} style={styles.optionItem}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onClick={() => setSelectedId(o.id)}
                        disabled={inProgress}
                        style={{
                          ...styles.optionButton,
                          ...(isSel ? styles.optionButtonSelected : null),
                        }}
                        data-link-crm-option={o.id}
                        data-link-crm-option-kind={o.sourceKind ?? 'clientrelationship'}
                      >
                        <span style={styles.optionName}>
                          {o.name}
                          {!o.active && <span style={styles.inactiveTag}> · inactive</span>}
                        </span>
                        {o.sublabel && <span style={styles.optionSub}>{o.sublabel}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <footer style={styles.footer}>
          {state.kind === 'outcome' ? (
            <button type="button" onClick={onClose} style={styles.primaryButton}>
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={inProgress}
                style={inProgress ? styles.secondaryButtonDisabled : styles.secondaryButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canSubmit}
                style={canSubmit ? styles.primaryButton : styles.primaryButtonDisabled}
                data-link-crm-confirm
              >
                {inProgress ? 'Linking…' : copy.confirm}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function OutcomeBlock({
  outcome,
  entity,
}: {
  outcome: LinkDealCrmEntityOutcome;
  entity: string;
}) {
  switch (outcome.kind) {
    case 'success':
      return (
        <div
          role="status"
          style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}
          data-link-crm-outcome="success"
        >
          <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
            {entity[0].toUpperCase() + entity.slice(1)} linked
          </div>
          <p style={styles.outcomeDetail}>
            The deal now points at {outcome.entityName ?? 'the selected record'}. The link was
            read back to confirm it persisted and recorded in the CRM audit trail.
          </p>
        </div>
      );
    case 'audit-failed':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
          data-link-crm-outcome="audit-failed"
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Linked, but the audit write failed
          </div>
          <p style={styles.outcomeDetail}>
            The {entity} link persisted and was read back, but the CRM audit entry could not be
            written. Do not retry the link — ask the audit owner to investigate.
          </p>
          {outcome.auditError && <p style={styles.outcomeDetailMono}>{outcome.auditError}</p>}
        </div>
      );
    case 'unauthorized':
    case 'identity-unresolved':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
          data-link-crm-outcome={outcome.kind}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>Not saved</div>
          <p style={styles.outcomeDetail}>{outcome.reason}</p>
        </div>
      );
    case 'invalid-input':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
          data-link-crm-outcome="invalid-input"
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>Not saved</div>
          <p style={styles.outcomeDetail}>{outcome.reason}</p>
        </div>
      );
    case 'readback-mismatch':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
          data-link-crm-outcome="readback-mismatch"
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>Could not confirm the link</div>
          <p style={styles.outcomeDetail}>
            The update did not read back as linked, so the link is not shown as saved. Refresh and
            try again.
          </p>
        </div>
      );
    case 'write-failed':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
          data-link-crm-outcome="write-failed"
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>Could not link</div>
          <p style={styles.outcomeDetail}>Nothing was changed on the deal. Refresh and try again.</p>
          <p style={styles.outcomeDetailMono}>{outcome.error}</p>
        </div>
      );
  }
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20, 26, 42, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 100,
    fontFamily: typography.family,
  },
  card: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(20, 26, 42, 0.18)',
    width: '100%',
    maxWidth: 520,
    maxHeight: '90vh',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: `${spacing.xl} ${spacing.xl}`,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm, flexWrap: 'wrap' },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.primary,
    fontWeight: typography.weight.semibold,
  },
  title: { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text },
  body: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxs,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  input: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    background: palette.surface,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: typography.weight.regular,
  },
  helperLine: { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle },
  loadError: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.atRiskFg,
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
  },
  optionList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxs,
    maxHeight: 260,
    overflow: 'auto',
  },
  optionItem: { margin: 0, padding: 0 },
  optionButton: {
    width: '100%',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    cursor: 'pointer',
    fontFamily: typography.family,
    color: palette.text,
  },
  optionButtonSelected: {
    borderColor: palette.primary,
    background: palette.panelBg,
    outline: `2px solid ${palette.primary}`,
  },
  optionName: { fontSize: typography.size.base, fontWeight: typography.weight.semibold, color: palette.text },
  optionSub: { fontSize: typography.size.xs, color: palette.textSubtle },
  inactiveTag: { color: palette.textMuted, fontWeight: typography.weight.regular, fontStyle: 'italic' },
  footer: { display: 'flex', gap: spacing.sm, justifyContent: 'flex-end', paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  outcomeBox: { border: '1px solid', borderRadius: radius.sm, padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  outcomeTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold },
  outcomeDetail: { margin: 0, fontSize: typography.size.md, color: palette.text, lineHeight: typography.lineHeight.snug },
  outcomeDetailMono: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontFamily: typography.mono,
    background: palette.surfaceAlt,
    padding: `${spacing.xxs} ${spacing.xs}`,
    borderRadius: radius.sm,
    wordBreak: 'break-word',
  },
  primaryButton: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  primaryButtonDisabled: {
    background: palette.borderStrong,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    cursor: 'not-allowed',
    fontFamily: typography.family,
  },
  secondaryButton: {
    background: palette.surface,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  secondaryButtonDisabled: {
    background: palette.surfaceAlt,
    color: palette.textMuted,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    cursor: 'not-allowed',
    fontFamily: typography.family,
  },
};
