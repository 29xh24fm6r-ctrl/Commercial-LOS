import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildRelationshipMemoryTeamsSummary,
  RELATIONSHIP_MEMORY_TEAMS_SUMMARY_DISCLAIMER,
  RELATIONSHIP_MEMORY_TEAMS_SUMMARY_MAX_DEALS,
} from './relationshipMemoryTeamsSummary';
import type {
  RelationshipDealSnapshot,
  RelationshipMemoryEntry,
} from './relationshipMemory';

/**
 * Phase 100 — buildRelationshipMemoryTeamsSummary tests.
 *
 * Pins:
 *   - heading composes "Relationship snapshot — <client> — UTC date"
 *     and always prints the verbatim "Client-name grouped." line;
 *   - missing-name entry renders the "(no borrower name on record)"
 *     placeholder rather than a bare em dash;
 *   - top-line counts (active deal count + pipeline, singular vs
 *     plural; pipeline omitted when totalAmount === 0; "(N missing
 *     $)" appended when dealsMissingAmount > 0);
 *   - timeline anchors: "Last activity: N days ago." (today / 1 day
 *     ago / N days ago); "Nearest upcoming close: today / tomorrow /
 *     in N days (YYYY-MM-DD)."; both lines omitted when their ISO is
 *     undefined;
 *   - Asks block (open document requests + open tasks with optional
 *     overdue parenthetical); whole block omitted when both counts
 *     are zero; singular / plural copy;
 *   - Attention block (pending review / closing soon / stage
 *     attention / draft memos); whole block omitted when all four
 *     counts are zero;
 *   - Active deals list — capped at
 *     RELATIONSHIP_MEMORY_TEAMS_SUMMARY_MAX_DEALS (8); extra deals
 *     surfaced as "- … and N more"; "(unnamed deal)" placeholder
 *     when dealName is blank;
 *   - count clamping (negative + NaN → 0; floats floored);
 *   - verbatim disclaimer at the end with every brief-mandated
 *     limitation marker;
 *   - exclusions: no UUID / cr664_* / _value / audit / timeline /
 *     correlation_id / Bearer / token / Graph / MSAL leakage;
 *   - forbidden positive claims: never says sent / posted /
 *     delivered / notified / synced / Teams integrated / Graph
 *     connected;
 *   - forbidden relationship claims: never says household /
 *     verified / complete history / full relationship profile /
 *     relationship score / risk score / performance score /
 *     AI-generated / Copilot / official relationship graph;
 *   - module hygiene: no SDK / role / Graph / MSAL / deals dir
 *     imports.
 */

const NOW = new Date('2026-05-19T12:00:00Z');

function snapshot(
  over: Partial<RelationshipDealSnapshot> = {},
): RelationshipDealSnapshot {
  return {
    dealId: 'd-1',
    dealName: 'Acme Working Capital',
    stage: 'Underwriting',
    targetCloseDate: '2026-09-30T00:00:00Z',
    amount: 4_500_000,
    lastActivityOn: '2026-05-18T10:00:00Z',
    ...over,
  };
}

function entry(
  over: Partial<RelationshipMemoryEntry> = {},
): RelationshipMemoryEntry {
  return {
    clientNameDisplay: 'Acme Manufacturing, LLC',
    clientNameKey: 'acme manufacturing, llc',
    isClientNameMissing: false,
    deals: [snapshot()],
    activeDealCount: 1,
    totalAmount: 4_500_000,
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

describe('Phase 100 — heading + grouping marker', () => {
  it('renders "Relationship snapshot — <client> — UTC date" + verbatim "Client-name grouped." line', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ clientNameDisplay: 'Acme Manufacturing, LLC' }),
      generatedAt: NOW,
    });
    expect(out).toMatch(
      /^Relationship snapshot — Acme Manufacturing, LLC — 2026-05-19\nClient-name grouped\.\n/,
    );
  });

  it('renders the "(no borrower name on record)" placeholder for missing-name entries', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        clientNameDisplay: '',
        clientNameKey: '__no-borrower-name-on-record__',
        isClientNameMissing: true,
      }),
      generatedAt: NOW,
    });
    expect(out).toContain(
      'Relationship snapshot — (no borrower name on record) — 2026-05-19',
    );
    expect(out).not.toMatch(/snapshot —  —/);
  });

  it('falls back to the placeholder when clientNameDisplay is whitespace-only but isClientNameMissing is false (degraded entry)', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        clientNameDisplay: '   ',
        isClientNameMissing: false,
      }),
      generatedAt: NOW,
    });
    expect(out).toContain('(no borrower name on record)');
  });
});

describe('Phase 100 — top-line counts', () => {
  it('renders singular "1 active deal" + pipeline when activeDealCount === 1 and amount > 0', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ activeDealCount: 1, totalAmount: 4_500_000 }),
      generatedAt: NOW,
    });
    expect(out).toContain('1 active deal · Pipeline $4,500,000');
    expect(out).not.toContain('1 active deals');
  });

  it('renders plural "N active deals" when activeDealCount >= 2', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ activeDealCount: 3 }),
      generatedAt: NOW,
    });
    expect(out).toContain('3 active deals');
  });

  it('omits the pipeline segment when totalAmount === 0', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ activeDealCount: 2, totalAmount: 0 }),
      generatedAt: NOW,
    });
    expect(out).toContain('2 active deals');
    expect(out).not.toMatch(/Pipeline \$0\b/);
  });

  it('appends "(N missing $)" to the pipeline segment when dealsMissingAmount > 0', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        activeDealCount: 3,
        totalAmount: 1_000_000,
        dealsMissingAmount: 2,
      }),
      generatedAt: NOW,
    });
    expect(out).toContain('Pipeline $1,000,000 (2 missing $)');
  });

  it('clamps negative + NaN counts to 0', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ activeDealCount: -3 }),
      generatedAt: NOW,
    });
    expect(out).toContain('0 active deals');
    const nan = buildRelationshipMemoryTeamsSummary({
      entry: entry({ activeDealCount: Number.NaN }),
      generatedAt: NOW,
    });
    expect(nan).toContain('0 active deals');
  });
});

describe('Phase 100 — timeline anchors', () => {
  it('renders "Last activity: N days ago." when mostRecentActivityIso is in the past', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ mostRecentActivityIso: '2026-05-16T12:00:00Z' }),
      generatedAt: NOW,
    });
    expect(out).toContain('Last activity: 3 days ago.');
  });

  it('renders "Last activity: 1 day ago." when exactly 1 day in the past', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ mostRecentActivityIso: '2026-05-18T12:00:00Z' }),
      generatedAt: NOW,
    });
    expect(out).toContain('Last activity: 1 day ago.');
  });

  it('renders "Last activity: today." when the timestamp is within the same UTC day', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ mostRecentActivityIso: '2026-05-19T08:00:00Z' }),
      generatedAt: NOW,
    });
    expect(out).toContain('Last activity: today.');
  });

  it('omits the Last activity line when mostRecentActivityIso is undefined', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ mostRecentActivityIso: undefined }),
      generatedAt: NOW,
    });
    expect(out).not.toMatch(/Last activity:/);
  });

  it('renders "Nearest upcoming close: in N days (YYYY-MM-DD)." for future close', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ nearestUpcomingCloseIso: '2026-05-30T00:00:00Z' }),
      generatedAt: NOW,
    });
    expect(out).toContain(
      'Nearest upcoming close: in 10 days (2026-05-30).',
    );
  });

  it('renders "Nearest upcoming close: tomorrow (YYYY-MM-DD)." when exactly 1 day ahead', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ nearestUpcomingCloseIso: '2026-05-20T13:00:00Z' }),
      generatedAt: NOW,
    });
    expect(out).toContain(
      'Nearest upcoming close: tomorrow (2026-05-20).',
    );
  });

  it('renders "Nearest upcoming close: today (YYYY-MM-DD)." when the close ISO is in the past (defensive)', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ nearestUpcomingCloseIso: '2026-05-19T11:00:00Z' }),
      generatedAt: NOW,
    });
    expect(out).toContain(
      'Nearest upcoming close: today (2026-05-19).',
    );
  });

  it('omits the Nearest upcoming close line when nearestUpcomingCloseIso is undefined', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ nearestUpcomingCloseIso: undefined }),
      generatedAt: NOW,
    });
    expect(out).not.toMatch(/Nearest upcoming close/);
  });
});

describe('Phase 100 — Asks block', () => {
  it('renders Asks with both lines when open docs + open tasks > 0', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        outstandingDocumentCount: 2,
        openTaskCount: 5,
        overdueTaskCount: 1,
      }),
      generatedAt: NOW,
    });
    expect(out).toContain('Asks:');
    expect(out).toContain('- 2 open document requests');
    expect(out).toContain('- 5 open tasks (1 overdue)');
  });

  it('uses singular "1 open document request" + "1 open task" copy', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        outstandingDocumentCount: 1,
        openTaskCount: 1,
      }),
      generatedAt: NOW,
    });
    expect(out).toContain('- 1 open document request');
    expect(out).toContain('- 1 open task');
    expect(out).not.toContain('1 open document requests');
    expect(out).not.toContain('1 open tasks');
  });

  it('omits the overdue parenthetical when overdueTaskCount === 0', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ openTaskCount: 3, overdueTaskCount: 0 }),
      generatedAt: NOW,
    });
    expect(out).toContain('- 3 open tasks');
    expect(out).not.toMatch(/overdue/);
  });

  it('omits the Asks block entirely when both counts are zero', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        outstandingDocumentCount: 0,
        openTaskCount: 0,
      }),
      generatedAt: NOW,
    });
    expect(out).not.toContain('Asks:');
  });
});

describe('Phase 100 — Attention block', () => {
  it('renders Attention with the four conditional lines when their counts > 0', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        pendingReviewDocumentCount: 2,
        closingSoonCount: 1,
        stageAtRiskCount: 1,
        draftMemoCount: 1,
      }),
      generatedAt: NOW,
    });
    expect(out).toContain('Attention:');
    expect(out).toContain('- 2 documents may require review');
    expect(out).toContain('- 1 closing soon');
    expect(out).toContain('- 1 stage attention');
    expect(out).toContain('- 1 draft memo');
  });

  it('uses singular "1 document may require review" + "1 draft memo" copy', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        pendingReviewDocumentCount: 1,
        draftMemoCount: 1,
      }),
      generatedAt: NOW,
    });
    expect(out).toContain('- 1 document may require review');
    expect(out).toContain('- 1 draft memo');
    expect(out).not.toContain('1 documents may require review');
    expect(out).not.toContain('1 draft memos');
  });

  it('omits the Attention block entirely when all four counts are zero', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry(),
      generatedAt: NOW,
    });
    expect(out).not.toContain('Attention:');
  });
});

describe('Phase 100 — Active deals list', () => {
  it('renders each visible deal as "- dealName — stage"', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        activeDealCount: 2,
        deals: [
          snapshot({
            dealId: 'd-1',
            dealName: 'Acme Working Capital',
            stage: 'Underwriting',
          }),
          snapshot({
            dealId: 'd-2',
            dealName: 'Acme Equipment Loan',
            stage: 'Closing',
          }),
        ],
      }),
      generatedAt: NOW,
    });
    expect(out).toContain('Active deals:');
    expect(out).toContain('- Acme Working Capital — Underwriting');
    expect(out).toContain('- Acme Equipment Loan — Closing');
  });

  it('omits the "— stage" segment when stage is blank or undefined', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        deals: [
          snapshot({
            dealId: 'd-1',
            dealName: 'Acme Bridge',
            stage: undefined,
          }),
        ],
      }),
      generatedAt: NOW,
    });
    expect(out).toContain('- Acme Bridge');
    expect(out).not.toMatch(/Acme Bridge — \s*$/m);
  });

  it('renders "(unnamed deal)" placeholder when dealName is blank', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        deals: [snapshot({ dealId: 'd-1', dealName: '   ', stage: 'Underwriting' })],
      }),
      generatedAt: NOW,
    });
    expect(out).toContain('- (unnamed deal) — Underwriting');
  });

  it('caps the rendered list at RELATIONSHIP_MEMORY_TEAMS_SUMMARY_MAX_DEALS = 8 and surfaces "… and N more"', () => {
    const many: RelationshipDealSnapshot[] = [];
    for (let i = 0; i < 12; i++) {
      many.push(snapshot({ dealId: `d-${i}`, dealName: `Deal ${i}` }));
    }
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ activeDealCount: 12, deals: many }),
      generatedAt: NOW,
    });
    const rows = out
      .split('\n')
      .filter((l) => l.startsWith('- Deal '));
    expect(rows.length).toBe(RELATIONSHIP_MEMORY_TEAMS_SUMMARY_MAX_DEALS);
    expect(RELATIONSHIP_MEMORY_TEAMS_SUMMARY_MAX_DEALS).toBe(8);
    expect(out).toContain('- … and 4 more');
  });

  it('omits the entire "Active deals:" block when the entry has no deals', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({ activeDealCount: 0, deals: [] }),
      generatedAt: NOW,
    });
    expect(out).not.toContain('Active deals:');
    expect(out).not.toContain('… and');
  });
});

describe('Phase 100 — disclaimer (verbatim)', () => {
  it('always renders the verbatim Phase 100 disclaimer at the end', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry(),
      generatedAt: NOW,
    });
    expect(out.endsWith(RELATIONSHIP_MEMORY_TEAMS_SUMMARY_DISCLAIMER)).toBe(
      true,
    );
    expect(out).toContain(
      '— Local copy only. Not posted to Teams. Paste into Teams. ' +
        'You send the message manually. Derived from visible records; ' +
        'client-name grouped — may not include all related borrowers. ' +
        'Not a relationship graph, not a household linkage, not a ' +
        'relationship score.',
    );
  });
});

describe('Phase 100 — exclusions (the formatter must NOT leak)', () => {
  it('output contains no UUID-shaped identifiers', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry({
        deals: [
          snapshot({
            dealId: '550e8400-e29b-41d4-a716-446655440000',
            dealName: 'Acme',
          }),
        ],
      }),
      generatedAt: NOW,
    });
    expect(out).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it('output contains no cr664_* logical names or _value lookup suffixes', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry(),
      generatedAt: NOW,
    });
    expect(out).not.toMatch(/\bcr664_/);
    expect(out).not.toMatch(/_value\b/);
  });

  it('output contains no audit / timeline / correlation payload markers', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry(),
      generatedAt: NOW,
    });
    expect(out).not.toMatch(/\baudit[_-]?id\b/i);
    expect(out).not.toMatch(/\bevent[_-]?id\b/i);
    expect(out).not.toMatch(/\btimeline[_-]?event\b/i);
    expect(out).not.toMatch(/\bcorrelation[_-]?id\b/i);
  });

  it('output contains no secrets / tokens / Graph / MSAL markers', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry(),
      generatedAt: NOW,
    });
    expect(out).not.toMatch(/\bBearer\b/);
    expect(out).not.toMatch(/\bAuthorization:/i);
    expect(out).not.toMatch(/\baccess[_-]?token\b/i);
    expect(out).not.toMatch(/\brefresh[_-]?token\b/i);
    expect(out).not.toMatch(/\bclient[_-]?secret\b/i);
    expect(out).not.toMatch(/\bGraph\b/);
    expect(out).not.toMatch(/\bMSAL\b/);
  });
});

describe('Phase 100 — conservative-copy vocabulary', () => {
  const populated = buildRelationshipMemoryTeamsSummary({
    entry: entry({
      activeDealCount: 3,
      totalAmount: 5_500_000,
      openTaskCount: 3,
      overdueTaskCount: 1,
      outstandingDocumentCount: 2,
      pendingReviewDocumentCount: 1,
      draftMemoCount: 1,
      closingSoonCount: 1,
      stageAtRiskCount: 1,
      mostRecentActivityIso: '2026-05-18T10:00:00Z',
      nearestUpcomingCloseIso: '2026-09-15T00:00:00Z',
      deals: [
        snapshot({ dealId: 'd-1', dealName: 'A', stage: 'Underwriting' }),
        snapshot({ dealId: 'd-2', dealName: 'B', stage: 'Closing' }),
        snapshot({ dealId: 'd-3', dealName: 'C', stage: 'Application' }),
      ],
    }),
    generatedAt: NOW,
  });

  // Strip the negation-laden disclaimer line before checking
  // forbidden positive claims so the negation does not register.
  const body = populated.replace(
    RELATIONSHIP_MEMORY_TEAMS_SUMMARY_DISCLAIMER,
    '',
  );

  it.each([
    ['sent', /\bsent\b/i],
    ['posted', /\bposted\b/i],
    ['delivered', /\bdelivered\b/i],
    ['notified', /\bnotified\b/i],
    ['synced', /\bsynced\b/i],
    ['Teams integrated', /Teams\s+integrated/i],
    ['Graph connected', /Graph\s+connected/i],
    ['notification raised', /notification\s+raised/i],
    ['approved', /\bapproved\b/i],
    ['denied', /\bdenied\b/i],
    ['rejected', /\brejected\b/i],
    ['credit decision', /credit\s+decision/i],
    ['risk score', /risk\s+score/i],
    ['performance score', /performance\s+score/i],
    ['AI-generated', /AI[- ]?generated/i],
    ['Copilot', /\bCopilot\b/i],
    ['household', /\bhousehold\b/i],
    ['verified', /\bverified\b/i],
    ['complete history', /complete\s+history/i],
    ['full relationship profile', /full\s+relationship\s+profile/i],
    ['relationship score', /relationship\s+score/i],
    ['official relationship graph', /official\s+relationship\s+graph/i],
  ])('the body never says "%s" as a positive claim', (_label, pattern) => {
    expect(body).not.toMatch(pattern);
  });
});

describe('Phase 100 — module hygiene', () => {
  const source = readFileSync(
    resolve(__dirname, 'relationshipMemoryTeamsSummary.ts'),
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

  it('imports no role module (banker / manager / team / executive / admin / deals)', () => {
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/banker/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/manager/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/team/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/executive/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/admin/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/deals/);
  });

  it('source reuses the Phase 76/77 derivation types (does not redefine them)', () => {
    // Should only import the result + snapshot types from the
    // sibling primitive — never the derivation function itself.
    expect(source).toMatch(
      /import type \{[^}]*RelationshipMemoryEntry[^}]*\} from ['"]\.\/relationshipMemory['"]/,
    );
    expect(source).not.toMatch(/function\s+deriveRelationshipMemory\b/);
    expect(source).not.toMatch(/function\s+deriveCrossDealContext\b/);
  });

  it('source contains the three required UI phrases that LOCAL_ONLY_FLOWS pins', () => {
    expect(source).toMatch(/Not posted to Teams/);
    expect(source).toMatch(/Paste into Teams/);
    expect(source).toMatch(/You send the message manually/);
  });

  it('rendered output carries the verbatim relationship-limitation markers the brief pins', () => {
    const out = buildRelationshipMemoryTeamsSummary({
      entry: entry(),
      generatedAt: NOW,
    });
    expect(out).toMatch(/client-name grouped/i);
    expect(out).toMatch(/may not include all related borrowers/i);
    expect(out).toMatch(/not a relationship graph/i);
    expect(out).toMatch(/not a household linkage/i);
    expect(out).toMatch(/not a relationship score/i);
  });
});
