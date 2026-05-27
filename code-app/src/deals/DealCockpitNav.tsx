import type { CSSProperties } from 'react';
import {
  ActivityIcon,
  AlertIcon,
  ChecklistIcon,
  MemoIcon,
  PipelineIcon,
  RelationshipIcon,
  SparkleIcon,
  StageIcon,
} from '../shared/cockpitIcons';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 125G — Deal Cockpit anchor strip.
 *
 * A compact horizontal anchor row that sits between the
 * DealMetricDeck and the two-column cockpit grid. Each anchor
 * smooth-scrolls to a major cockpit module so the banker
 * immediately sees that the page contains an Attention Console,
 * a Stage Map, an Action Console, etc. — without needing to
 * scroll far first.
 *
 * Anchors are real `<a href="#…">` links targeting the
 * `data-cockpit-zone` attributes the workspace already
 * declares + new `data-cockpit-anchor` ids on each module's
 * outer wrapper. Smooth scroll is opt-in via CSS
 * `scroll-behavior: smooth` on `<html>` (no JS handler needed).
 *
 * The strip is purely navigational chrome — no governed
 * writes, no fabricated state, no fake AI claim.
 */

export interface DealCockpitNavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ReactNode;
}

const ITEMS: ReadonlyArray<DealCockpitNavItem> = [
  { id: 'attention-console', label: 'Attention', icon: <AlertIcon /> },
  { id: 'stage-map', label: 'Stage Map', icon: <StageIcon /> },
  { id: 'action-console', label: 'Actions', icon: <SparkleIcon /> },
  { id: 'workstreams', label: 'Workstreams', icon: <PipelineIcon /> },
  { id: 'relationship', label: 'Relationship', icon: <RelationshipIcon /> },
  { id: 'credit-memo', label: 'Credit memo', icon: <MemoIcon /> },
  { id: 'activity-timeline', label: 'Activity', icon: <ActivityIcon /> },
  { id: 'deal-summary', label: 'Summary', icon: <ChecklistIcon /> },
];

export function DealCockpitNav() {
  return (
    <nav
      style={styles.wrap}
      aria-label="Deal cockpit sections"
      data-cockpit-anchor-nav="phase-125g"
    >
      <ul style={styles.list}>
        {ITEMS.map((it) => (
          <li key={it.id} style={styles.item}>
            <a
              href={`#${it.id}`}
              style={styles.link}
              data-cockpit-anchor-link={it.id}
            >
              <span style={styles.icon} aria-hidden="true">
                {it.icon}
              </span>
              <span style={styles.label}>{it.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    margin: `0 ${spacing.xxl} ${spacing.lg}`,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    overflowX: 'auto',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    gap: spacing.xs,
    flexWrap: 'wrap' as const,
  },
  item: { display: 'flex' },
  link: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xxs} ${spacing.sm}`,
    color: palette.textMuted,
    textDecoration: 'none',
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
    borderRadius: radius.pill,
    border: `1px solid transparent`,
    transition: 'background 140ms ease, color 140ms ease, border-color 140ms ease',
  },
  icon: {
    display: 'inline-flex',
    color: palette.cobalt,
    width: 14,
    height: 14,
  },
  label: {
    fontSize: typography.size.xs,
  },
};
