import { useDealData } from './DealDataProvider';
import { BankerIcon, ClientIcon, StageIcon } from '../shared/cockpitIcons';
import { radius, shadow, spacing, typography } from '../shared/theme';

/**
 * Phase 125E — Command Hero (recomposed).
 *
 * Larger, more dramatic navy command band that anchors the cockpit.
 * The Phase 125B glass metric strip is gone — those values now live
 * in the DealMetricDeck below the hero, so the hero can focus on
 * deal identity and quick navigation.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  ● COMMERCIAL LENDING COCKPIT                                │
 *   │                                                              │
 *   │  TEST — Deal Phase 121                                       │
 *   │                                                              │
 *   │  ┌──┐ Client            ┌──┐ Banker             ┌──┐ Stage   │
 *   │  │👥│ Acme Manufacturing│👤│ M. Paller          │▤ │ Underw. │
 *   │  └──┘                   └──┘                     └──┘         │
 *   │                                                              │
 *   │  [ Stage · Underwriting ] [ Status · Active ]   #d-current  │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Honest absence rules unchanged: missing values render as italic
 * "Not set" / "Not assigned" inside their identity slot. No fake
 * data, no fabricated metrics, no AI claim.
 */
export function DealHeader() {
  const { deal } = useDealData();

  return (
    <header style={styles.hero} aria-label="Deal command hero">
      <div style={styles.heroOverlay} aria-hidden="true" />
      <div style={styles.heroContent}>
        <div style={styles.eyebrowRow}>
          <span style={styles.eyebrowDot} aria-hidden="true" />
          <span style={styles.eyebrow}>Commercial Lending Cockpit</span>
          <span style={styles.idChip} aria-label={`Deal id ${deal.id}`}>
            #{deal.id.slice(0, 8)}
          </span>
        </div>

        <h1 style={styles.name}>{deal.name}</h1>

        <div style={styles.identityRow} aria-label="Deal identity">
          <IdentitySlot
            icon={<ClientIcon />}
            label="Client"
            value={deal.clientName}
          />
          <IdentitySlot
            icon={<BankerIcon />}
            label="Banker"
            value={deal.bankerName}
            missingLabel="Not assigned"
          />
          <IdentitySlot
            icon={<StageIcon />}
            label="Stage"
            value={deal.stage}
          />
        </div>

        <div style={styles.chipRow}>
          <span
            style={deal.status ? styles.chip : styles.chipMissing}
            aria-label={`Status: ${deal.status ?? 'not set'}`}
          >
            {deal.status ? `Status · ${deal.status}` : 'Status · Not set'}
          </span>
          {deal.isClosed && (
            <span style={styles.chipClosed} aria-label="Deal closed">
              Closed
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function IdentitySlot({
  icon,
  label,
  value,
  missingLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  missingLabel?: string;
}) {
  return (
    <div style={styles.identitySlot}>
      <span style={styles.identityIcon} aria-hidden="true">
        {icon}
      </span>
      <span style={styles.identityBody}>
        <span style={styles.identityLabel}>{label}</span>
        <span style={value ? styles.identityValue : styles.identityValueMissing}>
          {value ?? missingLabel ?? 'Not set'}
        </span>
      </span>
    </div>
  );
}

const NAVY_HERO_BG =
  'linear-gradient(135deg, #0b1224 0%, #14213d 55%, #1f3461 100%)';
const NAVY_HERO_OVERLAY =
  'radial-gradient(circle at 85% -10%, rgba(96, 165, 250, 0.22), transparent 55%)';
const HERO_TEXT = '#f1f5fa';
const HERO_TEXT_MUTED = 'rgba(241, 245, 250, 0.72)';
const HERO_TEXT_SUBTLE = 'rgba(241, 245, 250, 0.52)';
const HERO_ACCENT = '#60a5fa';
const GLASS_CELL_BG = 'rgba(255, 255, 255, 0.06)';
const GLASS_CELL_BORDER = 'rgba(255, 255, 255, 0.14)';

const styles: Record<string, React.CSSProperties> = {
  hero: {
    position: 'relative' as const,
    background: NAVY_HERO_BG,
    borderRadius: radius.lg,
    boxShadow: `${shadow.glow}, ${shadow.hero}`,
    overflow: 'hidden' as const,
    marginBottom: spacing.lg,
    color: HERO_TEXT,
  },
  heroOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: NAVY_HERO_OVERLAY,
    pointerEvents: 'none' as const,
  },
  heroContent: {
    position: 'relative' as const,
    padding: `${spacing.xl} ${spacing.xxl}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  eyebrowRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrowDot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: HERO_ACCENT,
    boxShadow: `0 0 0 4px rgba(96, 165, 250, 0.18)`,
  },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: HERO_ACCENT,
    fontWeight: typography.weight.bold,
  },
  idChip: {
    marginLeft: 'auto',
    fontSize: typography.size.xs,
    color: HERO_TEXT_SUBTLE,
    fontFamily: typography.mono,
    background: GLASS_CELL_BG,
    border: `1px solid ${GLASS_CELL_BORDER}`,
    padding: `2px ${spacing.sm}`,
    borderRadius: radius.sm,
  },
  name: {
    margin: 0,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    color: HERO_TEXT,
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: 1.05,
  },
  identityRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  identitySlot: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: GLASS_CELL_BG,
    border: `1px solid ${GLASS_CELL_BORDER}`,
    borderRadius: radius.md,
    minWidth: 0,
  },
  identityIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    background: 'rgba(96, 165, 250, 0.14)',
    color: HERO_ACCENT,
    flexShrink: 0,
  },
  identityBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
    minWidth: 0,
  },
  identityLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
    color: HERO_TEXT_SUBTLE,
    fontWeight: typography.weight.semibold,
  },
  identityValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: HERO_TEXT,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  identityValueMissing: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.regular,
    color: HERO_TEXT_SUBTLE,
    fontStyle: 'italic' as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    paddingTop: 4,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${spacing.xxs} ${spacing.sm}`,
    background: GLASS_CELL_BG,
    color: HERO_TEXT,
    border: `1px solid ${GLASS_CELL_BORDER}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
  },
  chipMissing: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${spacing.xxs} ${spacing.sm}`,
    background: 'transparent',
    color: HERO_TEXT_SUBTLE,
    border: `1px dashed ${GLASS_CELL_BORDER}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontStyle: 'italic' as const,
    letterSpacing: typography.letterSpacing.label,
  },
  chipClosed: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${spacing.xxs} ${spacing.sm}`,
    background: 'rgba(248, 113, 113, 0.18)',
    color: '#fecaca',
    border: '1px solid rgba(248, 113, 113, 0.38)',
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.label,
  },
};

// Silence "imported but never read" on HERO_TEXT_MUTED — kept as
// a named constant for future hero subtitle treatment (Phase 126+).
void HERO_TEXT_MUTED;
