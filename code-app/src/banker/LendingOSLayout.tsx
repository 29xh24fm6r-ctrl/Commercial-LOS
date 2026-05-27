import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import {
  ActivityIcon,
  ChecklistIcon,
  ClientIcon,
  DocumentsIcon,
  PipelineIcon,
  StageIcon,
  AlertIcon,
  CalendarIcon,
  BankerIcon,
  SparkleIcon,
  RelationshipIcon,
  TeamsIcon,
} from '../shared/cockpitIcons';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 125F — Lending OS shell layout.
 *
 * Shared dark-sidebar + content-frame chrome used by BOTH the
 * Banker Workspace home page (BankerShell) AND the per-deal
 * cockpit (BankerDealWorkspace). The shell carries the
 * Lending OS branding, the role-aware nav, the workspace
 * switcher, and the signed-in identity card. Content is
 * passed as `children` so each route renders the right body
 * inside the same chrome.
 *
 * Honest discipline (carried from Phase 117 / 118):
 *   - Sidebar nav surfaces real routes for surfaces with
 *     loaders (Dashboard, Active Deals, Tasks & Actions,
 *     Due Diligence, Activity Log).
 *   - "Schedule", "Contacts", "Vendors", "Settings", and
 *     "Help & Support" render as **disabled placeholders**
 *     with explicit "Not yet wired" tooltips so the shell
 *     matches the reference visually without implying
 *     unsupported surfaces.
 *   - No fake "+ New Deal" / "Log Activity" handlers — those
 *     live in `GreetingHeader` as disabled placeholders.
 *   - No global search loader exists today; the search input
 *     in `GreetingHeader` is also a disabled placeholder.
 */

export type LendingOSNavKey =
  | 'dashboard'
  | 'active-deals'
  | 'my-alerts'
  | 'tasks'
  | 'due-diligence'
  | 'activity'
  | 'relationships'
  | 'signals';

export interface LendingOSLayoutProps {
  /**
   * Currently-active nav item. Drives the highlight in the
   * sidebar. For deal pages, callers pass 'active-deals' so the
   * sidebar correctly indicates the user came from the pipeline.
   */
  activeNav: LendingOSNavKey;
  /**
   * Called when the user clicks a real (non-placeholder) nav item.
   * Undefined for routes where nav clicks should not change state
   * (the deal cockpit lives outside the home's tab system).
   */
  onNavSelect?: (key: LendingOSNavKey) => void;
  /** Signed-in banker's full name. */
  fullName: string;
  /** Signed-in banker's email. */
  email: string;
  /** Bootstrap-resolved workspace name (for the switcher). */
  workspaceName: string;
  /** Main content rendered to the right of the sidebar. */
  children: ReactNode;
}

interface RealNavItem {
  readonly kind: 'real';
  readonly key: LendingOSNavKey;
  readonly label: string;
  readonly icon: ReactNode;
}

interface PlaceholderNavItem {
  readonly kind: 'placeholder';
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly tooltip: string;
}

interface NavSection {
  readonly label: string;
  readonly items: ReadonlyArray<RealNavItem | PlaceholderNavItem>;
}

const NAV_SECTIONS: ReadonlyArray<NavSection> = [
  {
    label: 'My Pipeline',
    items: [
      { kind: 'real', key: 'dashboard', label: 'Dashboard', icon: <PipelineIcon /> },
      { kind: 'real', key: 'active-deals', label: 'Active Deals', icon: <StageIcon /> },
      { kind: 'real', key: 'my-alerts', label: 'My Alerts', icon: <AlertIcon /> },
    ],
  },
  {
    label: 'Work Queue',
    items: [
      { kind: 'real', key: 'tasks', label: 'Tasks & Actions', icon: <ChecklistIcon /> },
      { kind: 'real', key: 'due-diligence', label: 'Due Diligence', icon: <DocumentsIcon /> },
      {
        kind: 'placeholder',
        id: 'schedule',
        label: 'Schedule',
        icon: <CalendarIcon />,
        tooltip: 'Calendar integration not yet wired.',
      },
    ],
  },
  {
    label: 'Relationships',
    items: [
      {
        kind: 'placeholder',
        id: 'contacts',
        label: 'Contacts',
        icon: <ClientIcon />,
        tooltip: 'Contacts entity not yet wired in this environment.',
      },
      { kind: 'real', key: 'activity', label: 'Activity Log', icon: <ActivityIcon /> },
    ],
  },
  {
    label: 'Resources',
    items: [
      {
        kind: 'placeholder',
        id: 'vendors',
        label: 'Vendors',
        icon: <RelationshipIcon />,
        tooltip: 'Vendor entity not yet wired in this environment.',
      },
    ],
  },
];

const FOOTER_PLACEHOLDERS: ReadonlyArray<PlaceholderNavItem> = [
  {
    kind: 'placeholder',
    id: 'settings',
    label: 'Settings',
    icon: <SparkleIcon />,
    tooltip: 'Banker-side settings surface not yet wired.',
  },
  {
    kind: 'placeholder',
    id: 'help',
    label: 'Help & Support',
    icon: <TeamsIcon />,
    tooltip: 'Help & support routing not yet wired.',
  },
];

export function LendingOSLayout({
  activeNav,
  onNavSelect,
  fullName,
  email,
  workspaceName,
  children,
}: LendingOSLayoutProps) {
  const initials = useMemo(() => deriveInitials(fullName), [fullName]);
  const safeWorkspace = workspaceName.trim().length > 0 ? workspaceName : 'Banker Workspace';
  return (
    <div style={styles.page}>
      <nav style={styles.sidebar} aria-label="Lending OS navigation">
        <BrandBlock />
        <CurrentWorkspacePill name={safeWorkspace} />

        <div style={styles.scroll}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} style={styles.section}>
              <div style={styles.sectionLabel}>{section.label}</div>
              <ul style={styles.navList}>
                {section.items.map((item) => (
                  <li key={'key' in item ? item.key : item.id} style={styles.navItem}>
                    {item.kind === 'real' ? (
                      <NavButton
                        item={item}
                        active={item.key === activeNav}
                        onSelect={onNavSelect}
                      />
                    ) : (
                      <NavPlaceholder item={item} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          <ul style={styles.navList}>
            {FOOTER_PLACEHOLDERS.map((item) => (
              <li key={item.id} style={styles.navItem}>
                <NavPlaceholder item={item} />
              </li>
            ))}
          </ul>
          <div style={styles.identityCard} aria-label="Signed in banker">
            <div style={styles.identityAvatar} aria-hidden="true">
              {initials}
            </div>
            <div style={styles.identityStack}>
              <div style={styles.identityName}>{fullName}</div>
              <div style={styles.identityEmail}>{email}</div>
            </div>
          </div>
        </div>
      </nav>
      <div style={styles.content}>{children}</div>
    </div>
  );
}

function BrandBlock() {
  return (
    <div style={styles.brandBlock}>
      <div style={styles.brandMark}>
        <BankerIcon size={18} />
      </div>
      <div style={styles.brandStack}>
        <div style={styles.brandName}>Lending OS</div>
        <div style={styles.brandRole}>Old Glory Bank</div>
      </div>
    </div>
  );
}

function CurrentWorkspacePill({ name }: { name: string }) {
  return (
    <div
      style={styles.workspacePill}
      role="group"
      aria-label="Current workspace"
    >
      <span style={styles.workspacePillLabel}>Banker Workspace</span>
      <span style={styles.workspacePillSub} title={name}>{name}</span>
    </div>
  );
}

function NavButton({
  item,
  active,
  onSelect,
}: {
  item: RealNavItem;
  active: boolean;
  onSelect: ((k: LendingOSNavKey) => void) | undefined;
}) {
  const interactive = typeof onSelect === 'function';
  return (
    <button
      type="button"
      onClick={interactive ? () => onSelect(item.key) : undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      style={active ? styles.navButtonActive : styles.navButton}
      disabled={!interactive}
    >
      <span style={styles.navIcon} aria-hidden="true">
        {item.icon}
      </span>
      <span style={styles.navLabel}>{item.label}</span>
    </button>
  );
}

function NavPlaceholder({ item }: { item: PlaceholderNavItem }) {
  return (
    <button
      type="button"
      style={styles.navButtonPlaceholder}
      aria-label={`${item.label} (not yet wired)`}
      aria-disabled="true"
      title={item.tooltip}
      disabled
      data-nav-placeholder={item.id}
    >
      <span style={styles.navIconMuted} aria-hidden="true">
        {item.icon}
      </span>
      <span style={styles.navLabelMuted}>{item.label}</span>
      <span style={styles.navPlaceholderPill} aria-hidden="true">
        Soon
      </span>
    </button>
  );
}

function deriveInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

const SIDEBAR_BG = '#0f172a';
const SIDEBAR_BG_ALT = '#111c33';
const SIDEBAR_TEXT = '#e2e8f0';
const SIDEBAR_TEXT_MUTED = '#94a3b8';
const SIDEBAR_BORDER = 'rgba(148, 163, 184, 0.15)';
const SIDEBAR_ACTIVE_BG = '#1e293b';
const SIDEBAR_ACTIVE_ACCENT = '#60a5fa';
const SIDEBAR_HOVER_BG = 'rgba(96, 165, 250, 0.08)';

const styles: Record<string, CSSProperties> = {
  page: {
    display: 'grid',
    gridTemplateColumns: '240px 1fr',
    minHeight: '100vh',
    fontFamily: typography.family,
    color: palette.text,
    background: palette.panelBg,
  },
  sidebar: {
    background: SIDEBAR_BG,
    color: SIDEBAR_TEXT,
    padding: `${spacing.lg} ${spacing.sm}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    borderRight: `1px solid ${SIDEBAR_BORDER}`,
    position: 'sticky',
    top: 0,
    height: '100vh',
    overflowY: 'auto',
  },
  scroll: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    overflowY: 'auto',
  },
  brandBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingLeft: spacing.xs,
    paddingRight: spacing.xs,
    borderBottom: `1px solid ${SIDEBAR_BORDER}`,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    background: SIDEBAR_ACTIVE_BG,
    color: SIDEBAR_ACTIVE_ACCENT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  },
  brandName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: SIDEBAR_TEXT,
    letterSpacing: typography.letterSpacing.heading,
  },
  brandRole: {
    fontSize: typography.size.xs,
    color: SIDEBAR_TEXT_MUTED,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  workspacePill: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: SIDEBAR_BG_ALT,
    border: `1px solid ${SIDEBAR_BORDER}`,
    borderRadius: radius.sm,
  },
  workspacePillLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: SIDEBAR_TEXT,
  },
  workspacePillSub: {
    fontSize: typography.size.xs,
    color: SIDEBAR_TEXT_MUTED,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxs,
  },
  sectionLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: SIDEBAR_TEXT_MUTED,
    fontWeight: typography.weight.bold,
    padding: `0 ${spacing.sm}`,
    marginBottom: 4,
  },
  navList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  navItem: { display: 'flex' },
  navButton: {
    flex: 1,
    background: 'transparent',
    color: SIDEBAR_TEXT_MUTED,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    fontFamily: typography.family,
    transition: 'background-color 140ms ease, color 140ms ease',
  },
  navButtonActive: {
    flex: 1,
    background: SIDEBAR_ACTIVE_BG,
    color: SIDEBAR_TEXT,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    fontFamily: typography.family,
    boxShadow: `inset 3px 0 0 ${SIDEBAR_ACTIVE_ACCENT}`,
  },
  navButtonPlaceholder: {
    flex: 1,
    background: 'transparent',
    color: SIDEBAR_TEXT_MUTED,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    textAlign: 'left',
    cursor: 'not-allowed',
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    fontFamily: typography.family,
    opacity: 0.55,
  },
  navIcon: {
    display: 'inline-flex',
    width: 18,
    height: 18,
    color: SIDEBAR_ACTIVE_ACCENT,
    flexShrink: 0,
  },
  navIconMuted: {
    display: 'inline-flex',
    width: 18,
    height: 18,
    color: SIDEBAR_TEXT_MUTED,
    flexShrink: 0,
  },
  navLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  navLabelMuted: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: SIDEBAR_TEXT_MUTED,
    flex: 1,
  },
  navPlaceholderPill: {
    fontSize: typography.size.xs,
    color: SIDEBAR_TEXT_MUTED,
    background: SIDEBAR_BG_ALT,
    border: `1px solid ${SIDEBAR_BORDER}`,
    borderRadius: radius.pill,
    padding: `1px 6px`,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  footer: {
    paddingTop: spacing.sm,
    borderTop: `1px solid ${SIDEBAR_BORDER}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  identityCard: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: SIDEBAR_BG_ALT,
    border: `1px solid ${SIDEBAR_BORDER}`,
    borderRadius: radius.sm,
  },
  identityAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    background: SIDEBAR_BG,
    color: SIDEBAR_ACTIVE_ACCENT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
    border: `1px solid ${SIDEBAR_BORDER}`,
  },
  identityStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  },
  identityName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: SIDEBAR_TEXT,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  identityEmail: {
    fontSize: typography.size.xs,
    color: SIDEBAR_TEXT_MUTED,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    background: palette.panelBg,
  },
};

void SIDEBAR_HOVER_BG;
