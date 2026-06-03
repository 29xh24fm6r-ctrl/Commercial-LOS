import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { WorkspaceLink } from './workspaceEntitlements';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 124C — Workspace switcher.
 *
 * Renders the user's entitled workspaces as a compact link list. The
 * current workspace appears as a static, aria-current item; every
 * other entitled workspace renders as a `<Link>` to its route. No
 * write affordance — this is pure navigation.
 *
 * The component is presentation-only. It does NOT compute
 * entitlements itself (that's `useEntitledRoutes()` +
 * `deriveWorkspaceLinks()`). Callers decide whether to render the
 * switcher at all — typically only when `links.length >= 2`.
 *
 * Two visual modes via the `tone` prop:
 *   - 'dark' — for the Lending OS sidebar (dark navy chrome)
 *   - 'light' — for the Manager workspace header (white surface)
 *
 * Permission-before-render is preserved upstream: every link in
 * `links` is already either the bootstrap-primary route or an
 * additional route the user is entitled to navigate to (the
 * WorkspaceGate widens its allow check based on the same source
 * of truth).
 */

export interface WorkspaceSwitcherProps {
  /** Entitled workspaces, in catalog order. One must be isCurrent. */
  links: ReadonlyArray<WorkspaceLink>;
  /** Visual treatment. 'dark' = sidebar; 'light' = inline header. */
  tone?: 'dark' | 'light';
  /** Accessibility label for the surrounding nav element. */
  'aria-label'?: string;
}

export function WorkspaceSwitcher({
  links,
  tone = 'light',
  'aria-label': ariaLabel = 'Workspace switcher',
}: WorkspaceSwitcherProps) {
  const styles = tone === 'dark' ? darkStyles : lightStyles;
  return (
    <nav
      style={styles.wrap}
      aria-label={ariaLabel}
      data-workspace-switcher={tone}
    >
      <span style={styles.label}>Workspace</span>
      <ul style={styles.list}>
        {links.map((link) => (
          <li key={link.key} style={styles.item}>
            {link.isCurrent ? (
              <span
                style={styles.itemCurrent}
                aria-current="page"
                data-workspace-link-key={link.key}
                data-workspace-link-current="true"
              >
                {link.label}
              </span>
            ) : (
              <Link
                to={link.route}
                style={styles.itemLink}
                aria-label={`Switch to ${link.label}`}
                data-workspace-link-key={link.key}
                data-workspace-link-current="false"
              >
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

const lightStyles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    minWidth: 0,
  },
  label: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
  },
  list: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
  },
  item: {
    display: 'inline-flex',
  },
  itemCurrent: {
    padding: `2px ${spacing.sm}`,
    background: palette.primaryBg,
    color: palette.primaryFg,
    border: `1px solid ${palette.primaryDim}`,
    borderRadius: radius.pill,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  itemLink: {
    padding: `2px ${spacing.sm}`,
    background: palette.surface,
    color: palette.primary,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.pill,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    textDecoration: 'none' as const,
  },
};

const darkStyles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
    padding: `${spacing.sm} ${spacing.md}`,
    background: 'rgba(96, 165, 250, 0.08)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: radius.md,
    margin: `${spacing.sm} ${spacing.md} 0`,
    minWidth: 0,
  },
  label: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: '#94a3b8',
    fontWeight: typography.weight.bold,
  },
  list: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  item: {
    display: 'flex',
  },
  itemCurrent: {
    padding: `4px ${spacing.sm}`,
    background: 'rgba(96, 165, 250, 0.18)',
    color: '#cfe1ff',
    border: '1px solid rgba(96, 165, 250, 0.35)',
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    flex: 1,
  },
  itemLink: {
    padding: `4px ${spacing.sm}`,
    background: 'transparent',
    color: '#e2e8f0',
    border: '1px solid transparent',
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    textDecoration: 'none' as const,
    flex: 1,
  },
};
