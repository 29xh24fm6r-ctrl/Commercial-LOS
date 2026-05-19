import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveManagerMorningCatchUp,
  TOP_N_CATCH_UP_ITEMS,
  type ManagerCatchUpDealInput,
  type ManagerCatchUpDocumentInput,
  type ManagerCatchUpInput,
  type ManagerCatchUpMemoInput,
  type ManagerCatchUpMemoSectionInput,
  type ManagerCatchUpTaskInput,
} from './managerMorningCatchUp';

/**
 * Phase 88 — manager morning catch-up derivation tests.
 *
 * Pins:
 *   - empty input → empty feed;
 *   - each of the 11 item kinds fires under its documented
 *     condition;
 *   - priority sorting (HIGH > MEDIUM > LOW);
 *   - within priority: most recent occurredAt first;
 *   - within occurredAt: deal name asc (stable);
 *   - cap at TOP_N_CATCH_UP_ITEMS (8);
 *   - orphan rows (no dealId) are dropped;
 *   - completed tasks are not surfaced;
 *   - reviewed documents are not surfaced;
 *   - missing-stage + missing-assigned-banker data-quality items
 *     surface as expected fallbacks;
 *   - derivedAt is stamped on every item;
 *   - module hygiene: no SDK / role imports; forbidden vocabulary
 *     never appears in source.
 */

const NOW = new Date('2026-05-18T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function deal(
  o: Partial<ManagerCatchUpDealInput> = {},
): ManagerCatchUpDealInput {
  return {
    id: 'd-1',
    name: 'Sample Deal',
    stage: 'Underwriting',
    assignedBankerName: 'M. Paller',
    targetCloseDate: isoDaysFromNow(60),
    stageEntryDate: isoDaysAgo(5),
    modifiedOn: isoDaysAgo(1),
    ...o,
  };
}

function task(
  o: Partial<ManagerCatchUpTaskInput> & {
    id: string;
    dealId: string | undefined;
  },
): ManagerCatchUpTaskInput {
  return {
    title: 'Send Q2 financials',
    dueDate: undefined,
    completed: false,
    ...o,
  };
}

function document(
  o: Partial<ManagerCatchUpDocumentInput> & {
    id: string;
    dealId: string | undefined;
    status: 'outstanding' | 'received' | 'reviewed';
  },
): ManagerCatchUpDocumentInput {
  return {
    name: 'Document',
    receivedDate: undefined,
    reviewer: undefined,
    ...o,
  };
}

function memo(
  o: Partial<ManagerCatchUpMemoInput> & {
    id: string;
    dealId: string | undefined;
  },
): ManagerCatchUpMemoInput {
  return {
    statusKey: undefined,
    ...o,
  };
}

function empty(): ManagerCatchUpInput {
  return { deals: [], tasks: [], documents: [], memos: [] };
}

describe('Phase 88 — deriveManagerMorningCatchUp', () => {
  describe('empty / quiet input', () => {
    it('returns an empty feed when there is no data', () => {
      expect(deriveManagerMorningCatchUp(empty(), NOW)).toEqual([]);
    });

    it('returns an empty feed when every deal is quiet (fresh stage, future close, fresh activity, no children)', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [
            deal({ id: 'q1', name: 'Quiet One' }),
            deal({
              id: 'q2',
              name: 'Quiet Two',
              targetCloseDate: isoDaysFromNow(120),
              stageEntryDate: isoDaysAgo(2),
              modifiedOn: isoDaysAgo(2),
            }),
          ],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(feed).toEqual([]);
    });
  });

  describe('task-driven items', () => {
    it('overdue-task fires HIGH when a task is past its due date', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [
            task({
              id: 't1',
              dealId: 'd-1',
              title: 'Send Q2 financials',
              dueDate: isoDaysAgo(2),
            }),
          ],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('overdue-task');
      expect(feed[0]!.priority).toBe('high');
      expect(feed[0]!.source).toBe('task');
      expect(feed[0]!.dealId).toBe('d-1');
      expect(feed[0]!.reason).toMatch(/Q2 financials/);
      expect(feed[0]!.reason).toMatch(/2 days ago/);
      expect(feed[0]!.derivedAt).toBe(NOW.toISOString());
    });

    it('task-due-soon fires MEDIUM when a task is due within 3 days', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [
            task({ id: 't1', dealId: 'd-1', dueDate: isoDaysFromNow(2) }),
          ],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('task-due-soon');
      expect(feed[0]!.priority).toBe('medium');
    });

    it('does NOT surface completed tasks', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [
            task({
              id: 't1',
              dealId: 'd-1',
              dueDate: isoDaysAgo(2),
              completed: true,
            }),
          ],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(feed).toEqual([]);
    });

    it('does NOT surface orphan tasks (no dealId)', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [
            task({ id: 't-orphan', dealId: undefined, dueDate: isoDaysAgo(2) }),
          ],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(feed).toEqual([]);
    });

    it('does NOT surface tasks without a due date', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [task({ id: 't1', dealId: 'd-1', dueDate: undefined })],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(feed).toEqual([]);
    });
  });

  describe('document-driven items', () => {
    it('pending-review-document fires HIGH when a received doc has no reviewer + crosses the 7d threshold', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [
            document({
              id: 'doc1',
              dealId: 'd-1',
              name: 'PFS',
              status: 'received',
              receivedDate: isoDaysAgo(10),
              reviewer: undefined,
            }),
          ],
          memos: [],
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('pending-review-document');
      expect(feed[0]!.priority).toBe('high');
    });

    it('newly-received-document fires LOW when a received doc is recent (<3d) and has no reviewer', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [
            document({
              id: 'doc1',
              dealId: 'd-1',
              status: 'received',
              receivedDate: isoDaysAgo(2),
              reviewer: undefined,
            }),
          ],
          memos: [],
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('newly-received-document');
      expect(feed[0]!.priority).toBe('low');
    });

    it('newly-received-document fallback fires when a received doc has no receivedDate', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [
            document({
              id: 'doc1',
              dealId: 'd-1',
              status: 'received',
              receivedDate: undefined,
              reviewer: undefined,
            }),
          ],
          memos: [],
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('newly-received-document');
      expect(feed[0]!.occurredAt).toBeUndefined();
    });

    it('outstanding-documents fires MEDIUM (one per deal, aggregated)', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [
            document({ id: 'd1', dealId: 'd-1', status: 'outstanding' }),
            document({ id: 'd2', dealId: 'd-1', status: 'outstanding' }),
            document({ id: 'd3', dealId: 'd-1', status: 'outstanding' }),
          ],
          memos: [],
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('outstanding-documents');
      expect(feed[0]!.priority).toBe('medium');
      expect(feed[0]!.reason).toMatch(/3 documents outstanding/);
    });

    it('singular "1 document outstanding" copy when exactly one outstanding doc', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [
            document({ id: 'd1', dealId: 'd-1', status: 'outstanding' }),
          ],
          memos: [],
        },
        NOW,
      );
      expect(feed[0]!.reason).toMatch(/1 document outstanding/);
    });

    it('does NOT surface reviewed documents (state is resolved from the catch-up perspective)', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [
            document({
              id: 'doc1',
              dealId: 'd-1',
              status: 'reviewed',
              receivedDate: isoDaysAgo(30),
              reviewer: 'M. Paller',
            }),
          ],
          memos: [],
        },
        NOW,
      );
      expect(feed).toEqual([]);
    });

    it('does NOT surface orphan documents (no dealId)', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [
            document({
              id: 'doc-orphan',
              dealId: undefined,
              status: 'outstanding',
            }),
          ],
          memos: [],
        },
        NOW,
      );
      expect(feed).toEqual([]);
    });
  });

  describe('memo-driven items', () => {
    it('draft-memo fires LOW when a memo with statusKey=draft is present', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [],
          memos: [memo({ id: 'm1', dealId: 'd-1', statusKey: 'draft' })],
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('draft-memo');
      expect(feed[0]!.priority).toBe('low');
    });

    it('draft-memo is deduped per deal even when multiple draft memos exist on the same deal', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [],
          memos: [
            memo({ id: 'm1', dealId: 'd-1', statusKey: 'draft' }),
            memo({ id: 'm2', dealId: 'd-1', statusKey: 'draft' }),
          ],
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('draft-memo');
    });

    it('does NOT surface final / stale memos', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [],
          memos: [
            memo({ id: 'm1', dealId: 'd-1', statusKey: 'final' }),
            memo({ id: 'm2', dealId: 'd-1', statusKey: 'stale' }),
          ],
        },
        NOW,
      );
      expect(feed).toEqual([]);
    });

    it('does NOT surface orphan memos (no dealId)', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          documents: [],
          memos: [
            memo({ id: 'm-orphan', dealId: undefined, statusKey: 'draft' }),
          ],
        },
        NOW,
      );
      expect(feed).toEqual([]);
    });
  });

  describe('Phase 95 — memo-consistency-findings item', () => {
    function dealWithStructuredFields(
      o: Partial<ManagerCatchUpDealInput> = {},
    ): ManagerCatchUpDealInput {
      return deal({
        clientName: 'Acme Manufacturing, LLC',
        amount: 4_500_000,
        collateralSummary: 'A/R, inventory',
        ...o,
      });
    }

    it('fires MEDIUM once per deal when the consistency check returns one or more findings', () => {
      // Memo text omits deal name, client name, and amount → three
      // findings from Phase 73.
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [dealWithStructuredFields({ id: 'd-mc', name: 'Acme Working Capital' })],
          tasks: [],
          documents: [],
          memos: [
            memo({
              id: 'm-1',
              dealId: 'd-mc',
              statusKey: 'draft',
              textPreview: 'Some unrelated memo content with no deal references.',
            }),
          ],
          memoSections: [],
        },
        NOW,
      );
      const mc = feed.find((i) => i.kind === 'memo-consistency-findings');
      expect(mc).toBeDefined();
      expect(mc!.priority).toBe('medium');
      expect(mc!.source).toBe('memo');
      expect(mc!.dealId).toBe('d-mc');
      expect(mc!.id).toBe('memo-consistency-findings:d-mc');
      expect(mc!.title).toMatch(/consistency finding/);
      expect(mc!.reason).toMatch(/banker review recommended/);
    });

    it('renders singular title when exactly one finding', () => {
      // Only omit the deal name → exactly one finding.
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [dealWithStructuredFields({ id: 'd-mc', name: 'Acme Working Capital' })],
          tasks: [],
          documents: [],
          memos: [
            memo({
              id: 'm-1',
              dealId: 'd-mc',
              statusKey: 'draft',
              textPreview:
                'Borrower: Acme Manufacturing, LLC. Underwriting. Loan amount $4,500,000. Collateral A/R, inventory.',
            }),
          ],
          memoSections: [],
        },
        NOW,
      );
      const mc = feed.find((i) => i.kind === 'memo-consistency-findings');
      expect(mc).toBeDefined();
      expect(mc!.title).toBe('Memo consistency finding');
    });

    it('does NOT fire when no memos and no sections exist for the deal', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [dealWithStructuredFields({ id: 'd-mc' })],
          tasks: [],
          documents: [],
          memos: [],
          memoSections: [],
        },
        NOW,
      );
      expect(feed.find((i) => i.kind === 'memo-consistency-findings')).toBeUndefined();
    });

    it('does NOT fire when memos are clean (no findings)', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [dealWithStructuredFields({ id: 'd-mc', name: 'Acme Working Capital', stage: 'Underwriting' })],
          tasks: [],
          documents: [],
          memos: [
            memo({
              id: 'm-1',
              dealId: 'd-mc',
              statusKey: 'draft',
              textPreview:
                'Acme Working Capital — Acme Manufacturing, LLC. Underwriting. Loan amount $4,500,000. Senior secured against A/R, inventory.',
            }),
          ],
          memoSections: [
            { id: 's-1', dealId: 'd-mc', sectionLabel: 'Collateral', textPreview: 'A/R, inventory' },
          ],
        },
        NOW,
      );
      expect(feed.find((i) => i.kind === 'memo-consistency-findings')).toBeUndefined();
    });

    it('does NOT fire when memoSections is omitted and no memos exist (pre-Phase-95 callers stay quiet)', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [dealWithStructuredFields({ id: 'd-mc' })],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(feed.find((i) => i.kind === 'memo-consistency-findings')).toBeUndefined();
    });

    it('emits the item once per deal even when multiple memo + section rows exist for the same deal', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [dealWithStructuredFields({ id: 'd-mc', name: 'Acme Working Capital' })],
          tasks: [],
          documents: [],
          memos: [
            memo({ id: 'm-1', dealId: 'd-mc', statusKey: 'draft', textPreview: 'unrelated content one' }),
            memo({ id: 'm-2', dealId: 'd-mc', statusKey: 'draft', textPreview: 'unrelated content two' }),
          ],
          memoSections: [
            { id: 's-1', dealId: 'd-mc', sectionLabel: 'Risk', textPreview: 'unrelated section content' },
          ],
        },
        NOW,
      );
      const mcItems = feed.filter((i) => i.kind === 'memo-consistency-findings');
      expect(mcItems).toHaveLength(1);
    });

    it('drops orphan section rows (no dealId)', () => {
      const orphan: ManagerCatchUpMemoSectionInput = {
        id: 's-orph',
        dealId: undefined,
        sectionLabel: 'Risk',
        textPreview: 'unrelated',
      };
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [dealWithStructuredFields({ id: 'd-mc' })],
          tasks: [],
          documents: [],
          memos: [],
          memoSections: [orphan],
        },
        NOW,
      );
      expect(feed.find((i) => i.kind === 'memo-consistency-findings')).toBeUndefined();
    });
  });

  describe('deal-driven items', () => {
    it('closing-soon fires HIGH when targetCloseDate is within 14 days', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [
            deal({ id: 'd-cs', name: 'Closing Deal', targetCloseDate: isoDaysFromNow(10) }),
          ],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('closing-soon');
      expect(feed[0]!.priority).toBe('high');
    });

    it('stage-aging fires MEDIUM when days-in-stage >= 30', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal({ id: 'd-sa', stageEntryDate: isoDaysAgo(45) })],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      const stageAging = feed.find((i) => i.kind === 'stage-aging');
      expect(stageAging).toBeDefined();
      expect(stageAging!.priority).toBe('medium');
    });

    it('stale-activity fires LOW when modifiedOn is >= 14 days old', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [
            deal({
              id: 'd-stale',
              modifiedOn: isoDaysAgo(20),
              // Keep future close so closing-soon does not also fire
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
            }),
          ],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      const stale = feed.find((i) => i.kind === 'stale-activity');
      expect(stale).toBeDefined();
      expect(stale!.priority).toBe('low');
    });

    it('missing-stage fires MEDIUM (data quality) when deal has no stage', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal({ id: 'd-ns', stage: undefined })],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      const ms = feed.find((i) => i.kind === 'missing-stage');
      expect(ms).toBeDefined();
      expect(ms!.priority).toBe('medium');
    });

    it('missing-stage also fires on whitespace-only stage', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal({ id: 'd-ws', stage: '   ' })],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      const ms = feed.find((i) => i.kind === 'missing-stage');
      expect(ms).toBeDefined();
    });

    it('missing-assigned-banker fires MEDIUM when no banker is recorded', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal({ id: 'd-nb', assignedBankerName: undefined })],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      const mab = feed.find((i) => i.kind === 'missing-assigned-banker');
      expect(mab).toBeDefined();
      expect(mab!.priority).toBe('medium');
    });
  });

  describe('priority sort + cap', () => {
    it('sorts HIGH > MEDIUM > LOW within the feed', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [
            deal({ id: 'd-low', name: 'Low Deal', modifiedOn: isoDaysAgo(20) }), // stale-activity LOW
            deal({
              id: 'd-med',
              name: 'Med Deal',
              stageEntryDate: isoDaysAgo(45),
            }), // stage-aging MEDIUM
            deal({
              id: 'd-high',
              name: 'High Deal',
              targetCloseDate: isoDaysFromNow(5),
            }), // closing-soon HIGH
          ],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      const priorities = feed.map((i) => i.priority);
      const highIdx = priorities.indexOf('high');
      const medIdx = priorities.indexOf('medium');
      const lowIdx = priorities.indexOf('low');
      expect(highIdx).toBeLessThan(medIdx);
      expect(medIdx).toBeLessThan(lowIdx);
    });

    it('within priority, more recent occurredAt comes first (overdue 5d > overdue 1d)', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [
            deal({ id: 'd-a', name: 'Deal A' }),
            deal({ id: 'd-b', name: 'Deal B' }),
          ],
          tasks: [
            task({
              id: 't-old',
              dealId: 'd-a',
              title: 'Task Old',
              dueDate: isoDaysAgo(5),
            }),
            task({
              id: 't-recent',
              dealId: 'd-b',
              title: 'Task Recent',
              dueDate: isoDaysAgo(1),
            }),
          ],
          documents: [],
          memos: [],
        },
        NOW,
      );
      // More recent occurredAt (-1d > -5d) sorts first.
      expect(feed[0]!.dealId).toBe('d-b');
      expect(feed[1]!.dealId).toBe('d-a');
    });

    it('caps the feed at TOP_N_CATCH_UP_ITEMS = 8', () => {
      const deals: ManagerCatchUpDealInput[] = [];
      const tasks: ManagerCatchUpTaskInput[] = [];
      for (let i = 0; i < 12; i++) {
        const id = `d-${i}`;
        deals.push(
          deal({ id, name: `Deal ${String.fromCharCode(65 + i)}` }),
        );
        tasks.push(
          task({
            id: `t-${i}`,
            dealId: id,
            dueDate: isoDaysAgo(i + 1),
          }),
        );
      }
      const feed = deriveManagerMorningCatchUp(
        {
          deals,
          tasks,
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(feed.length).toBe(TOP_N_CATCH_UP_ITEMS);
    });
  });

  describe('cross-source coexistence', () => {
    it('emits multiple items for a single deal when multiple kinds fire', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal({ id: 'd-1', stageEntryDate: isoDaysAgo(45) })],
          tasks: [
            task({ id: 't1', dealId: 'd-1', dueDate: isoDaysAgo(2) }),
          ],
          documents: [],
          memos: [memo({ id: 'm1', dealId: 'd-1', statusKey: 'draft' })],
        },
        NOW,
      );
      const kinds = new Set(feed.map((i) => i.kind));
      expect(kinds.has('overdue-task')).toBe(true);
      expect(kinds.has('stage-aging')).toBe(true);
      expect(kinds.has('draft-memo')).toBe(true);
    });

    it('propagates ownerName from the parent deal', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [deal({ assignedBankerName: 'B. One' })],
          tasks: [task({ id: 't1', dealId: 'd-1', dueDate: isoDaysAgo(2) })],
          documents: [],
          memos: [],
        },
        NOW,
      );
      expect(feed[0]!.ownerName).toBe('B. One');
    });

    it('emits both data-quality items + signal items on the same deal independently', () => {
      const feed = deriveManagerMorningCatchUp(
        {
          deals: [
            deal({
              id: 'd-1',
              stage: undefined,
              assignedBankerName: undefined,
              stageEntryDate: isoDaysAgo(45),
            }),
          ],
          tasks: [],
          documents: [],
          memos: [],
        },
        NOW,
      );
      const kinds = new Set(feed.map((i) => i.kind));
      expect(kinds.has('missing-stage')).toBe(true);
      expect(kinds.has('missing-assigned-banker')).toBe(true);
      expect(kinds.has('stage-aging')).toBe(true);
    });
  });

  describe('module hygiene', () => {
    const SRC = readFileSync(
      resolve(__dirname, 'managerMorningCatchUp.ts'),
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

    it('does not contain AI / automation / decisioning / real-time / unsafe-alert vocabulary in source code', () => {
      expect(CODE).not.toMatch(/\bAI[ -]?(generated|detected)\b/i);
      expect(CODE).not.toMatch(/\bsystem\s+decided\b/i);
      expect(CODE).not.toMatch(/\bcritical\s+breach\b/i);
      expect(CODE).not.toMatch(/\bguaranteed\b/i);
      expect(CODE).not.toMatch(/\bnoncompliant\b/i);
      expect(CODE).not.toMatch(/\bofficial\s+alert\b/i);
      expect(CODE).not.toMatch(/\breal[- ]?time\b/i);
      expect(CODE).not.toMatch(/\b(is|was|has been|will be)\s+failed\b/i);
      expect(CODE).not.toMatch(/\bautopilot\s+executed\b/i);
      expect(CODE).not.toMatch(
        /\b(executes|runs|completes|approves|decides)\s+automatically\b/i,
      );
    });
  });
});
