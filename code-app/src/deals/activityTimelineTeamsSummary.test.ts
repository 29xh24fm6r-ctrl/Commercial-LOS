import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildActivityTimelineTeamsSummary,
  ACTIVITY_TIMELINE_TEAMS_SUMMARY_DISCLAIMER,
  ACTIVITY_TIMELINE_TEAMS_SUMMARY_MAX_ITEMS,
  type ActivityTimelineTeamsSummaryInput,
  type ActivityTimelineTeamsSummaryItem,
} from './activityTimelineTeamsSummary';

/**
 * Phase 99 — buildActivityTimelineTeamsSummary tests.
 *
 * Pins:
 *   - heading composes deal name + "activity digest" + YYYY-MM-DD UTC;
 *   - count line (singular vs plural);
 *   - since-last-visit line: omitted when undefined, first-visit copy,
 *     0/1/N copy variants; clamp negative + NaN newCount to 0;
 *   - top-items list renders "- <UTC stamp> · <type>: <title> — <summary>
 *     (<source> · by <actor>)" with optional "(new)" suffix;
 *   - cap at ACTIVITY_TIMELINE_TEAMS_SUMMARY_MAX_ITEMS = 8;
 *   - degraded items (missing title / type / source / summary) render
 *     gracefully and never produce bare colons;
 *   - empty list omits the "Recent activity:" block;
 *   - verbatim disclaimer at the end;
 *   - exclusions: no UUID / cr664_* / _value / audit_id /
 *     correlation_id / timeline_event / Bearer / Authorization /
 *     access_token / Graph / MSAL leakage;
 *   - forbidden positive Teams claims: never says sent / posted /
 *     delivered / notified / synced / Teams integrated / Graph
 *     connected as a positive claim;
 *   - forbidden decisioning vocabulary: approved / denied / rejected /
 *     credit decision / risk score / performance score / AI-generated /
 *     Copilot;
 *   - module hygiene: no SDK / role / Graph / MSAL / deals dir
 *     re-entry imports.
 */

function item(
  over: Partial<ActivityTimelineTeamsSummaryItem> = {},
): ActivityTimelineTeamsSummaryItem {
  return {
    eventAt: '2026-05-18T14:30:00Z',
    title: 'Send Q2 financials',
    summary: 'Borrower agreed to provide Q2 financials by month-end.',
    eventType: 'Task completed',
    eventSubType: undefined,
    sourceLabel: 'Task',
    actor: 'M. Paller',
    isNewSinceLastVisit: false,
    ...over,
  };
}

function baseInput(
  over: Partial<ActivityTimelineTeamsSummaryInput> = {},
): ActivityTimelineTeamsSummaryInput {
  return {
    dealName: 'Acme Working Capital',
    totalItemCount: 5,
    lastSeen: { firstVisit: false, newCount: 2 },
    items: [
      item({
        eventAt: '2026-05-18T14:30:00Z',
        title: 'Q2 financials received',
        eventType: 'Task completed',
        sourceLabel: 'Task',
        actor: 'M. Paller',
        isNewSinceLastVisit: true,
      }),
      item({
        eventAt: '2026-05-17T09:15:00Z',
        title: 'Borrower update prepared',
        summary: undefined,
        eventType: 'Note logged',
        sourceLabel: 'Note',
        actor: 'M. Paller',
        isNewSinceLastVisit: false,
      }),
      item({
        eventAt: '2026-05-16T10:00:00Z',
        title: 'PFS received',
        summary: 'Uploaded by borrower; pending review.',
        eventType: 'Document uploaded',
        sourceLabel: 'Document',
        actor: 'System',
        isNewSinceLastVisit: false,
      }),
    ],
    generatedAt: new Date('2026-05-19T12:00:00Z'),
    ...over,
  };
}

describe('Phase 99 — buildActivityTimelineTeamsSummary (heading + count)', () => {
  it('renders deal name + "activity digest" + UTC date in the heading', () => {
    const out = buildActivityTimelineTeamsSummary(baseInput());
    expect(out).toMatch(
      /^Acme Working Capital — activity digest — 2026-05-19\n/,
    );
  });

  it('falls back to a generic heading when dealName is blank', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({ dealName: '   ' }),
    );
    expect(out).toMatch(/^Activity digest — 2026-05-19\n/);
  });

  it('renders singular "1 timeline event." when totalItemCount is 1', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({ totalItemCount: 1, items: [item()] }),
    );
    expect(out).toContain('1 timeline event.');
    expect(out).not.toContain('1 timeline events.');
  });

  it('renders plural "N timeline events." when totalItemCount is 0 or 2+', () => {
    expect(
      buildActivityTimelineTeamsSummary(
        baseInput({ totalItemCount: 0, items: [] }),
      ),
    ).toContain('0 timeline events.');
    expect(
      buildActivityTimelineTeamsSummary(baseInput({ totalItemCount: 5 })),
    ).toContain('5 timeline events.');
  });

  it('clamps negative / NaN totalItemCount to 0', () => {
    expect(
      buildActivityTimelineTeamsSummary(
        baseInput({ totalItemCount: -3, items: [] }),
      ),
    ).toContain('0 timeline events.');
    expect(
      buildActivityTimelineTeamsSummary(
        baseInput({ totalItemCount: Number.NaN, items: [] }),
      ),
    ).toContain('0 timeline events.');
  });
});

describe('Phase 99 — since-last-visit line', () => {
  it('omits the line entirely when lastSeen is undefined', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({ lastSeen: undefined }),
    );
    expect(out).not.toMatch(/First visit on this browser/);
    expect(out).not.toMatch(/since your last visit/i);
  });

  it('renders "First visit on this browser." when firstVisit is true', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({ lastSeen: { firstVisit: true, newCount: 0 } }),
    );
    expect(out).toContain('First visit on this browser.');
  });

  it('renders "No new activity since your last visit on this browser." when newCount is 0', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({ lastSeen: { firstVisit: false, newCount: 0 } }),
    );
    expect(out).toContain(
      'No new activity since your last visit on this browser.',
    );
  });

  it('renders "1 new activity item since your last visit on this browser." for 1', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({ lastSeen: { firstVisit: false, newCount: 1 } }),
    );
    expect(out).toContain(
      '1 new activity item since your last visit on this browser.',
    );
  });

  it('renders "N new activity items since your last visit on this browser." for 2+', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({ lastSeen: { firstVisit: false, newCount: 5 } }),
    );
    expect(out).toContain(
      '5 new activity items since your last visit on this browser.',
    );
  });

  it('clamps negative + NaN newCount to 0 in the rendered line', () => {
    const neg = buildActivityTimelineTeamsSummary(
      baseInput({ lastSeen: { firstVisit: false, newCount: -3 } }),
    );
    expect(neg).toContain(
      'No new activity since your last visit on this browser.',
    );
    const nan = buildActivityTimelineTeamsSummary(
      baseInput({ lastSeen: { firstVisit: false, newCount: Number.NaN } }),
    );
    expect(nan).toContain(
      'No new activity since your last visit on this browser.',
    );
  });
});

describe('Phase 99 — recent-activity list', () => {
  it('omits the "Recent activity:" block when no items are passed', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({ totalItemCount: 0, items: [] }),
    );
    expect(out).not.toContain('Recent activity:');
  });

  it('renders the row format "- <UTC stamp> · <type>: <title> — <summary> (<source> · by <actor>)"', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({
        items: [
          item({
            eventAt: '2026-05-18T14:30:00Z',
            title: 'Q2 financials received',
            summary: 'Borrower confirmed delivery.',
            eventType: 'Task completed',
            sourceLabel: 'Task',
            actor: 'M. Paller',
            isNewSinceLastVisit: false,
          }),
        ],
      }),
    );
    expect(out).toContain(
      '- 2026-05-18 14:30 UTC · Task completed: Q2 financials received — ' +
        'Borrower confirmed delivery. (Task · by M. Paller)',
    );
  });

  it('appends " · new" when isNewSinceLastVisit is true', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({
        items: [
          item({
            isNewSinceLastVisit: true,
          }),
        ],
      }),
    );
    expect(out).toMatch(/· new$/m);
  });

  it('omits the summary segment when summary is blank', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({
        items: [
          item({
            title: 'Borrower update prepared',
            summary: undefined,
            eventType: 'Note logged',
            sourceLabel: 'Note',
            actor: 'M. Paller',
          }),
        ],
      }),
    );
    expect(out).toContain(
      'Note logged: Borrower update prepared (Note · by M. Paller)',
    );
    expect(out).not.toMatch(/— $/m);
  });

  it('includes the sub-type when present (Type / SubType)', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({
        items: [
          item({
            eventType: 'Note logged',
            eventSubType: 'documentrequest:outlook-handoff-prepared',
            title: 'Outlook handoff prepared',
            summary: undefined,
            sourceLabel: 'Note',
            actor: 'M. Paller',
          }),
        ],
      }),
    );
    expect(out).toContain(
      'Note logged / documentrequest:outlook-handoff-prepared: ' +
        'Outlook handoff prepared (Note · by M. Paller)',
    );
  });

  it('omits the source segment when sourceLabel is blank', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({
        items: [item({ sourceLabel: undefined })],
      }),
    );
    expect(out).toContain('(by M. Paller)');
    expect(out).not.toMatch(/\(\s*·/);
  });

  it('omits the meta parenthetical entirely when both source and actor are blank', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({
        items: [item({ sourceLabel: undefined, actor: '' })],
      }),
    );
    expect(out).not.toMatch(/\(\s*\)/);
    expect(out).not.toMatch(/\(by\s*\)/);
  });

  it('renders "(no title)" placeholder when title + type are both blank (defensive)', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({
        items: [
          item({
            title: '',
            eventType: undefined,
            eventSubType: undefined,
            summary: 'some summary',
            sourceLabel: 'Task',
            actor: 'M. Paller',
          }),
        ],
      }),
    );
    expect(out).toContain('(no title)');
  });

  it('renders an unknown-time placeholder when eventAt is unparseable', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({
        items: [item({ eventAt: 'not-a-date' })],
      }),
    );
    expect(out).toContain('- unknown time ·');
  });

  it('caps the rendered list at ACTIVITY_TIMELINE_TEAMS_SUMMARY_MAX_ITEMS (8)', () => {
    const many: ActivityTimelineTeamsSummaryItem[] = [];
    for (let i = 0; i < 12; i++) {
      many.push(
        item({
          eventAt: `2026-05-${String(18 - i).padStart(2, '0')}T10:00:00Z`,
          title: `Item ${i}`,
        }),
      );
    }
    const out = buildActivityTimelineTeamsSummary(
      baseInput({ totalItemCount: 12, items: many }),
    );
    const renderedRows = out.split('\n').filter((l) => l.startsWith('- '));
    expect(renderedRows.length).toBe(
      ACTIVITY_TIMELINE_TEAMS_SUMMARY_MAX_ITEMS,
    );
    expect(ACTIVITY_TIMELINE_TEAMS_SUMMARY_MAX_ITEMS).toBe(8);
  });
});

describe('Phase 99 — disclaimer (verbatim)', () => {
  it('always renders the verbatim Phase 99 disclaimer at the end', () => {
    const out = buildActivityTimelineTeamsSummary(baseInput());
    expect(out.endsWith(ACTIVITY_TIMELINE_TEAMS_SUMMARY_DISCLAIMER)).toBe(true);
    expect(out).toContain(
      '— Local copy only. Not posted to Teams. Paste into Teams. ' +
        'You send the message manually. Derived from current records; ' +
        'copying does not mark activity seen or change deal status.',
    );
  });

  it('renders the disclaimer even when items + lastSeen are absent', () => {
    const out = buildActivityTimelineTeamsSummary(
      baseInput({
        totalItemCount: 0,
        lastSeen: undefined,
        items: [],
      }),
    );
    expect(out).toContain(ACTIVITY_TIMELINE_TEAMS_SUMMARY_DISCLAIMER);
  });
});

describe('Phase 99 — exclusions (the formatter must NOT leak)', () => {
  it('output contains no UUID-shaped identifiers', () => {
    const out = buildActivityTimelineTeamsSummary(baseInput());
    expect(out).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it('output contains no cr664_* logical names or _value lookup suffixes', () => {
    const out = buildActivityTimelineTeamsSummary(baseInput());
    expect(out).not.toMatch(/\bcr664_/);
    expect(out).not.toMatch(/_value\b/);
  });

  it('output contains no audit / timeline / correlation payload markers', () => {
    const out = buildActivityTimelineTeamsSummary(baseInput());
    expect(out).not.toMatch(/\baudit[_-]?id\b/i);
    expect(out).not.toMatch(/\bevent[_-]?id\b/i);
    expect(out).not.toMatch(/\btimeline[_-]?event[_-]?id\b/i);
    expect(out).not.toMatch(/\bcorrelation[_-]?id\b/i);
  });

  it('output contains no secrets / tokens / Graph / MSAL markers', () => {
    const out = buildActivityTimelineTeamsSummary(baseInput());
    expect(out).not.toMatch(/\bBearer\b/);
    expect(out).not.toMatch(/\bAuthorization:/i);
    expect(out).not.toMatch(/\baccess[_-]?token\b/i);
    expect(out).not.toMatch(/\brefresh[_-]?token\b/i);
    expect(out).not.toMatch(/\bclient[_-]?secret\b/i);
    expect(out).not.toMatch(/\bGraph\b/);
    expect(out).not.toMatch(/\bMSAL\b/);
  });
});

describe('Phase 99 — conservative-copy vocabulary', () => {
  const populated = buildActivityTimelineTeamsSummary(baseInput());

  // Strip the negation-laden disclaimer line before checking
  // forbidden positive claims so the negation does not register.
  const body = populated.replace(
    ACTIVITY_TIMELINE_TEAMS_SUMMARY_DISCLAIMER,
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
  ])('the body never says "%s" as a positive claim', (_label, pattern) => {
    expect(body).not.toMatch(pattern);
  });
});

describe('Phase 99 — module hygiene', () => {
  const source = readFileSync(
    resolve(__dirname, 'activityTimelineTeamsSummary.ts'),
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
    expect(source).not.toMatch(/from\s+['"]\.\.\/banker/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/manager/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/team\b/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/executive/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/admin/);
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
