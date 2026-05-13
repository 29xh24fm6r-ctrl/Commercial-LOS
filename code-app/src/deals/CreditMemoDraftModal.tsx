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
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 24: Credit Memo DRAFT PREVIEW modal. Local-only:
 *   - no Dataverse write
 *   - no AI / model call
 *   - no PDF / export
 *   - no Save / Finalize / Submit
 *
 * The banker toggles which sections to include, edits the generated
 * body if needed, then Copies the body to the clipboard. Missing
 * fields are surfaced explicitly in a side panel so the banker can
 * see what the deal record is missing without having to scan the
 * body for "Missing / Not provided." placeholders.
 */

interface CreditMemoDraftModalProps {
  deal: DealDetail;
  tasks: DealTasksResult | undefined;
  documents: DealDocumentsResult | undefined;
  existingMemos: CreditMemoData | undefined;
  onClose: () => void;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function CreditMemoDraftModal({
  deal,
  tasks,
  documents,
  existingMemos,
  onClose,
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

  // Banker may edit the generated body; we seed from generated.body
  // when it changes (i.e. when section selection changes).
  const [body, setBody] = useState(generated.body);
  const [bodyOverridden, setBodyOverridden] = useState(false);
  const [copy, setCopy] = useState<CopyState>('idle');

  useEffect(() => {
    if (!bodyOverridden) {
      setBody(generated.body);
      setCopy('idle');
    }
  }, [generated.body, bodyOverridden]);

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

  const canCopy = body.trim().length > 0;

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
          Generated locally from the deal record only. No AI was used. No memo will be saved,
          exported, or finalized from this dialog. Persistence and export are a later phase.
        </p>

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

        {copy === 'copied' && (
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
        {copy === 'failed' && (
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
