import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveRelationshipMemory,
  MISSING_CLIENT_NAME_KEY,
  type RelationshipDealInput,
  type RelationshipMemoryInput,
} from './relationshipMemory';

/**
 * Phase 76 — relationship-memory derivation tests.
 *
 * Pins:
 *   - grouping by normalized client name (trim + collapse whitespace
 *     + lowercase);
 *   - missing-client fallback (clientName undefined / blank groups
 *     under MISSING_CLIENT_NAME_KEY with isClientNameMissing=true);
 *   - per-entry attention totals (open tasks + overdue + outstanding
 *     docs + pending-review + draft memos + closing-soon + stage-at-
 *     risk);
 *   - timeline anchors (most-recent activity, nearest upcoming close);
 *   - sort order: attention-bearing rows first, then by most-recent-
 *     activity desc, missing-name client last on tie;
 *   - deals-per-entry sort: nearest upcoming close first, missing
 *     target close last, then by name;
 *   - module hygiene: no SDK / role / score / AI / predictive
 *     vocabulary in the source.
 */

const NOW = new Date('2026-05-15T12:00:00Z');

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
function isoDaysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function dealInput(o: Partial<RelationshipDealInput>): RelationshipDealInput {
  return {
    id: 'd',
    name: 'Sample',
    clientName: 'Acme',
    stage: 'Underwriting',
    amount: 1_000_000,
    targetCloseDate: undefined,
    lastActivityOn: undefined,
    stageEntryDate: undefined,
    ...o,
  };
}

function emptyInput(): RelationshipMemoryInput {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
  };
}

describe('Phase 76 — deriveRelationshipMemory', () => {
  describe('empty input', () => {
    it('returns an empty array when there are no deals', () => {
      expect(deriveRelationshipMemory(emptyInput(), NOW)).toEqual([]);
    });
  });

  describe('grouping', () => {
    it('groups deals by normalized client name (case + whitespace insensitive)', () => {
      const input = emptyInput();
      input.deals = [
        dealInput({ id: 'd1', name: 'A', clientName: 'Acme, LLC' }),
        dealInput({ id: 'd2', name: 'B', clientName: '  acme,    LLC ' }),
        dealInput({ id: 'd3', name: 'C', clientName: 'Beta Industries' }),
      ];
      const r = deriveRelationshipMemory(input, NOW);
      expect(r.length).toBe(2);
      const acme = r.find((e) => e.clientNameKey === 'acme, llc')!;
      expect(acme.activeDealCount).toBe(2);
      expect(acme.clientNameDisplay).toBe('Acme, LLC');
      const beta = r.find((e) => e.clientNameKey !== 'acme, llc')!;
      expect(beta.activeDealCount).toBe(1);
    });

    it('treats undefined / blank clientName as the missing-name group', () => {
      const input = emptyInput();
      input.deals = [
        dealInput({ id: 'd1', name: 'A', clientName: undefined }),
        dealInput({ id: 'd2', name: 'B', clientName: '   ' }),
      ];
      const r = deriveRelationshipMemory(input, NOW);
      expect(r.length).toBe(1);
      expect(r[0]!.clientNameKey).toBe(MISSING_CLIENT_NAME_KEY);
      expect(r[0]!.isClientNameMissing).toBe(true);
      expect(r[0]!.clientNameDisplay).toBe('');
      expect(r[0]!.activeDealCount).toBe(2);
    });

    it('uses the first non-empty clientName for display when multiple appear in the same group', () => {
      const input = emptyInput();
      input.deals = [
        dealInput({ id: 'd1', name: 'A', clientName: '   ' }),
        dealInput({ id: 'd2', name: 'B', clientName: 'Acme, LLC' }),
        dealInput({ id: 'd3', name: 'C', clientName: 'acme, llc' }),
      ];
      const r = deriveRelationshipMemory(input, NOW);
      // d1 normalizes to the missing-name bucket so it forms its own
      // group; d2 + d3 collapse together.
      expect(r.length).toBe(2);
      const acme = r.find((e) => !e.isClientNameMissing)!;
      expect(acme.activeDealCount).toBe(2);
      expect(acme.clientNameDisplay).toBe('Acme, LLC');
    });
  });

  describe('attention totals', () => {
    it('sums open + overdue tasks, outstanding + pending-review docs, draft memos, closing-soon + stage-at-risk per client', () => {
      const input = emptyInput();
      input.deals = [
        dealInput({
          id: 'd1',
          clientName: 'Acme',
          stage: 'Underwriting',
          targetCloseDate: isoDaysFromNow(10), // closing soon
          stageEntryDate: isoDaysAgo(35),     // at-risk stage
        }),
        dealInput({
          id: 'd2',
          clientName: 'Acme',
          stage: 'Closing',
          targetCloseDate: isoDaysFromNow(20),
          stageEntryDate: isoDaysAgo(5),
        }),
      ];
      input.tasks = [
        { dealId: 'd1', dueDate: isoDaysAgo(1) },  // overdue
        { dealId: 'd1', dueDate: isoDaysFromNow(5) },
        { dealId: 'd2', dueDate: undefined },
      ];
      input.outstandingDocuments = [
        { dealId: 'd1' },
        { dealId: 'd2' },
        { dealId: 'd2' },
      ];
      input.pendingReviewDocuments = [
        { dealId: 'd1', receivedDate: isoDaysAgo(10) }, // 10d ≥ 7d → counts
        { dealId: 'd2', receivedDate: isoDaysAgo(3) },  // 3d < 7d → no
      ];
      input.memos = [
        { dealId: 'd1', statusKey: 'draft' },
        { dealId: 'd2', statusKey: 'final' },
      ];
      const r = deriveRelationshipMemory(input, NOW);
      expect(r.length).toBe(1);
      const acme = r[0]!;
      expect(acme.openTaskCount).toBe(3);
      expect(acme.overdueTaskCount).toBe(1);
      expect(acme.outstandingDocumentCount).toBe(3);
      expect(acme.pendingReviewDocumentCount).toBe(1);
      expect(acme.draftMemoCount).toBe(1);
      expect(acme.closingSoonCount).toBe(1);
      expect(acme.stageAtRiskCount).toBe(1);
    });

    it('reports totalAmount and dealsMissingAmount honestly', () => {
      const input = emptyInput();
      input.deals = [
        dealInput({ id: 'd1', clientName: 'Acme', amount: 1_000_000 }),
        dealInput({ id: 'd2', clientName: 'Acme', amount: undefined }),
        dealInput({ id: 'd3', clientName: 'Acme', amount: Number.NaN }),
      ];
      const r = deriveRelationshipMemory(input, NOW);
      expect(r[0]!.totalAmount).toBe(1_000_000);
      expect(r[0]!.dealsMissingAmount).toBe(2);
    });
  });

  describe('timeline anchors', () => {
    it('reports the most recent activity timestamp across the client\'s deals', () => {
      const input = emptyInput();
      input.deals = [
        dealInput({
          id: 'd1',
          clientName: 'Acme',
          lastActivityOn: isoDaysAgo(10),
        }),
        dealInput({
          id: 'd2',
          clientName: 'Acme',
          lastActivityOn: isoDaysAgo(2),
        }),
      ];
      const r = deriveRelationshipMemory(input, NOW);
      expect(r[0]!.mostRecentActivityIso).toBe(isoDaysAgo(2));
    });

    it('reports the nearest UPCOMING close (ignores past target-close dates)', () => {
      const input = emptyInput();
      input.deals = [
        dealInput({
          id: 'd1',
          clientName: 'Acme',
          targetCloseDate: isoDaysAgo(5), // past — ignored
        }),
        dealInput({
          id: 'd2',
          clientName: 'Acme',
          targetCloseDate: isoDaysFromNow(20),
        }),
        dealInput({
          id: 'd3',
          clientName: 'Acme',
          targetCloseDate: isoDaysFromNow(8),
        }),
      ];
      const r = deriveRelationshipMemory(input, NOW);
      expect(r[0]!.nearestUpcomingCloseIso).toBe(isoDaysFromNow(8));
    });

    it('leaves the anchors undefined when no parseable values exist', () => {
      const input = emptyInput();
      input.deals = [
        dealInput({
          id: 'd1',
          clientName: 'Acme',
          lastActivityOn: undefined,
          targetCloseDate: 'not-an-iso',
        }),
      ];
      const r = deriveRelationshipMemory(input, NOW);
      expect(r[0]!.mostRecentActivityIso).toBeUndefined();
      expect(r[0]!.nearestUpcomingCloseIso).toBeUndefined();
    });
  });

  describe('per-entry deal-snapshot sort', () => {
    it('sorts a client\'s deals by nearest upcoming close, missing target-close last', () => {
      const input = emptyInput();
      input.deals = [
        dealInput({
          id: 'd-late',
          name: 'Z late',
          clientName: 'Acme',
          targetCloseDate: isoDaysFromNow(30),
        }),
        dealInput({
          id: 'd-soon',
          name: 'Y soon',
          clientName: 'Acme',
          targetCloseDate: isoDaysFromNow(5),
        }),
        dealInput({
          id: 'd-none',
          name: 'X no-close',
          clientName: 'Acme',
          targetCloseDate: undefined,
        }),
      ];
      const r = deriveRelationshipMemory(input, NOW);
      const names = r[0]!.deals.map((d) => d.dealName);
      expect(names).toEqual(['Y soon', 'Z late', 'X no-close']);
    });
  });

  describe('entry sort order', () => {
    it('orders entries by attention first, then by most-recent activity desc, then by name', () => {
      const input = emptyInput();
      input.deals = [
        // calm client, recent activity
        dealInput({
          id: 'd1',
          name: 'Quiet',
          clientName: 'Beta',
          lastActivityOn: isoDaysAgo(1),
        }),
        // attention-bearing client (overdue task), older activity
        dealInput({
          id: 'd2',
          name: 'Loud',
          clientName: 'Acme',
          lastActivityOn: isoDaysAgo(10),
        }),
      ];
      input.tasks = [{ dealId: 'd2', dueDate: isoDaysAgo(2) }];
      const r = deriveRelationshipMemory(input, NOW);
      expect(r.map((e) => e.clientNameDisplay)).toEqual(['Acme', 'Beta']);
    });

    it('pushes the missing-name client behind all named clients on activity tie', () => {
      const input = emptyInput();
      input.deals = [
        dealInput({
          id: 'd1',
          name: 'Z',
          clientName: 'Zenith',
          lastActivityOn: undefined,
        }),
        dealInput({
          id: 'd2',
          name: 'X',
          clientName: undefined,
          lastActivityOn: undefined,
        }),
      ];
      const r = deriveRelationshipMemory(input, NOW);
      expect(r[0]!.clientNameDisplay).toBe('Zenith');
      expect(r[1]!.isClientNameMissing).toBe(true);
    });
  });

  describe('module hygiene', () => {
    const SRC = readFileSync(
      resolve(__dirname, 'relationshipMemory.ts'),
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

    it('does not use AI / scoring / ranking / graph / predictive / decisioning vocabulary in the source', () => {
      expect(CODE).not.toMatch(/\bAI[ -]?generated\b/i);
      expect(CODE).not.toMatch(/\bAI\b/i);
      expect(CODE).not.toMatch(/\brelationship\s+score\b/i);
      expect(CODE).not.toMatch(/\brisk\s+score\b/i);
      expect(CODE).not.toMatch(/\bperformance\s+rating\b/i);
      expect(CODE).not.toMatch(/\bpredictive\b/i);
      expect(CODE).not.toMatch(/\bguaranteed\b/i);
      expect(CODE).not.toMatch(/\bapprov(ed|al)\b/i);
      expect(CODE).not.toMatch(/\brejected\b/i);
      expect(CODE).not.toMatch(/\brelationship\s+graph\b/i);
      expect(CODE).not.toMatch(/\bhouseholding\b/i);
      expect(CODE).not.toMatch(/\bcomplete\s+relationship\s+profile\b/i);
    });
  });
});
