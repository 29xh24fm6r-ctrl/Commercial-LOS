import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveTeamAutopilotRollup,
  TOP_N_TEAM_ROLLUP_DEALS,
  type TeamRollupDealInput,
  type TeamRollupInput,
} from './teamAutopilotRollup';

/**
 * Phase 84 — team rollup derivation tests.
 *
 * The team rollup reshapes the team workspace data (deals, tasks,
 * documents with status, memos) into the Phase 82 banker derivation
 * input shape and delegates. The tests focus on the reshape
 * contract:
 *   - empty input → empty rollup;
 *   - documents bucketed by `status` (outstanding → outstandingDocuments,
 *     received → pendingReviewDocuments, reviewed → dropped);
 *   - tasks / memos with no `dealId` are dropped;
 *   - 7 Phase 80 signals can fire on the team rollup (the full
 *     banker set minus memo-consistency-findings);
 *   - cap at TOP_N_TEAM_ROLLUP_DEALS = 5 (parity with
 *     manager / banker rollups);
 *   - module hygiene: no SDK / role imports; no AI / automation /
 *     decisioning vocabulary in source.
 */

const NOW = new Date('2026-05-18T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function dealInput(o: Partial<TeamRollupDealInput>): TeamRollupDealInput {
  return {
    id: 'd',
    name: 'Sample',
    clientName: 'Sample Co',
    stage: 'Underwriting',
    targetCloseDate: undefined,
    stageEntryDate: undefined,
    modifiedOn: undefined,
    assignedBankerName: undefined,
    ...o,
  };
}

function emptyInput(): TeamRollupInput {
  return { deals: [], tasks: [], documents: [], memos: [] };
}

describe('Phase 84 — deriveTeamAutopilotRollup', () => {
  describe('empty / quiet inputs', () => {
    it('returns an empty rollup when there are no team-visible deals', () => {
      const r = deriveTeamAutopilotRollup(emptyInput(), NOW);
      expect(r).toEqual({
        totalDealsScanned: 0,
        dealsWithSuggestions: 0,
        highPriorityDealCount: 0,
        mediumPriorityDealCount: 0,
        lowPriorityDealCount: 0,
        topDeals: [],
      });
    });

    it('returns zero-flagged when every deal is healthy', () => {
      const r = deriveTeamAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Healthy',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(r.dealsWithSuggestions).toBe(0);
      expect(r.topDeals).toEqual([]);
    });
  });

  describe('signal coverage — 7 of 8 Phase 80 signals fire on the team surface', () => {
    it('overdue tasks fire HIGH', () => {
      const r = deriveTeamAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Deal',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [
            {
              id: 't1',
              dealId: 'd1',
              title: 'X',
              dueDate: isoDaysAgo(2),
              completed: false,
            },
          ],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(r.topDeals[0]!.topSuggestion.id).toBe('overdue-tasks');
      expect(r.topDeals[0]!.highestPriority).toBe('high');
    });

    it('pending-review documents fire HIGH (uses status=received bucket)', () => {
      const r = deriveTeamAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Deal',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          documents: [
            {
              id: 'doc1',
              dealId: 'd1',
              name: 'PFS',
              receivedDate: isoDaysAgo(10),
              reviewer: undefined,
              uploaded: false,
              status: 'received',
            },
          ],
          memos: [],
        },
        NOW,
      );
      expect(r.topDeals[0]!.topSuggestion.id).toBe(
        'pending-review-documents',
      );
    });

    it('outstanding documents fire MEDIUM (status=outstanding bucket)', () => {
      const r = deriveTeamAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Deal',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          documents: [
            {
              id: 'doc1',
              dealId: 'd1',
              name: 'PFS',
              receivedDate: undefined,
              reviewer: undefined,
              uploaded: false,
              status: 'outstanding',
            },
          ],
          memos: [],
        },
        NOW,
      );
      expect(r.topDeals[0]!.topSuggestion.id).toBe('outstanding-documents');
    });

    it('reviewed documents do NOT fire any signal (rule already filters on no-reviewer)', () => {
      const r = deriveTeamAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Deal',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          documents: [
            {
              id: 'doc1',
              dealId: 'd1',
              name: 'PFS',
              receivedDate: isoDaysAgo(30),
              reviewer: 'M. Paller',
              uploaded: false,
              status: 'reviewed',
            },
          ],
          memos: [],
        },
        NOW,
      );
      expect(r.dealsWithSuggestions).toBe(0);
    });

    it('draft memos fire LOW', () => {
      const r = deriveTeamAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Deal',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          documents: [],
          memos: [{ id: 'm1', dealId: 'd1', statusKey: 'draft' }],
        },
        NOW,
      );
      expect(r.topDeals[0]!.topSuggestion.id).toBe('draft-memo');
      expect(r.topDeals[0]!.highestPriority).toBe('low');
    });
  });

  describe('orphan rows (no dealId)', () => {
    it('drops tasks with no dealId', () => {
      const r = deriveTeamAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Deal',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [
            {
              id: 't-orphan',
              dealId: undefined,
              title: 'Overdue but unattributed',
              dueDate: isoDaysAgo(10),
              completed: false,
            },
          ],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(r.dealsWithSuggestions).toBe(0);
    });

    it('drops documents with no dealId', () => {
      const r = deriveTeamAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Deal',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          documents: [
            {
              id: 'doc-orphan',
              dealId: undefined,
              name: 'Orphan',
              receivedDate: undefined,
              reviewer: undefined,
              uploaded: false,
              status: 'outstanding',
            },
          ],
          memos: [],
        },
        NOW,
      );
      expect(r.dealsWithSuggestions).toBe(0);
    });

    it('drops memos with no dealId', () => {
      const r = deriveTeamAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'd1',
              name: 'Deal',
              targetCloseDate: isoDaysFromNow(90),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          documents: [],
          memos: [{ id: 'm-orphan', dealId: undefined, statusKey: 'draft' }],
        },
        NOW,
      );
      expect(r.dealsWithSuggestions).toBe(0);
    });
  });

  describe('cap', () => {
    it(`caps topDeals at TOP_N_TEAM_ROLLUP_DEALS = ${TOP_N_TEAM_ROLLUP_DEALS}`, () => {
      const deals: TeamRollupDealInput[] = [];
      for (let i = 0; i < 12; i++) {
        deals.push(
          dealInput({
            id: `d-${i}`,
            name: `Deal ${String.fromCharCode(65 + i)}`,
            stageEntryDate: isoDaysAgo(45 + i),
            targetCloseDate: isoDaysFromNow(60),
            modifiedOn: isoDaysAgo(1),
          }),
        );
      }
      const r = deriveTeamAutopilotRollup(
        { deals, tasks: [], documents: [], memos: [] },
        NOW,
      );
      expect(r.topDeals.length).toBe(TOP_N_TEAM_ROLLUP_DEALS);
      expect(TOP_N_TEAM_ROLLUP_DEALS).toBe(5);
    });
  });

  describe('priority + ranking', () => {
    it('orders HIGH → MEDIUM → LOW (consistent with manager / banker rollups)', () => {
      const r = deriveTeamAutopilotRollup(
        {
          deals: [
            dealInput({
              id: 'l',
              name: 'Low',
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(30),
            }),
            dealInput({
              id: 'h',
              name: 'High',
              targetCloseDate: isoDaysFromNow(5),
              stageEntryDate: isoDaysAgo(5),
              modifiedOn: isoDaysAgo(20),
            }),
            dealInput({
              id: 'm',
              name: 'Medium',
              stageEntryDate: isoDaysAgo(45),
              targetCloseDate: isoDaysFromNow(90),
              modifiedOn: isoDaysAgo(1),
            }),
          ],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(r.topDeals.map((d) => d.dealId)).toEqual(['h', 'm', 'l']);
    });
  });

  describe('module hygiene', () => {
    const SRC = readFileSync(
      resolve(__dirname, 'teamAutopilotRollup.ts'),
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
