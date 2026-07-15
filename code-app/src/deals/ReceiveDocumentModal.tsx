import { useEffect, useRef, useState } from 'react';
import type { DealDocument } from './dealDocumentQueries';
import type { MarkDocumentReceivedOutcome } from './documentActions';
import type { UploadDocumentFileOutcome } from './documentUploadAction';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from './documentUploadAction';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

type ReceiveOutcome = MarkDocumentReceivedOutcome | UploadDocumentFileOutcome;

interface ReceiveDocumentModalProps {
  doc: DealDocument;
  onConfirm: (note: string) => Promise<MarkDocumentReceivedOutcome>;
  onClose: () => void;
  /**
   * Optional: when supplied, a file picker renders alongside the note field
   * and selecting a file switches the submit action to a real binary upload
   * instead of the metadata-only "mark received" write. Callers pass this
   * ONLY when DOCUMENT_FILE_UPLOAD_ENABLED resolves true — this component
   * itself stays flag-agnostic, matching every other gated-capability prop
   * in this codebase (e.g. StageAdvanceControl's canAdvance).
   */
  onUploadFile?: (file: File) => Promise<UploadDocumentFileOutcome>;
}

type ModalState =
  | { kind: 'editing' }
  | { kind: 'submitting' }
  | { kind: 'outcome'; outcome: ReceiveOutcome };

/**
 * Phase 51: banker-side "Mark Document Received" governed flow.
 *
 * What this is:
 *   - A metadata-only governed write. The banker records that the
 *     borrower has delivered the requested document; cr664_receiveddate
 *     is stamped and the row moves from Outstanding to Received.
 *
 * What this is NOT (honestly):
 *   - It does not upload a binary file. The cr664_DocumentChecklist
 *     schema has no File column. The modal therefore has no file
 *     picker — adding one would imply a capability that does not
 *     exist. See docs/PHASE_51_DOCUMENT_UPLOAD_SCOPE.md for the
 *     exact schema blocker.
 */
export function ReceiveDocumentModal({
  doc,
  onConfirm,
  onClose,
  onUploadFile,
}: ReceiveDocumentModalProps) {
  const [note, setNote] = useState('');
  const [state, setState] = useState<ModalState>({ kind: 'editing' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>(undefined);
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

  const trimmedNote = note.trim();
  const canSubmit =
    state.kind === 'editing' && (selectedFile !== null || trimmedNote.length > 0) && !fileError;
  const inProgress = state.kind === 'submitting';

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      setFileError(undefined);
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setSelectedFile(null);
      setFileError(`"${file.type || 'unknown type'}" is not an accepted file type. Accepted: PDF, Word, Excel, JPEG, PNG.`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setSelectedFile(null);
      setFileError(`The file is larger than the ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB limit.`);
      return;
    }
    setFileError(undefined);
    setSelectedFile(file);
  }

  async function handleConfirm() {
    if (!canSubmit) return;
    setState({ kind: 'submitting' });
    try {
      // A selected file supersedes the metadata-only write — uploadDocumentFile already
      // stamps cr664_receiveddate itself, so calling both would double-write.
      const outcome =
        selectedFile && onUploadFile ? await onUploadFile(selectedFile) : await onConfirm(trimmedNote);
      setState({ kind: 'outcome', outcome });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: 'outcome', outcome: { kind: 'unknown', message } });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receive-document-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Deal Workspace · Documents</div>
            <h2 id="receive-document-title" style={styles.title}>
              Mark Document Received
            </h2>
          </div>
        </header>

        <section style={styles.summarySection}>
          <div style={styles.summaryHeaderRow}>
            <span style={styles.docName}>{doc.name}</span>
            <Badge variant="atRisk" appearance="outline">Outstanding</Badge>
          </div>
          <dl style={styles.facts}>
            <Fact label="Due date" value={formatDate(doc.dueDate)} />
            <Fact label="Last requested" value={formatDate(doc.requestDate) ?? 'Never'} />
            <Fact label="Current status" value="Outstanding" />
          </dl>
        </section>

        {state.kind === 'outcome' ? (
          <OutcomeBlock outcome={state.outcome} />
        ) : (
          <>
            {onUploadFile && (
              <section style={styles.noteSection}>
                <label htmlFor="receive-document-file" style={styles.label}>
                  Attach file <span style={styles.optional}>optional</span>
                </label>
                <input
                  id="receive-document-file"
                  type="file"
                  accept={[...ALLOWED_MIME_TYPES].join(',')}
                  disabled={inProgress}
                  onChange={handleFileChange}
                  style={{ opacity: inProgress ? 0.6 : 1 }}
                />
                {fileError && (
                  <p role="alert" style={{ ...styles.helperLine, color: palette.atRiskFg }}>{fileError}</p>
                )}
                {selectedFile && !fileError && (
                  <p style={styles.helperLine}>
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB) will be uploaded and this
                    document marked received in one governed write.
                  </p>
                )}
              </section>
            )}
            <section style={styles.noteSection}>
              <label htmlFor="receive-document-note" style={styles.label}>
                Receipt note{' '}
                <span style={styles.required}>{selectedFile ? 'optional with a file attached' : 'required'}</span>
              </label>
              <textarea
                id="receive-document-note"
                ref={textareaRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={inProgress}
                placeholder="Describe how the document arrived (e.g. emailed by borrower, hand-delivered) and any context worth recording. The note is copied to the audit event and the deal activity timeline."
                rows={4}
                aria-required={selectedFile ? 'false' : 'true'}
                aria-describedby="receive-document-note-help"
                style={{ ...styles.textarea, opacity: inProgress ? 0.6 : 1 }}
              />
              <p id="receive-document-note-help" style={styles.helperLine}>
                {onUploadFile
                  ? 'Attaching a file uploads the real document to Dataverse and marks it received in one step. Leaving the attachment empty falls back to a metadata-only receipt (no binary), same as before.'
                  : 'Metadata-only: this records receipt on the deal timeline and audit trail. Binary file upload is not enabled in this environment yet.'}
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
                style={inProgress ? styles.secondaryButtonDisabled : styles.secondaryButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canSubmit}
                style={canSubmit ? styles.primaryButton : styles.primaryButtonDisabled}
              >
                {inProgress ? (selectedFile ? 'Uploading…' : 'Recording…') : selectedFile ? 'Upload & mark received' : 'Mark received'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function OutcomeBlock({ outcome }: { outcome: ReceiveOutcome }) {
  // Phase 74: outcome blocks announce to assistive tech when they
  // appear. Success is polite (role=status); error / partial /
  // unknown are assertive (role=alert) so screen readers surface
  // them without waiting for focus to land.
  switch (outcome.kind) {
    case 'success':
      return (
        <div
          role="status"
          style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>Recorded</div>
          <p style={styles.outcomeDetail}>
            Document marked received; audit and timeline events recorded.
          </p>
        </div>
      );
    case 'dependency_not_ready':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>Upload not enabled</div>
          <p style={styles.outcomeDetail}>{outcome.detail}</p>
        </div>
      );
    case 'invalid-input':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>Cannot upload this file</div>
          <p style={styles.outcomeDetail}>{outcome.reason}</p>
        </div>
      );
    case 'upload-failed':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>Upload failed</div>
          <p style={styles.outcomeDetail}>The document is unchanged. Refresh and try again.</p>
          <p style={styles.outcomeDetailMono}>{outcome.error}</p>
        </div>
      );
    case 'readback-mismatch':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.blockedBg, borderColor: palette.blocked }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.blockedFg }}>Upload could not be confirmed</div>
          <p style={styles.outcomeDetail}>{outcome.detail}</p>
        </div>
      );
    case 'receive-failed':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
            Could not record receipt
          </div>
          <p style={styles.outcomeDetail}>
            The document is unchanged. A Failed audit event was recorded best-effort.
            Refresh and try again.
          </p>
          <p style={styles.outcomeDetailMono}>{outcome.docError}</p>
        </div>
      );
    case 'governance-partial':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.blockedBg, borderColor: palette.blocked }}
        >
          <div style={{ ...styles.outcomeTitle, color: palette.blockedFg }}>
            Critical: governance write failed
          </div>
          <p style={styles.outcomeDetail}>
            The document was marked received on the checklist row, but one or both
            governance writes failed. The receipt is not fully governed.
          </p>
          {outcome.auditError && (
            <p style={styles.outcomeDetailMono}>Audit: {outcome.auditError}</p>
          )}
          {outcome.timelineError && (
            <p style={styles.outcomeDetailMono}>Timeline: {outcome.timelineError}</p>
          )}
          <p style={styles.outcomeDetail}>
            Action: capture this message and ask the AuditEvent / TimelineEvent owner
            to investigate. Do not retry — the document receipt is already recorded.
          </p>
        </div>
      );
    case 'unknown':
      return (
        <div
          role="alert"
          style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}
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
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
  header: { display: 'flex', flexDirection: 'column', gap: 2 },
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
  optional: {
    marginLeft: spacing.xxs,
    color: palette.textSubtle,
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
