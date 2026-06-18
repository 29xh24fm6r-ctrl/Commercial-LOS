import { type CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  buildDocumentChecklistPilotViewModel,
  type DocumentChecklistPilotInput,
} from './documentChecklistPilotViewModel';
import {
  DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES,
} from './documentChecklistPilotConfig';

/**
 * Phase 188D -- banker-only, PILOT-DISABLED document checklist preview panel.
 *
 * Read-only and non-operative. It presents checklist generation readiness +
 * planned (would-create) vs already-present document names for the deal, but it
 * NEVER creates a checklist row, contacts a borrower, sends a request, calls a
 * generated service, or invokes the generator adapter. The generate control is
 * permanently disabled in this phase (`canGenerate` is always false). No borrower
 * messaging / email / SMS / Outlook / handoff is imported or referenced.
 */

export interface DocumentChecklistPilotPanelProps {
  /** Existing checklist document names already loaded for the deal. */
  readonly existingDocumentNames?: readonly string[];
  /** Override approved names (tests); defaults to the static pilot config. */
  readonly approvedChecklistNames?: readonly string[];
  /** Override the pilot flag (tests); defaults to the disabled config flag. */
  readonly pilotEnabled?: boolean;
  /** Optional deal context (display only). */
  readonly deal?: DocumentChecklistPilotInput['deal'];
}

export function DocumentChecklistPilotPanel({
  existingDocumentNames = [],
  approvedChecklistNames = DOCUMENT_CHECKLIST_PILOT_APPROVED_NAMES,
  pilotEnabled = DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  deal,
}: DocumentChecklistPilotPanelProps) {
  const vm = buildDocumentChecklistPilotViewModel({
    deal,
    existingChecklistRows: existingDocumentNames,
    approvedChecklistNames,
    pilotEnabled,
  });

  // 188D invariant: the UI can NEVER trigger generation.
  const generateDisabled = true; // vm.canGenerate is always false this phase.

  return (
    <section
      style={styles.wrap}
      aria-label="Document Checklist Pilot"
      data-doc-checklist-pilot="panel"
      data-doc-checklist-pilot-status={vm.status}
    >
      <header style={styles.head}>
        <div style={styles.titleRow}>
          <h3 style={styles.title}>Document Checklist Pilot</h3>
          <Badge variant="neutral" appearance="outline">
            {vm.status === 'pilot_disabled' ? 'Pilot disabled' : 'Preview only'}
          </Badge>
        </div>
        <p style={styles.subtitle}>
          Checklist generation is available only as a controlled pilot and is
          currently disabled. This panel is a read-only preview.
        </p>
      </header>

      <div style={styles.messages} role="note">
        {vm.safetyMessages.map((m) => (
          <p key={m} style={styles.message} data-doc-checklist-pilot-safety>
            {m}
          </p>
        ))}
        {vm.disabledReason ? (
          <p style={styles.message} data-doc-checklist-pilot-disabled-reason>
            {vm.disabledReason}
          </p>
        ) : null}
      </div>

      <details style={styles.details}>
        <summary style={styles.summary} data-doc-checklist-pilot-preview-toggle>
          Preview details (read-only)
        </summary>
        <div style={styles.previewBody}>
          <NameList
            label="Approved checklist names"
            names={vm.approvedNames}
            testid="approved"
          />
          <NameList
            label="Already present on this deal"
            names={vm.alreadyPresentNames}
            testid="already-present"
            tone="clear"
          />
          <NameList
            label="Would create (preview only)"
            names={vm.wouldCreateNames}
            testid="would-create"
            tone="neutral"
          />
        </div>
      </details>

      <p style={styles.certNote} data-doc-checklist-pilot-cert-note>
        Pilot requires operator certification.
      </p>

      <button
        type="button"
        disabled={generateDisabled}
        aria-disabled={generateDisabled}
        style={styles.disabledAction}
        data-doc-checklist-pilot-generate
      >
        Generate checklist — disabled
      </button>
    </section>
  );
}

function NameList({
  label,
  names,
  testid,
  tone = 'neutral',
}: {
  label: string;
  names: readonly string[];
  testid: string;
  tone?: 'neutral' | 'clear';
}) {
  return (
    <div style={styles.nameBlock} data-doc-checklist-pilot-list={testid}>
      <span style={styles.nameLabel}>
        {label} ({names.length})
      </span>
      {names.length === 0 ? (
        <span style={styles.nameEmpty}>(none)</span>
      ) : (
        <ul style={styles.nameUl}>
          {names.map((n) => (
            <li key={n} style={styles.nameLi}>
              <Badge variant={tone} appearance="soft" emphasize={false}>
                {n}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.md} ${spacing.lg}`,
    marginTop: spacing.md,
  },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  titleRow: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  title: { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.bold, color: palette.text },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  messages: { display: 'flex', flexDirection: 'column', gap: 2 },
  message: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  details: { fontSize: typography.size.sm, color: palette.text },
  summary: { cursor: 'pointer', color: palette.textMuted, fontSize: typography.size.sm },
  previewBody: { display: 'flex', flexDirection: 'column', gap: spacing.sm, paddingTop: spacing.sm },
  nameBlock: { display: 'flex', flexDirection: 'column', gap: 4 },
  nameLabel: { color: palette.textSubtle, fontSize: typography.size.xs, fontWeight: typography.weight.semibold },
  nameEmpty: { color: palette.textSubtle, fontSize: typography.size.sm },
  nameUl: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs, listStyle: 'none', margin: 0, padding: 0 },
  nameLi: { listStyle: 'none' },
  certNote: { margin: 0, color: palette.textSubtle, fontSize: typography.size.xs, fontStyle: 'italic' },
  disabledAction: {
    alignSelf: 'flex-start',
    background: palette.surfaceSubtle,
    color: palette.textSubtle,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'not-allowed',
  },
};
