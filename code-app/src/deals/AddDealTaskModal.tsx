import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreateDealTaskOutcome } from './createDealTaskAction';
import { loadAssignableUsers, type AssignableUser } from './assignableUserOptions';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * WF-1A — general "Add Task" modal for the Deal Workspace.
 *
 * Fields: title (required), assignee (systemuser picker; the acting banker is
 * always self-assignable and preselected), optional due date, optional note.
 * cr664_dealtask1 has no notes/description column, so the note is copied to the
 * governed audit + timeline rows only (see createDealTask), never onto the task.
 */

export interface AddDealTaskFields {
  taskName: string;
  assigneeSystemUserId: string;
  assigneeName: string | undefined;
  dueDate: string | undefined;
  note: string | undefined;
}

interface AddDealTaskModalProps {
  /** Deal name for the header (optional, display only). */
  dealName: string | undefined;
  /** The acting banker — always an assignable option, preselected. */
  self: { id: string; name: string };
  onConfirm: (fields: AddDealTaskFields) => Promise<CreateDealTaskOutcome>;
  onClose: () => void;
  /** Injected for tests; defaults to the live systemuser read. */
  loadAssignees?: () => Promise<readonly AssignableUser[]>;
}

type ModalState =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'outcome'; outcome: CreateDealTaskOutcome };

export function AddDealTaskModal({
  dealName,
  self,
  onConfirm,
  onClose,
  loadAssignees = loadAssignableUsers,
}: AddDealTaskModalProps) {
  const [taskName, setTaskName] = useState('');
  const [assigneeId, setAssigneeId] = useState(self.id);
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [others, setOthers] = useState<readonly AssignableUser[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [state, setState] = useState<ModalState>({ kind: 'editing' });
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
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

  // Load the other assignable users once. The acting banker is always
  // assignable from context, so a failed load still leaves a working picker.
  useEffect(() => {
    let cancelled = false;
    loadAssignees()
      .then((users) => {
        if (!cancelled) setOthers(users.filter((u) => u.id !== self.id));
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAssignees, self.id]);

  const options = useMemo(
    () => [{ id: self.id, name: `${self.name} (me)` }, ...others.map((u) => ({ id: u.id, name: u.email ? `${u.name} · ${u.email}` : u.name }))],
    [self.id, self.name, others],
  );
  const assigneeName = useMemo(() => {
    if (assigneeId === self.id) return self.name;
    return others.find((u) => u.id === assigneeId)?.name;
  }, [assigneeId, self.id, self.name, others]);

  const trimmedTitle = taskName.trim();
  const canSubmit = state.kind === 'editing' && trimmedTitle.length > 0 && assigneeId.length > 0;
  const inProgress = state.kind === 'submitting';

  async function handleConfirm() {
    if (!canSubmit) return;
    setState({ kind: 'submitting' });
    try {
      const outcome = await onConfirm({
        taskName: trimmedTitle,
        assigneeSystemUserId: assigneeId,
        assigneeName,
        dueDate: dueDate.trim() || undefined,
        note: note.trim() || undefined,
      });
      setState({ kind: 'outcome', outcome });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: 'outcome', outcome: { kind: 'unknown', message } });
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="add-task-title" style={styles.overlay}>
      <div style={styles.card} data-add-task-form>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Deal Workspace · Tasks{dealName ? ` · ${dealName}` : ''}</div>
            <h2 id="add-task-title" style={styles.title}>Add task</h2>
          </div>
        </header>

        {state.kind === 'outcome' ? (
          <OutcomeBlock outcome={state.outcome} />
        ) : (
          <div style={styles.body}>
            <label style={styles.label}>
              Task title <span style={styles.required}>required</span>
              <input
                ref={titleRef}
                type="text"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                disabled={inProgress}
                placeholder="e.g. Order flood determination"
                style={styles.input}
                data-add-task-title
                aria-required="true"
              />
            </label>

            <label style={styles.label}>
              Assignee
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={inProgress}
                style={styles.input}
                data-add-task-assignee
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              {loadFailed && (
                <span style={styles.helperLine} data-add-task-assignee-error>
                  Could not load other users; you can still assign this task to yourself.
                </span>
              )}
            </label>

            <label style={styles.label}>
              Due date (optional)
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={inProgress}
                style={styles.input}
                data-add-task-due
              />
            </label>

            <label style={styles.label}>
              Note (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={inProgress}
                rows={3}
                placeholder="Copied to the deal's audit + activity timeline (not stored on the task)."
                style={styles.textarea}
                data-add-task-note
              />
            </label>
          </div>
        )}

        <footer style={styles.footer}>
          {state.kind === 'outcome' ? (
            <button type="button" onClick={onClose} style={styles.primaryButton}>Close</button>
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
                data-add-task-submit
              >
                {inProgress ? 'Creating…' : 'Create task'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function OutcomeBlock({ outcome }: { outcome: CreateDealTaskOutcome }) {
  switch (outcome.kind) {
    case 'success':
      return (
        <div role="status" style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }} data-add-task-outcome="success">
          <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>Task created</div>
          <p style={styles.outcomeDetail}>The task was added to this deal and recorded in the audit + activity timeline.</p>
        </div>
      );
    case 'task-create-failed':
      return (
        <div role="alert" style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }} data-add-task-outcome="task-create-failed">
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>Could not create task</div>
          <p style={styles.outcomeDetail}>No task was created. A Failed audit event was recorded best-effort. Refresh and try again.</p>
          <p style={styles.outcomeDetailMono}>{outcome.taskError}</p>
        </div>
      );
    case 'governance-partial':
      return (
        <div role="alert" style={{ ...styles.outcomeBox, background: palette.blockedBg, borderColor: palette.blocked }} data-add-task-outcome="governance-partial">
          <div style={{ ...styles.outcomeTitle, color: palette.blockedFg }}>Critical: governance write failed</div>
          <p style={styles.outcomeDetail}>The task was created, but one or both governance writes failed. Do not retry — the task already exists; ask the AuditEvent / TimelineEvent owner to investigate.</p>
          {outcome.auditError && <p style={styles.outcomeDetailMono}>Audit: {outcome.auditError}</p>}
          {outcome.timelineError && <p style={styles.outcomeDetailMono}>Timeline: {outcome.timelineError}</p>}
        </div>
      );
    case 'unknown':
      return (
        <div role="alert" style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }} data-add-task-outcome="unknown">
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>Unexpected error</div>
          <p style={styles.outcomeDetail}>{outcome.message}</p>
        </div>
      );
  }
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(20, 26, 42, 0.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg, zIndex: 100, fontFamily: typography.family,
  },
  card: {
    background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 8,
    boxShadow: '0 12px 32px rgba(20, 26, 42, 0.18)', width: '100%', maxWidth: 520, maxHeight: '90vh',
    overflow: 'auto', display: 'flex', flexDirection: 'column', gap: spacing.md, padding: `${spacing.xl} ${spacing.xl}`,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm, flexWrap: 'wrap' },
  eyebrow: {
    fontSize: typography.size.xs, letterSpacing: typography.letterSpacing.label, textTransform: 'uppercase',
    color: palette.primary, fontWeight: typography.weight.semibold,
  },
  title: { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text },
  body: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  label: {
    display: 'flex', flexDirection: 'column', gap: spacing.xxs, fontSize: typography.size.xs,
    textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, color: palette.textSubtle, fontWeight: typography.weight.semibold,
  },
  required: { marginLeft: spacing.xxs, color: palette.atRiskFg, textTransform: 'none', letterSpacing: 0, fontWeight: typography.weight.regular },
  input: {
    fontFamily: typography.family, fontSize: typography.size.base, border: `1px solid ${palette.border}`,
    borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.sm}`, color: palette.text, background: palette.surface,
    textTransform: 'none', letterSpacing: 0, fontWeight: typography.weight.regular,
  },
  textarea: {
    fontFamily: typography.family, fontSize: typography.size.base, border: `1px solid ${palette.border}`,
    borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.sm}`, color: palette.text, background: palette.surface,
    resize: 'vertical', minHeight: 64, textTransform: 'none', letterSpacing: 0, fontWeight: typography.weight.regular,
  },
  helperLine: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'none', letterSpacing: 0, fontWeight: typography.weight.regular },
  outcomeBox: { border: '1px solid', borderRadius: radius.sm, padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  outcomeTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold },
  outcomeDetail: { margin: 0, fontSize: typography.size.md, color: palette.text, lineHeight: typography.lineHeight.snug },
  outcomeDetailMono: {
    margin: 0, fontSize: typography.size.sm, color: palette.textMuted, fontFamily: typography.mono,
    background: palette.surfaceAlt, padding: `${spacing.xxs} ${spacing.xs}`, borderRadius: radius.sm, wordBreak: 'break-word',
  },
  footer: { display: 'flex', gap: spacing.sm, justifyContent: 'flex-end', paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  primaryButton: {
    background: palette.primary, color: palette.textInverse, border: 'none', borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.md, fontWeight: typography.weight.semibold, cursor: 'pointer', fontFamily: typography.family,
  },
  primaryButtonDisabled: {
    background: palette.borderStrong, color: palette.textInverse, border: 'none', borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.md, fontWeight: typography.weight.semibold, cursor: 'not-allowed', fontFamily: typography.family,
  },
  secondaryButton: {
    background: palette.surface, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.md, fontWeight: typography.weight.medium, cursor: 'pointer', fontFamily: typography.family,
  },
  secondaryButtonDisabled: {
    background: palette.surfaceAlt, color: palette.textMuted, border: `1px solid ${palette.divider}`, borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.md, fontWeight: typography.weight.medium, cursor: 'not-allowed', fontFamily: typography.family,
  },
};
