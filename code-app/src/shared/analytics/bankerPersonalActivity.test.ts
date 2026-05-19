import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { BankerWorkQueueData } from '../../banker/workQueueQueries';
import type { PipelineDeal } from '../../banker/dealQueries';
import { deriveBankerPersonalActivity } from './bankerPersonalActivity';

/**
 * Phase 75 — banker personal activity derivation tests.
 *
 * Pinned behaviors:
 *   - pipeline shape: active deal count, total amount with
 *     missing-amount gap;
 *   - time-sensitive deal signals: closing-soon, past-target-close,
 *     stage-at-risk, missing stage-entry-date gap;
 *   - work item counts (open + overdue tasks);
 *   - document attention (outstanding + pending-review past threshold);
 *   - memo draft count (status-key 'draft' only);
 *   - empty-data fallback;
 *   - module hygiene (no SDK / role-module imports; no AI / scoring /
 *     ranking / decisioning vocabulary).
 */

const NOW = new Date('2026-05-15T12:00:00Z');

function deal(overrides: Partial<PipelineDeal>): PipelineDeal {
  return {
    id: 'd',
    name: 'Sample',
    clientName: 'Acme',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: undefined,
    lastActivityOn: undefined,
    stageEntryDate: undefined,
    isClosed: false,
    collateralSummary: undefined,
    ...overrides,
  };
}

function emptyData(): BankerWorkQueueData {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
  };
}

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoDaysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('Phase 75 — deriveBankerPersonalActivity', () => {
  describe('empty data', () => {
    it('returns all zero counts when the banker has no active deals', () => {
      const r = deriveBankerPersonalActivity(emptyData(), NOW);
      expect(r).toEqual({
        activeDeals: 0,
        totalAmount: 0,
        dealsMissingAmount: 0,
        closingSoonCount: 0,
        pastTargetCloseCount: 0,
        stageAtRiskCount: 0,
        missingStageEntryDateCount: 0,
        openTaskCount: 0,
        overdueTaskCount: 0,
        outstandingDocumentCount: 0,
        pendingReviewDocumentCount: 0,
        draftMemoCount: 0,
      });
    });
  });

  describe('pipeline shape', () => {
    it('counts active deals and sums amounts, skipping missing amounts honestly', () => {
      const data = emptyData();
      data.deals = [
        deal({ id: 'd1', amount: 1_500_000 }),
        deal({ id: 'd2', amount: 750_000 }),
        deal({ id: 'd3', amount: undefined }),
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      expect(r.activeDeals).toBe(3);
      expect(r.totalAmount).toBe(2_250_000);
      expect(r.dealsMissingAmount).toBe(1);
    });

    it('treats NaN / non-finite amounts as missing, not as 0', () => {
      const data = emptyData();
      data.deals = [
        deal({ id: 'd1', amount: 1_000_000 }),
        deal({ id: 'd2', amount: Number.NaN }),
        deal({ id: 'd3', amount: Number.POSITIVE_INFINITY }),
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      expect(r.totalAmount).toBe(1_000_000);
      expect(r.dealsMissingAmount).toBe(2);
    });
  });

  describe('time-sensitive deal signals', () => {
    it('flags deals closing within 14 days as closing-soon', () => {
      const data = emptyData();
      data.deals = [
        deal({ id: 'd1', targetCloseDate: isoDaysFromNow(3) }),
        deal({ id: 'd2', targetCloseDate: isoDaysFromNow(14) }),
        deal({ id: 'd3', targetCloseDate: isoDaysFromNow(15) }),
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      expect(r.closingSoonCount).toBe(2);
    });

    it('flags deals whose target close date is in the past as past-target-close', () => {
      const data = emptyData();
      data.deals = [
        deal({ id: 'd1', targetCloseDate: isoDaysAgo(1) }),
        deal({ id: 'd2', targetCloseDate: isoDaysFromNow(5) }),
        deal({ id: 'd3', targetCloseDate: undefined }),
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      expect(r.pastTargetCloseCount).toBe(1);
      expect(r.closingSoonCount).toBe(1);
    });

    it('flags deals at or past 30 days in current stage as stage-at-risk', () => {
      const data = emptyData();
      data.deals = [
        deal({ id: 'd1', stageEntryDate: isoDaysAgo(30) }),
        deal({ id: 'd2', stageEntryDate: isoDaysAgo(45) }),
        deal({ id: 'd3', stageEntryDate: isoDaysAgo(15) }),
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      expect(r.stageAtRiskCount).toBe(2);
    });

    it('counts missing / future-stage-entry dates honestly via missingStageEntryDateCount', () => {
      const data = emptyData();
      data.deals = [
        deal({ id: 'd1', stageEntryDate: undefined }),
        deal({ id: 'd2', stageEntryDate: 'not-an-iso' }),
        deal({ id: 'd3', stageEntryDate: isoDaysFromNow(2) }),
        deal({ id: 'd4', stageEntryDate: isoDaysAgo(10) }),
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      expect(r.missingStageEntryDateCount).toBe(3);
      expect(r.stageAtRiskCount).toBe(0);
    });
  });

  describe('work items', () => {
    it('reports open task count from data.tasks length', () => {
      const data = emptyData();
      data.tasks = [
        { id: 't1', dealId: 'd1', title: 'A', dueDate: undefined, modifiedOn: undefined, completed: false },
        { id: 't2', dealId: 'd1', title: 'B', dueDate: undefined, modifiedOn: undefined, completed: false },
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      expect(r.openTaskCount).toBe(2);
      expect(r.overdueTaskCount).toBe(0);
    });

    it('reports overdue task count for past-due open tasks only', () => {
      const data = emptyData();
      data.tasks = [
        { id: 't1', dealId: 'd1', title: 'A', dueDate: isoDaysAgo(2), modifiedOn: undefined, completed: false },
        { id: 't2', dealId: 'd1', title: 'B', dueDate: isoDaysFromNow(5), modifiedOn: undefined, completed: false },
        { id: 't3', dealId: 'd1', title: 'C', dueDate: undefined, modifiedOn: undefined, completed: false },
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      expect(r.openTaskCount).toBe(3);
      expect(r.overdueTaskCount).toBe(1);
    });
  });

  describe('document attention', () => {
    it('reports outstanding-document count from data.outstandingDocuments length', () => {
      const data = emptyData();
      data.outstandingDocuments = [
        { id: 'doc1', dealId: 'd1', name: 'PFS', dueDate: undefined, requestDate: undefined, receivedDate: undefined, reviewer: undefined, uploaded: false, modifiedOn: undefined },
        { id: 'doc2', dealId: 'd1', name: 'Tax', dueDate: undefined, requestDate: undefined, receivedDate: undefined, reviewer: undefined, uploaded: false, modifiedOn: undefined },
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      expect(r.outstandingDocumentCount).toBe(2);
    });

    it('only counts pending-review documents whose receivedDate is past the 7-day threshold', () => {
      const data = emptyData();
      data.pendingReviewDocuments = [
        { id: 'doc1', dealId: 'd1', name: 'A', dueDate: undefined, requestDate: undefined, receivedDate: isoDaysAgo(8), reviewer: undefined, uploaded: false, modifiedOn: undefined },
        { id: 'doc2', dealId: 'd1', name: 'B', dueDate: undefined, requestDate: undefined, receivedDate: isoDaysAgo(7), reviewer: undefined, uploaded: false, modifiedOn: undefined },
        { id: 'doc3', dealId: 'd1', name: 'C', dueDate: undefined, requestDate: undefined, receivedDate: isoDaysAgo(2), reviewer: undefined, uploaded: false, modifiedOn: undefined },
        { id: 'doc4', dealId: 'd1', name: 'D', dueDate: undefined, requestDate: undefined, receivedDate: undefined, reviewer: undefined, uploaded: true, modifiedOn: undefined },
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      // doc1 (8d) and doc2 (7d) qualify; doc3 (2d) and doc4 (no
      // receivedDate) do not.
      expect(r.pendingReviewDocumentCount).toBe(2);
    });
  });

  describe('memo drafts', () => {
    it('counts only memos whose statusKey is "draft"', () => {
      const data = emptyData();
      data.memos = [
        { id: 'm1', dealId: 'd1', name: 'X', statusKey: 'draft', generatedAt: '2026-04-01', modifiedOn: undefined, textPreview: undefined },
        { id: 'm2', dealId: 'd1', name: 'Y', statusKey: 'final', generatedAt: '2026-04-01', modifiedOn: undefined, textPreview: undefined },
        { id: 'm3', dealId: 'd1', name: 'Z', statusKey: 'stale', generatedAt: '2026-04-01', modifiedOn: undefined, textPreview: undefined },
        { id: 'm4', dealId: 'd1', name: 'W', statusKey: undefined, generatedAt: '2026-04-01', modifiedOn: undefined, textPreview: undefined },
      ];
      const r = deriveBankerPersonalActivity(data, NOW);
      expect(r.draftMemoCount).toBe(1);
    });
  });

  describe('module hygiene', () => {
    const SRC = readFileSync(
      resolve(__dirname, 'bankerPersonalActivity.ts'),
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
      // Phase 48 isolation: src/shared/ never imports from a role
      // directory. The derivation accepts its input as a structural
      // type defined inline (PersonalActivityInput); the banker
      // workspace passes BankerWorkQueueData which satisfies that
      // shape via structural typing.
      const imports = SRC.match(/from\s+['"][^'"]+['"]/g) ?? [];
      for (const imp of imports) {
        expect(imp).not.toMatch(/\/(banker|manager|team|deals|executive|admin)\//);
      }
    });

    it('does not use scoring / ranking / AI / decisioning vocabulary in the source', () => {
      // Match whole words only — "score" inside a hypothetical
      // "scoreboard" identifier is the kind of false positive we
      // explicitly do NOT want to catch with a substring search.
      expect(CODE).not.toMatch(/\bscore\b/i);
      expect(CODE).not.toMatch(/\branking\b/i);
      expect(CODE).not.toMatch(/\bperformance\s+rating\b/i);
      expect(CODE).not.toMatch(/\bunderperforming\b/i);
      expect(CODE).not.toMatch(/\bAI[ -]generated\b/i);
      expect(CODE).not.toMatch(/\bpredictive\b/i);
      expect(CODE).not.toMatch(/\bguaranteed\b/i);
      expect(CODE).not.toMatch(/\bapprov(ed|al)\b/i);
      expect(CODE).not.toMatch(/\brejected\b/i);
    });
  });
});
