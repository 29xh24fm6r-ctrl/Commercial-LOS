import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveManagerAutopilotRollup,
  TOP_N_ROLLUP_DEALS,
  type ManagerRollupDealInput,
  type ManagerRollupDocumentInput,
  type ManagerRollupInput,
  type ManagerRollupMemoInput,
  type ManagerRollupTaskInput,
} from './managerAutopilotRollup';

/**
 * Phase 81 — manager rollup derivation tests.
 *
 * Pins:
 *   - empty input → empty rollup with zero counts;
 *   - deals with no signal don't appear in topDeals;
 *   - HIGH (closing-soon + stale activity) ranks ahead of MEDIUM
 *     (stage-aging alone) ahead of LOW (stale-activity alone);
 *   - within priority: more suggestions wins;
 *   - within count: nearest target close wins;
 *   - within close: deal name asc (stable);
 *   - cap at TOP_N_ROLLUP_DEALS (5);
 *   - rollup counts (high/medium/low) reflect each deal's
 *     highest-priority signal;
 *   - module hygiene: no SDK / role imports;
 *   - the rollup never emits the forbidden Phase 80 vocabulary
 *     (AI / automation / decisioning / approved / guaranteed /
 *     "system will complete" / prediction).
 */

const NOW = new Date('2026-05-18T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function dealInput(
  o: Partial<ManagerRollupDealInput>,
): ManagerRollupDealInput {
  return {
    id: 'd',
    name: 'Sample',
    stage: 'Underwriting',
    targetCloseDate: undefined,
    stageEntryDate: undefined,
    modifiedOn: undefined,
    assignedBankerName: undefined,
    ...o,
  };
}

function emptyInput(): ManagerRollupInput {
  return { deals: [] };
}

describe('Phase 81 — deriveManagerAutopilotRollup', () => {
  describe('empty / quiet inputs', () => {
    it('returns zero counts and an empty topDeals list when there are no deals', () => {
      const r = deriveManagerAutopilotRollup(emptyInput(), NOW);
      expect(r).toEqual({
        totalDealsScanned: 0,
        dealsWithSuggestions: 0,
        highPriorityDealCount: 0,
        mediumPriorityDealCount: 0,
        lowPriorityDealCount: 0,
        topDeals: [],
      });
    });

    it('returns zero suggestion-count when every deal is quiet', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Quiet A',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'd2',
              name: 'Quiet B',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(2),
              modifiedOn: isoDaysAgo(2),
            }),
          ],
        },
        NOW,
      );
      expect(r.totalDealsScanned).toBe(2);
      expect(r.dealsWithSuggestions).toBe(0);
      expect(r.topDeals).toEqual([]);
    });
  });

  describe('priority counts', () => {
    it('counts each deal under its TOP suggestion priority', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            // HIGH: closing-soon + stale activity.
            dealInput({
              id: 'h1',
              name: 'High Deal',
              targetCloseDate: isoDaysFromNow(5),
              modifiedOn: isoDaysAgo(20),
            }),
            // MEDIUM: stage-aging only.
            dealInput({
              id: 'm1',
              name: 'Medium Deal',
              stageEntryDate: isoDaysAgo(45),
              modifiedOn: isoDaysAgo(1),
            }),
            // LOW: stale-activity only.
            dealInput({
              id: 'l1',
              name: 'Low Deal',
              targetCloseDate: isoDaysFromNow(60),
              modifiedOn: isoDaysAgo(30),
            }),
          ],
        },
        NOW,
      );
      expect(r.totalDealsScanned).toBe(3);
      expect(r.dealsWithSuggestions).toBe(3);
      expect(r.highPriorityDealCount).toBe(1);
      expect(r.mediumPriorityDealCount).toBe(1);
      expect(r.lowPriorityDealCount).toBe(1);
    });
  });

  describe('ranking', () => {
    it('orders topDeals HIGH → MEDIUM → LOW', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'l',
              name: 'Low',
              targetCloseDate: isoDaysFromNow(60),
              modifiedOn: isoDaysAgo(30),
            }),
            dealInput({
              id: 'h',
              name: 'High',
              targetCloseDate: isoDaysFromNow(5),
              modifiedOn: isoDaysAgo(20),
            }),
            dealInput({
              id: 'm',
              name: 'Medium',
              stageEntryDate: isoDaysAgo(45),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
        },
        NOW,
      );
      const ids = r.topDeals.map((d) => d.dealId);
      expect(ids).toEqual(['h', 'm', 'l']);
    });

    it('breaks priority ties by suggestion count desc', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            // MEDIUM with 1 suggestion (stage aging only).
            dealInput({
              id: 'm-one',
              name: 'Medium One',
              stageEntryDate: isoDaysAgo(45),
              modifiedOn: isoDaysAgo(1),
              targetCloseDate: isoDaysFromNow(90),
            }),
            // MEDIUM with 2 suggestions (closing-soon + stage aging).
            dealInput({
              id: 'm-two',
              name: 'Medium Two',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(10),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
        },
        NOW,
      );
      // Both top-priority MEDIUM; "Two" has more suggestions.
      expect(r.topDeals[0]!.dealId).toBe('m-two');
      expect(r.topDeals[1]!.dealId).toBe('m-one');
    });

    it('breaks count ties by nearest target close date asc', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'far',
              name: 'Far Close',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(90),
              modifiedOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'near',
              name: 'Near Close',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(20),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
        },
        NOW,
      );
      expect(r.topDeals[0]!.dealId).toBe('near');
      expect(r.topDeals[1]!.dealId).toBe('far');
    });

    it('sends deals with missing target close date to the back of the close tiebreak', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'no-close',
              name: 'A No Close',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: undefined,
              modifiedOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'with-close',
              name: 'Z With Close',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(30),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
        },
        NOW,
      );
      // 'with-close' wins even though its name sorts later.
      expect(r.topDeals[0]!.dealId).toBe('with-close');
      expect(r.topDeals[1]!.dealId).toBe('no-close');
    });

    it('breaks close ties by deal name asc (stable lexicographic fallback)', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'z',
              name: 'Zenith Manufacturing',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(30),
              modifiedOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'a',
              name: 'Acme Industries',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(30),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
        },
        NOW,
      );
      expect(r.topDeals[0]!.dealId).toBe('a');
      expect(r.topDeals[1]!.dealId).toBe('z');
    });
  });

  describe('cap', () => {
    it(`caps topDeals at TOP_N_ROLLUP_DEALS = ${TOP_N_ROLLUP_DEALS}`, () => {
      const deals: ManagerRollupDealInput[] = [];
      for (let i = 0; i < 12; i++) {
        deals.push(
          dealInput({
            id: `d-${i}`,
            name: `Deal ${String.fromCharCode(65 + i)}`, // A, B, C, ...
            stageEntryDate: isoDaysAgo(45 + i), // all MEDIUM stage-aging
            targetCloseDate: isoDaysFromNow(60),
            modifiedOn: isoDaysAgo(1),
          }),
        );
      }
      const r = deriveManagerAutopilotRollup({ deals }, NOW);
      expect(r.totalDealsScanned).toBe(12);
      expect(r.dealsWithSuggestions).toBe(12);
      expect(r.topDeals.length).toBe(TOP_N_ROLLUP_DEALS);
    });
  });

  describe('top-suggestion shape', () => {
    it('exposes the top suggestion of the deal in topSuggestion', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'h',
              name: 'Hot Deal',
              targetCloseDate: isoDaysFromNow(5),
              modifiedOn: isoDaysAgo(20),
            }),
          ],
        },
        NOW,
      );
      expect(r.topDeals.length).toBe(1);
      const top = r.topDeals[0]!;
      expect(top.topSuggestion.priority).toBe('high');
      expect(top.topSuggestion.id).toBe('closing-soon-stale-activity');
      expect(top.topSuggestion.isAutomated).toBe(false);
      expect(top.suggestionCount).toBeGreaterThanOrEqual(1);
    });

    it('exposes the banker name for the manager to scan ownership', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Owned Deal',
              stageEntryDate: isoDaysAgo(45),
              assignedBankerName: 'M. Paller',
              modifiedOn: isoDaysAgo(1),
            }),
          ],
        },
        NOW,
      );
      expect(r.topDeals[0]!.assignedBankerName).toBe('M. Paller');
    });
  });

  // -----------------------------------------------------------------
  // Phase 87 — manager-scoped child data (tasks / documents / memos)
  // -----------------------------------------------------------------

  describe('Phase 87 — child-data signals', () => {
    function taskInput(
      o: Partial<ManagerRollupTaskInput> & { id: string; dealId: string },
    ): ManagerRollupTaskInput {
      return {
        title: 'Send Q2 financials',
        dueDate: undefined,
        completed: false,
        ...o,
      };
    }
    function docInput(
      o: Partial<ManagerRollupDocumentInput> & {
        id: string;
        dealId: string;
        status: 'outstanding' | 'received' | 'reviewed';
      },
    ): ManagerRollupDocumentInput {
      return {
        name: 'Document',
        receivedDate: undefined,
        reviewer: undefined,
        uploaded: false,
        ...o,
      };
    }
    function memoInput(
      o: Partial<ManagerRollupMemoInput> & { id: string; dealId: string },
    ): ManagerRollupMemoInput {
      return {
        statusKey: undefined,
        ...o,
      };
    }

    it('preserves Phase 81 behavior when no child collections are supplied (4-signal floor)', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd-quiet',
              name: 'Quiet Deal',
              stageEntryDate: isoDaysAgo(45), // MEDIUM stage-aging fires
              modifiedOn: isoDaysAgo(1),
            }),
          ],
        },
        NOW,
      );
      expect(r.dealsWithSuggestions).toBe(1);
      expect(r.topDeals[0]!.topSuggestion.id).toBe('stage-aging');
    });

    it('overdue-tasks (HIGH) fires when an open task is past its due date', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd-h',
              name: 'Hot Deal',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [
            taskInput({
              id: 't1',
              dealId: 'd-h',
              dueDate: isoDaysAgo(2),
            }),
          ],
        },
        NOW,
      );
      expect(r.highPriorityDealCount).toBe(1);
      expect(r.topDeals[0]!.topSuggestion.id).toBe('overdue-tasks');
    });

    it('pending-review-documents (HIGH) fires when a received doc has no reviewer + crosses the threshold', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd-pr',
              name: 'PR Deal',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          documents: [
            docInput({
              id: 'doc1',
              dealId: 'd-pr',
              status: 'received',
              receivedDate: isoDaysAgo(10),
              reviewer: undefined,
            }),
          ],
        },
        NOW,
      );
      expect(r.highPriorityDealCount).toBe(1);
      expect(r.topDeals[0]!.topSuggestion.id).toBe('pending-review-documents');
    });

    it('outstanding-documents (MEDIUM) fires when documents are in the outstanding bucket', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd-od',
              name: 'OD Deal',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          documents: [
            docInput({
              id: 'doc-od',
              dealId: 'd-od',
              status: 'outstanding',
            }),
          ],
        },
        NOW,
      );
      expect(r.mediumPriorityDealCount).toBe(1);
      expect(r.topDeals[0]!.topSuggestion.id).toBe('outstanding-documents');
    });

    it('draft-memo (LOW) fires when a memo with statusKey=draft is supplied', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd-m',
              name: 'Memo Deal',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          memos: [memoInput({ id: 'm1', dealId: 'd-m', statusKey: 'draft' })],
        },
        NOW,
      );
      expect(r.lowPriorityDealCount).toBe(1);
      expect(r.topDeals[0]!.topSuggestion.id).toBe('draft-memo');
    });

    it("drops orphan rows that arrived without a dealId (manager rollup never invents a parent)", () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd-h',
              name: 'Hot Deal',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [
            // Orphan — no dealId. Must NOT trigger overdue-tasks for d-h.
            {
              id: 't-orphan',
              dealId: undefined,
              title: 'Lost task',
              dueDate: isoDaysAgo(2),
              completed: false,
            },
          ],
        },
        NOW,
      );
      // The deal is otherwise quiet (stageEntry=5d, close=60d, modified=1d),
      // so without the orphan attribution there is no signal.
      expect(r.dealsWithSuggestions).toBe(0);
    });

    it("drops reviewed documents (Phase 80's pending-review rule requires no reviewer)", () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd-r',
              name: 'Reviewed Deal',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          documents: [
            docInput({
              id: 'doc-r',
              dealId: 'd-r',
              status: 'reviewed',
              receivedDate: isoDaysAgo(30),
              reviewer: 'M. Paller',
            }),
          ],
        },
        NOW,
      );
      // No outstanding, no pending-review fire → no signal.
      expect(r.dealsWithSuggestions).toBe(0);
    });

    it('memo-consistency-findings remains silenced on the manager surface (no sections loaded)', () => {
      // Supply a draft memo (which fires draft-memo) but assert
      // memo-consistency-findings is NOT among the suggestions on
      // the rollup — the manager memo loader pulls status only.
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd-mc',
              name: 'Memo Consistency Deal',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          memos: [
            memoInput({ id: 'm1', dealId: 'd-mc', statusKey: 'draft' }),
          ],
        },
        NOW,
      );
      expect(r.topDeals[0]!.topSuggestion.id).not.toBe(
        'memo-consistency-findings',
      );
    });

    it('attributes child rows to the correct deal when the manager team has multiple deals', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd-A',
              name: 'Deal A',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'd-B',
              name: 'Deal B',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [
            taskInput({ id: 't1', dealId: 'd-A', dueDate: isoDaysAgo(2) }),
          ],
        },
        NOW,
      );
      // Only d-A should flag overdue-tasks; d-B stays quiet.
      const a = r.topDeals.find((d) => d.dealId === 'd-A');
      const b = r.topDeals.find((d) => d.dealId === 'd-B');
      expect(a?.topSuggestion.id).toBe('overdue-tasks');
      expect(b).toBeUndefined();
    });

    it('still ranks HIGH > MEDIUM > LOW across the broader signal set (Phase 87 ranking parity)', () => {
      const r = deriveManagerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd-low',
              name: 'Low Deal',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'd-med',
              name: 'Med Deal',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'd-high',
              name: 'High Deal',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [
            taskInput({ id: 't-h', dealId: 'd-high', dueDate: isoDaysAgo(2) }),
          ],
          documents: [
            docInput({
              id: 'doc-m',
              dealId: 'd-med',
              status: 'outstanding',
            }),
          ],
          memos: [
            memoInput({ id: 'm-low', dealId: 'd-low', statusKey: 'draft' }),
          ],
        },
        NOW,
      );
      expect(r.topDeals.map((d) => d.dealId)).toEqual([
        'd-high',
        'd-med',
        'd-low',
      ]);
    });
  });

  describe('module hygiene', () => {
    const SRC = readFileSync(
      resolve(__dirname, 'managerAutopilotRollup.ts'),
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

    it('imports no role module (banker / manager / team / deals / executive / admin)', () => {
      const imports = SRC.match(/from\s+['"][^'"]+['"]/g) ?? [];
      for (const imp of imports) {
        expect(imp).not.toMatch(
          /\/(banker|manager|team|deals|executive|admin)\//,
        );
      }
    });

    it('does not contain AI / automation / decisioning / prediction vocabulary in source code', () => {
      expect(CODE).not.toMatch(/\bAI[ -]?generated\b/i);
      expect(CODE).not.toMatch(/\bautopilot\s+executed\b/i);
      expect(CODE).not.toMatch(/\bautomatic(ally)?\b/i);
      expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+approved\b/i);
      expect(CODE).not.toMatch(/\bdecisioned\b/i);
      expect(CODE).not.toMatch(/\bguaranteed\b/i);
      expect(CODE).not.toMatch(/\bsystem\s+will\s+complete\b/i);
      expect(CODE).not.toMatch(/\bpredicts\b/i);
      expect(CODE).not.toMatch(/\bprediction\b/i);
    });
  });
});
