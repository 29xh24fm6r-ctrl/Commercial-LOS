import { useEffect, useState, type CSSProperties } from 'react';
import { Badge } from '../shared/Badge';
import { Guilloche } from '../design';
import { EMAIL_MODE } from '../deals/emailDelivery/emailMode';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import {
  LogActivityModal,
  type LogActivityDealOption,
} from '../deals/LogActivityModal';
import { logActivity } from '../deals/logActivityActions';

/**
 * Phase 125F Ã¢â‚¬â€ Banker Workspace greeting header.
 *
 * Replaces the Phase 117 institutional eyebrow with a personal
 * greeting card matching the original Lending OS reference:
 *
 *   Ã¢â€Å’Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Â
 *   Ã¢â€â€š Good afternoon, Matthew      [search Ã¢â€“Â¢] [Log Activity][+New]Ã¢â€â€š
 *   Ã¢â€â€š You have 4 tasks pending and 0 meetings today              Ã¢â€â€š
 *   Ã¢â€â€š                                                            Ã¢â€â€š
 *   Ã¢â€â€š Email: LIVE  Ã‚Â· Banker Workspace                            Ã¢â€â€š
 *   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€Ëœ
 *
 * Honest discipline (updated Phase 257):
 *   - Greeting uses the signed-in banker's first name (or the
 *     fullName fallback). Time-of-day is derived from `now`.
 *   - Task count is derived from the parent shell's KPI snapshot
 *     (`openTaskCount`). The unbuilt calendar/meeting line and the
 *     unbuilt global-search input are hidden from the launch UI.
 *   - "Log Activity" opens a governed activity-write modal when
 *     the banker has write entitlement and Dataverse identity.
 *   - "+ New Deal" is a real, enabled shortcut that routes to the
 *     governed New Deal panel on the Active Deals tab (via onNewDeal).
 *   - The read-only banner from Phase 117 is preserved as a
 *     status row beneath the greeting when applicable.
 */
export interface GreetingHeaderProps {
  fullName: string;
  email: string;
  writeDisabledReason: string | undefined;
  /** Dataverse systemuserid for governed writes. */
  systemUserId: string | undefined;
  /** Banker ID for governed writes. */
  bankerId: string | undefined;
  /** Active banker-authorized deals available for activity logging. */
  activityDealOptions: readonly LogActivityDealOption[];
  /**
   * Open-task count derived by the parent shell. Used to populate
   * the "N tasks pending" sub-line honestly. `undefined` while
   * the parent slot is still loading; the sub-line renders a
   * neutral "Loading workload..." until ready.
   */
  openTaskCount: number | undefined;
  /**
   * Intaglio v2 — the hero pipeline figure (sum across active deals). When
   * provided, the band renders it huge and luminous as the screen's one hero
   * moment. `undefined` while the parent snapshot is loading.
   */
  pipelineAmount?: number;
  /** Count of active deals missing an amount (honest caveat under the figure). */
  dealsMissingAmount?: number;
  /** Urgent-item count — drives the single Seal-Red accent when > 0. */
  urgentCount?: number;
  /** Callback after a governed activity write completes. */
  onActivityLogged?: () => void;
  /**
   * Phase 257 — opens the governed New Deal create flow (the Active Deals
   * New Deal panel). The header button is a navigation shortcut; the panel
   * itself enforces authorization, the production Stage/Status resolver, and
   * audit.
   */
  onNewDeal?: () => void;
  /**
   * Optional override for `now` -- primarily for tests.
   */
  now?: Date;
}

export function GreetingHeader({
  fullName,
  email,
  writeDisabledReason,
  systemUserId,
  bankerId,
  activityDealOptions,
  openTaskCount,
  pipelineAmount,
  dealsMissingAmount,
  urgentCount,
  onActivityLogged,
  onNewDeal,
  now: nowOverride,
}: GreetingHeaderProps) {
  const now = nowOverride ?? new Date();
  const [showLogActivityModal, setShowLogActivityModal] = useState(false);
  const logActivityEnabled = !writeDisabledReason && !!systemUserId && !!bankerId;
  const firstName = deriveFirstName(fullName);
  const greeting = greetingForHour(now.getHours());
  const pipelineDisplay = useCountUp(pipelineAmount ?? 0);
  return (
    <header className="cc-rise-in" style={styles.header} aria-label="Banker workspace greeting header">
      {/* Intaglio v2 hero — the guilloché elevated to atmosphere behind the band,
          like the security engraving on a banknote. Used at this scale here and
          nowhere else. Decorative; hidden from AT. */}
      <Guilloche
        size={500}
        opacity={0.08}
        color="var(--cc-text)"
        className="cc-hero-guilloche"
      />
      <div style={styles.heroContent}>
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
                task{openTaskCount === 1 ? '' : 's'} pending today
              </>
            )}
          </p>
        </div>
        <div style={styles.actions} aria-label="Workspace actions">
          {logActivityEnabled ? (
            <button
              type="button"
              style={styles.secondaryEnabledButton}
              aria-label="Log activity"
              onClick={() => setShowLogActivityModal(true)}
            >
              Log Activity
            </button>
          ) : (
            <ActionButton
              label="Log Activity"
              tooltip={writeDisabledReason ?? 'Log Activity requires write entitlement.'}
            />
          )}
          <button
            type="button"
            style={styles.primaryEnabledButton}
            aria-label="Create deal"
            title="Open the New Deal panel. Stage opens at Intake with status Open; the create is governed and audited."
            onClick={() => onNewDeal?.()}
            data-action-new-deal
          >
            + New Deal
          </button>
        </div>
      </div>
      {pipelineAmount !== undefined && (
        <div style={styles.heroRow}>
          <div style={styles.heroNumberBlock}>
            <div className="cc-display cc-tnum" style={styles.heroNumber} data-hero-pipeline>
              {formatCurrencyCompact(pipelineDisplay)}
            </div>
            <div style={styles.heroLabel}>
              Total pipeline
              <span style={styles.heroSub}>
                {' · '}
                {dealsMissingAmount && dealsMissingAmount > 0
                  ? `${dealsMissingAmount} deal${dealsMissingAmount === 1 ? '' : 's'} missing amount`
                  : 'across active deals'}
              </span>
            </div>
          </div>
          {urgentCount !== undefined && urgentCount > 0 && (
            <span style={styles.urgentAccent} data-hero-urgent>
              {urgentCount} urgent
            </span>
          )}
        </div>
      )}
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
          (Identity chip: {fullName} Ã‚Â· {email}.)
        </div>
      )}
      </div>
      {showLogActivityModal && systemUserId && (
        <LogActivityModal
          deals={activityDealOptions}
          writeDisabledReason={writeDisabledReason}
          onConfirm={async (dealId, note) => {
            const deal = activityDealOptions.find((option) => option.id === dealId);
            const result = await logActivity({
              dealId,
              dealName: deal?.name ?? 'Selected deal',
              bankerName: fullName,
              systemUserId,
              actorEmail: email,
              note,
            });
            if (result.kind === 'success' || result.kind === 'governance-partial') {
              onActivityLogged?.();
            }
            return result;
          }}
          onClose={() => setShowLogActivityModal(false)}
        />
      )}
    </header>
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
      aria-label={`${label} (unavailable)`}
      style={primary ? styles.primaryButton : styles.secondaryButton}
      data-action-placeholder={label.toLowerCase().replace(/\W+/g, '-')}
    >
      {label}
    </button>
  );
}

/** True when motion should be suppressed. No matchMedia (tests / minimal shells)
 *  is treated as reduced-motion, so the hero number renders final immediately. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Count the hero figure up from 0 → target on mount (easeOutCubic, ~650ms).
 *  Reduced-motion (or no rAF) shows the final value instantly — and because the
 *  return short-circuits to `target` in that case, the figure is always honest. */
function useCountUp(target: number, durationMs = 650): number {
  const reduced = prefersReducedMotion() || typeof requestAnimationFrame !== 'function';
  // Lazy initial: start at 0 only when we will actually animate (no flash of final).
  const [value, setValue] = useState(() => (reduced ? target : 0));
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let startTime: number | null = null;
    const tick = (t: number) => {
      if (startTime === null) startTime = t;
      const p = Math.min(1, (t - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased); // set inside the rAF callback (not the effect body)
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);
  return reduced ? target : value;
}

function formatCurrencyCompact(n: number): string {
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
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
    position: 'relative',
    overflow: 'hidden',
    // Subtle sheen across the band — elevated surface lifting toward a lighter
    // top edge, so the hero reads as the screen's anchor surface.
    background: `linear-gradient(160deg, ${palette.surfaceAlt} 0%, ${palette.surface} 60%)`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.lg,
    boxShadow: shadow.hero,
    padding: `${spacing.xl} ${spacing.xxl}`,
    margin: `${spacing.lg} ${spacing.xxl} 0`,
  },
  heroContent: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  heroRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  heroNumberBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  heroNumber: {
    fontSize: 'clamp(3.4rem, 6vw, 5rem)',
    fontWeight: typography.weight.bold,
    color: palette.text,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    // Faint luminance — the number is the star of the screen.
    textShadow: '0 0 32px rgba(237, 232, 220, 0.20)',
  },
  heroLabel: {
    fontSize: typography.size.sm,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textMuted,
    fontWeight: typography.weight.semibold,
  },
  heroSub: {
    textTransform: 'none',
    letterSpacing: 0,
    color: palette.textSubtle,
    fontWeight: typography.weight.regular,
  },
  // The single Seal-Red accent on the screen — the one number that wants attention.
  urgentAccent: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xxs,
    background: palette.accent,
    color: '#fffdf9',
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    padding: `${spacing.xxs} ${spacing.sm}`,
    borderRadius: radius.pill,
    boxShadow: shadow.accentGlow,
    fontVariantNumeric: 'tabular-nums',
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
  secondaryEnabledButton: {
    background: palette.surfaceAlt,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'pointer',
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
  primaryEnabledButton: {
    background: palette.cobalt,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    fontFamily: typography.family,
    cursor: 'pointer',
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
