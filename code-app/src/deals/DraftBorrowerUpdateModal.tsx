import { useEffect, useMemo, useRef, useState } from 'react';
import type { DealDetail } from './dealQueries';
import type { DealDocument } from './dealDocumentQueries';
import type { DealTask } from './dealTaskQueries';
import {
  TEMPLATE_OPTIONS,
  buildBorrowerUpdateDraft,
  findProhibitedTerms,
  type BorrowerUpdateTemplate,
  type ProhibitedTermHit,
} from './borrowerUpdateDraft';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 23: borrower update DRAFT modal. Local-only fallback path —
 * no Dataverse write, no email send, no Outlook/Graph. The banker
 * picks a template, edits the generated subject/body if needed,
 * writes a required note explaining why the update is going out, then
 * Copies the body to the clipboard for manual paste into their own
 * mail client.
 *
 * The modal exists inside an already-authorized DealDataProvider tree,
 * so the deal/tasks/documents passed in are banker-scoped.
 */

interface DraftBorrowerUpdateModalProps {
  deal: DealDetail;
  outstandingDocuments: DealDocument[];
  openTasks: DealTask[];
  bankerName: string | undefined;
  onClose: () => void;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function DraftBorrowerUpdateModal({
  deal,
  outstandingDocuments,
  openTasks,
  bankerName,
  onClose,
}: DraftBorrowerUpdateModalProps) {
  const [template, setTemplate] = useState<BorrowerUpdateTemplate>('general-status');
  const initial = useMemo(
    () =>
      buildBorrowerUpdateDraft(template, {
        deal,
        outstandingDocuments,
        openTasks,
        bankerName,
      }),
    // We rebuild only when template changes, not on every doc/task ref
    // bump — switching templates is the explicit reset signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template],
  );
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [reason, setReason] = useState('');
  const [copy, setCopy] = useState<CopyState>('idle');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // When the banker picks a different template, replace subject/body
  // with the new generated text. Their note/reason persists because it
  // describes WHY they're sending — that doesn't change per template.
  useEffect(() => {
    setSubject(initial.subject);
    setBody(initial.body);
    setCopy('idle');
  }, [initial]);

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

  const prohibitedHits: ProhibitedTermHit[] = useMemo(
    () => findProhibitedTerms(`${subject}\n${body}`, deal),
    [subject, body, deal],
  );

  const reasonOk = reason.trim().length > 0;
  const safetyOk = prohibitedHits.length === 0;
  const canCopy = reasonOk && safetyOk && body.trim().length > 0;

  async function handleCopy() {
    if (!canCopy) return;
    const payload = `Subject: ${subject}\n\n${body}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        setCopy('copied');
        return;
      }
      setCopy('failed');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="draft-borrower-update-title"
      style={styles.overlay}
    >
      <div style={styles.card}>
        <header style={styles.header}>
          <div>
            <div style={styles.eyebrow}>Deal Workspace · Borrower Communication</div>
            <h2 id="draft-borrower-update-title" style={styles.title}>
              Draft Borrower Update
            </h2>
          </div>
          <Badge variant="neutral" appearance="outline">
            Draft only
          </Badge>
        </header>

        <p style={styles.localOnlyBanner} role="status">
          <strong>Draft not saved to system.</strong> No email is sent. Copy the
          message and paste it into your mail client to send manually. External
          delivery, audit, and timeline logging are a later phase.
        </p>

        <section style={styles.toSection}>
          <Fact label="To" value={deal.clientName ?? '— (no borrower contact on this deal)'} />
          <Fact label="Deal" value={deal.name} />
          <Fact label="Stage" value={deal.stage ?? '—'} />
        </section>

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="draft-template-select">
            Template
          </label>
          <select
            id="draft-template-select"
            value={template}
            onChange={(e) => setTemplate(e.target.value as BorrowerUpdateTemplate)}
            style={styles.select}
          >
            {TEMPLATE_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          <p style={styles.helperLine}>
            {TEMPLATE_OPTIONS.find((o) => o.key === template)?.description}
          </p>
        </section>

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="draft-subject">
            Subject
          </label>
          <input
            id="draft-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={styles.input}
          />
        </section>

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="draft-body">
            Body
          </label>
          <textarea
            id="draft-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            style={styles.textareaBody}
          />
        </section>

        {prohibitedHits.length > 0 && (
          <div style={styles.guardBox} role="alert">
            <div style={styles.guardTitle}>Borrower-safe language check flagged issues</div>
            <ul style={styles.guardList}>
              {prohibitedHits.map((h) => (
                <li key={h.term}>
                  <strong>{h.term}</strong> — {h.reason}
                </li>
              ))}
            </ul>
            <p style={styles.guardDetail}>
              Remove or soften these terms before copying. Commitment language is
              not permitted unless the deal stage/status explicitly supports it.
            </p>
          </div>
        )}

        <section style={styles.fieldBlock}>
          <label style={styles.label} htmlFor="draft-reason">
            Banker note / reason for this update{' '}
            <span style={styles.required}>required</span>
          </label>
          <textarea
            id="draft-reason"
            ref={noteRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why are you sending this update? (Internal only — not part of the borrower-facing message.)"
            style={styles.textareaReason}
          />
        </section>

        {copy === 'copied' && (
          <div style={{ ...styles.outcomeBox, background: palette.clearBg, borderColor: palette.clear }}>
            <div style={{ ...styles.outcomeTitle, color: palette.clearFg }}>
              Copied to clipboard
            </div>
            <p style={styles.outcomeDetail}>
              The draft was copied. Paste it into your mail client to send manually.
              Nothing was logged to this deal's activity ledger.
            </p>
          </div>
        )}
        {copy === 'failed' && (
          <div style={{ ...styles.outcomeBox, background: palette.atRiskBg, borderColor: palette.atRisk }}>
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
        </footer>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={styles.fact}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value ?? '—'}</dd>
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
    maxWidth: 720,
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
  toSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: `${spacing.xs} ${spacing.md}`,
    margin: 0,
    padding: `${spacing.sm} 0`,
    borderTop: `1px solid ${palette.divider}`,
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
  dd: { margin: 0, fontSize: typography.size.sm, color: palette.text, wordBreak: 'break-word' },
  fieldBlock: { display: 'flex', flexDirection: 'column', gap: spacing.xxs },
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
  helperLine: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle },
  select: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surface,
    color: palette.text,
  },
  input: {
    fontFamily: typography.family,
    fontSize: typography.size.base,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surface,
    color: palette.text,
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
    minHeight: 240,
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
