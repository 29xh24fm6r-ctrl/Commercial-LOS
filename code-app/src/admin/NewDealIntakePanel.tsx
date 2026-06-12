import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  NEW_DEAL_INTAKE_BLOCKER,
  NEW_DEAL_INTAKE_FIELDS,
  NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST,
} from './adminNewDealIntakeModel';

/**
 * Phase 169C -- Admin New Deal Intake panel (blocker/preview only).
 *
 * Makes the New Deal blocker operationally clear and lays out the exact
 * path to safe deal creation. No live create is wired; the action is a
 * disabled placeholder. Rendered only inside the authorized branch of
 * AdminOperationsConsole, so it inherits the admin route gate.
 */
export function NewDealIntakePanel() {
  return (
    <section
      style={styles.wrap}
      aria-label="New Deal Intake"
      data-admin-new-deal="panel"
    >
      <header style={styles.head}>
        <div style={styles.titleRow}>
          <h3 style={styles.title}>New Deal Intake</h3>
          <Badge variant="atRisk" appearance="outline">
            Blocked
          </Badge>
        </div>
        <p style={styles.subtitle}>
          Admin deal onboarding. Blocked until the Stage/Status reference data
          source is registered. No deal is created from here.
        </p>
      </header>

      <div style={styles.blocker} role="note" data-admin-new-deal-blocker>
        <strong>Blocker:</strong> {NEW_DEAL_INTAKE_BLOCKER}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Required fields for future intake</div>
        <table style={styles.table} data-admin-new-deal-fields>
          <thead>
            <tr>
              <th style={styles.th}>Field</th>
              <th style={styles.th}>Maps to</th>
              <th style={styles.th}>Required</th>
              <th style={styles.th}>State</th>
            </tr>
          </thead>
          <tbody>
            {NEW_DEAL_INTAKE_FIELDS.map((f) => (
              <tr key={f.field}>
                <td style={styles.td}>{f.label}</td>
                <td style={styles.tdMono}>{f.field}</td>
                <td style={styles.td}>{f.required ? 'Yes' : 'No'}</td>
                <td style={styles.td}>
                  {f.blockedByReference ? (
                    <Badge variant="atRisk" appearance="outline">
                      Blocked
                    </Badge>
                  ) : (
                    <Badge variant="neutral" appearance="outline">
                      Ready
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          Stage/Status data-source registration checklist
        </div>
        <ol style={styles.checklist} data-admin-new-deal-checklist>
          {NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST.map((step) => (
            <li key={step.order} style={styles.checklistItem}>
              <span style={styles.checklistMark} aria-hidden="true">
                ☐
              </span>
              <span>
                <strong>{step.title}.</strong> {step.detail}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <button
        type="button"
        disabled
        aria-disabled="true"
        style={styles.disabledAction}
        title={NEW_DEAL_INTAKE_BLOCKER}
        aria-label="Create deal (not yet available)"
        data-admin-new-deal-create
      >
        Create deal (not yet available)
      </button>
      <p style={styles.footnote} data-admin-new-deal-footnote>
        The + New Deal button elsewhere in the app remains disabled for the same
        reason. Deal creation will be enabled only after the checklist above is
        complete and a fail-closed Stage/Status resolver exists.
      </p>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
    marginBottom: spacing.lg,
  },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  titleRow: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  title: {
    margin: 0,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: palette.text,
  },
  subtitle: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  blocker: {
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  section: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  sectionTitle: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: typography.size.sm },
  th: {
    textAlign: 'left',
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.textSubtle,
    textTransform: 'uppercase',
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    borderBottom: `1px solid ${palette.divider}`,
  },
  td: {
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    borderBottom: `1px solid ${palette.divider}`,
  },
  tdMono: {
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.textMuted,
    borderBottom: `1px solid ${palette.divider}`,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: typography.size.xs,
  },
  checklist: {
    margin: 0,
    paddingLeft: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  checklistItem: {
    display: 'flex',
    gap: spacing.sm,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  checklistMark: { color: palette.textSubtle, flexShrink: 0 },
  disabledAction: {
    alignSelf: 'flex-start',
    background: palette.surfaceAlt,
    color: palette.textSubtle,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'not-allowed',
  },
  footnote: {
    margin: 0,
    color: palette.textSubtle,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.snug,
  },
};
