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

import { useManagerData } from './ManagerDataProvider';

const useManagerDataMock = vi.mocked(useManagerData);

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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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

  it('control never uses forbidden vocabulary', () => {
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
    expect(text).not.toMatch(/\bsynced\b/i);
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
    expect(CODE).not.toMatch(/\bsynced\b/i);
  });
});
