import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../shared/Badge';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  NEW_DEAL_INTAKE_BLOCKER,
  NEW_DEAL_INTAKE_FIELDS,
  NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST,
  NEW_DEAL_READINESS_TRUTH,
} from './adminNewDealIntakeModel';
import { NEW_DEAL_BANKER_PILOT_TRUTH } from './adminNewDealCreateCapabilityTruth';
import {
  NEW_DEAL_REFERENCE_TARGETS,
  NEW_DEAL_REFERENCE_TARGETS_CONFIRMED_ON,
  NEW_DEAL_REFERENCE_TARGETS_SOURCE_COMMAND,
} from '../deals/newDealReferenceTargets';
import { NewDealResolverReadinessCard } from './NewDealResolverReadinessCard';

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
          <Badge variant="clear" appearance="outline">
            Banker create live
          </Badge>
        </div>
        <p style={styles.subtitle}>
          Deal create is live for authorized bankers from the Banker Workspace
          “+ New Deal” action — governed, audited, and resolving the production
          Stage (Intake) and Status (Open) references. This panel tracks the
          broader public / admin create governance path, which stays gated. No
          deal is created from this console.
        </p>
      </header>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Banker pilot create readiness (live path)</div>
        <p style={styles.sectionNote} data-admin-new-deal-banker-pilot-note>
          Computed from the exact same runtime inputs BankerNewDealCreate.tsx itself evaluates
          (evaluateBankerCreateRollout + the pilot&rsquo;s gate values) — never a second,
          hand-maintained copy that could drift from the real component.
        </p>
        <table style={styles.table} data-admin-new-deal-banker-pilot-truth>
          <tbody>
            {NEW_DEAL_BANKER_PILOT_TRUTH.map((item) => (
              <tr key={item.label}>
                <td style={styles.td}>{item.label}</td>
                <td style={styles.td}>
                  <Badge variant={item.done ? 'clear' : 'neutral'} appearance="outline">
                    {item.value}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>New Deal create readiness (public / global path — separate from the banker pilot above)</div>
        <table style={styles.table} data-admin-new-deal-truth>
          <tbody>
            {NEW_DEAL_READINESS_TRUTH.map((item) => (
              <tr key={item.label}>
                <td style={styles.td}>{item.label}</td>
                <td style={styles.td}>
                  <Badge variant={item.done ? 'clear' : 'neutral'} appearance="outline">
                    {item.value}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.blocker} role="note" data-admin-new-deal-blocker>
        <strong>Status:</strong> {NEW_DEAL_INTAKE_BLOCKER}
      </div>

      <NewDealResolverReadinessCard />

      <details style={styles.section}>
        <summary style={styles.sectionTitle}>
          Technical reference details
        </summary>
        <p style={styles.sectionNote} data-admin-new-deal-targets-note>
          Identified read-only via <code>{NEW_DEAL_REFERENCE_TARGETS_SOURCE_COMMAND}</code> on{' '}
          {NEW_DEAL_REFERENCE_TARGETS_CONFIRMED_ON}. Metadata names only -- no
          record ids. Now registered as native app data sources with typed
          services; the fail-closed resolver reads them at runtime (Ready in
          TEST). Create stays disabled pending production approval + a governed
          create adapter.
        </p>
        <table style={styles.table} data-admin-new-deal-targets>
          <thead>
            <tr>
              <th style={styles.th}>Reference</th>
              <th style={styles.th}>Target entity set</th>
              <th style={styles.th}>Primary id</th>
              <th style={styles.th}>Primary name</th>
              <th style={styles.th}>Selector fields</th>
            </tr>
          </thead>
          <tbody>
            {NEW_DEAL_REFERENCE_TARGETS.map((t) => (
              <tr key={t.lookupAttribute}>
                <td style={styles.td}>{t.label}</td>
                <td style={styles.tdMono}>{t.targetEntitySetName}</td>
                <td style={styles.tdMono}>{t.primaryIdAttribute}</td>
                <td style={styles.tdMono}>{t.primaryNameAttribute}</td>
                <td style={styles.tdMono}>{t.selectorFields.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details style={styles.section}>
        <summary style={styles.sectionTitle}>Technical field mapping</summary>
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
      </details>

      <details style={styles.section}>
        <summary style={styles.sectionTitle}>
          Technical enablement checklist
        </summary>
        <ol style={styles.checklist} data-admin-new-deal-checklist>
          {NEW_DEAL_INTAKE_REGISTRATION_CHECKLIST.map((step) => (
            <li
              key={step.order}
              style={styles.checklistItem}
              data-done={step.done ? 'true' : 'false'}
            >
              <span style={styles.checklistMark} aria-hidden="true">
                {step.done ? '☑' : '☐'}
              </span>
              <span>
                <strong>{step.title}.</strong> {step.detail}
                {step.done ? <em style={styles.doneTag}> — done</em> : null}
              </span>
            </li>
          ))}
        </ol>
      </details>

      <div style={styles.actions}>
        <Link
          to={WORKSPACE_ROUTES.banker}
          style={styles.manageLink}
          data-admin-new-deal-open
          aria-label="Open Banker Workspace to create a deal"
        >
          Open Banker Workspace
        </Link>
        <button
          type="button"
          disabled
          aria-disabled="true"
          style={styles.disabledAction}
          title={NEW_DEAL_INTAKE_BLOCKER}
          aria-label="Public create gated"
          data-admin-new-deal-create
        >
          Public create gated
        </button>
      </div>
      <p style={styles.footnote} data-admin-new-deal-footnote>
        Authorized bankers create deals from the Banker Workspace “+ New Deal”
        action (live). Public / anonymous create stays gated — see the readiness
        detail above. Stage progression (Advance Stage) is governed separately.
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
  sectionNote: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.snug,
  },
  doneTag: { color: palette.textSubtle, fontStyle: 'italic' },
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
  actions: { display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  manageLink: {
    background: palette.primary,
    color: palette.surface,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    textDecoration: 'none',
    display: 'inline-block',
  },
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
