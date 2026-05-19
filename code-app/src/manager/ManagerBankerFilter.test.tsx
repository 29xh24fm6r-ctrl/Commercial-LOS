// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ManagerData } from './ManagerDataProvider';
import type { TeamDeal } from './managerQueries';

import {
  ALL_TEAM_OPTION_VALUE,
  UNASSIGNED_OPTION_VALUE,
  dealMatchesBankerFilter,
  deriveBankerFilterOptions,
  selectionLabel,
  selectionToOptionValue,
  ManagerBankerFilterControl,
  ManagerBankerFilterProvider,
  useManagerBankerFilter,
  type ManagerBankerFilterSelection,
} from './ManagerBankerFilter';

/**
 * Phase 92 — manager banker filter tests.
 *
 * Pins:
 *   - deriveBankerFilterOptions: "All team" first, one option per
 *     unique banker (by id; name fallback), alphabetical, optional
 *     "Unassigned" last.
 *   - dealMatchesBankerFilter: pass-all on 'all'; id-match on
 *     'banker' when id is defined; name-fallback (case-insensitive)
 *     when id is undefined; unassigned matches deals with no banker.
 *   - selectionToOptionValue + selectionLabel round-trip.
 *   - Provider default selection is 'all'; setSelection updates the
 *     view; matchesDeal reflects the current selection; options come
 *     from useManagerData().teamPipeline.
 *   - Control renders a labeled <select>, includes the helper text,
 *     and updates the provider selection on change.
 *   - Module hygiene: no SDK / forbidden vocab.
 */

vi.mock('./ManagerDataProvider', () => ({
  useManagerData: vi.fn(),
}));

vi.mock('./ManagerContext', () => ({
  useManager: vi.fn(),
}));

import { useManagerData } from './ManagerDataProvider';
import { useManager } from './ManagerContext';

const useManagerDataMock = vi.mocked(useManagerData);
const useManagerMock = vi.mocked(useManager);

function deal(o: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-1',
    name: 'Sample',
    clientName: 'Sample Co',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: undefined,
    stageEntryDate: undefined,
    modifiedOn: undefined,
    assignedBankerId: 'banker-1',
    assignedBankerName: 'M. Paller',
    collateralSummary: undefined,
    ...o,
  };
}

function ready(deals: TeamDeal[]): ManagerData {
  return {
    teamPipeline: { kind: 'ready', data: deals },
    teamBankers: { kind: 'ready', data: [] },
    teamTasks: { kind: 'ready', data: [] },
    teamDocuments: { kind: 'ready', data: [] },
    teamMemos: { kind: 'ready', data: [] },
    teamMemoSections: { kind: 'ready', data: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // Default manager identity → preference scope is available.
  useManagerMock.mockReturnValue({
    bankerId: 'manager-banker-1',
    fullName: 'M. Manager',
    email: 'mgr@bank.test',
    teamId: 'team-1',
    teamName: 'Acme Team',
  });
});

describe('Phase 92 — deriveBankerFilterOptions (pure)', () => {
  it('returns just "All team" when there are no deals', () => {
    const options = deriveBankerFilterOptions([]);
    expect(options.length).toBe(1);
    expect(options[0]!.value).toBe(ALL_TEAM_OPTION_VALUE);
    expect(options[0]!.label).toBe('All team');
    expect(options[0]!.selection.kind).toBe('all');
  });

  it('always puts "All team" first', () => {
    const options = deriveBankerFilterOptions([
      deal({ assignedBankerId: 'b-1', assignedBankerName: 'A' }),
    ]);
    expect(options[0]!.selection.kind).toBe('all');
  });

  it('dedupes bankers by id', () => {
    const options = deriveBankerFilterOptions([
      deal({ assignedBankerId: 'b-1', assignedBankerName: 'A' }),
      deal({ assignedBankerId: 'b-1', assignedBankerName: 'A' }),
      deal({ assignedBankerId: 'b-2', assignedBankerName: 'B' }),
    ]);
    // 1 all + 2 bankers = 3
    expect(options.length).toBe(3);
  });

  it('falls back to name when no banker id is available', () => {
    const options = deriveBankerFilterOptions([
      deal({ assignedBankerId: undefined, assignedBankerName: 'A. Banker' }),
    ]);
    // 1 all + 1 name-keyed banker = 2 (no Unassigned because the
    // name is present)
    expect(options.length).toBe(2);
    const bankerOpt = options[1]!;
    expect(bankerOpt.value).toBe('banker-name:A. Banker');
    expect(bankerOpt.label).toBe('A. Banker');
    expect(bankerOpt.selection).toEqual({
      kind: 'banker',
      id: undefined,
      name: 'A. Banker',
    });
  });

  it('sorts banker options alphabetically by label', () => {
    const options = deriveBankerFilterOptions([
      deal({ assignedBankerId: 'b-c', assignedBankerName: 'Charlie' }),
      deal({ assignedBankerId: 'b-a', assignedBankerName: 'Alice' }),
      deal({ assignedBankerId: 'b-b', assignedBankerName: 'Bob' }),
    ]);
    expect(options.map((o) => o.label)).toEqual([
      'All team',
      'Alice',
      'Bob',
      'Charlie',
    ]);
  });

  it('appends "Unassigned" when any deal has neither id nor name', () => {
    const options = deriveBankerFilterOptions([
      deal({ assignedBankerId: 'b-1', assignedBankerName: 'A' }),
      deal({ assignedBankerId: undefined, assignedBankerName: undefined }),
    ]);
    expect(options[options.length - 1]!.value).toBe(UNASSIGNED_OPTION_VALUE);
    expect(options[options.length - 1]!.selection.kind).toBe('unassigned');
  });

  it('does NOT append "Unassigned" when every deal has a banker', () => {
    const options = deriveBankerFilterOptions([
      deal({ assignedBankerId: 'b-1', assignedBankerName: 'A' }),
    ]);
    expect(
      options.some((o) => o.value === UNASSIGNED_OPTION_VALUE),
    ).toBe(false);
  });

  it('treats whitespace-only id/name as unassigned', () => {
    const options = deriveBankerFilterOptions([
      deal({ assignedBankerId: '   ', assignedBankerName: '  ' }),
    ]);
    expect(
      options.some((o) => o.value === UNASSIGNED_OPTION_VALUE),
    ).toBe(true);
  });
});

describe('Phase 92 — dealMatchesBankerFilter (pure)', () => {
  it("'all' matches every deal (including unassigned)", () => {
    const sel: ManagerBankerFilterSelection = { kind: 'all' };
    expect(
      dealMatchesBankerFilter(deal({ assignedBankerId: 'b-1' }), sel),
    ).toBe(true);
    expect(
      dealMatchesBankerFilter(
        deal({ assignedBankerId: undefined, assignedBankerName: undefined }),
        sel,
      ),
    ).toBe(true);
  });

  it("'banker' with id matches deals whose assignedBankerId === id", () => {
    const sel: ManagerBankerFilterSelection = {
      kind: 'banker',
      id: 'b-1',
      name: 'A. Banker',
    };
    expect(
      dealMatchesBankerFilter(deal({ assignedBankerId: 'b-1' }), sel),
    ).toBe(true);
    expect(
      dealMatchesBankerFilter(deal({ assignedBankerId: 'b-2' }), sel),
    ).toBe(false);
  });

  it("'banker' without id falls back to case-insensitive name match", () => {
    const sel: ManagerBankerFilterSelection = {
      kind: 'banker',
      id: undefined,
      name: 'A. Banker',
    };
    expect(
      dealMatchesBankerFilter(
        deal({ assignedBankerId: undefined, assignedBankerName: 'a. banker' }),
        sel,
      ),
    ).toBe(true);
    expect(
      dealMatchesBankerFilter(
        deal({ assignedBankerId: undefined, assignedBankerName: 'B. Other' }),
        sel,
      ),
    ).toBe(false);
  });

  it("'banker' with id-only selection does NOT name-match unrelated deals", () => {
    const sel: ManagerBankerFilterSelection = {
      kind: 'banker',
      id: 'b-1',
      name: 'A. Banker',
    };
    // Different id; same name → must NOT match (id is the source of
    // truth when present).
    expect(
      dealMatchesBankerFilter(
        deal({ assignedBankerId: 'b-2', assignedBankerName: 'A. Banker' }),
        sel,
      ),
    ).toBe(false);
  });

  it("'unassigned' matches only deals with neither id nor name", () => {
    const sel: ManagerBankerFilterSelection = { kind: 'unassigned' };
    expect(
      dealMatchesBankerFilter(
        deal({ assignedBankerId: undefined, assignedBankerName: undefined }),
        sel,
      ),
    ).toBe(true);
    expect(
      dealMatchesBankerFilter(deal({ assignedBankerId: 'b-1' }), sel),
    ).toBe(false);
    expect(
      dealMatchesBankerFilter(
        deal({ assignedBankerId: undefined, assignedBankerName: 'A' }),
        sel,
      ),
    ).toBe(false);
  });
});

describe('Phase 92 — selectionToOptionValue + selectionLabel', () => {
  it('round-trips through option values', () => {
    expect(selectionToOptionValue({ kind: 'all' })).toBe(ALL_TEAM_OPTION_VALUE);
    expect(selectionToOptionValue({ kind: 'unassigned' })).toBe(
      UNASSIGNED_OPTION_VALUE,
    );
    expect(
      selectionToOptionValue({ kind: 'banker', id: 'b-1', name: 'A' }),
    ).toBe('banker-id:b-1');
    expect(
      selectionToOptionValue({ kind: 'banker', id: undefined, name: 'A' }),
    ).toBe('banker-name:A');
  });

  it('produces accessible selection labels', () => {
    expect(selectionLabel({ kind: 'all' })).toBe('Showing team view');
    expect(selectionLabel({ kind: 'unassigned' })).toBe('Filtered to Unassigned');
    expect(
      selectionLabel({ kind: 'banker', id: 'b-1', name: 'A. Banker' }),
    ).toBe('Filtered to A. Banker');
  });

  it('label copy never uses forbidden vocabulary', () => {
    // The labels surface in headers + on the rollup card; pin the
    // brief's forbidden vocab against the rendered strings.
    const labels = [
      selectionLabel({ kind: 'all' }),
      selectionLabel({ kind: 'unassigned' }),
      selectionLabel({ kind: 'banker', id: 'b-1', name: 'A. Banker' }),
    ];
    for (const l of labels) {
      expect(l).not.toMatch(/official\s+(assignment|view)/i);
      expect(l).not.toMatch(/performance\s+ranking/i);
      expect(l).not.toMatch(/underperforming/i);
      expect(l).not.toMatch(/\bscore\b/i);
      expect(l).not.toMatch(/surveillance/i);
      expect(l).not.toMatch(/audit\s+view/i);
    }
  });
});

describe('Phase 92 — ManagerBankerFilterProvider', () => {
  function Probe() {
    const f = useManagerBankerFilter();
    return (
      <div data-testid="probe">
        {f.selection.kind}|{f.options.length}|{f.selectionLabel}
      </div>
    );
  }

  it('starts with the "all" selection', () => {
    useManagerDataMock.mockReturnValue(
      ready([deal({ assignedBankerId: 'b-1', assignedBankerName: 'A' })]),
    );
    render(
      <ManagerBankerFilterProvider>
        <Probe />
      </ManagerBankerFilterProvider>,
    );
    const txt = screen.getByTestId('probe').textContent ?? '';
    expect(txt.startsWith('all|')).toBe(true);
    expect(txt).toContain('Showing team view');
  });

  it('exposes options derived from teamPipeline', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', assignedBankerId: 'b-1', assignedBankerName: 'A' }),
        deal({ id: 'd2', assignedBankerId: 'b-2', assignedBankerName: 'B' }),
      ]),
    );
    render(
      <ManagerBankerFilterProvider>
        <Probe />
      </ManagerBankerFilterProvider>,
    );
    // 1 all + 2 bankers = 3
    expect(screen.getByTestId('probe').textContent).toMatch(/\|3\|/);
  });

  it('renders an empty options pool plus All-team when the pipeline is loading', () => {
    useManagerDataMock.mockReturnValue({
      teamPipeline: { kind: 'loading' },
      teamBankers: { kind: 'ready', data: [] },
      teamTasks: { kind: 'ready', data: [] },
      teamDocuments: { kind: 'ready', data: [] },
      teamMemos: { kind: 'ready', data: [] },
      teamMemoSections: { kind: 'ready', data: [] },
    });
    render(
      <ManagerBankerFilterProvider>
        <Probe />
      </ManagerBankerFilterProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toMatch(/\|1\|/);
  });

  it('useManagerBankerFilter throws when used outside the provider', () => {
    // Suppress the React error-boundary error log noise.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Throws() {
      useManagerBankerFilter();
      return null;
    }
    expect(() => render(<Throws />)).toThrow(
      /must be used inside <ManagerBankerFilterProvider>/i,
    );
    errSpy.mockRestore();
  });
});

describe('Phase 92 — ManagerBankerFilterControl', () => {
  it('renders a labeled select with all derived options', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', assignedBankerId: 'b-1', assignedBankerName: 'Alice' }),
        deal({ id: 'd2', assignedBankerId: 'b-2', assignedBankerName: 'Bob' }),
      ]),
    );
    render(
      <ManagerBankerFilterProvider>
        <ManagerBankerFilterControl />
      </ManagerBankerFilterProvider>,
    );
    const select = screen.getByLabelText(/Focus on banker/i) as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    // 1 all + 2 bankers (alphabetical) = 3 <option>s
    expect(select.querySelectorAll('option')).toHaveLength(3);
    expect(select.value).toBe(ALL_TEAM_OPTION_VALUE);
  });

  it('changing the select updates the provider selection', async () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', assignedBankerId: 'b-1', assignedBankerName: 'Alice' }),
      ]),
    );
    function Compound() {
      const f = useManagerBankerFilter();
      return (
        <>
          <ManagerBankerFilterControl />
          <div data-testid="selection">{f.selection.kind}|{f.selectionLabel}</div>
        </>
      );
    }
    render(
      <ManagerBankerFilterProvider>
        <Compound />
      </ManagerBankerFilterProvider>,
    );
    const user = userEvent.setup();
    const select = screen.getByLabelText(/Focus on banker/i);
    await user.selectOptions(select, 'banker-id:b-1');
    expect(screen.getByTestId('selection').textContent).toBe(
      'banker|Filtered to Alice',
    );
  });

  it('renders helper text describing the local-only posture', () => {
    useManagerDataMock.mockReturnValue(ready([]));
    render(
      <ManagerBankerFilterProvider>
        <ManagerBankerFilterControl />
      </ManagerBankerFilterProvider>,
    );
    expect(
      screen.getByText(
        /Local view filter\. No data is hidden from the team/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No data is changed\./i),
    ).toBeInTheDocument();
  });

  it('control never uses forbidden vocabulary as a positive claim', () => {
    useManagerDataMock.mockReturnValue(ready([]));
    const { container } = render(
      <ManagerBankerFilterProvider>
        <ManagerBankerFilterControl />
      </ManagerBankerFilterProvider>,
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/official\s+(assignment|view)/i);
    expect(text).not.toMatch(/performance\s+ranking/i);
    expect(text).not.toMatch(/underperforming/i);
    expect(text).not.toMatch(/\bscore\b/i);
    expect(text).not.toMatch(/surveillance/i);
    expect(text).not.toMatch(/audit\s+view/i);
    // Phase 93 intentionally surfaces "Not synced across devices."
    // as a truthful negation. Forbid only affirmative tense.
    expect(text).not.toMatch(/\b(is|was|has been)\s+synced\b/i);
  });
});

describe('Phase 92 — module hygiene', () => {
  const SRC = readFileSync(
    resolve(__dirname, 'ManagerBankerFilter.tsx'),
    'utf8',
  );

  function stripComments(s: string): string {
    return s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  }

  const CODE = stripComments(SRC);

  it('imports no SDK / generated service', () => {
    expect(CODE).not.toMatch(/from\s+['"][^'"]*generated\//);
    expect(CODE).not.toMatch(/Cr664_\w+Service/);
  });

  it('does not contain AI / surveillance / score / official-record vocabulary in source', () => {
    expect(CODE).not.toMatch(/\bAI[ -]?(generated|detected)\b/i);
    expect(CODE).not.toMatch(/surveillance/i);
    expect(CODE).not.toMatch(/performance\s+ranking/i);
    expect(CODE).not.toMatch(/\bunderperforming\b/i);
    expect(CODE).not.toMatch(/official\s+(assignment|view|record|status)/i);
    // Phase 93 source intentionally contains "Not synced across
    // devices." as a truthful negation in the helper text. Forbid
    // only affirmative-tense forms — same pattern Phase 90 uses.
    expect(CODE).not.toMatch(/\b(is|was|has been)\s+synced\b/i);
  });
});

// -------------------------------------------------------------------
// Phase 93 — saved manager filter preference (provider integration)
// -------------------------------------------------------------------

describe('Phase 93 — saved manager filter preference', () => {
  function Probe() {
    const f = useManagerBankerFilter();
    return (
      <div data-testid="probe">
        {f.selection.kind}|
        {f.selection.kind === 'banker' ? f.selection.name : ''}|
        {String(f.isPreferenceScoped)}
      </div>
    );
  }

  it('exposes isPreferenceScoped=true when manager identity is complete', () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', assignedBankerId: 'b-1', assignedBankerName: 'Alice' }),
      ]),
    );
    render(
      <ManagerBankerFilterProvider>
        <Probe />
      </ManagerBankerFilterProvider>,
    );
    const txt = screen.getByTestId('probe').textContent ?? '';
    expect(txt.endsWith('|true')).toBe(true);
  });

  it('exposes isPreferenceScoped=false when bankerId is missing', () => {
    useManagerMock.mockReturnValue({
      bankerId: '',
      fullName: 'M. Manager',
      email: 'mgr@bank.test',
      teamId: 'team-1',
      teamName: 'Acme Team',
    });
    useManagerDataMock.mockReturnValue(ready([]));
    render(
      <ManagerBankerFilterProvider>
        <Probe />
      </ManagerBankerFilterProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toMatch(/\|false$/);
  });

  it('exposes isPreferenceScoped=false when teamId is missing', () => {
    useManagerMock.mockReturnValue({
      bankerId: 'manager-banker-1',
      fullName: 'M. Manager',
      email: 'mgr@bank.test',
      teamId: '',
      teamName: '',
    });
    useManagerDataMock.mockReturnValue(ready([]));
    render(
      <ManagerBankerFilterProvider>
        <Probe />
      </ManagerBankerFilterProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toMatch(/\|false$/);
  });

  it('persists the selection to localStorage when the user picks a banker', async () => {
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', assignedBankerId: 'b-1', assignedBankerName: 'Alice' }),
      ]),
    );
    render(
      <ManagerBankerFilterProvider>
        <ManagerBankerFilterControl />
      </ManagerBankerFilterProvider>,
    );
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText(/Focus on banker/i),
      'banker-id:b-1',
    );
    const raw = localStorage.getItem('cc:managerFilterSelection:v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    const entry = parsed['manager:manager-banker-1:team-1'];
    expect(entry).toBeDefined();
    expect(entry.kind).toBe('banker');
    expect(entry.bankerId).toBe('b-1');
    expect(entry.bankerName).toBe('Alice');
  });

  it('restores a saved banker selection on mount once teamPipeline is ready', async () => {
    // Pre-seed a saved preference for the current (manager, team).
    localStorage.setItem(
      'cc:managerFilterSelection:v1',
      JSON.stringify({
        'manager:manager-banker-1:team-1': {
          scopeId: 'manager:manager-banker-1:team-1',
          kind: 'banker',
          bankerId: 'b-1',
          bankerName: 'Alice',
          recordedAt: '2026-05-17T10:00:00.000Z',
        },
      }),
    );
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', assignedBankerId: 'b-1', assignedBankerName: 'Alice' }),
      ]),
    );
    render(
      <ManagerBankerFilterProvider>
        <Probe />
      </ManagerBankerFilterProvider>,
    );
    // After the restore-on-ready effect runs, the selection reflects
    // the saved preference.
    await screen.findByText(/banker\|Alice\|/);
  });

  it('falls back to "All team" when the saved banker no longer exists in the options', async () => {
    localStorage.setItem(
      'cc:managerFilterSelection:v1',
      JSON.stringify({
        'manager:manager-banker-1:team-1': {
          scopeId: 'manager:manager-banker-1:team-1',
          kind: 'banker',
          bankerId: 'b-vanished',
          bankerName: 'Phantom',
          recordedAt: '2026-05-17T10:00:00.000Z',
        },
      }),
    );
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', assignedBankerId: 'b-1', assignedBankerName: 'Alice' }),
      ]),
    );
    render(
      <ManagerBankerFilterProvider>
        <Probe />
      </ManagerBankerFilterProvider>,
    );
    await screen.findByText(/^all\|\|true$/);
  });

  it('falls back to "All team" when "unassigned" is saved but no unassigned option exists', async () => {
    localStorage.setItem(
      'cc:managerFilterSelection:v1',
      JSON.stringify({
        'manager:manager-banker-1:team-1': {
          scopeId: 'manager:manager-banker-1:team-1',
          kind: 'unassigned',
          bankerId: undefined,
          bankerName: undefined,
          recordedAt: '2026-05-17T10:00:00.000Z',
        },
      }),
    );
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', assignedBankerId: 'b-1', assignedBankerName: 'Alice' }),
      ]),
    );
    render(
      <ManagerBankerFilterProvider>
        <Probe />
      </ManagerBankerFilterProvider>,
    );
    await screen.findByText(/^all\|\|true$/);
  });

  it('does NOT restore when scope is unavailable (no bankerId)', async () => {
    useManagerMock.mockReturnValue({
      bankerId: '',
      fullName: 'M. Manager',
      email: 'mgr@bank.test',
      teamId: 'team-1',
      teamName: 'Acme Team',
    });
    // Even if a stale entry sits in storage, the provider can't
    // resolve a scope, so it leaves the default 'all' in place.
    localStorage.setItem(
      'cc:managerFilterSelection:v1',
      JSON.stringify({
        'manager:someone-else:team-1': {
          scopeId: 'manager:someone-else:team-1',
          kind: 'banker',
          bankerId: 'b-1',
          bankerName: 'Alice',
          recordedAt: '2026-05-17T10:00:00.000Z',
        },
      }),
    );
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', assignedBankerId: 'b-1', assignedBankerName: 'Alice' }),
      ]),
    );
    render(
      <ManagerBankerFilterProvider>
        <Probe />
      </ManagerBankerFilterProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toMatch(/^all\|\|false$/);
  });

  it('does NOT save when scope is unavailable (no teamId)', async () => {
    useManagerMock.mockReturnValue({
      bankerId: 'manager-banker-1',
      fullName: 'M. Manager',
      email: 'mgr@bank.test',
      teamId: '',
      teamName: '',
    });
    useManagerDataMock.mockReturnValue(
      ready([
        deal({ id: 'd1', assignedBankerId: 'b-1', assignedBankerName: 'Alice' }),
      ]),
    );
    render(
      <ManagerBankerFilterProvider>
        <ManagerBankerFilterControl />
      </ManagerBankerFilterProvider>,
    );
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText(/Focus on banker/i),
      'banker-id:b-1',
    );
    // No write happened.
    expect(
      localStorage.getItem('cc:managerFilterSelection:v1'),
    ).toBeNull();
  });

  it('control renders "Saved on this browser · Not synced across devices." when scoped', () => {
    useManagerDataMock.mockReturnValue(ready([]));
    render(
      <ManagerBankerFilterProvider>
        <ManagerBankerFilterControl />
      </ManagerBankerFilterProvider>,
    );
    expect(
      screen.getByText(/Saved on this browser/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Not synced across devices/i),
    ).toBeInTheDocument();
  });

  it('control renders the "resets on refresh" helper when scope is unavailable', () => {
    useManagerMock.mockReturnValue({
      bankerId: '',
      fullName: 'M. Manager',
      email: 'mgr@bank.test',
      teamId: 'team-1',
      teamName: 'Acme Team',
    });
    useManagerDataMock.mockReturnValue(ready([]));
    render(
      <ManagerBankerFilterProvider>
        <ManagerBankerFilterControl />
      </ManagerBankerFilterProvider>,
    );
    expect(
      screen.getByText(
        /This filter resets on refresh \(no stable identity available\)/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Saved on this browser/i)).toBeNull();
  });

  it('helper text never claims profile / official / tenant settings', () => {
    useManagerDataMock.mockReturnValue(ready([]));
    const { container } = render(
      <ManagerBankerFilterProvider>
        <ManagerBankerFilterControl />
      </ManagerBankerFilterProvider>,
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bsaved\s+to\s+profile\b/i);
    expect(text).not.toMatch(/\bofficial\s+preference\b/i);
    expect(text).not.toMatch(/\btenant\s+setting\b/i);
    expect(text).not.toMatch(/\bmanager\s+setting\b/i);
    expect(text).not.toMatch(/\bremembered\s+by\s+the\s+system\b/i);
    expect(text).not.toMatch(/\b(is|was|has been)\s+synced\b/i);
  });
});
