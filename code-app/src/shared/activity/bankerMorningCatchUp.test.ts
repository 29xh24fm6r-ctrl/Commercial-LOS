import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveBankerMorningCatchUp,
  TOP_N_BANKER_CATCH_UP_ITEMS,
  type BankerCatchUpDealInput,
  type BankerCatchUpDocumentInput,
  type BankerCatchUpInput,
  type BankerCatchUpMemoInput,
  type BankerCatchUpTaskInput,
} from './bankerMorningCatchUp';
import { TOP_N_CATCH_UP_ITEMS } from './managerMorningCatchUp';

/**
 * Phase 89 — banker morning catch-up adapter tests.
 *
 * Pins:
 *   - empty / quiet input → empty feed;
 *   - banker-side reshape into the Phase 88 primitive: outstanding
 *     and pendingReview documents flow through with the right
 *     status discriminant, lastActivityOn maps to modifiedOn, the
 *     banker's own name flows through as ownerName;
 *   - each Phase 88 signal fires under the documented condition
 *     when banker-shaped inputs are supplied;
 *   - the missing-assigned-banker signal NEVER fires on the banker
 *     surface (the banker IS the assigned banker on their own
 *     deals);
 *   - sorting + cap match Phase 88 (delegation contract);
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
  o: Partial<BankerCatchUpDealInput> = {},
): BankerCatchUpDealInput {
  return {
    id: 'd-1',
    name: 'Sample Deal',
    stage: 'Underwriting',
    targetCloseDate: isoDaysFromNow(60),
    stageEntryDate: isoDaysAgo(5),
    lastActivityOn: isoDaysAgo(1),
    ...o,
  };
}

function task(
  o: Partial<BankerCatchUpTaskInput> & { id: string; dealId: string },
): BankerCatchUpTaskInput {
  return {
    title: 'Send Q2 financials',
    dueDate: undefined,
    completed: false,
    ...o,
  };
}

function doc(
  o: Partial<BankerCatchUpDocumentInput> & { id: string; dealId: string },
): BankerCatchUpDocumentInput {
  return {
    name: 'Document',
    receivedDate: undefined,
    reviewer: undefined,
    ...o,
  };
}

function memo(
  o: Partial<BankerCatchUpMemoInput> & { id: string; dealId: string },
): BankerCatchUpMemoInput {
  return {
    statusKey: undefined,
    ...o,
  };
}

function emptyInput(): BankerCatchUpInput {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    bankerName: 'M. Paller',
  };
}

describe('Phase 89 — deriveBankerMorningCatchUp', () => {
  describe('empty / quiet input', () => {
    it('returns an empty feed when there are no deals', () => {
      expect(deriveBankerMorningCatchUp(emptyInput(), NOW)).toEqual([]);
    });

    it('returns an empty feed when every deal is quiet', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal({ id: 'q1', name: 'Quiet One' })],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed).toEqual([]);
    });

    it('cap constant matches the Phase 88 manager cap', () => {
      expect(TOP_N_BANKER_CATCH_UP_ITEMS).toBe(TOP_N_CATCH_UP_ITEMS);
    });
  });

  describe('task-driven items', () => {
    it('overdue-task fires HIGH when a task is past its due date', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [task({ id: 't1', dealId: 'd-1', dueDate: isoDaysAgo(2) })],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('overdue-task');
      expect(feed[0]!.priority).toBe('high');
    });

    it('task-due-soon fires MEDIUM when a task is due within 3 days', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [task({ id: 't1', dealId: 'd-1', dueDate: isoDaysFromNow(2) })],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('task-due-soon');
    });
  });

  describe('document-driven items', () => {
    it('outstandingDocuments are routed into the outstanding bucket and aggregated per deal', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          outstandingDocuments: [
            doc({ id: 'doc1', dealId: 'd-1' }),
            doc({ id: 'doc2', dealId: 'd-1' }),
          ],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('outstanding-documents');
      expect(feed[0]!.reason).toMatch(/2 documents outstanding/);
    });

    it('pendingReviewDocuments fire HIGH pending-review when received >= 7 days ago and no reviewer', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [
            doc({
              id: 'doc1',
              dealId: 'd-1',
              receivedDate: isoDaysAgo(10),
              reviewer: undefined,
            }),
          ],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('pending-review-document');
      expect(feed[0]!.priority).toBe('high');
    });

    it('pendingReviewDocuments fire LOW newly-received when received within 3 days', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [
            doc({
              id: 'doc1',
              dealId: 'd-1',
              receivedDate: isoDaysAgo(2),
              reviewer: undefined,
            }),
          ],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('newly-received-document');
      expect(feed[0]!.priority).toBe('low');
    });
  });

  describe('memo-driven items', () => {
    it('draft memos fire LOW draft-memo', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [memo({ id: 'm1', dealId: 'd-1', statusKey: 'draft' })],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.length).toBe(1);
      expect(feed[0]!.kind).toBe('draft-memo');
      expect(feed[0]!.priority).toBe('low');
    });
  });

  describe('Phase 95 — memo-consistency-findings forwarding', () => {
    it('fires MEDIUM when banker deal + memo text trigger Phase 73 findings', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [
            deal({
              id: 'd-mc',
              name: 'Acme Working Capital',
              clientName: 'Acme Manufacturing, LLC',
              amount: 4_500_000,
              collateralSummary: 'A/R, inventory',
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [
            memo({
              id: 'm1',
              dealId: 'd-mc',
              statusKey: 'draft',
              textPreview: 'Some unrelated memo text without deal references.',
            }),
          ],
          memoSections: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      const mc = feed.find((i) => i.kind === 'memo-consistency-findings');
      expect(mc).toBeDefined();
      expect(mc!.priority).toBe('medium');
      expect(mc!.source).toBe('memo');
      expect(mc!.ownerName).toBe('M. Paller');
    });

    it('does NOT fire when memos + sections are clean against the structured fields', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [
            deal({
              id: 'd-mc',
              name: 'Acme Working Capital',
              clientName: 'Acme Manufacturing, LLC',
              amount: 4_500_000,
              collateralSummary: 'A/R, inventory',
              stage: 'Underwriting',
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [
            memo({
              id: 'm1',
              dealId: 'd-mc',
              statusKey: 'draft',
              textPreview:
                'Acme Working Capital — Acme Manufacturing, LLC. Underwriting. Loan amount $4,500,000. Senior secured against A/R, inventory.',
            }),
          ],
          memoSections: [
            { id: 's1', dealId: 'd-mc', sectionLabel: 'Collateral', textPreview: 'A/R, inventory' },
          ],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.find((i) => i.kind === 'memo-consistency-findings')).toBeUndefined();
    });

    it('stays quiet (no memo-consistency item) when callers omit memoSections + memos (pre-Phase-95 contract)', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [
            deal({
              id: 'd-mc',
              clientName: 'Acme Manufacturing, LLC',
              amount: 4_500_000,
              collateralSummary: 'A/R, inventory',
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.find((i) => i.kind === 'memo-consistency-findings')).toBeUndefined();
    });
  });

  describe('deal-driven items', () => {
    it('closing-soon fires HIGH when target close is within 14 days', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal({ targetCloseDate: isoDaysFromNow(10) })],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.some((i) => i.kind === 'closing-soon')).toBe(true);
    });

    it('stage-aging fires MEDIUM when days-in-stage >= 30', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal({ stageEntryDate: isoDaysAgo(45) })],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.some((i) => i.kind === 'stage-aging')).toBe(true);
    });

    it('stale-activity fires LOW when lastActivityOn is >= 14 days old', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [
            deal({
              lastActivityOn: isoDaysAgo(20),
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.some((i) => i.kind === 'stale-activity')).toBe(true);
    });

    it('missing-stage fires MEDIUM (data quality)', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal({ stage: undefined })],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.some((i) => i.kind === 'missing-stage')).toBe(true);
    });

    it('missing-assigned-banker NEVER fires on the banker surface (the banker IS the assigned banker)', () => {
      // Even if we somehow built a banker view from a deal where the
      // banker name was not propagated, the adapter stamps the
      // signed-in banker's name on every deal — so the data-quality
      // check Phase 88 makes always passes here. Verify with a deal
      // that would otherwise trigger the signal under the manager
      // primitive.
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal({ stageEntryDate: isoDaysAgo(45) })], // triggers stage-aging
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.some((i) => i.kind === 'missing-assigned-banker')).toBe(false);
    });

    it('missing-assigned-banker DOES surface when bankerName is undefined (degraded state)', () => {
      // Tests the contract that the banker signal still fires when
      // no banker name is available at all — i.e., the adapter does
      // not silently invent a name. This case shouldn't happen in
      // production (BankerProvider guarantees fullName) but the
      // primitive's check should remain honest.
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal()],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: undefined,
        },
        NOW,
      );
      expect(feed.some((i) => i.kind === 'missing-assigned-banker')).toBe(true);
    });
  });

  describe('ownerName propagation', () => {
    it('every emitted item carries bankerName as ownerName', () => {
      const feed = deriveBankerMorningCatchUp(
        {
          deals: [deal({ stageEntryDate: isoDaysAgo(45) })],
          tasks: [task({ id: 't1', dealId: 'd-1', dueDate: isoDaysAgo(2) })],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [memo({ id: 'm1', dealId: 'd-1', statusKey: 'draft' })],
          bankerName: 'B. Specific',
        },
        NOW,
      );
      for (const item of feed) {
        expect(item.ownerName).toBe('B. Specific');
      }
    });
  });

  describe('reshape correctness', () => {
    it('reshapes lastActivityOn into the modifiedOn-driven stale-activity check', () => {
      const stale = deriveBankerMorningCatchUp(
        {
          deals: [
            deal({
              id: 'd-stale',
              lastActivityOn: isoDaysAgo(20),
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      const fresh = deriveBankerMorningCatchUp(
        {
          deals: [
            deal({
              id: 'd-fresh',
              lastActivityOn: isoDaysAgo(1),
              targetCloseDate: isoDaysFromNow(60),
              stageEntryDate: isoDaysAgo(5),
            }),
          ],
          tasks: [],
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(stale.some((i) => i.kind === 'stale-activity')).toBe(true);
      expect(fresh.some((i) => i.kind === 'stale-activity')).toBe(false);
    });

    it('preserves the Phase 88 cap (8) via the delegation contract', () => {
      const deals: BankerCatchUpDealInput[] = [];
      const tasks: BankerCatchUpTaskInput[] = [];
      for (let i = 0; i < 12; i++) {
        const id = `d-${i}`;
        deals.push(
          deal({ id, name: `Deal ${String.fromCharCode(65 + i)}` }),
        );
        tasks.push(
          task({ id: `t-${i}`, dealId: id, dueDate: isoDaysAgo(i + 1) }),
        );
      }
      const feed = deriveBankerMorningCatchUp(
        {
          deals,
          tasks,
          outstandingDocuments: [],
          pendingReviewDocuments: [],
          memos: [],
          bankerName: 'M. Paller',
        },
        NOW,
      );
      expect(feed.length).toBe(TOP_N_BANKER_CATCH_UP_ITEMS);
    });
  });

  describe('module hygiene', () => {
    const SRC = readFileSync(
      resolve(__dirname, 'bankerMorningCatchUp.ts'),
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
