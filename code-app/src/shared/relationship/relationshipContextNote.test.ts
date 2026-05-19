import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildRelationshipContextNote } from './relationshipContextNote';
import type {
  CrossDealContextResult,
  RelationshipMemoryEntry,
} from './relationshipMemory';

/**
 * Phase 97 — buildRelationshipContextNote tests.
 *
 * Pins:
 *   - 'no-client-name' result → undefined (omit the relationship line);
 *   - 'no-other-deals' result → undefined (omit when there are no
 *     other visible deals; brief preference);
 *   - 'has-other-deals' with full aggregates → renders a short
 *     plain-text line including count + asks + nearest close;
 *   - the rendered line always carries the "client-name grouped" +
 *     "From visible records; may not include all related borrowers"
 *     limitation markers (matches Phase 77 card disclaimer language);
 *   - singular / plural copy for 1 vs 2+ counts;
 *   - the askParts sentence is dropped entirely when every count is
 *     zero (no awkward "Across those deals: ." line);
 *   - missing-name group renders the safe "(no borrower name on
 *     record)" placeholder rather than a bare colon;
 *   - nearest close uses YYYY-MM-DD UTC formatting; missing close
 *     drops the date sentence cleanly;
 *   - exclusion vocabulary: no "household", "verified", "complete",
 *     "full relationship profile", "AI-generated relationship
 *     context", "relationship score", "risk score", "all borrower
 *     exposure";
 *   - module hygiene: no SDK / role / Graph / MSAL import.
 */

const NOW = new Date('2026-05-18T12:00:00Z');

function entry(
  over: Partial<RelationshipMemoryEntry> = {},
): RelationshipMemoryEntry {
  return {
    clientNameDisplay: 'Acme Manufacturing, LLC',
    clientNameKey: 'acme manufacturing, llc',
    isClientNameMissing: false,
    deals: [],
    activeDealCount: 2,
    totalAmount: 0,
    dealsMissingAmount: 0,
    openTaskCount: 0,
    overdueTaskCount: 0,
    outstandingDocumentCount: 0,
    pendingReviewDocumentCount: 0,
    draftMemoCount: 0,
    closingSoonCount: 0,
    stageAtRiskCount: 0,
    mostRecentActivityIso: undefined,
    nearestUpcomingCloseIso: undefined,
    ...over,
  };
}

describe('Phase 97 — buildRelationshipContextNote (empty results)', () => {
  it('returns undefined when the deal has no client name on record', () => {
    const result: CrossDealContextResult = { kind: 'no-client-name' };
    expect(buildRelationshipContextNote(result, { now: NOW })).toBeUndefined();
  });

  it('returns undefined when no other deals share the client-name group', () => {
    const result: CrossDealContextResult = {
      kind: 'no-other-deals',
      clientNameDisplay: 'Acme',
    };
    expect(buildRelationshipContextNote(result, { now: NOW })).toBeUndefined();
  });

  it('returns undefined when activeDealCount is zero on the matched entry (defensive)', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({ activeDealCount: 0, deals: [] }),
    };
    expect(buildRelationshipContextNote(result, { now: NOW })).toBeUndefined();
  });
});

describe('Phase 97 — buildRelationshipContextNote (populated)', () => {
  it('renders count + client name + asks + nearest close + disclaimer', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 2,
        clientNameDisplay: 'Acme Manufacturing, LLC',
        openTaskCount: 3,
        overdueTaskCount: 1,
        outstandingDocumentCount: 1,
        pendingReviewDocumentCount: 1,
        draftMemoCount: 1,
        nearestUpcomingCloseIso: '2026-09-15T00:00:00Z',
      }),
    };
    const note = buildRelationshipContextNote(result, { now: NOW });
    expect(note).toBeDefined();
    expect(note!).toContain('2 other visible deals for Acme Manufacturing, LLC');
    expect(note!).toContain('(client-name grouped)');
    expect(note!).toContain('Across those deals:');
    expect(note!).toContain('3 open tasks (1 overdue)');
    expect(note!).toContain('1 outstanding document');
    expect(note!).toContain('1 document pending review');
    expect(note!).toContain('1 draft memo');
    expect(note!).toContain('Nearest upcoming close 2026-09-15.');
    expect(note!).toContain(
      'From visible records; may not include all related borrowers.',
    );
  });

  it('uses singular "deal" + singular "task" copy when activeDealCount === 1 and openTaskCount === 1', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 1,
        openTaskCount: 1,
        outstandingDocumentCount: 0,
        pendingReviewDocumentCount: 0,
        draftMemoCount: 0,
      }),
    };
    const note = buildRelationshipContextNote(result, { now: NOW })!;
    expect(note).toContain('1 other visible deal for Acme Manufacturing, LLC');
    expect(note).toContain('Across those deals: 1 open task.');
  });

  it('drops the Across-those-deals sentence entirely when every count is zero', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 2,
        openTaskCount: 0,
        overdueTaskCount: 0,
        outstandingDocumentCount: 0,
        pendingReviewDocumentCount: 0,
        draftMemoCount: 0,
        nearestUpcomingCloseIso: undefined,
      }),
    };
    const note = buildRelationshipContextNote(result, { now: NOW })!;
    expect(note).not.toContain('Across those deals');
    expect(note).toContain('2 other visible deals for Acme Manufacturing, LLC');
    expect(note).toContain(
      'From visible records; may not include all related borrowers.',
    );
  });

  it('joins ask parts with commas + Oxford "and" for three+ items', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 2,
        openTaskCount: 3,
        outstandingDocumentCount: 1,
        pendingReviewDocumentCount: 1,
      }),
    };
    const note = buildRelationshipContextNote(result, { now: NOW })!;
    expect(note).toContain(
      'Across those deals: 3 open tasks, 1 outstanding document, ' +
        'and 1 document pending review.',
    );
  });

  it('uses "X and Y" (no comma) for exactly two ask parts', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 2,
        openTaskCount: 3,
        outstandingDocumentCount: 1,
      }),
    };
    const note = buildRelationshipContextNote(result, { now: NOW })!;
    expect(note).toContain(
      'Across those deals: 3 open tasks and 1 outstanding document.',
    );
  });

  it('does not include the overdue parenthetical when overdueTaskCount is zero', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 2,
        openTaskCount: 3,
        overdueTaskCount: 0,
      }),
    };
    const note = buildRelationshipContextNote(result, { now: NOW })!;
    expect(note).toContain('Across those deals: 3 open tasks.');
    expect(note).not.toMatch(/overdue/);
  });

  it('drops the nearest-close sentence when nearestUpcomingCloseIso is undefined', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 2,
        openTaskCount: 1,
        nearestUpcomingCloseIso: undefined,
      }),
    };
    const note = buildRelationshipContextNote(result, { now: NOW })!;
    expect(note).not.toMatch(/Nearest upcoming close/);
  });

  it('drops the nearest-close sentence when the ISO string is unparseable', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 2,
        openTaskCount: 1,
        nearestUpcomingCloseIso: 'not-a-date',
      }),
    };
    const note = buildRelationshipContextNote(result, { now: NOW })!;
    expect(note).not.toMatch(/Nearest upcoming close/);
  });

  it('renders the safe missing-name placeholder when the matched group has no borrower name on record', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 2,
        clientNameDisplay: '',
        clientNameKey: '__no-borrower-name-on-record__',
        isClientNameMissing: true,
        openTaskCount: 1,
      }),
    };
    const note = buildRelationshipContextNote(result, { now: NOW })!;
    expect(note).toContain(
      '2 other visible deals for (no borrower name on record) ' +
        '(client-name grouped).',
    );
  });

  it('renders without a bare colon when display name is whitespace-only (degraded entry)', () => {
    const result: CrossDealContextResult = {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 2,
        clientNameDisplay: '   ',
        isClientNameMissing: false,
      }),
    };
    const note = buildRelationshipContextNote(result, { now: NOW })!;
    // Falls back to the count-only form when display name is blank
    // and the entry is not flagged as missing-name.
    expect(note).toContain('2 other visible deals (client-name grouped).');
    expect(note).not.toMatch(/for\s+for/);
  });
});

describe('Phase 97 — exclusion vocabulary (forbidden positive claims)', () => {
  const note = buildRelationshipContextNote(
    {
      kind: 'has-other-deals',
      entry: entry({
        activeDealCount: 2,
        clientNameDisplay: 'Acme Manufacturing, LLC',
        openTaskCount: 3,
        overdueTaskCount: 1,
        outstandingDocumentCount: 1,
        pendingReviewDocumentCount: 1,
        draftMemoCount: 1,
        nearestUpcomingCloseIso: '2026-09-15T00:00:00Z',
      }),
    },
    { now: NOW },
  )!;

  it.each([
    ['household', /\bhousehold\b/i],
    ['verified', /\bverified\b/i],
    ['complete history', /complete\s+history/i],
    ['full relationship profile', /full\s+relationship\s+profile/i],
    ['relationship score', /relationship\s+score/i],
    ['risk score', /risk\s+score/i],
    ['all borrower exposure', /all\s+borrower\s+exposure/i],
    ['AI-generated', /AI[- ]?generated/i],
    ['Copilot', /\bCopilot\b/i],
    ['relationship graph', /relationship\s+graph/i],
    ['credit decision', /credit\s+decision/i],
    ['guaranteed', /\bguaranteed\b/i],
  ])('the note never says "%s" as a positive claim', (_label, pattern) => {
    expect(note).not.toMatch(pattern);
  });
});

describe('Phase 97 — module hygiene', () => {
  const source = readFileSync(
    resolve(__dirname, 'relationshipContextNote.ts'),
    'utf-8',
  );

  it('imports no Power Apps / Graph / MSAL / fetch / Dataverse SDK', () => {
    expect(source).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
    expect(source).not.toMatch(/from\s+['"]@microsoft\/teams-js/);
    expect(source).not.toMatch(/from\s+['"]@azure\//);
    expect(source).not.toMatch(/from\s+['"]@microsoft\/microsoft-graph/);
    expect(source).not.toMatch(/from\s+['"]msal/i);
    expect(source).not.toMatch(/\.getAll\(/);
  });

  it('imports no role module (banker / manager / team / executive / admin)', () => {
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/banker/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/manager/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/team/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/executive/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/admin/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/deals/);
  });

  it('source reuses the existing Phase 76/77 derivation (does not redefine it)', () => {
    // The module imports the result type from the Phase 76/77
    // derivation rather than declaring its own. This pins that the
    // formatter is downstream of the existing primitive.
    expect(source).toMatch(
      /import type \{[^}]*CrossDealContextResult[^}]*\} from ['"]\.\/relationshipMemory['"]/,
    );
    // The module must NOT redefine the derivation function.
    expect(source).not.toMatch(/function\s+deriveRelationshipMemory\b/);
    expect(source).not.toMatch(/function\s+deriveCrossDealContext\b/);
  });
});
