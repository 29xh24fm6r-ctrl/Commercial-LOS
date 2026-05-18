import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveNextBestActions,
  MAX_NEXT_BEST_ACTIONS,
  STALE_ACTIVITY_DAYS,
  type AutopilotInput,
} from './dealAutopilot';

/**
 * Phase 80 — pure derivation tests for the Deal Autopilot Lite
 * "Next Best Actions" surface.
 *
 * Pins:
 *   - empty input → empty array;
 *   - overdue tasks fire HIGH priority;
 *   - pending-review documents past 7d threshold fire HIGH priority;
 *   - closing soon + stale activity fires HIGH priority (combined
 *     signal); closing soon alone fires MEDIUM;
 *   - stage at-risk (>=30d) fires MEDIUM;
 *   - outstanding documents fire MEDIUM;
 *   - memo consistency findings fire MEDIUM and suppress the
 *     draft-memo LOW signal (more specific call to action wins);
 *   - draft memo (no findings) fires LOW;
 *   - stale activity (>14d, not closing soon) fires LOW;
 *   - sort: HIGH → MEDIUM → LOW, stable within priority;
 *   - cap at MAX_NEXT_BEST_ACTIONS = 3;
 *   - every suggestion carries isAutomated: false;
 *   - module hygiene: no SDK / role / AI vocabulary in source.
 */

const NOW = new Date('2026-05-18T12:00:00Z');

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
function isoDaysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function emptyInput(): AutopilotInput {
  return {
    deal: {
      id: 'd1',
      name: 'Sample',
      stage: 'Underwriting',
      targetCloseDate: undefined,
      stageEntryDate: undefined,
    },
    openTasks: [],
    outstandingDocuments: [],
    receivedDocuments: [],
    memos: [],
    memoConsistencyFindingsCount: 0,
    mostRecentActivityIso: undefined,
  };
}

describe('Phase 80 — deriveNextBestActions', () => {
  describe('empty / quiet deal', () => {
    it('returns an empty array when no signal fires', () => {
      const input = emptyInput();
      input.deal.stageEntryDate = isoDaysAgo(5); // not at risk
      input.deal.targetCloseDate = isoDaysFromNow(60); // not closing soon
      input.mostRecentActivityIso = isoDaysAgo(2); // fresh activity
      expect(deriveNextBestActions(input, NOW)).toEqual([]);
    });
  });

  describe('high priority signals', () => {
    it('flags overdue tasks as HIGH priority with the right count', () => {
      const input = emptyInput();
      input.openTasks = [
        { id: 't1', title: 'A', dueDate: isoDaysAgo(2), completed: false },
        { id: 't2', title: 'B', dueDate: isoDaysAgo(1), completed: false },
        { id: 't3', title: 'C', dueDate: isoDaysFromNow(5), completed: false },
      ];
      const r = deriveNextBestActions(input, NOW);
      const overdue = r.find((s) => s.id === 'overdue-tasks');
      expect(overdue).toBeDefined();
      expect(overdue!.priority).toBe('high');
      expect(overdue!.title).toMatch(/2 overdue tasks/);
      expect(overdue!.targetSurface).toBe('tasks');
      expect(overdue!.isAutomated).toBe(false);
    });

    it('skips completed tasks when counting overdue', () => {
      const input = emptyInput();
      input.openTasks = [
        { id: 't1', title: 'A', dueDate: isoDaysAgo(2), completed: true },
        { id: 't2', title: 'B', dueDate: isoDaysAgo(1), completed: false },
      ];
      const r = deriveNextBestActions(input, NOW);
      const overdue = r.find((s) => s.id === 'overdue-tasks');
      expect(overdue!.title).toMatch(/1 overdue task\b/);
    });

    it('flags pending-review documents past the 7d threshold as HIGH priority', () => {
      const input = emptyInput();
      input.receivedDocuments = [
        { id: 'd1', name: 'PFS', receivedDate: isoDaysAgo(8), reviewer: undefined },
        { id: 'd2', name: 'Tax', receivedDate: isoDaysAgo(3), reviewer: undefined },
        { id: 'd3', name: 'Bank', receivedDate: isoDaysAgo(10), reviewer: 'M. Paller' },
      ];
      const r = deriveNextBestActions(input, NOW);
      const pending = r.find((s) => s.id === 'pending-review-documents');
      expect(pending).toBeDefined();
      expect(pending!.priority).toBe('high');
      expect(pending!.title).toMatch(/1 document may require review/);
      expect(pending!.targetSurface).toBe('documents');
    });

    it('combines closing-soon + stale activity into a single HIGH priority suggestion', () => {
      const input = emptyInput();
      input.deal.targetCloseDate = isoDaysFromNow(5);
      input.mostRecentActivityIso = isoDaysAgo(10);
      const r = deriveNextBestActions(input, NOW);
      const combined = r.find((s) => s.id === 'closing-soon-stale-activity');
      expect(combined).toBeDefined();
      expect(combined!.priority).toBe('high');
      expect(combined!.title).toMatch(/Closes in 5 days/);
      expect(combined!.reason).toMatch(/no timeline events.*10 days/i);
      expect(combined!.targetSurface).toBe('borrower-communication');
      // The plain closing-soon suggestion should NOT also fire.
      expect(r.find((s) => s.id === 'closing-soon')).toBeUndefined();
    });

    it('handles closing-soon-stale-activity when there is no activity on record at all', () => {
      const input = emptyInput();
      input.deal.targetCloseDate = isoDaysFromNow(3);
      input.mostRecentActivityIso = undefined;
      const r = deriveNextBestActions(input, NOW);
      const combined = r.find((s) => s.id === 'closing-soon-stale-activity');
      expect(combined).toBeDefined();
      expect(combined!.reason).toMatch(
        /no timeline events are on record/i,
      );
    });
  });

  describe('medium priority signals', () => {
    it('demotes closing-soon to MEDIUM when activity is recent', () => {
      const input = emptyInput();
      input.deal.targetCloseDate = isoDaysFromNow(10);
      input.mostRecentActivityIso = isoDaysAgo(2);
      const r = deriveNextBestActions(input, NOW);
      const cs = r.find((s) => s.id === 'closing-soon');
      expect(cs).toBeDefined();
      expect(cs!.priority).toBe('medium');
      expect(cs!.title).toMatch(/Closes in 10 days/);
      expect(r.find((s) => s.id === 'closing-soon-stale-activity')).toBeUndefined();
    });

    it('flags stage-aging at or past 30 days as MEDIUM', () => {
      const input = emptyInput();
      input.deal.stage = 'Underwriting';
      input.deal.stageEntryDate = isoDaysAgo(45);
      const r = deriveNextBestActions(input, NOW);
      const sa = r.find((s) => s.id === 'stage-aging');
      expect(sa).toBeDefined();
      expect(sa!.priority).toBe('medium');
      expect(sa!.title).toMatch(/45 days in current stage/);
      expect(sa!.reason).toContain('"Underwriting"');
    });

    it('flags outstanding documents as MEDIUM', () => {
      const input = emptyInput();
      input.outstandingDocuments = [
        { id: 'd1', name: 'PFS', receivedDate: undefined, reviewer: undefined },
        { id: 'd2', name: 'Tax', receivedDate: undefined, reviewer: undefined },
      ];
      const r = deriveNextBestActions(input, NOW);
      const od = r.find((s) => s.id === 'outstanding-documents');
      expect(od).toBeDefined();
      expect(od!.priority).toBe('medium');
      expect(od!.title).toMatch(/2 outstanding documents/);
    });

    it('flags memo consistency findings as MEDIUM and suppresses the LOW draft-memo signal', () => {
      const input = emptyInput();
      input.memos = [
        { id: 'm1', statusKey: 'draft' },
      ];
      input.memoConsistencyFindingsCount = 2;
      const r = deriveNextBestActions(input, NOW);
      const findings = r.find((s) => s.id === 'memo-consistency-findings');
      expect(findings).toBeDefined();
      expect(findings!.priority).toBe('medium');
      expect(findings!.title).toMatch(/2 memo consistency findings/);
      // Draft-memo signal suppressed because findings is more specific.
      expect(r.find((s) => s.id === 'draft-memo')).toBeUndefined();
    });
  });

  describe('low priority signals', () => {
    it('flags draft memos as LOW when consistency findings is 0', () => {
      const input = emptyInput();
      input.memos = [{ id: 'm1', statusKey: 'draft' }];
      input.memoConsistencyFindingsCount = 0;
      const r = deriveNextBestActions(input, NOW);
      const dm = r.find((s) => s.id === 'draft-memo');
      expect(dm).toBeDefined();
      expect(dm!.priority).toBe('low');
    });

    it('flags stale activity past 14 days as LOW (when not closing soon)', () => {
      const input = emptyInput();
      input.mostRecentActivityIso = isoDaysAgo(20);
      const r = deriveNextBestActions(input, NOW);
      const sa = r.find((s) => s.id === 'stale-activity');
      expect(sa).toBeDefined();
      expect(sa!.priority).toBe('low');
      expect(sa!.title).toMatch(/No timeline activity in 20 days/);
    });

    it('suppresses stale-activity LOW when closing-soon is firing (avoid double-flagging)', () => {
      const input = emptyInput();
      input.deal.targetCloseDate = isoDaysFromNow(10);
      input.mostRecentActivityIso = isoDaysAgo(30);
      const r = deriveNextBestActions(input, NOW);
      // closing-soon-stale-activity should fire (HIGH); the LOW
      // stale-activity should NOT also appear.
      expect(r.find((s) => s.id === 'closing-soon-stale-activity')).toBeDefined();
      expect(r.find((s) => s.id === 'stale-activity')).toBeUndefined();
    });

    it('STALE_ACTIVITY_DAYS is exported as 14 to match the brief', () => {
      expect(STALE_ACTIVITY_DAYS).toBe(14);
    });
  });

  describe('priority ordering + cap', () => {
    it(`returns at most ${MAX_NEXT_BEST_ACTIONS} suggestions`, () => {
      const input = emptyInput();
      // Fire every signal at once.
      input.openTasks = [{ id: 't1', title: 'A', dueDate: isoDaysAgo(1), completed: false }];
      input.receivedDocuments = [
        { id: 'r1', name: 'X', receivedDate: isoDaysAgo(8), reviewer: undefined },
      ];
      input.deal.targetCloseDate = isoDaysFromNow(5);
      input.mostRecentActivityIso = isoDaysAgo(20); // also stale
      input.deal.stageEntryDate = isoDaysAgo(45);
      input.outstandingDocuments = [
        { id: 'o1', name: 'Y', receivedDate: undefined, reviewer: undefined },
      ];
      input.memoConsistencyFindingsCount = 1;
      input.memos = [{ id: 'm1', statusKey: 'draft' }];

      const r = deriveNextBestActions(input, NOW);
      expect(r.length).toBeLessThanOrEqual(MAX_NEXT_BEST_ACTIONS);
      expect(r.length).toBe(MAX_NEXT_BEST_ACTIONS);
    });

    it('sorts HIGH → MEDIUM → LOW with stable insertion-order tiebreak', () => {
      const input = emptyInput();
      // One LOW + one MEDIUM + one HIGH — verify order in result.
      input.mostRecentActivityIso = isoDaysAgo(20); // LOW stale
      input.outstandingDocuments = [
        { id: 'o1', name: 'Y', receivedDate: undefined, reviewer: undefined },
      ]; // MEDIUM
      input.openTasks = [
        { id: 't1', title: 'A', dueDate: isoDaysAgo(1), completed: false },
      ]; // HIGH overdue
      const r = deriveNextBestActions(input, NOW);
      expect(r.length).toBe(3);
      expect(r[0]!.priority).toBe('high');
      expect(r[1]!.priority).toBe('medium');
      expect(r[2]!.priority).toBe('low');
    });

    it('drops LOW signals when 3 HIGH/MEDIUM already fill the cap', () => {
      const input = emptyInput();
      // 2 HIGH + 2 MEDIUM = 4 candidates, but cap is 3. The two HIGH
      // should come first, plus the FIRST MEDIUM in insertion order
      // (closing-soon); the second MEDIUM (stage-aging) drops; LOW
      // stale-activity also drops.
      input.openTasks = [
        { id: 't1', title: 'A', dueDate: isoDaysAgo(1), completed: false },
      ]; // HIGH overdue
      input.receivedDocuments = [
        { id: 'r1', name: 'X', receivedDate: isoDaysAgo(8), reviewer: undefined },
      ]; // HIGH pending review
      input.deal.targetCloseDate = isoDaysFromNow(10); // MEDIUM closing-soon (fresh activity)
      input.mostRecentActivityIso = isoDaysAgo(1);
      input.deal.stageEntryDate = isoDaysAgo(45); // MEDIUM stage-aging
      const r = deriveNextBestActions(input, NOW);
      expect(r.length).toBe(3);
      expect(r.filter((s) => s.priority === 'high').length).toBe(2);
      expect(r.filter((s) => s.priority === 'medium').length).toBe(1);
      // stage-aging should be the dropped MEDIUM (closing-soon
      // appears before it in insertion order).
      expect(r.find((s) => s.id === 'stage-aging')).toBeUndefined();
      expect(r.find((s) => s.id === 'closing-soon')).toBeDefined();
    });
  });

  describe('contract: isAutomated', () => {
    it('every returned suggestion carries isAutomated === false', () => {
      const input = emptyInput();
      input.openTasks = [
        { id: 't1', title: 'A', dueDate: isoDaysAgo(1), completed: false },
      ];
      input.outstandingDocuments = [
        { id: 'o1', name: 'Y', receivedDate: undefined, reviewer: undefined },
      ];
      input.mostRecentActivityIso = isoDaysAgo(20);
      const r = deriveNextBestActions(input, NOW);
      expect(r.length).toBeGreaterThan(0);
      for (const s of r) {
        expect(s.isAutomated).toBe(false);
      }
    });
  });

  describe('module hygiene', () => {
    const SRC = readFileSync(
      resolve(__dirname, 'dealAutopilot.ts'),
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
      // The Phase 80 brief forbids these tokens in code. Suggestion
      // text already has to be "this is a suggestion, banker decides"
      // — the static check pins that the source never accidentally
      // adopts the forbidden affirmative phrasing.
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
