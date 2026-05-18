import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveBankerAutopilotRollup,
  TOP_N_BANKER_ROLLUP_DEALS,
  type BankerRollupDealInput,
  type BankerRollupInput,
} from './bankerAutopilotRollup';

/**
 * Phase 82 — banker rollup derivation tests.
 *
 * Pins:
 *   - empty input → empty rollup with zero counts;
 *   - quiet deals (no signal fires) excluded from topDeals;
 *   - child collections are bucketed by dealId so overdue tasks on
 *     deal A do NOT leak into deal B's signal set;
 *   - 7 of 8 Phase 80 signals fire on the banker surface:
 *     overdue-tasks (HIGH), pending-review-documents (HIGH),
 *     closing-soon-stale-activity (HIGH), closing-soon (MEDIUM),
 *     stage-aging (MEDIUM), outstanding-documents (MEDIUM),
 *     draft-memo (LOW), stale-activity (LOW);
 *   - memo-consistency-findings does NOT fire (intentionally
 *     silenced because memoConsistencyFindingsCount is passed as 0);
 *   - priority counts roll up per-deal under each deal's TOP
 *     priority;
 *   - ranking: priority → suggestion count → nearest close → name;
 *   - cap at TOP_N_BANKER_ROLLUP_DEALS = 5;
 *   - top-suggestion shape passes through Phase 80 isAutomated: false
 *     contract;
 *   - module hygiene: no SDK / role imports; no AI / automation /
 *     decisioning / prediction vocabulary.
 */

const NOW = new Date('2026-05-18T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function dealInput(o: Partial<BankerRollupDealInput>): BankerRollupDealInput {
  return {
    id: 'd',
    name: 'Sample',
    clientName: 'Sample Co',
    stage: 'Underwriting',
    targetCloseDate: undefined,
    stageEntryDate: undefined,
    lastActivityOn: undefined,
    ...o,
  };
}

function emptyInput(): BankerRollupInput {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
  };
}

describe('Phase 82 — deriveBankerAutopilotRollup', () => {
  describe('empty / quiet inputs', () => {
    it('returns zero counts and an empty topDeals list when no deals exist', () => {
      const r = deriveBankerAutopilotRollup(emptyInput(), NOW);
      expect(r).toEqual({
        totalDealsScanned: 0,
        dealsWithSuggestions: 0,
        highPriorityDealCount: 0,
        mediumPriorityDealCount: 0,
        lowPriorityDealCount: 0,
        topDeals: [],
      });
    });

    it('omits deals with no signal from topDeals', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Quiet A',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
        },
        NOW,
      );
      expect(r.totalDealsScanned).toBe(1);
      expect(r.dealsWithSuggestions).toBe(0);
      expect(r.topDeals).toEqual([]);
    });
  });

  describe('child bucketing — signals fire only on the right deal', () => {
    it('attributes an overdue task only to the deal that owns it', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'da',
              name: 'Deal A',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'db',
              name: 'Deal B',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(1),
            }),
          ],
          tasks: [
            {
              id: 't1',
              dealId: 'da',
              title: 'Overdue thing on Deal A',
              dueDate: isoDaysAgo(2),
              completed: false,
            },
          ],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
        },
        NOW,
      );
      expect(r.dealsWithSuggestions).toBe(1);
      expect(r.topDeals[0]!.dealId).toBe('da');
      expect(r.topDeals[0]!.highestPriority).toBe('high');
      expect(r.topDeals[0]!.topSuggestion.id).toBe('overdue-tasks');
    });

    it('attributes outstanding documents only to the owning deal', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'da',
              name: 'Deal A',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'db',
              name: 'Deal B',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          outstandingDocuments: [
            {
              id: 'doc1',
              dealId: 'db',
              name: 'PFS',
              receivedDate: undefined,
              reviewer: undefined,
              uploaded: false,
            },
          ],
          pendingReviewDocuments: [],
          memos: [],
        },
        NOW,
      );
      expect(r.dealsWithSuggestions).toBe(1);
      expect(r.topDeals[0]!.dealId).toBe('db');
      expect(r.topDeals[0]!.topSuggestion.id).toBe('outstanding-documents');
    });

    it('attributes pending-review documents only to the owning deal and respects the 7d threshold', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'da',
              name: 'Deal A',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [
            // Past 7d threshold — should fire.
            {
              id: 'doc1',
              dealId: 'da',
              name: 'Old',
              receivedDate: isoDaysAgo(10),
              reviewer: undefined,
            },
            // Within 7d — should NOT fire.
            {
              id: 'doc2',
              dealId: 'da',
              name: 'Recent',
              receivedDate: isoDaysAgo(2),
              reviewer: undefined,
            },
          ],
          memos: [],
        },
        NOW,
      );
      const top = r.topDeals[0]!;
      expect(top.topSuggestion.id).toBe('pending-review-documents');
      expect(top.topSuggestion.title).toMatch(/1 document may require review/);
    });

    it('attributes draft memo signal only to the owning deal (LOW priority)', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'da',
              name: 'Deal A',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'db',
              name: 'Deal B',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [
            { id: 'm1', dealId: 'da', statusKey: 'draft' },
            { id: 'm2', dealId: 'db', statusKey: 'final' },
          ],
        },
        NOW,
      );
      expect(r.dealsWithSuggestions).toBe(1);
      expect(r.topDeals[0]!.dealId).toBe('da');
      expect(r.topDeals[0]!.topSuggestion.id).toBe('draft-memo');
      expect(r.topDeals[0]!.highestPriority).toBe('low');
    });
  });

  describe('memo-consistency-findings is intentionally silenced on the banker rollup', () => {
    it('does not fire even when a draft memo exists', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'da',
              name: 'Deal A',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [{ id: 'm1', dealId: 'da', statusKey: 'draft' }],
        },
        NOW,
      );
      const top = r.topDeals[0]!;
      // Draft-memo (LOW) fires; memo-consistency-findings does not
      // (input.memoConsistencyFindingsCount is hardcoded to 0).
      expect(top.topSuggestion.id).toBe('draft-memo');
    });
  });

  describe('priority counts + ranking', () => {
    it('counts each deal under its TOP suggestion priority', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            // HIGH: overdue task.
            dealInput({
              id: 'h1',
              name: 'High Acme',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(1),
            }),
            // MEDIUM: stage-aging only.
            dealInput({
              id: 'm1',
              name: 'Medium Beta',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(90),
              lastActivityOn: isoDaysAgo(1),
            }),
            // LOW: stale-activity only.
            dealInput({
              id: 'l1',
              name: 'Low Gamma',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(30),
            }),
          ],
          tasks: [
            {
              id: 't1',
              dealId: 'h1',
              title: 'A',
              dueDate: isoDaysAgo(2),
              completed: false,
            },
          ],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
        },
        NOW,
      );
      expect(r.totalDealsScanned).toBe(3);
      expect(r.dealsWithSuggestions).toBe(3);
      expect(r.highPriorityDealCount).toBe(1);
      expect(r.mediumPriorityDealCount).toBe(1);
      expect(r.lowPriorityDealCount).toBe(1);
    });

    it('orders topDeals HIGH → MEDIUM → LOW', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'l',
              name: 'Low',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(30),
            }),
            dealInput({
              id: 'h',
              name: 'High',
              targetCloseDate: isoDaysFromNow(5),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(20),
            }),
            dealInput({
              id: 'm',
              name: 'Medium',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(90),
              lastActivityOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
        },
        NOW,
      );
      const ids = r.topDeals.map((d) => d.dealId);
      expect(ids).toEqual(['h', 'm', 'l']);
    });

    it('breaks priority ties by suggestion count desc', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            // Both MEDIUM. Deal "two" carries both stage-aging AND
            // outstanding-documents → 2 suggestions.
            dealInput({
              id: 'm-one',
              name: 'Medium One',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(90),
              lastActivityOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'm-two',
              name: 'Medium Two',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(90),
              lastActivityOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          outstandingDocuments: [
            {
              id: 'doc',
              dealId: 'm-two',
              name: 'PFS',
              receivedDate: undefined,
              reviewer: undefined,
            },
          ],
          pendingReviewDocuments: [],
          memos: [],
        },
        NOW,
      );
      expect(r.topDeals[0]!.dealId).toBe('m-two');
      expect(r.topDeals[1]!.dealId).toBe('m-one');
    });

    it('breaks count ties by nearest target close date asc', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'far',
              name: 'Far Close',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(90),
              lastActivityOn: isoDaysAgo(1),
            }),
            dealInput({
              id: 'near',
              name: 'Near Close',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(20),
              lastActivityOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
        },
        NOW,
      );
      expect(r.topDeals[0]!.dealId).toBe('near');
      expect(r.topDeals[1]!.dealId).toBe('far');
    });
  });

  describe('cap', () => {
    it(`caps topDeals at TOP_N_BANKER_ROLLUP_DEALS = ${TOP_N_BANKER_ROLLUP_DEALS}`, () => {
      const deals: BankerRollupDealInput[] = [];
      for (let i = 0; i < 12; i++) {
        deals.push(
          dealInput({
            id: `d-${i}`,
            name: `Deal ${String.fromCharCode(65 + i)}`,
            stageEntryDate: isoDaysAgo(45 + i),
            targetCloseDate: isoDaysFromNow(60),
            lastActivityOn: isoDaysAgo(1),
          }),
        );
      }
      const r = deriveBankerAutopilotRollup(
        {
          deals,
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
        },
        NOW,
      );
      expect(r.totalDealsScanned).toBe(12);
      expect(r.dealsWithSuggestions).toBe(12);
      expect(r.topDeals.length).toBe(TOP_N_BANKER_ROLLUP_DEALS);
    });
  });

  describe('top-suggestion shape', () => {
    it('preserves the Phase 80 isAutomated: false contract', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'h',
              name: 'Hot Deal',
              targetCloseDate: isoDaysFromNow(5),
              stageEntryDate: isoDaysAgo(5),
              lastActivityOn: isoDaysAgo(20),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
        },
        NOW,
      );
      expect(r.topDeals[0]!.topSuggestion.isAutomated).toBe(false);
    });

    it('passes the clientName through for the rollup card to display', () => {
      const r = deriveBankerAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Acme RLOC',
              clientName: 'Acme Manufacturing',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(90),
              lastActivityOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
        },
        NOW,
      );
      expect(r.topDeals[0]!.clientName).toBe('Acme Manufacturing');
    });
  });

  describe('module hygiene', () => {
    const SRC = readFileSync(
      resolve(__dirname, 'bankerAutopilotRollup.ts'),
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
