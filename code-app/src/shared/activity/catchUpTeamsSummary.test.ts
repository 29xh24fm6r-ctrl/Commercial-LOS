import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildCatchUpTeamsSummary,
  CATCH_UP_TEAMS_SUMMARY_DISCLAIMER,
  CATCH_UP_TEAMS_SUMMARY_MAX_ITEMS,
  type CatchUpTeamsSummaryInput,
  type CatchUpTeamsSummaryItem,
} from './catchUpTeamsSummary';

/**
 * Phase 98 — buildCatchUpTeamsSummary tests.
 *
 * Pins:
 *   - Banker + Manager headings ("Banker morning catch-up" /
 *     "Manager morning catch-up") + YYYY-MM-DD UTC date;
 *   - Visible-item count line (singular vs plural);
 *   - Since-last-visit line: omitted when lastSeen is undefined,
 *     "First visit" when firstVisit=true, "N new since your last
 *     visit on this browser." (with singular/plural copy) otherwise;
 *   - Top-items list: [PRIORITY] DealName — Title: Reason;
 *   - Manager surface appends "(Banker: <ownerName>)" when present;
 *   - Banker surface ignores ownerName (the banker IS the owner);
 *   - Cap at CATCH_UP_TEAMS_SUMMARY_MAX_ITEMS = 8;
 *   - Empty items list omits the "Top items:" block entirely;
 *   - Verbatim Phase 98 disclaimer at the end;
 *   - Exclusions: no UUID / cr664_* / _value / audit_id /
 *     event_id / timeline_event / Bearer / Authorization /
 *     access_token / Graph / MSAL leakage;
 *   - Forbidden positive claims: never says sent / posted /
 *     delivered / notified / synced / Teams integrated / Graph
 *     connected (the negation inside the disclaimer is allowed);
 *   - Forbidden language: never says approved / denied / rejected /
 *     credit decision / risk score / performance score;
 *   - Count clamping (negative + NaN → 0; floats floored);
 *   - Module hygiene: no SDK / role / Graph / MSAL import.
 */

function item(
  over: Partial<CatchUpTeamsSummaryItem> = {},
): CatchUpTeamsSummaryItem {
  return {
    dealId: 'd-1',
    dealName: 'Acme Working Capital',
    ownerName: 'M. Paller',
    priority: 'high',
    title: 'Overdue task',
    reason: 'Send Q2 financials was due 3 days ago; may require review.',
    ...over,
  };
}

function baseInput(
  over: Partial<CatchUpTeamsSummaryInput> = {},
): CatchUpTeamsSummaryInput {
  return {
    surface: 'banker',
    visibleItemCount: 3,
    lastSeen: { firstVisit: false, newCount: 2 },
    items: [
      item({ dealId: 'd-1', dealName: 'Acme Working Capital', priority: 'high' }),
      item({
        dealId: 'd-2',
        dealName: 'Beta Corp',
        priority: 'medium',
        title: 'Outstanding documents',
        reason: '2 documents outstanding on this deal; needs attention.',
      }),
      item({
        dealId: 'd-3',
        dealName: 'Gamma LLC',
        priority: 'low',
        title: 'No recent activity',
        reason: 'Last recorded change was 18 days ago; may require review.',
      }),
    ],
    generatedAt: new Date('2026-05-19T12:00:00Z'),
    ...over,
  };
}

describe('Phase 98 — buildCatchUpTeamsSummary (heading + counts)', () => {
  it('renders the banker heading + YYYY-MM-DD UTC date', () => {
    const out = buildCatchUpTeamsSummary(baseInput({ surface: 'banker' }));
    expect(out).toMatch(/^Banker morning catch-up — 2026-05-19\n/);
  });

  it('renders the manager heading + YYYY-MM-DD UTC date', () => {
    const out = buildCatchUpTeamsSummary(baseInput({ surface: 'manager' }));
    expect(out).toMatch(/^Manager morning catch-up — 2026-05-19\n/);
  });

  it('renders the singular "1 visible item." line when only one item is visible', () => {
    const out = buildCatchUpTeamsSummary(
      baseInput({ visibleItemCount: 1, items: [item()] }),
    );
    expect(out).toContain('1 visible item.');
    expect(out).not.toContain('1 visible items.');
  });

  it('renders the plural "N visible items." line for 0 or 2+', () => {
    expect(
      buildCatchUpTeamsSummary(baseInput({ visibleItemCount: 0, items: [] })),
    ).toContain('0 visible items.');
    expect(
      buildCatchUpTeamsSummary(baseInput({ visibleItemCount: 5 })),
    ).toContain('5 visible items.');
  });

  it('clamps negative / NaN counts to 0', () => {
    expect(
      buildCatchUpTeamsSummary(
        baseInput({ visibleItemCount: -3, items: [] }),
      ),
    ).toContain('0 visible items.');
    expect(
      buildCatchUpTeamsSummary(
        baseInput({ visibleItemCount: Number.NaN, items: [] }),
      ),
    ).toContain('0 visible items.');
  });
});

describe('Phase 98 — since-last-visit line', () => {
  it('omits the line entirely when lastSeen is undefined (unscoped fallback)', () => {
    const out = buildCatchUpTeamsSummary(baseInput({ lastSeen: undefined }));
    expect(out).not.toMatch(/First visit on this browser/);
    expect(out).not.toMatch(/since your last visit/i);
  });

  it('renders "First visit on this browser." when firstVisit is true', () => {
    const out = buildCatchUpTeamsSummary(
      baseInput({ lastSeen: { firstVisit: true, newCount: 0 } }),
    );
    expect(out).toContain('First visit on this browser.');
  });

  it('renders "No new items since your last visit on this browser." when newCount is 0', () => {
    const out = buildCatchUpTeamsSummary(
      baseInput({ lastSeen: { firstVisit: false, newCount: 0 } }),
    );
    expect(out).toContain('No new items since your last visit on this browser.');
  });

  it('renders "1 new item since your last visit on this browser." when newCount is 1', () => {
    const out = buildCatchUpTeamsSummary(
      baseInput({ lastSeen: { firstVisit: false, newCount: 1 } }),
    );
    expect(out).toContain('1 new item since your last visit on this browser.');
  });

  it('renders "N new items since your last visit on this browser." when newCount is 2+', () => {
    const out = buildCatchUpTeamsSummary(
      baseInput({ lastSeen: { firstVisit: false, newCount: 5 } }),
    );
    expect(out).toContain('5 new items since your last visit on this browser.');
  });

  it('clamps negative + NaN newCount to 0 in the rendered line', () => {
    const neg = buildCatchUpTeamsSummary(
      baseInput({ lastSeen: { firstVisit: false, newCount: -3 } }),
    );
    expect(neg).toContain('No new items since your last visit on this browser.');
    const nan = buildCatchUpTeamsSummary(
      baseInput({ lastSeen: { firstVisit: false, newCount: Number.NaN } }),
    );
    expect(nan).toContain('No new items since your last visit on this browser.');
  });
});

describe('Phase 98 — top-items list', () => {
  it('omits the "Top items:" block when no items are passed', () => {
    const out = buildCatchUpTeamsSummary(
      baseInput({ visibleItemCount: 0, items: [] }),
    );
    expect(out).not.toContain('Top items:');
  });

  it('renders each item as "- [PRIORITY] DealName — Title: Reason"', () => {
    const out = buildCatchUpTeamsSummary(baseInput());
    expect(out).toContain(
      '- [HIGH] Acme Working Capital — Overdue task: ' +
        'Send Q2 financials was due 3 days ago; may require review.',
    );
    expect(out).toContain(
      '- [MEDIUM] Beta Corp — Outstanding documents: ' +
        '2 documents outstanding on this deal; needs attention.',
    );
    expect(out).toContain(
      '- [LOW] Gamma LLC — No recent activity: ' +
        'Last recorded change was 18 days ago; may require review.',
    );
  });

  it('the banker surface does NOT append "(Banker: …)" even when ownerName is present', () => {
    const out = buildCatchUpTeamsSummary(
      baseInput({
        surface: 'banker',
        items: [item({ ownerName: 'M. Paller' })],
      }),
    );
    expect(out).not.toContain('(Banker:');
  });

  it('the manager surface appends "(Banker: <ownerName>)" when ownerName is present', () => {
    const out = buildCatchUpTeamsSummary(
      baseInput({
        surface: 'manager',
        items: [item({ ownerName: 'M. Paller' })],
      }),
    );
    expect(out).toContain(
      '- [HIGH] Acme Working Capital — Overdue task: ' +
        'Send Q2 financials was due 3 days ago; may require review. ' +
        '(Banker: M. Paller)',
    );
  });

  it('the manager surface omits the Banker suffix when ownerName is undefined or blank', () => {
    const noName = buildCatchUpTeamsSummary(
      baseInput({
        surface: 'manager',
        items: [item({ ownerName: undefined })],
      }),
    );
    expect(noName).not.toContain('(Banker:');
    const blank = buildCatchUpTeamsSummary(
      baseInput({
        surface: 'manager',
        items: [item({ ownerName: '   ' })],
      }),
    );
    expect(blank).not.toContain('(Banker:');
  });

  it('caps the rendered list at CATCH_UP_TEAMS_SUMMARY_MAX_ITEMS (8)', () => {
    const many: CatchUpTeamsSummaryItem[] = [];
    for (let i = 0; i < 12; i++) {
      many.push(item({ dealId: `d-${i}`, dealName: `Deal ${i}` }));
    }
    const out = buildCatchUpTeamsSummary(
      baseInput({ visibleItemCount: 12, items: many }),
    );
    const renderedRows = out.split('\n').filter((l) => l.startsWith('- ['));
    expect(renderedRows.length).toBe(CATCH_UP_TEAMS_SUMMARY_MAX_ITEMS);
    expect(CATCH_UP_TEAMS_SUMMARY_MAX_ITEMS).toBe(8);
  });

  it('renders the item even when title or reason is blank (degrades gracefully)', () => {
    const titleOnly = buildCatchUpTeamsSummary(
      baseInput({
        items: [item({ title: 'Stage aging', reason: '' })],
      }),
    );
    expect(titleOnly).toContain(
      '- [HIGH] Acme Working Capital — Stage aging',
    );
    const reasonOnly = buildCatchUpTeamsSummary(
      baseInput({
        items: [item({ title: '', reason: 'orphan reason' })],
      }),
    );
    expect(reasonOnly).toContain(
      '- [HIGH] Acme Working Capital — orphan reason',
    );
    const neither = buildCatchUpTeamsSummary(
      baseInput({ items: [item({ title: '', reason: '' })] }),
    );
    expect(neither).toContain('- [HIGH] Acme Working Capital');
  });
});

describe('Phase 98 — disclaimer (verbatim)', () => {
  it('always renders the verbatim Phase 98 disclaimer at the end', () => {
    const out = buildCatchUpTeamsSummary(baseInput());
    expect(out.endsWith(CATCH_UP_TEAMS_SUMMARY_DISCLAIMER)).toBe(true);
    expect(out).toContain(
      '— Local copy only. Not posted to Teams. Paste into Teams. ' +
        'You send the message manually. Derived from current records; ' +
        'copying does not mark items seen, dismissed, or snoozed.',
    );
  });

  it('renders the disclaimer even when no items + no lastSeen + 0 count', () => {
    const out = buildCatchUpTeamsSummary(
      baseInput({
        visibleItemCount: 0,
        lastSeen: undefined,
        items: [],
      }),
    );
    expect(out).toContain(CATCH_UP_TEAMS_SUMMARY_DISCLAIMER);
  });
});

describe('Phase 98 — exclusions (the formatter must NOT leak)', () => {
  it('output contains no UUID-shaped identifiers', () => {
    const out = buildCatchUpTeamsSummary(baseInput());
    expect(out).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it('output contains no cr664_* logical names', () => {
    const out = buildCatchUpTeamsSummary(baseInput());
    expect(out).not.toMatch(/\bcr664_/);
    expect(out).not.toMatch(/_value\b/);
  });

  it('output contains no audit / timeline payload markers', () => {
    const out = buildCatchUpTeamsSummary(baseInput());
    expect(out).not.toMatch(/\baudit[_-]?id\b/i);
    expect(out).not.toMatch(/\bevent[_-]?id\b/i);
    expect(out).not.toMatch(/\btimeline[_-]?event\b/i);
    expect(out).not.toMatch(/\bcorrelation[_-]?id\b/i);
  });

  it('output contains no secrets / tokens / Graph / MSAL markers', () => {
    const out = buildCatchUpTeamsSummary(baseInput());
    expect(out).not.toMatch(/\bBearer\b/);
    expect(out).not.toMatch(/\bAuthorization:/i);
    expect(out).not.toMatch(/\baccess[_-]?token\b/i);
    expect(out).not.toMatch(/\brefresh[_-]?token\b/i);
    expect(out).not.toMatch(/\bclient[_-]?secret\b/i);
    expect(out).not.toMatch(/\bGraph\b/);
    expect(out).not.toMatch(/\bMSAL\b/);
  });
});

describe('Phase 98 — conservative-copy vocabulary', () => {
  const populated = buildCatchUpTeamsSummary(baseInput());

  // The disclaimer says "Not posted to Teams" — strip it before
  // testing forbidden positive claims so the negation doesn't
  // register.
  const body = populated.replace(CATCH_UP_TEAMS_SUMMARY_DISCLAIMER, '');

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
  ])('the body never says "%s" as a positive claim', (_label, pattern) => {
    expect(body).not.toMatch(pattern);
  });
});

describe('Phase 98 — module hygiene', () => {
  const source = readFileSync(
    resolve(__dirname, 'catchUpTeamsSummary.ts'),
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

  it('source contains the three required UI phrases that LOCAL_ONLY_FLOWS pins', () => {
    expect(source).toMatch(/Not posted to Teams/);
    expect(source).toMatch(/Paste into Teams/);
    expect(source).toMatch(/You send the message manually/);
  });

  it('source never positively claims to send / post / deliver / notify / sync / Graph', () => {
    expect(source).not.toMatch(/we\s+post\b/i);
    expect(source).not.toMatch(/we\s+send\b/i);
    expect(source).not.toMatch(/we\s+notify\b/i);
    expect(source).not.toMatch(/we\s+sync\b/i);
    expect(source).not.toMatch(/Graph\.\w+/);
  });
});
