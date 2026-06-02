import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useManager } from './ManagerContext';
import { useManagerData } from './ManagerDataProvider';
import type { TeamDeal } from './managerQueries';
import {
  buildManagerFilterPreferenceScope,
  getManagerFilterPreference,
  saveManagerFilterPreference,
  validateRestoredPreference,
} from './managerBankerFilterPreference';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 92: per-banker filter for the manager observability surfaces.
 *
 * State is local React state held by `ManagerBankerFilterProvider`.
 * Default selection is `{ kind: 'all' }` — the manager sees their
 * whole authorized team pipeline, exactly as before Phase 92. When
 * the manager picks a specific banker, the autopilot rollup and
 * morning catch-up cards filter their data sources to that banker's
 * deals before running the deterministic derivation.
 *
 * Discipline:
 *   - No Dataverse write, no audit row, no timeline event, no
 *     governed write, no schema work.
 *   - No persistence — filter selection is in-memory React state.
 *     The brief explicitly prefers in-memory state for Phase 92.
 *   - No cross-device sync, no notification, no AI, no real-time
 *     stream.
 *   - No permission widening. The filter operates strictly over the
 *     manager's already-authorized `teamPipeline` (Phase 14) and the
 *     Phase 87 manager-scoped child data.
 *   - Phase 90 / 91 ledgers are unaffected: the filter changes which
 *     ROWS render, not which keys exist; a dismissed item that gets
 *     filtered out simply doesn't show, and reappears (still
 *     dismissed) when the filter widens.
 *
 * Surfaces filtered (Phase 92 scope):
 *   - ManagerAutopilotRollup
 *   - ManagerMorningCatchUp
 *
 * Out of Phase 92 scope (intentional):
 *   - ManagerActivitySummary, TeamPipelineSummary, DealsByStage,
 *     ClosingForecast, AtRiskBlockedDeals, BankerWorkloadSummary,
 *     TeamWorkQueue. These continue to show the full team view.
 *     A future phase could thread the filter through additional
 *     cards if banker feedback warrants it.
 */

// ---------------------------------------------------------------------------
// Selection + option model
// ---------------------------------------------------------------------------

export type ManagerBankerFilterSelection =
  | { kind: 'all' }
  | {
      kind: 'banker';
      /** `cr664_bankerid` when known; undefined when only the
       *  `cr664_assignedbankername` denorm is available on the deal
       *  record. Name-fallback is honestly documented as a limitation
       *  in the Phase 92 doc. */
      id: string | undefined;
      name: string;
    }
  | { kind: 'unassigned' };

export interface ManagerBankerFilterOption {
  /** Stable string suitable for use as `<select>`'s `value`. Maps
   *  one-to-one to the underlying `selection`. */
  value: string;
  label: string;
  selection: ManagerBankerFilterSelection;
}

export const ALL_TEAM_OPTION_VALUE = '__all__';
export const UNASSIGNED_OPTION_VALUE = '__unassigned__';

function bankerOptionValue(opt: {
  id: string | undefined;
  name: string;
}): string {
  // Prefer the banker id; fall back to a `name:<name>` key when the
  // id is absent. Same disambiguation Phase 87 manager queries lean
  // on for the denorm-only path.
  return opt.id ? `banker-id:${opt.id}` : `banker-name:${opt.name}`;
}

/**
 * Pure: derive the filter options from a list of team deals. Always
 * includes "All team" first; appends one option per unique banker
 * (by id, falling back to name); appends "Unassigned" last iff any
 * deal lacks an assigned banker.
 *
 * Exported for tests + so the provider stays a thin React shell
 * around the pure logic.
 */
export function deriveBankerFilterOptions(
  deals: ReadonlyArray<Pick<TeamDeal, 'assignedBankerId' | 'assignedBankerName'>>,
): ManagerBankerFilterOption[] {
  const seen = new Map<
    string,
    { id: string | undefined; name: string }
  >();
  let anyUnassigned = false;
  for (const d of deals) {
    const name = (d.assignedBankerName ?? '').trim();
    const id = d.assignedBankerId?.trim() || undefined;
    if (!id && !name) {
      anyUnassigned = true;
      continue;
    }
    const key = bankerOptionValue({ id, name });
    if (!seen.has(key)) seen.set(key, { id, name });
  }
  const bankers = Array.from(seen.entries())
    .map(([value, { id, name }]) => ({
      value,
      label: name || '(unnamed banker)',
      selection: {
        kind: 'banker' as const,
        id,
        name: name || '(unnamed banker)',
      },
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const all: ManagerBankerFilterOption = {
    value: ALL_TEAM_OPTION_VALUE,
    label: 'All team',
    selection: { kind: 'all' },
  };
  const options: ManagerBankerFilterOption[] = [all, ...bankers];
  if (anyUnassigned) {
    options.push({
      value: UNASSIGNED_OPTION_VALUE,
      label: 'Unassigned',
      selection: { kind: 'unassigned' },
    });
  }
  return options;
}

/**
 * Pure predicate: whether a deal passes the given filter. Exported
 * for tests + so the surfaces can apply the filter directly without
 * threading the provider through.
 *
 * For `kind: 'banker'`, prefers id match; falls back to a
 * case-insensitive name match when the selection has no id (the
 * denorm-only fallback path).
 */
export function dealMatchesBankerFilter(
  deal: Pick<TeamDeal, 'assignedBankerId' | 'assignedBankerName'>,
  selection: ManagerBankerFilterSelection,
): boolean {
  if (selection.kind === 'all') return true;
  if (selection.kind === 'unassigned') {
    const id = deal.assignedBankerId?.trim() || undefined;
    const name = (deal.assignedBankerName ?? '').trim();
    return !id && !name;
  }
  // 'banker' selection.
  if (selection.id) {
    return deal.assignedBankerId === selection.id;
  }
  // Name-fallback path. Compare case-insensitively to avoid
  // tripping on cosmetic casing drift.
  const dealName = (deal.assignedBankerName ?? '').trim().toLowerCase();
  const selName = selection.name.trim().toLowerCase();
  return dealName !== '' && dealName === selName;
}

/** Compute the `<select>` value that maps to the current selection. */
export function selectionToOptionValue(
  selection: ManagerBankerFilterSelection,
): string {
  if (selection.kind === 'all') return ALL_TEAM_OPTION_VALUE;
  if (selection.kind === 'unassigned') return UNASSIGNED_OPTION_VALUE;
  return bankerOptionValue({ id: selection.id, name: selection.name });
}

/** Human-readable accessibility label for the current selection. */
export function selectionLabel(
  selection: ManagerBankerFilterSelection,
): string {
  if (selection.kind === 'all') return 'Showing team view';
  if (selection.kind === 'unassigned') return 'Filtered to Unassigned';
  return `Filtered to ${selection.name}`;
}

// ---------------------------------------------------------------------------
// Context + provider + hook
// ---------------------------------------------------------------------------

export interface ManagerBankerFilterView {
  selection: ManagerBankerFilterSelection;
  setSelection(next: ManagerBankerFilterSelection): void;
  options: ManagerBankerFilterOption[];
  /** True when the deal passes the current filter. */
  matchesDeal(deal: Pick<TeamDeal, 'assignedBankerId' | 'assignedBankerName'>): boolean;
  /** Accessibility label describing the current selection. */
  selectionLabel: string;
  /** Phase 93: true when a stable (manager, team) scope is
   *  available and the selection is being persisted to
   *  localStorage on every change. When false the provider
   *  operates as in-memory only (no save, no restore). The control
   *  uses this flag to tailor its helper text. */
  isPreferenceScoped: boolean;
}

const ManagerBankerFilterContext =
  createContext<ManagerBankerFilterView | null>(null);

/**
 * Mounts inside ManagerDataProvider. Reads `teamPipeline` to derive
 * options reactively; holds the selection in local React state.
 *
 * The provider does NOT auto-reset the selection when the team
 * pipeline changes (e.g. a banker's deals all get reassigned). If
 * the selected banker no longer matches any deal, the surfaces will
 * honestly show empty states; the manager can switch back to "All
 * team" manually. This is more transparent than silently auto-
 * resetting their selection out from under them.
 */
export function ManagerBankerFilterProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { bankerId, teamId } = useManager();
  const { teamPipeline } = useManagerData();
  const [selection, setSelectionState] = useState<ManagerBankerFilterSelection>(
    { kind: 'all' },
  );

  const options = useMemo(() => {
    const deals = teamPipeline.kind === 'ready' ? teamPipeline.data : [];
    return deriveBankerFilterOptions(deals);
  }, [teamPipeline]);

  // Phase 93: compute the preference scope. When undefined the
  // provider behaves as in-memory only (Phase 92 behavior).
  const preferenceScope = useMemo(
    () => buildManagerFilterPreferenceScope({ userId: bankerId, teamId }),
    [bankerId, teamId],
  );

  // Phase 93: restore the saved preference once, as soon as options
  // are populated. The validate step guarantees the restored
  // selection matches one of the current options (or falls back to
  // 'all'). Restoration runs at most once per scope to avoid
  // re-clobbering the user's explicit picks.
  const restoredScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (preferenceScope == null) return;
    if (restoredScopeRef.current === preferenceScope) return;
    if (teamPipeline.kind !== 'ready') return;
    const saved = getManagerFilterPreference(preferenceScope);
    const validated = validateRestoredPreference(saved, options);
    restoredScopeRef.current = preferenceScope;
    setSelectionState(validated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferenceScope, teamPipeline.kind]);

  // Phase 93: write-through setter. Updates React state AND (when a
  // scope is available) persists the selection. Storage write is
  // best-effort; failures are swallowed inside the helper.
  const setSelection = useCallback(
    (next: ManagerBankerFilterSelection) => {
      setSelectionState(next);
      if (preferenceScope != null) {
        saveManagerFilterPreference(preferenceScope, next, new Date());
      }
    },
    [preferenceScope],
  );

  const matchesDeal = useCallback(
    (deal: Pick<TeamDeal, 'assignedBankerId' | 'assignedBankerName'>) =>
      dealMatchesBankerFilter(deal, selection),
    [selection],
  );

  const value: ManagerBankerFilterView = useMemo(
    () => ({
      selection,
      setSelection,
      options,
      matchesDeal,
      selectionLabel: selectionLabel(selection),
      isPreferenceScoped: preferenceScope != null,
    }),
    [selection, setSelection, options, matchesDeal, preferenceScope],
  );

  return (
    <ManagerBankerFilterContext.Provider value={value}>
      {children}
    </ManagerBankerFilterContext.Provider>
  );
}

export function useManagerBankerFilter(): ManagerBankerFilterView {
  const ctx = useContext(ManagerBankerFilterContext);
  if (!ctx) {
    throw new Error(
      'useManagerBankerFilter must be used inside <ManagerBankerFilterProvider>.',
    );
  }
  return ctx;
}

/**
 * Phase 124B — opt-in variant for cockpit surfaces that may render
 * outside the filter provider (e.g. component tests that mount the
 * card standalone). Returns `undefined` when no provider is mounted
 * — never throws. Mirrors the Phase 123B
 * `useOptionalDealIntelligence` pattern.
 */
export function useOptionalManagerBankerFilter():
  | ManagerBankerFilterView
  | undefined {
  return useContext(ManagerBankerFilterContext) ?? undefined;
}

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

/**
 * Native `<select>` control. Native is the right call for Phase 92:
 *   - Keyboard-operable by default (Tab to focus, arrow keys to
 *     change, Enter / Space to open).
 *   - Mobile-friendly (uses the platform picker).
 *   - Screen-reader friendly (the `<label>` + the underlying option
 *     list).
 *
 * The visible label "Focus on banker" is the accessibility label;
 * helper text states the local-only posture explicitly.
 */
export function ManagerBankerFilterControl() {
  const { selection, setSelection, options, isPreferenceScoped } =
    useManagerBankerFilter();
  const currentValue = selectionToOptionValue(selection);
  return (
    <div style={styles.wrap} aria-label="Manager banker filter">
      <label htmlFor="manager-banker-filter" style={styles.label}>
        Focus on banker
      </label>
      <select
        id="manager-banker-filter"
        style={styles.select}
        value={currentValue}
        onChange={(e) => {
          const target = options.find((o) => o.value === e.target.value);
          if (target) setSelection(target.selection);
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span style={styles.helper}>
        Local view filter. No data is hidden from the team; this
        narrows the autopilot rollup and morning catch-up cards
        only. No data is changed.{' '}
        {isPreferenceScoped
          ? 'Saved on this browser · Not synced across devices.'
          : 'This filter resets on refresh (no stable identity available).'}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  select: {
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.sm,
    fontFamily: typography.family,
    color: palette.text,
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    cursor: 'pointer',
    minWidth: 220,
  },
  helper: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic',
    flexBasis: '100%',
  },
};
