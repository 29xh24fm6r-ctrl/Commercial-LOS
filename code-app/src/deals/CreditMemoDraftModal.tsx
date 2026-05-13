import { useEffect, useMemo, useState } from 'react';
import type { DealDetail } from './dealQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData } from './creditMemoQueries';
import {
  ALL_SECTION_KEYS,
  SECTION_OPTIONS,
  buildCreditMemoDraft,
  type CreditMemoSectionKey,
} from './creditMemoDraft';
import { findProhibitedTerms } from './borrowerUpdateDraft';
import type {
  SaveCreditMemoDraftOutcome,
  SaveCreditMemoDraftSection,
} from './creditMemoActions';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Credit Memo DRAFT PREVIEW modal.
 *
 * Phase 24 (local-only): generate, edit, Copy. No write.
 * Phase 25 (governed save): when an onSave handler is provided, the
 * modal also exposes a Save Draft action that takes the banker
 * through a confirmation step (summary + required note + commitment-
 * language guard) and then surfaces the SaveCreditMemoDraftOutcome.
 *
 * Even with Phase 25 wired up, the modal NEVER exposes Finalize,
 * Submit, Export, or Send. Those belong to a later phase with
 * separate audit + timeline rules.
 */

export interface DraftSectionSnapshot {
  sectionKey: CreditMemoSectionKey;
  sectionLabel: string;
  draftText: string;
}

interface CreditMemoDraftModalProps {
  deal: DealDetail;
  tasks: DealTasksResult | undefined;
  documents: DealDocumentsResult | undefined;
  existingMemos: CreditMemoData | undefined;
  onClose: () => void;
  /** Phase 25: governed Save Draft handler. When undefined the modal
   *  stays in pure local-preview mode (Phase 24 surface). */
  onSave?: (input: {
    memoBody: string;
    saveNote: string;
    sections: SaveCreditMemoDraftSection[];
  }) => Promise<SaveCreditMemoDraftOutcome>;
}

type CopyState = 'idle' | 'copied' | 'failed';

type Stage =
  | { kind: 'editing' }
  | { kind: 'confirming' }
  | { kind: 'saving' }
  | { kind: 'save-outcome'; outcome: SaveCreditMemoDraftOutcome };

export function CreditMemoDraftModal({
  deal,
  tasks,
  documents,
  existingMemos,
  onClose,
  onSave,
}: CreditMemoDraftModalProps) {
  const [enabled, setEnabled] = useState<Set<CreditMemoSectionKey>>(
    () => new Set(ALL_SECTION_KEYS),
  );
  const enabledList = useMemo(
    () => ALL_SECTION_KEYS.filter((k) => enabled.has(k)),
    [enabled],
  );

  const generated = useMemo(
    () =>
      buildCreditMemoDraft(enabledList, {
        deal,
        tasks,
        documents,
        existingMemos,
      }),
    [enabledList, deal, tasks, documents, existingMemos],
  );

  // Per-section snapshots used at save time so each
  // cr664_creditmemodraftsection row captures its slice of the
  // generated content. We regenerate per section here, not by
  // parsing the combined body — that way each section's draftText
  // is a clean self-contained chunk.
  const sectionSnapshots = useMemo<DraftSectionSnapshot[]>(
    () =>
      enabledList.map((k) => {
        const opt = SECTION_OPTIONS.find((o) => o.key === k)!;
        const single = buildCreditMemoDraft([k], {
          deal,
          tasks,
          documents,
          existingMemos,
        });
        return { sectionKey: k, sectionLabel: opt.label, draftText: single.body };
      }),
    [enabledList, deal, tasks, documents, existingMemos],
  );

  // Banker may edit the generated body; we seed from generated.body
  // when it changes (i.e. when section selection changes).
  const [body, setBody] = useState(generated.body);
  const [bodyOverridden, setBodyOverridden] = useState(false);
  const [copy, setCopy] = useState<CopyState>('idle');
  const [stage, setStage] = useState<Stage>({ kind: 'editing' });
  const [saveNote, setSaveNote] = useState('');

  useEffect(() => {
    if (!bodyOverridden) {
      setBody(generated.body);
      setCopy('idle');
    }
  }, [generated.body, bodyOverridden]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && stage.kind !== 'saving') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, stage.kind]);

  function toggleSection(key: CreditMemoSectionKey) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function regenerate() {
    setBody(generated.body);
    setBodyOverridden(false);
    setCopy('idle');
  }

  async function handleCopy() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(body);
        setCopy('copied');
        return;
      }
      setCopy('failed');
    } catch {
      setCopy('failed');
    }
  }

  const prohibitedHits = useMemo(
    () => findProhibitedTerms(body, deal),
    [body, deal],
  );
  const canCopy = body.trim().length > 0;
  const noteOk = saveNote.trim().length > 0;
  const languageOk = prohibitedHits.length === 0;
  const bodyOk = body.trim().length > 0;
  const canSave = noteOk && languageOk && bodyOk;
  const submitting = stage.kind === 'saving';

  function openConfirm() {
    if (!onSave) return;
    setStage({ kind: 'confirming' });
  }

  async function handleSave() {
    if (!onSave || !canSave) return;
    setStage({ kind: 'saving' });
    try {
      const outcome = await onSave({
        memoBody: body,
        saveNote: saveNote.trim(),
        sections: sectionSnapshots.map((s) => ({
          sectionKey: s.sectionKey,
          sectionLabel: s.sectionLabel,
          draftText: s.draftText,
        })),
      });
      setStage({ kind: 'save-outcome', outcome });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStage({
        kind: 'save-outcome',
        outcome: { kind: 'unknown', message },
      });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-memo-draft-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Deal Workspace · Credit Memo</div>
            <h2 id="credit-memo-draft-title" style={styles.title}>
              Generate Draft Preview
            </h2>
          </div>
          <Badge variant="neutral" appearance="outline">
            Draft preview
          </Badge>
        </header>

        <p style={styles.localOnlyBanner} role="status">
          <strong>Draft preview — not saved, not final, banker review required.</strong>{' '}
          Generated locally from the deal record only. No AI was used.
          {onSave
            ? ' Save Draft persists a Draft memo record (and Pending section drafts) plus governance events; it never finalizes, exports, or sends.'
            : ' No memo will be saved, exported, or finalized from this dialog. Persistence and export are a later phase.'}
        </p>

        {stage.kind === 'save-outcome' ? (
          <OutcomeBlock outcome={stage.outcome} />
        ) : stage.kind === 'confirming' || stage.kind === 'saving' ? (
          <ConfirmBlock
            deal={deal}
            enabledCount={enabledList.length}
            missingCount={generated.missingFields.length}
            prohibitedHits={prohibitedHits}
            note={saveNote}
            onNoteChange={(v) => setSaveNote(v)}
            submitting={submitting}
          />
        ) : (
          <div style={styles.workspace}>
            <aside style={styles.sidebar}>
              <h3 style={styles.sidebarHeading}>Sections</h3>
              <ul style={styles.sectionList}>
                {SECTION_OPTIONS.map((opt) => {
                  const checked = enabled.has(opt.key);
                  return (
                    <li key={opt.key}>
                      <label style={styles.sectionLabel}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSection(opt.key)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <h3 style={styles.sidebarHeading}>Missing information</h3>
              {generated.missingFields.length === 0 ? (
                <p style={styles.muted}>None detected for selected sections.</p>
              ) : (
                <ul style={styles.missingList}>
                  {generated.missingFields.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
              {bodyOverridden && (
                <button type="button" onClick={regenerate} style={styles.secondaryButton}>
                  Regenerate from sections
                </button>
              )}
            </aside>

            <section style={styles.main}>
              <label style={styles.label} htmlFor="credit-memo-draft-body">
                Memo body
              </label>
              <textarea
                id="credit-memo-draft-body"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setBodyOverridden(true);
                  setCopy('idle');
                }}
                rows={28}
                style={styles.textareaBody}
              />
            </section>
          </div>
        )}

        {stage.kind === 'editing' && copy === 'copied' && (
          <div
            style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}
            role="status"
          >
            <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
              Copied to clipboard
            </div>
            <p style={styles.outcomeDetail}>
              The draft text was copied. Nothing has been saved to Dataverse and no memo
              record has been created or modified.
            </p>
          </div>
        )}
        {stage.kind === 'editing' && copy === 'failed' && (
          <div
            style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
            role="alert"
          >
            <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
              Could not access clipboard
            </div>
            <p style={styles.outcomeDetail}>
              Select the body text manually and copy it (Ctrl+C / Cmd+C). The browser
              clipboard API was unavailable.
            </p>
          </div>
        )}

        <footer style={styles.footer}>
          {stage.kind === 'save-outcome' ? (
            <button type="button" onClick={onClose} style={styles.primaryButton}>
              Close
            </button>
          ) : stage.kind === 'confirming' || stage.kind === 'saving' ? (
            <>
              <button
                type="button"
                onClick={() => setStage({ kind: 'editing' })}
                disabled={submitting}
                style={submitting ? styles.secondaryButtonDisabled : styles.secondaryButton}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || submitting}
                style={
                  canSave && !submitting ? styles.primaryButton : styles.primaryButtonDisabled
                }
                aria-label="Save credit memo draft"
              >
                {submitting ? 'Saving…' : 'Save Draft'}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} style={styles.secondaryButton}>
                Close
              </button>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!canCopy}
                style={canCopy ? styles.primaryButton : styles.primaryButtonDisabled}
                aria-label="Copy draft to clipboard"
              >
                Copy draft
              </button>
              {onSave && (
                <button
                  type="button"
                  onClick={openConfirm}
                  disabled={!bodyOk}
                  style={bodyOk ? styles.primaryButton : styles.primaryButtonDisabled}
                  aria-label="Save credit memo draft"
                >
                  Save Draft…
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function ConfirmBlock({
  deal,
  enabledCount,
  missingCount,
  prohibitedHits,
  note,
  onNoteChange,
  submitting,
}: {
  deal: DealDetail;
  enabledCount: number;
  missingCount: number;
  prohibitedHits: ReturnType<typeof findProhibitedTerms>;
  note: string;
  onNoteChange: (v: string) => void;
  submitting: boolean;
}) {
  return (
    <section style={styles.confirmBlock} aria-label="Save draft confirmation">
      <h3 style={styles.confirmHeading}>Confirm save</h3>
      <p style={styles.confirmIntro}>
        <strong>Draft only, not final.</strong> A new <code>cr664_creditmemo1</code>{' '}
        record will be created in <em>Draft</em> status, with one{' '}
        <code>cr664_creditmemodraftsection</code> per included section in{' '}
        <em>Pending</em> review status. An audit event and a timeline entry will be
        emitted. No memo is finalized, exported, or submitted.
      </p>
      <dl style={styles.confirmFacts}>
        <Fact label="Deal" value={deal.name} />
        <Fact label="Stage" value={deal.stage ?? '—'} />
        <Fact label="Included sections" value={String(enabledCount)} />
        <Fact label="Missing fields" value={String(missingCount)} />
      </dl>
      {prohibitedHits.length > 0 && (
        <div style={styles.guardBox} role="alert">
          <div style={styles.guardTitle}>Borrower-safe language check failed</div>
          <ul style={styles.guardList}>
            {prohibitedHits.map((h) => (
              <li key={h.term}>
                <strong>{h.term}</strong> — {h.reason}
              </li>
            ))}
          </ul>
          <p style={styles.guardDetail}>
            Save is blocked. Remove or soften these terms in the memo body
            (Back), then return to confirm.
          </p>
        </div>
      )}
      <label htmlFor="credit-memo-save-note" style={styles.label}>
        Save note <span style={styles.required}>required</span>
      </label>
      <textarea
        id="credit-memo-save-note"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        disabled={submitting}
        rows={3}
        placeholder="Why is this draft being saved? (Internal only — recorded on the audit + timeline.)"
        style={styles.textareaReason}
      />
    </section>
  );
}

function OutcomeBlock({ outcome }: { outcome: SaveCreditMemoDraftOutcome }) {
  switch (outcome.kind) {
    case 'success':
      return (
        <div
          style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}
          role="status"
        >
          <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
            Draft saved
          </div>
          <p style={styles.outcomeDetail}>
            Draft credit memo recorded ({outcome.sectionIds.length} section{' '}
            {outcome.sectionIds.length === 1 ? 'draft' : 'drafts'}); audit and timeline
            events emitted. Final review and finalization remain a separate workflow.
          </p>
        </div>
      );
    case 'memo-failed':
      return (
        <div
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
          role="alert"
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Could not save draft
          </div>
          <p style={styles.outcomeDetail}>
            The draft was not saved. A Failed audit event was recorded best-effort.
            You can safely retry.
          </p>
          <p style={styles.outcomeDetailMono}>{outcome.memoError}</p>
        </div>
      );
    case 'governance-partial':
      return (
        <div
          style={{ ...styles.outcomeBox, background: palette.blockedBg, borderColor: palette.blocked }}
          role="alert"
        >
          <div style={{ ...styles.outcomeTitle, color: palette.blockedFg }}>
            Critical: governance write failed
          </div>
          <p style={styles.outcomeDetail}>
            The draft memo was saved, but one or more governance writes failed.
            Do not retry — the draft may already be saved.
          </p>
          {outcome.sectionErrors.length > 0 && (
            <div style={styles.outcomePartialBlock}>
              <strong>Section drafts not saved:</strong>
              <ul style={styles.outcomeList}>
                {outcome.sectionErrors.map((s) => (
                  <li key={s.sectionKey}>
                    <code>{s.sectionKey}</code>: <span>{s.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {outcome.auditError && (
            <p style={styles.outcomeDetailMono}>Audit: {outcome.auditError}</p>
          )}
          {outcome.timelineError && (
            <p style={styles.outcomeDetailMono}>Timeline: {outcome.timelineError}</p>
          )}
          <p style={styles.outcomeDetail}>
            Action: capture this message and ask the AuditEvent / TimelineEvent owner to
            investigate. The memo row itself is at <code>{outcome.memoId}</code>.
          </p>
        </div>
      );
    case 'unknown':
      return (
        <div
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
          role="alert"
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Unexpected error
          </div>
          <p style={styles.outcomeDetail}>{outcome.message}</p>
        </div>
      );
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value}</dd>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20, 26, 42, 0.45)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 100,
    fontFamily: typography.family,
    overflowY: 'auto',
  },
  card: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(20, 26, 42, 0.18)',
    width: '100%',
    maxWidth: 1080,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: `${spacing.xl} ${spacing.xl}`,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
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
  localOnlyBanner: {
    margin: 0,
    padding: `${spacing.xs} ${spacing.md}`,
    background: palette.neutralBg,
    color: palette.neutralFg,
    fontSize: typography.size.sm,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    lineHeight: typography.lineHeight.snug,
  },
  workspace: {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 280px) 1fr',
    gap: spacing.md,
    alignItems: 'stretch',
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    paddingRight: spacing.md,
    borderRight: `1px solid ${palette.divider}`,
    minWidth: 0,
  },
  sidebarHeading: {
    margin: `${spacing.xs} 0 0 0`,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  sectionList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxs,
  },
  sectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    fontSize: typography.size.sm,
    color: palette.text,
    cursor: 'pointer',
  },
  missingList: {
    margin: 0,
    paddingLeft: spacing.md,
    fontSize: typography.size.sm,
    color: palette.atRiskFg,
    lineHeight: typography.lineHeight.snug,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  muted: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontStyle: 'italic',
  },
  main: { display: 'flex', flexDirection: 'column', gap: spacing.xxs, minWidth: 0 },
  label: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  required: {
    marginLeft: spacing.xxs,
    color: palette.atRiskFg,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: typography.weight.regular,
  },
  textareaBody: {
    fontFamily: typography.mono,
    fontSize: typography.size.sm,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    background: palette.surfaceAlt,
    resize: 'vertical',
    minHeight: 360,
    lineHeight: typography.lineHeight.snug,
  },
  textareaReason: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    background: palette.surface,
    resize: 'vertical',
    minHeight: 70,
    lineHeight: typography.lineHeight.snug,
  },
  confirmBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: spacing.md,
    background: palette.surfaceAlt,
  },
  confirmHeading: {
    margin: 0,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  confirmIntro: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  confirmFacts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: `${spacing.xs} ${spacing.md}`,
    margin: 0,
  },
  fact: { display: 'flex', flexDirection: 'column', gap: 2 },
  dt: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  dd: { margin: 0, fontSize: typography.size.sm, color: palette.text, wordBreak: 'break-word' },
  guardBox: {
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    background: palette.atRiskBg,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  guardTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: palette.atRiskFg,
  },
  guardList: {
    margin: 0,
    paddingLeft: spacing.md,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  guardDetail: { margin: 0, fontSize: typography.size.sm, color: palette.text },
  outcomeBox: {
    border: '1px solid',
    borderRadius: radius.sm,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  outcomeTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold },
  outcomeDetail: {
    margin: 0,
    fontSize: typography.size.md,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
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
  outcomePartialBlock: {
    fontSize: typography.size.sm,
    color: palette.text,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxs,
  },
  outcomeList: {
    margin: 0,
    paddingLeft: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  footer: {
    display: 'flex',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    paddingTop: spacing.sm,
    borderTop: `1px solid ${palette.divider}`,
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
