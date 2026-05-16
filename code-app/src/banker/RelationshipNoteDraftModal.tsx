import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildRelationshipNoteText,
  type RelationshipNoteDealRef,
} from '../shared/relationship/relationshipNoteDraft';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 78: local-only banker relationship-note draft modal.
 *
 * Pattern modeled after Phase 23 (DraftBorrowerUpdateModal) and
 * Phase 66 (BorrowerSafeStatusPacketModal): a banker drafts text
 * locally, copies it to the clipboard, and pastes it into the bank's
 * external system of record.
 *
 * Strictly local-only:
 *   - No Dataverse write.
 *   - No audit row.
 *   - No timeline event.
 *   - No governed write entry.
 *   - No cross-device persistence (modal state lives in React state
 *     only; closing the modal drops the draft).
 *
 * Inventoried via LOCAL_ONLY_FLOWS.relationship-note-draft. The
 * inventory tests in platformInventory.test.ts enforce that the
 * entry exists with the right phase + disclaimers.
 */

interface RelationshipNoteDraftModalProps {
  clientName: string;
  bankerName: string | undefined;
  deals: ReadonlyArray<RelationshipNoteDealRef>;
  onClose: () => void;
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'copied' }
  | { kind: 'copy-failed' };

export function RelationshipNoteDraftModal({
  clientName,
  bankerName,
  deals,
  onClose,
}: RelationshipNoteDraftModalProps) {
  const generatedAt = useMemo(() => new Date(), []);
  const [noteText, setNoteText] = useState('');
  const [followUpText, setFollowUpText] = useState('');
  const [openAskText, setOpenAskText] = useState('');
  const [action, setAction] = useState<ActionState>({ kind: 'idle' });
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    noteRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const preview = useMemo(
    () =>
      buildRelationshipNoteText({
        clientName,
        bankerName,
        noteText,
        followUpText: followUpText.trim() || undefined,
        openAskText: openAskText.trim() || undefined,
        deals,
        generatedAt,
      }),
    [
      clientName,
      bankerName,
      noteText,
      followUpText,
      openAskText,
      deals,
      generatedAt,
    ],
  );

  const canCopy = noteText.trim().length > 0;

  async function handleCopy() {
    if (!canCopy) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(preview);
        setAction({ kind: 'copied' });
        return;
      }
      setAction({ kind: 'copy-failed' });
    } catch {
      setAction({ kind: 'copy-failed' });
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="relationship-note-draft-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Banker Command Center · Relationship</div>
            <h2 id="relationship-note-draft-title" style={styles.title}>
              Draft relationship note
            </h2>
          </div>
          <Badge variant="neutral" appearance="outline">
            Local draft only
          </Badge>
        </header>

        <p style={styles.localOnlyBanner} role="status">
          <strong>Local draft. Not saved to the system.</strong>{' '}
          Paste into the appropriate system of record. The app does not
          store this note, does not emit an audit or timeline event, and
          does not sync across devices. Closing this modal without
          copying drops the draft.
        </p>

        <section style={styles.summarySection}>
          <Fact label="Client" value={clientName} />
          <Fact
            label="Banker"
            value={bankerName ?? '— (banker name not on record)'}
          />
          <Fact
            label="Active deals"
            value={deals.length > 0 ? `${deals.length}` : '0'}
          />
        </section>

        <section style={styles.fieldBlock}>
          <label htmlFor="relationship-note-text" style={styles.label}>
            Note <span style={styles.required}>required to copy</span>
          </label>
          <textarea
            id="relationship-note-text"
            ref={noteRef}
            value={noteText}
            onChange={(e) => {
              setNoteText(e.target.value);
              setAction({ kind: 'idle' });
            }}
            placeholder="What did you observe / discuss? This is a local note for your own system of record — the app does not store it."
            rows={5}
            aria-required="true"
            aria-describedby="relationship-note-text-help"
            style={styles.textarea}
          />
          <p id="relationship-note-text-help" style={styles.helperLine}>
            Required. The banker controls all content; the app never
            interprets, summarizes, or transmits the text.
          </p>
        </section>

        <section style={styles.fieldBlock}>
          <label htmlFor="relationship-note-followup" style={styles.label}>
            Follow-up (optional)
          </label>
          <textarea
            id="relationship-note-followup"
            value={followUpText}
            onChange={(e) => {
              setFollowUpText(e.target.value);
              setAction({ kind: 'idle' });
            }}
            placeholder="Reminders or planned next contact. Omitted from the copied draft when blank."
            rows={2}
            style={styles.textarea}
          />
        </section>

        <section style={styles.fieldBlock}>
          <label htmlFor="relationship-note-open-asks" style={styles.label}>
            Open asks / next steps (optional)
          </label>
          <textarea
            id="relationship-note-open-asks"
            value={openAskText}
            onChange={(e) => {
              setOpenAskText(e.target.value);
              setAction({ kind: 'idle' });
            }}
            placeholder="Outstanding requests or next-step actions. Omitted from the copied draft when blank."
            rows={2}
            style={styles.textarea}
          />
        </section>

        <section style={styles.previewBlock}>
          <div style={styles.previewLabel}>Preview</div>
          <pre style={styles.preview} aria-label="Relationship note preview">
            {preview}
          </pre>
        </section>

        {action.kind === 'copied' && (
          <div
            role="status"
            style={{
              ...styles.outcomeBox,
              background: palette.clearBg,
              borderColor: palette.clear,
            }}
          >
            <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
              Draft copied to clipboard
            </div>
            <p style={styles.outcomeDetail}>
              Paste it into the appropriate system of record. The app
              did not store the note and did not emit any audit,
              timeline, or task event.
            </p>
          </div>
        )}
        {action.kind === 'copy-failed' && (
          <div
            role="alert"
            style={{
              ...styles.outcomeBox,
              background: palette.atRiskBg,
              borderColor: palette.atRisk,
            }}
          >
            <div style={{ ...styles.outcomeTitle, color: palette.atRiskFg }}>
              Could not access clipboard
            </div>
            <p style={styles.outcomeDetail}>
              The browser blocked the clipboard write. Select the
              Preview text above and copy it manually.
            </p>
          </div>
        )}

        <footer style={styles.footer}>
          <button type="button" onClick={onClose} style={styles.secondaryButton}>
            Close
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!canCopy}
            style={canCopy ? styles.primaryButton : styles.primaryButtonDisabled}
            aria-label="Copy relationship note to clipboard"
          >
            {action.kind === 'copied' ? 'Copied ✓' : 'Copy note'}
          </button>
        </footer>
      </div>
    </div>
  );
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
    maxWidth: 680,
    maxHeight: '92vh',
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
  localOnlyBanner: {
    margin: 0,
    padding: spacing.sm,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  summarySection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: `${spacing.xs} ${spacing.md}`,
    margin: 0,
    paddingBottom: spacing.sm,
    borderBottom: `1px solid ${palette.divider}`,
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
  fieldBlock: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
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
    minHeight: 64,
    lineHeight: typography.lineHeight.snug,
  },
  helperLine: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle },
  previewBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTop: `1px solid ${palette.divider}`,
  },
  previewLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  preview: {
    margin: 0,
    padding: spacing.sm,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    fontFamily: typography.mono,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
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
};
