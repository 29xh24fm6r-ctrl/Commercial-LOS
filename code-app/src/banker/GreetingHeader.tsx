import type { CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { SparkleIcon } from '../shared/cockpitIcons';
import { EMAIL_MODE } from '../deals/emailDelivery/emailMode';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';

/**
 * Phase 125F — Banker Workspace greeting header.
 *
 * Replaces the Phase 117 institutional eyebrow with a personal
 * greeting card matching the original Lending OS reference:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Good afternoon, Matthew      [search ▢] [Log Activity][+New]│
 *   │ You have 4 tasks pending and 0 meetings today              │
 *   │                                                            │
 *   │ Email: LIVE  · Banker Workspace                            │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Honest discipline:
 *   - Greeting uses the signed-in banker's first name (or the
 *     fullName fallback). Time-of-day is derived from `now`.
 *   - Task count is derived from the parent shell's KPI snapshot
 *     (`openTaskCount`); meeting count is honestly 0 with a
 *     hover tooltip that says "Calendar integration not yet
 *     wired."
 *   - Search bar is a **disabled** input with a "Search not yet
 *     wired" placeholder/tooltip. No client-side filtering; no
 *     loader call.
 *   - "Log Activity" and "+ New Deal" render as **disabled**
 *     buttons with explicit "Not yet wired" tooltips. They
 *     would require new GOVERNED_WRITES entries that have not
 *     been added (see PHASE_118_ORIGINAL_UI_UX_INVENTORY.md
 *     §4.1).
 *   - The read-only banner from Phase 117 is preserved as a
 *     status row beneath the greeting when applicable.
 */
export interface GreetingHeaderProps {
  fullName: string;
  email: string;
  writeDisabledReason: string | undefined;
  /**
   * Open-task count derived by the parent shell. Used to populate
   * the "N tasks pending" sub-line honestly. `undefined` while
   * the parent slot is still loading; the sub-line renders a
   * neutral "Loading workload…" until ready.
   */
  openTaskCount: number | undefined;
  /**
   * Optional override for `now` — primarily for tests.
   */
  now?: Date;
}

export function GreetingHeader({
  fullName,
  email,
  writeDisabledReason,
  openTaskCount,
  now: nowOverride,
}: GreetingHeaderProps) {
  const now = nowOverride ?? new Date();
  const firstName = deriveFirstName(fullName);
  const greeting = greetingForHour(now.getHours());
  return (
    <header style={styles.header} aria-label="Banker workspace greeting header">
      <div style={styles.row}>
        <div style={styles.titleBlock}>
          <h1 style={styles.greeting}>
            {greeting}, {firstName}
          </h1>
          <p style={styles.subtitle}>
            {openTaskCount === undefined ? (
              <span style={styles.subtitleLoading}>Loading workload…</span>
            ) : (
              <>
                You have{' '}
                <strong style={styles.subtitleStrong}>{openTaskCount}</strong>{' '}
                task{openTaskCount === 1 ? '' : 's'} pending and{' '}
                <strong
                  style={styles.subtitleStrong}
                  title="Calendar integration not yet wired."
                >
                  0
                </strong>{' '}
                meetings today
              </>
            )}
          </p>
        </div>
        <div style={styles.actions} aria-label="Workspace actions">
          <SearchPlaceholder />
          <ActionButton
            label="Log Activity"
            tooltip="Log Activity is not yet wired. Requires a new GOVERNED_WRITES entry (see Phase 118 inventory)."
          />
          <ActionButton
            label="+ New Deal"
            tooltip="+ New Deal is not yet wired. Requires a new GOVERNED_WRITES entry (see Phase 118 inventory)."
            primary
          />
        </div>
      </div>
      <div style={styles.metaRow}>
        <Badge
          variant={EMAIL_MODE === 'LIVE' ? 'clear' : 'neutral'}
          appearance="outline"
          aria-label={`Email delivery mode: ${EMAIL_MODE}`}
        >
          Email: {EMAIL_MODE}
        </Badge>
        {writeDisabledReason && (
          <Badge variant="atRisk" appearance="outline" title={writeDisabledReason}>
            Read-only mode
          </Badge>
        )}
      </div>
      {writeDisabledReason && (
        <div style={styles.readOnlyBanner} role="status">
          <strong>Read-only mode.</strong> {writeDisabledReason} Write actions
          remain disabled until the underlying issue is resolved.
          (Identity chip: {fullName} · {email}.)
        </div>
      )}
    </header>
  );
}

function SearchPlaceholder() {
  return (
    <label
      style={styles.searchWrap}
      title="Global search not yet wired."
      aria-label="Search (not yet wired)"
    >
      <span style={styles.searchIcon} aria-hidden="true">
        <SparkleIcon size={14} />
      </span>
      <input
        type="text"
        style={styles.searchInput}
        placeholder="Search deals, loans, contacts… (not yet wired)"
        disabled
        aria-disabled="true"
        data-search-placeholder="lending-os-search"
      />
    </label>
  );
}

function ActionButton({
  label,
  tooltip,
  primary,
}: {
  label: string;
  tooltip: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={tooltip}
      aria-label={`${label} (not yet wired)`}
      style={primary ? styles.primaryButton : styles.secondaryButton}
      data-action-placeholder={label.toLowerCase().replace(/\W+/g, '-')}
    >
      {label}
    </button>
  );
}

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function deriveFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Banker';
  return parts[0]!;
}

const styles: Record<string, CSSProperties> = {
  header: {
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.lg,
    boxShadow: shadow.elevated,
    padding: `${spacing.lg} ${spacing.xl}`,
    margin: `${spacing.lg} ${spacing.xxl} 0`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  greeting: {
    margin: 0,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: 1.05,
  },
  subtitle: {
    margin: 0,
    fontSize: typography.size.md,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  subtitleStrong: {
    color: palette.text,
    fontWeight: typography.weight.bold,
    fontVariantNumeric: 'tabular-nums',
  },
  subtitleLoading: {
    fontStyle: 'italic',
    color: palette.textSubtle,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  searchWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.pill,
    minWidth: 240,
    cursor: 'not-allowed',
    opacity: 0.65,
  },
  searchIcon: {
    color: palette.textSubtle,
    display: 'inline-flex',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontFamily: typography.family,
    outline: 'none',
  },
  secondaryButton: {
    background: palette.surfaceAlt,
    color: palette.textMuted,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'not-allowed',
    opacity: 0.7,
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  primaryButton: {
    background: palette.cobalt,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    fontFamily: typography.family,
    cursor: 'not-allowed',
    opacity: 0.7,
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
    paddingTop: spacing.xs,
    borderTop: `1px solid ${palette.divider}`,
  },
  readOnlyBanner: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.atRiskBg,
    color: palette.atRiskFg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
};
