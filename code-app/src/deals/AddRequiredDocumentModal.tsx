import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';
import type { AddRequiredDocumentOutcome } from './addRequiredDocumentAction';
import { useDialogDismissal } from '../shared/ui/useDialogDismissal';

/**
 * Governed intake of a REQUIRED deal document that has no checklist row yet.
 *
 * The live-smoke gap: the Documents panel had no add/upload action and the checklist pilot is
 * disabled, so a mandatory document (e.g. the Loan Application) could never be added through the
 * UI — blocking Intake→Underwriting. This modal is that operator path. It records the GOVERNED
 * RECEIPT of the document as metadata (associate to the deal, classify by name, mark received)
 * through the governed `addRequiredDocument` write (create → readback → audit → timeline).
 *
 * Honest scope: this is NOT a binary file upload — the cr664_documentchecklist schema has no File
 * column yet, so no bytes are stored. The copy says "record received", never "upload".
 */
export interface AddRequiredDocumentModalProps {
  /** Missing required-document names the banker may add (from the stage requirement model). */
  readonly candidateNames: readonly string[];
  /** When launched from a specific blocker, the exact document to add (overrides the picker). */
  readonly presetName?: string;
  readonly onConfirm: (name: string, note: string) => Promise<AddRequiredDocumentOutcome>;
  readonly onClose: () => void;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done'; outcome: AddRequiredDocumentOutcome };

export function AddRequiredDocumentModal({ candidateNames, presetName, onConfirm, onClose }: AddRequiredDocumentModalProps) {
  const options = presetName ? [presetName] : candidateNames;
  const [name, setName] = useState(presetName ?? candidateNames[0] ?? '');
  const [note, setNote] = useState('');
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const saving = save.kind === 'saving';
  const canSubmit = name.trim().length > 0 && note.trim().length > 0 && !saving;
  const dialogRef = useDialogDismissal<HTMLDivElement>({
    onClose,
    disabled: saving,
    closeOnOutsideClick: false,
  });

  useEffect(() => {
    noteRef.current?.focus();
  }, []);

  async function onSave() {
    if (!canSubmit) return;
    setSave({ kind: 'saving' });
    const outcome = await onConfirm(name.trim(), note.trim());
    setSave({ kind: 'done', outcome });
  }

  const titleId = 'add-required-document-title';
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} style={styles.overlay}>
      <div style={styles.card} data-add-document-modal ref={dialogRef}>
        <header style={styles.header}>
          <h2 id={titleId} style={styles.title}>Record receipt without a file</h2>
          <p style={styles.subtitle}>
            Creates the missing checklist row and records that the required document arrived through
            an approved external channel. This marks it <strong>received</strong>, but stores no file
            bytes. To retain a file in this app, use <strong>Mark Document Received</strong> on an
            existing checklist row and attach the file there.
          </p>
        </header>

        {save.kind === 'done' ? (
          <OutcomeBlock outcome={save.outcome} onClose={onClose} />
        ) : (
          <>
            <div style={styles.body}>
              <label style={styles.field}>
                <span style={styles.fieldLabel}>Required document</span>
                {presetName ? (
                  <div style={styles.presetValue} data-add-document-preset>{presetName}</div>
                ) : options.length > 0 ? (
                  <select
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                    style={styles.input}
                    data-add-document-name
                  >
                    {options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                    style={styles.input}
                    placeholder="Document name"
                    data-add-document-name
                  />
                )}
              </label>

              <label style={styles.field}>
                <span style={styles.fieldLabel}>Receipt note</span>
                <textarea
                  ref={noteRef}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={saving}
                  rows={3}
                  placeholder="How and when the document was received (recorded verbatim in the audit trail)."
                  style={{ ...styles.input, resize: 'vertical' }}
                  data-add-document-note
                />
              </label>
            </div>

            <footer style={styles.footer}>
              <button type="button" onClick={onClose} disabled={saving} style={styles.secondary} data-add-document-cancel>
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={!canSubmit}
                style={canSubmit ? styles.primary : styles.primaryDisabled}
                data-add-document-save
              >
                {saving ? 'Saving…' : 'Record received'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function OutcomeBlock({ outcome, onClose }: { outcome: AddRequiredDocumentOutcome; onClose: () => void }) {
  const ok = outcome.kind === 'success' || outcome.kind === 'governance-partial';
  return (
    <div
      role={ok ? 'status' : 'alert'}
      style={{ ...styles.outcome, ...(ok ? styles.outcomeOk : styles.outcomeBad) }}
      data-add-document-outcome={outcome.kind}
    >
      <div style={styles.outcomeTitle}>{outcomeTitle(outcome)}</div>
      <p style={styles.outcomeDetail}>{outcomeDetail(outcome)}</p>
      <div style={styles.footer}>
        <button type="button" onClick={onClose} style={styles.primary} data-add-document-done>
          {ok ? 'Close' : 'Back'}
        </button>
      </div>
    </div>
  );
}

function outcomeTitle(o: AddRequiredDocumentOutcome): string {
  switch (o.kind) {
    case 'success': return 'Document recorded as received';
    case 'governance-partial': return 'Recorded, but a governance write failed';
    case 'readback-mismatch': return 'Could not verify the document';
    case 'create-failed': return 'Not added';
    case 'unknown': return 'Could not add the document';
  }
}

function outcomeDetail(o: AddRequiredDocumentOutcome): string {
  switch (o.kind) {
    case 'success':
      return 'The document is now associated with this deal and marked received. The requirement is satisfied and will persist across refresh.';
    case 'governance-partial':
      return 'The document was created and verified, but its audit and/or timeline entry could not be written. An operator must reattempt the governance write — do not re-add the document.';
    case 'readback-mismatch':
      return o.docError;
    case 'create-failed':
      return `Nothing was added. ${o.docError}`;
    case 'unknown':
      return o.message;
  }
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(20, 26, 42, 0.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg, zIndex: 100, fontFamily: typography.family,
  },
  card: {
    background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: 8,
    boxShadow: '0 12px 32px rgba(20, 26, 42, 0.18)', width: '100%', maxWidth: 480, maxHeight: '90vh',
    overflow: 'auto', display: 'flex', flexDirection: 'column', gap: spacing.md, padding: `${spacing.xl} ${spacing.xl}`,
  },
  header: { display: 'flex', flexDirection: 'column', gap: 4 },
  title: { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text },
  subtitle: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, lineHeight: typography.lineHeight.snug },
  body: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  field: { display: 'flex', flexDirection: 'column', gap: 2 },
  fieldLabel: {
    fontSize: typography.size.xs, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle, fontWeight: typography.weight.semibold,
  },
  presetValue: { fontSize: typography.size.base, color: palette.text, fontWeight: typography.weight.semibold },
  input: {
    padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.border}`, borderRadius: radius.sm,
    fontSize: typography.size.base, fontFamily: typography.family, background: palette.surface, color: palette.text,
  },
  footer: { display: 'flex', gap: spacing.sm, justifyContent: 'flex-end', paddingTop: spacing.sm, borderTop: `1px solid ${palette.divider}` },
  primary: {
    background: palette.primary, color: palette.textInverse, border: 'none', borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.md, fontWeight: typography.weight.semibold,
    cursor: 'pointer', fontFamily: typography.family,
  },
  primaryDisabled: {
    background: palette.borderStrong, color: palette.textInverse, border: 'none', borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.md, fontWeight: typography.weight.semibold,
    cursor: 'not-allowed', fontFamily: typography.family,
  },
  secondary: {
    background: palette.surface, color: palette.text, border: `1px solid ${palette.border}`, borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`, fontSize: typography.size.md, fontWeight: typography.weight.medium,
    cursor: 'pointer', fontFamily: typography.family,
  },
  outcome: { border: '1px solid', borderRadius: radius.sm, padding: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  outcomeOk: { background: palette.clearBg, borderColor: palette.clear },
  outcomeBad: { background: palette.atRiskBg, borderColor: palette.atRisk },
  outcomeTitle: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: palette.text },
  outcomeDetail: { margin: 0, fontSize: typography.size.md, color: palette.text, lineHeight: typography.lineHeight.snug },
};
