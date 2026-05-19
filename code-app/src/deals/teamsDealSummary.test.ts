import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildTeamsDealSummary,
  TEAMS_DEAL_SUMMARY_CLOSING_SOON_DAYS,
  TEAMS_DEAL_SUMMARY_DISCLAIMER,
  type TeamsDealSummaryInput,
} from './teamsDealSummary';

/**
 * Phase 96 — buildTeamsDealSummary tests.
 *
 * Pins:
 *   - happy-path render includes every required block (deal facts,
 *     counts, optional next-best-action, optional relationship line,
 *     prepared-by, disclaimer);
 *   - exclusions: no IDs (UUID / 'cr664_*' / GUID-shaped strings);
 *     no raw timeline JSON; no full memo body text leakage; no
 *     approval / denial / risk-score / decisioning vocabulary; no
 *     secrets / tokens / connector identifiers;
 *   - conservative-copy: the formatter never emits 'sent', 'posted',
 *     'delivered', 'notified', 'synced', 'Teams integrated',
 *     'Graph connected' (etc.) as a positive claim;
 *   - count clamping (negative + NaN → 0; floats floored);
 *   - missing-field fallbacks: undefined client/stage/status/amount
 *     render "Not provided"; missing topSuggestion drops the block;
 *     missing relationship note drops the block;
 *   - closing-soon window: 0 ≤ days ≤ 14 → fires; >14 → silent;
 *     negative days → overdue copy fires;
 *   - banker-name fallback to 'the assigned banker' when blank;
 *   - deterministic UTC date formatting;
 *   - module hygiene: no SDK / role / Graph / MSAL / token import.
 */

function baseInput(
  over: Partial<TeamsDealSummaryInput> = {},
): TeamsDealSummaryInput {
  return {
    dealName: 'Acme Working Capital',
    clientName: 'Acme Manufacturing, LLC',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    targetCloseDate: '2026-09-30T00:00:00Z',
    openTaskCount: 2,
    outstandingDocumentCount: 1,
    pendingReviewDocumentCount: 0,
    memoConsistencyFindingCount: 0,
    topSuggestion: undefined,
    bankerName: 'M. Paller',
    relationshipContextNote: undefined,
    generatedAt: new Date('2026-05-18T12:00:00Z'),
    ...over,
  };
}

describe('Phase 96 — buildTeamsDealSummary (happy path)', () => {
  it('renders every required block when all fields are present', () => {
    const out = buildTeamsDealSummary(
      baseInput({
        topSuggestion: {
          title: '1 document may require review',
          reason: 'Received 8 days ago with no reviewer on the record.',
        },
        relationshipContextNote:
          'Borrower has 2 other deals in your pipeline.',
      }),
    );

    expect(out).toContain('Deal summary — Acme Working Capital');
    expect(out).toContain('Client: Acme Manufacturing, LLC');
    expect(out).toContain('Stage: Underwriting');
    expect(out).toContain('Status: Active');
    expect(out).toContain('Loan amount: $4,500,000');
    expect(out).toContain('Target close: 2026-09-30');
    expect(out).toContain('Banker focus:');
    expect(out).toContain('- Open tasks: 2');
    expect(out).toContain('- Outstanding documents: 1');
    expect(out).toContain('- Documents pending review: 0');
    expect(out).toContain('- Memo consistency findings: 0');
    expect(out).toContain('Next best action:');
    expect(out).toContain('1 document may require review');
    expect(out).toContain('Relationship: Borrower has 2 other deals in your pipeline.');
    expect(out).toContain('Prepared by M. Paller on 2026-05-18.');
    expect(out).toContain(TEAMS_DEAL_SUMMARY_DISCLAIMER);
  });

  it('renders the verbatim disclaimer pinning local-only posture', () => {
    const out = buildTeamsDealSummary(baseInput());
    expect(out).toContain(
      '— Local copy only. Not posted to Teams. Paste into Teams. ' +
        'You send the message manually.',
    );
  });
});

describe('Phase 96 — missing-field fallbacks', () => {
  it('renders "Not provided" for each fact omitted', () => {
    const out = buildTeamsDealSummary(
      baseInput({
        clientName: undefined,
        stage: undefined,
        status: undefined,
        amount: undefined,
        targetCloseDate: undefined,
      }),
    );
    expect(out).toContain('Client: Not provided');
    expect(out).toContain('Stage: Not provided');
    expect(out).toContain('Status: Not provided');
    expect(out).toContain('Loan amount: Not provided');
    expect(out).toContain('Target close: Not provided');
  });

  it('renders "Not provided" when a string facts is whitespace-only', () => {
    const out = buildTeamsDealSummary(
      baseInput({ clientName: '   ', stage: '\t' }),
    );
    expect(out).toContain('Client: Not provided');
    expect(out).toContain('Stage: Not provided');
  });

  it('drops the Next-best-action block when topSuggestion is undefined', () => {
    const out = buildTeamsDealSummary(
      baseInput({ topSuggestion: undefined }),
    );
    expect(out).not.toContain('Next best action');
  });

  it('drops the Next-best-action block when title + reason are both blank', () => {
    const out = buildTeamsDealSummary(
      baseInput({ topSuggestion: { title: '   ', reason: '\n' } }),
    );
    expect(out).not.toContain('Next best action');
  });

  it('drops the Relationship line when note is undefined', () => {
    const out = buildTeamsDealSummary(
      baseInput({ relationshipContextNote: undefined }),
    );
    expect(out).not.toContain('Relationship:');
  });

  it('drops the Relationship line when note is whitespace-only', () => {
    const out = buildTeamsDealSummary(
      baseInput({ relationshipContextNote: '   ' }),
    );
    expect(out).not.toContain('Relationship:');
  });

  it('falls back to "the assigned banker" when bankerName is blank', () => {
    const out = buildTeamsDealSummary(baseInput({ bankerName: '   ' }));
    expect(out).toContain('Prepared by the assigned banker on 2026-05-18.');
  });

  it('falls back to "the assigned banker" when bankerName is undefined', () => {
    const out = buildTeamsDealSummary(baseInput({ bankerName: undefined }));
    expect(out).toContain('Prepared by the assigned banker on 2026-05-18.');
  });
});

describe('Phase 96 — count clamping', () => {
  it('clamps negative counts to 0', () => {
    const out = buildTeamsDealSummary(
      baseInput({
        openTaskCount: -1,
        outstandingDocumentCount: -5,
        pendingReviewDocumentCount: -100,
        memoConsistencyFindingCount: -1,
      }),
    );
    expect(out).toContain('- Open tasks: 0');
    expect(out).toContain('- Outstanding documents: 0');
    expect(out).toContain('- Documents pending review: 0');
    expect(out).toContain('- Memo consistency findings: 0');
  });

  it('clamps NaN counts to 0', () => {
    const out = buildTeamsDealSummary(
      baseInput({ openTaskCount: Number.NaN }),
    );
    expect(out).toContain('- Open tasks: 0');
  });

  it('floors floating-point counts (callers should not pass them but the formatter is robust)', () => {
    const out = buildTeamsDealSummary(
      baseInput({ openTaskCount: 3.9 }),
    );
    expect(out).toContain('- Open tasks: 3');
  });
});

describe('Phase 96 — closing-soon note', () => {
  const NOW = new Date('2026-05-18T12:00:00Z');
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  function isoDaysFromNow(d: number): string {
    return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
  }

  it('fires when target close is within the 14-day window', () => {
    const out = buildTeamsDealSummary(
      baseInput({ targetCloseDate: isoDaysFromNow(10), generatedAt: NOW }),
    );
    expect(out).toMatch(/Target close in \d+ days?\. Closing soon\./);
  });

  it('uses "today" wording when close is exactly today', () => {
    const out = buildTeamsDealSummary(
      baseInput({ targetCloseDate: isoDaysFromNow(0), generatedAt: NOW }),
    );
    expect(out).toContain('Target close is today. Closing soon.');
  });

  it('uses overdue wording when close is in the past', () => {
    const out = buildTeamsDealSummary(
      baseInput({ targetCloseDate: isoDaysFromNow(-3), generatedAt: NOW }),
    );
    expect(out).toMatch(/Target close was \d+ days? ago\. Needs attention\./);
  });

  it('stays silent when close is beyond the 14-day window', () => {
    const out = buildTeamsDealSummary(
      baseInput({
        targetCloseDate: isoDaysFromNow(TEAMS_DEAL_SUMMARY_CLOSING_SOON_DAYS + 5),
        generatedAt: NOW,
      }),
    );
    expect(out).not.toMatch(/Closing soon/i);
    expect(out).not.toMatch(/Needs attention/i);
  });

  it('stays silent when target close is undefined', () => {
    const out = buildTeamsDealSummary(
      baseInput({ targetCloseDate: undefined, generatedAt: NOW }),
    );
    expect(out).not.toMatch(/Closing soon/i);
    expect(out).not.toMatch(/Needs attention/i);
  });

  it('the closing-soon window matches the documented constant', () => {
    expect(TEAMS_DEAL_SUMMARY_CLOSING_SOON_DAYS).toBe(14);
  });
});

describe('Phase 96 — exclusions (the formatter must NOT leak)', () => {
  it('output contains no UUID-shaped identifiers', () => {
    const out = buildTeamsDealSummary(
      baseInput({
        topSuggestion: {
          title: '1 document may require review',
          reason: 'Received 8 days ago with no reviewer on the record.',
        },
        relationshipContextNote: 'Borrower has 2 other deals in your pipeline.',
      }),
    );
    // No UUID v4-shaped strings.
    expect(out).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    // No cr664_* logical names.
    expect(out).not.toMatch(/\bcr664_/);
    // No `_value` Dataverse internal suffixes.
    expect(out).not.toMatch(/_value\b/);
  });

  it('output never echoes credit memo body text or section drafts', () => {
    // The formatter has no API for memo text at all; this test pins
    // that callers can't accidentally pipe memo body through a
    // relationship-context note. The note is rendered as-is but is
    // intended for a one-line context string — we still pin that
    // the formatter does not include any memo-content marker.
    const out = buildTeamsDealSummary(baseInput());
    expect(out).not.toMatch(/memo body/i);
    expect(out).not.toMatch(/draft section/i);
    expect(out).not.toMatch(/textPreview/);
  });

  it('output never contains approval / denial / risk-score / decisioning vocabulary as a positive claim', () => {
    const out = buildTeamsDealSummary(
      baseInput({
        topSuggestion: {
          title: '1 document may require review',
          reason: 'Received 8 days ago with no reviewer on the record.',
        },
      }),
    );
    expect(out).not.toMatch(/\bapproved\b/i);
    expect(out).not.toMatch(/\bdenied\b/i);
    expect(out).not.toMatch(/\brejected\b/i);
    expect(out).not.toMatch(/\bdecisioned\b/i);
    expect(out).not.toMatch(/\brisk\s+score\b/i);
    expect(out).not.toMatch(/\bcredit\s+decision\b/i);
    expect(out).not.toMatch(/\bworkflow\s+complete\b/i);
  });

  it('output never contains secrets / tokens / connector-state markers', () => {
    const out = buildTeamsDealSummary(baseInput());
    expect(out).not.toMatch(/\bBearer\b/);
    expect(out).not.toMatch(/\bAuthorization:/i);
    expect(out).not.toMatch(/\baccess[_-]?token\b/i);
    expect(out).not.toMatch(/\brefresh[_-]?token\b/i);
    expect(out).not.toMatch(/\bclient[_-]?secret\b/i);
    expect(out).not.toMatch(/\bGraph\b/);
    expect(out).not.toMatch(/\bMSAL\b/);
  });

  it('the formatter does not echo raw timeline payload markers', () => {
    const out = buildTeamsDealSummary(baseInput());
    // The formatter has no timeline input; pin that no JSON-y
    // markers leak (e.g. "audit_id:", "event_id:", curly braces in
    // the prepared lines).
    expect(out).not.toMatch(/\baudit[_-]?id\b/i);
    expect(out).not.toMatch(/\bevent[_-]?id\b/i);
    expect(out).not.toMatch(/\btimeline[_-]?event\b/i);
  });
});

describe('Phase 96 — conservative-copy vocabulary', () => {
  const populated = buildTeamsDealSummary(
    baseInput({
      topSuggestion: {
        title: '1 document may require review',
        reason: 'Received 8 days ago with no reviewer on the record.',
      },
      relationshipContextNote: 'Borrower has 2 other deals in your pipeline.',
    }),
  );

  // The disclaimer says "Not posted to Teams" — that contains the
  // word "posted" but as a NEGATION. Strip the disclaimer before
  // checking the forbidden words so the negation does not register
  // as a positive claim. The disclaimer itself is pinned by a
  // separate test above.
  const body = populated.replace(TEAMS_DEAL_SUMMARY_DISCLAIMER, '');

  it.each([
    ['sent', /\bsent\b/i],
    ['posted', /\bposted\b/i],
    ['delivered', /\bdelivered\b/i],
    ['notified', /\bnotified\b/i],
    ['synced', /\bsynced\b/i],
    ['Teams integrated', /Teams\s+integrated/i],
    ['Graph connected', /Graph\s+connected/i],
    ['notification raised', /notification\s+raised/i],
  ])('the body never says "%s" as a positive claim', (_label, pattern) => {
    expect(body).not.toMatch(pattern);
  });
});

describe('Phase 96 — module hygiene', () => {
  const source = readFileSync(
    resolve(__dirname, 'teamsDealSummary.ts'),
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
    expect(source).not.toMatch(/from\s+['"]\.\.\/team/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/executive/);
    expect(source).not.toMatch(/from\s+['"]\.\.\/admin/);
  });

  it('source never claims to send / post / deliver / notify / sync / Graph', () => {
    // The source can mention these words as negations in its
    // comment block (and the disclaimer); pin against the
    // disclaimer-stripped form below.
    expect(source).toMatch(/Not posted to Teams/);
    expect(source).not.toMatch(/we\s+post\b/i);
    expect(source).not.toMatch(/we\s+send\b/i);
    expect(source).not.toMatch(/we\s+notify\b/i);
    expect(source).not.toMatch(/we\s+sync\b/i);
    expect(source).not.toMatch(/Graph\.\w+/);
  });

  it('source contains the three required UI phrases that LOCAL_ONLY_FLOWS pins', () => {
    expect(source).toMatch(/Not posted to Teams/);
    expect(source).toMatch(/Paste into Teams/);
    expect(source).toMatch(/You send the message manually/);
  });
});
