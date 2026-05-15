import { useEffect, useMemo, useRef, useState } from 'react';
import type { DealDocument } from './dealDocumentQueries';
import type { DealTask } from './dealTaskQueries';
import type { CreateDocumentReviewTaskOutcome } from './dealTaskActions';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 70: banker-side "Create review task" modal.
 *
 * Pairs with the Phase 54 pending-review signal: when a received
 * document has sat unreviewed past the at-risk threshold, the banker
 * can self-assign a follow-up task that surfaces in their own work
 * queue and on the deal's task list.
 *
 * What this modal is:
 *   - A confirmation surface for the Phase 70 governed write
 *     `deal-document-review-task-create`. The banker provides a
 *     required note; the action creates a self-assigned deal task
 *     titled "Follow up on document review: <document name>" and
 *     emits audit + timeline rows.
 *
 * What this modal is NOT:
 *   - It does NOT mark the document reviewed (that is Phase 55's
 *     ReviewDocumentModal — a different governed write with
 *     different semantics).
 *   - It does NOT reassign the document to another banker — task
 *     reassignment is a deferred capability; Phase 70 self-assigns
 *     only.
 *   - It does NOT alter the document checklist row in any way.
 *
 * Duplicate-task hint (best-effort):
 *   - If an open task with the document name in its title already
 *     exists for this deal, the modal renders a soft hint. The
 *     banker may proceed anyway — the schema offers no
 *     document-foreign-key column on cr664_dealtask1s, so the match
 *     is necessarily a title-substring heuristic, not a hard
 *     deduplication guarantee.
 */

interface CreateDocumentReviewTaskModalProps {
  doc: DealDocument;
  /** Open tasks on the same deal, from useDealData(). Used for
   *  duplicate-task hinting. Empty array if data still loading;
   *  the hint simply doesn't surface in that case. */
  openTasks: readonly DealTask[];
  /** Banker display name; included in the audit note for
   *  human-readability. Optional. */
  bankerName: string | undefined;
  onConfirm: (note: string) => Promise<CreateDocumentReviewTaskOutcome>;
  onClose: () => void;
}

type ModalState =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'outcome'; outcome: CreateDocumentReviewTaskOutcome };

export function CreateDocumentReviewTaskModal({
  doc,
  openTasks,
  bankerName,
  onConfirm,
  onClose,
}: CreateDocumentReviewTaskModalProps) {
  const [note, setNote] = useState('');
  const [state, setState] = useState<ModalState>({ kind: 'editing' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
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

  // Best-effort duplicate detection: title-substring match against
  // openTasks. No promise of completeness — the schema has no
  // document-foreign-key on cr664_dealtask1s. The banker may proceed
  // regardless.
  const suspectedDuplicate = useMemo(
    () => findSuspectedDuplicate(doc.name, openTasks),
    [doc.name, openTasks],
  );

  const trimmedNote = note.trim();
  const canSubmit = state.kind === 'editing' && trimmedNote.length > 0;
  const inProgress = state.kind === 'submitting';

  async function handleConfirm() {
    if (!canSubmit) return;
    setState({ kind: 'submitting' });
    try {
      const outcome = await onConfirm(trimmedNote);
      setState({ kind: 'outcome', outcome });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: 'outcome', outcome: { kind: 'unknown', message } });
    }
  }

  const proposedTitle = `Follow up on document review: ${doc.name}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-review-task-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Deal Workspace · Documents</div>
            <h2 id="create-review-task-title" style={styles.title}>
              Create review task
            </h2>
          </div>
        </header>

        <section style={styles.summarySection}>
          <div style={styles.summaryHeaderRow}>
            <span style={styles.docName}>{doc.name}</span>
            <Badge variant="atRisk" appearance="outline">
              Document may require review
            </Badge>
          </div>
          <dl style={styles.facts}>
            <Fact label="Received" value={formatDate(doc.receivedDate)} />
            <Fact
              label="Assignee"
              value={bankerName ?? 'You (self-assigned)'}
            />
            <Fact label="Proposed task title" value={proposedTitle} />
          </dl>
        </section>

        {state.kind === 'outcome' ? (
          <OutcomeBlock outcome={state.outcome} />
        ) : (
          <>
            {suspectedDuplicate && (
              <div style={styles.duplicateHint} role="status">
                <strong>An open task may already cover this document.</strong>{' '}
                We found an existing open task titled{' '}
                <em>{suspectedDuplicate.title}</em>. You may proceed and create
                another, but consider whether the existing task suffices.
                Duplicate detection is a title-substring match only; the
                schema has no document foreign key on tasks, so this hint is
                advisory.
              </div>
            )}
            <section style={styles.noteSection}>
              <label
                htmlFor="create-review-task-note"
                style={styles.label}
              >
                Follow-up note <span style={styles.required}>required</span>
              </label>
              <textarea
                id="create-review-task-note"
                ref={textareaRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={inProgress}
                placeholder="Why does this document need a follow-up review task? (e.g. need to compare against memo; need a second pair of eyes; deferring until Friday.) The note is copied to the audit event and the deal activity timeline."
                rows={4}
                style={{
                  ...styles.textarea,
                  opacity: inProgress ? 0.6 : 1,
                }}
              />
              <p style={styles.helperLine}>
                The task is self-assigned to you. It surfaces in your work
                queue and on the deal's open-tasks list. No automatic routing
                or escalation occurs. The cr664_dealtask1s schema has no
                document foreign key; the document linkage lives in the task
                title plus the audit + timeline rows' related-entity fields.
              </p>
            </section>
          </>
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
                style={
                  inProgress
                    ? styles.secondaryButtonDisabled
                    : styles.secondaryButton
                }
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canSubmit}
                style={
                  canSubmit ? styles.primaryButton : styles.primaryButtonDisabled
                }
              >
                {inProgress ? 'Creating…' : 'Create review task'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function findSuspectedDuplicate(
  documentName: string,
  openTasks: readonly DealTask[],
): DealTask | undefined {
  const needle = documentName.trim().toLowerCase();
  if (needle.length === 0) return undefined;
  return openTasks.find((t) => t.title.toLowerCase().includes(needle));
}

function OutcomeBlock({
  outcome,
}: {
  outcome: CreateDocumentReviewTaskOutcome;
}) {
  switch (outcome.kind) {
    case 'success':
      return (
        <div
          style={{
            ...styles.outcomeBox,
            background: palette.clearBg,
            borderColor: palette.clear,
          }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
            Review task created
          </div>
          <p style={styles.outcomeDetail}>
            A self-assigned follow-up task was added to this deal. It appears
            in your work queue and on the deal's open-tasks list. Audit and
            timeline events were recorded.
          </p>
        </div>
      );
    case 'task-create-failed':
      return (
        <div
          style={{
            ...styles.outcomeBox,
            background: palette.atRiskBg,
            borderColor: palette.atRisk,
          }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Could not create review task
          </div>
          <p style={styles.outcomeDetail}>
            No task was created. A Failed audit event was recorded best-effort.
            Refresh and try again.
          </p>
          <p style={styles.outcomeDetailMono}>{outcome.taskError}</p>
        </div>
      );
    case 'governance-partial':
      return (
        <div
          style={{
            ...styles.outcomeBox,
            background: palette.blockedBg,
            borderColor: palette.blocked,
          }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.blockedFg }}>
            Critical: governance write failed
          </div>
          <p style={styles.outcomeDetail}>
            The follow-up task was created on this deal, but one or both
            governance writes failed. The task itself exists; the audit /
            timeline pair is incomplete.
          </p>
          {outcome.auditError && (
            <p style={styles.outcomeDetailMono}>Audit: {outcome.auditError}</p>
          )}
          {outcome.timelineError && (
            <p style={styles.outcomeDetailMono}>
              Timeline: {outcome.timelineError}
            </p>
          )}
          <p style={styles.outcomeDetail}>
            Action: capture this message and ask the AuditEvent / TimelineEvent
            owner to investigate. Do not retry — the task is already created.
          </p>
        </div>
      );
    case 'unknown':
      return (
        <div
          style={{
            ...styles.outcomeBox,
            background: palette.atRiskBg,
            borderColor: palette.atRisk,
          }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Unexpected error
          </div>
          <p style={styles.outcomeDetail}>{outcome.message}</p>
        </div>
      );
  }
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value ?? '—'}</dd>
    </div>
  );
}

function formatDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
    maxWidth: 560,
    maxHeight: '90vh',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: `${spacing.xl} ${spacing.xl}`,
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
  summarySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottom: `1px solid ${palette.divider}`,
  },
  summaryHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  docName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  facts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
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
  dd: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    wordBreak: 'break-word',
  },
  duplicateHint: {
    margin: 0,
    padding: spacing.sm,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  noteSection: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
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
  textarea: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    background: palette.surface,
    resize: 'vertical',
    minHeight: 80,
    lineHeight: typography.lineHeight.snug,
  },
  helperLine: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle },
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
