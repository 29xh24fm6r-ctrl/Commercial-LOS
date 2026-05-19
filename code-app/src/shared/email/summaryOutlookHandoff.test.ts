import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  prepareSummaryOutlookHandoff,
  morningCatchUpOutlookSubject,
  activityTimelineOutlookSubject,
  relationshipMemoryOutlookSubject,
} from './summaryOutlookHandoff';

/**
 * Phase 101 — summaryOutlookHandoff tests.
 *
 * Pins:
 *   - prepareSummaryOutlookHandoff returns both a mailto URL + a
 *     "To: …\nSubject: …\n\n<body>" clipboard payload;
 *   - mailto URL conforms to RFC 6068:
 *       - "mailto:" prefix
 *       - "?subject=" then "&body="
 *       - body newlines encoded as %0A
 *       - subject + body run through encodeURIComponent
 *   - recipient is optional; when omitted the mailto prefix has no
 *     recipient between "mailto:" and "?" and the clipboard says
 *     "To: " with no value;
 *   - recipient is NEVER inferred — the wrapper passes through
 *     verbatim; the caller is expected to supply the optional value;
 *   - subject builders use the verbatim Phase 101 brief copy:
 *       "Morning catch-up summary"
 *       "Deal activity summary — <Deal Name>"
 *       "Relationship snapshot — <Client Name>" (or "(no borrower
 *       name on record)" placeholder when missing);
 *   - module hygiene: no SDK / Graph / MSAL / role / connector
 *     imports; reuses the Phase 63 emailHandoff module only.
 */

describe('Phase 101 — prepareSummaryOutlookHandoff (mailto + clipboard)', () => {
  it('returns a mailto URL and a clipboard payload with the same inputs', () => {
    const out = prepareSummaryOutlookHandoff({
      recipient: 'banker@bank.example',
      subject: 'Morning catch-up summary',
      body: 'line one\nline two',
    });
    expect(out.mailtoUrl).toMatch(/^mailto:banker%40bank\.example\?/);
    expect(out.mailtoUrl).toContain('subject=Morning%20catch-up%20summary');
    // Body newlines encode as %0A.
    expect(out.mailtoUrl).toMatch(/body=line%20one%0Aline%20two$/);
    expect(out.clipboardText).toBe(
      'To: banker@bank.example\nSubject: Morning catch-up summary\n\nline one\nline two',
    );
  });

  it('defaults recipient to empty string when omitted', () => {
    const out = prepareSummaryOutlookHandoff({
      subject: 'Morning catch-up summary',
      body: 'hello',
    });
    // mailto with no recipient: "mailto:?subject=..." — no chars
    // between "mailto:" and "?".
    expect(out.mailtoUrl).toMatch(/^mailto:\?subject=/);
    expect(out.clipboardText).toMatch(/^To: \nSubject: Morning catch-up summary/);
  });

  it('defaults recipient to empty string when explicitly undefined', () => {
    const out = prepareSummaryOutlookHandoff({
      recipient: undefined,
      subject: 'X',
      body: 'Y',
    });
    expect(out.mailtoUrl).toMatch(/^mailto:\?/);
    expect(out.clipboardText).toMatch(/^To: \nSubject: X/);
  });

  it('trims the recipient + subject (delegates to Phase 63 helpers)', () => {
    const out = prepareSummaryOutlookHandoff({
      recipient: '   banker@bank.example   ',
      subject: '   Morning catch-up summary   ',
      body: 'body',
    });
    expect(out.mailtoUrl).toContain('mailto:banker%40bank.example?');
    expect(out.mailtoUrl).toContain('subject=Morning%20catch-up%20summary');
    expect(out.clipboardText).toContain('To: banker@bank.example\n');
    expect(out.clipboardText).toContain('Subject: Morning catch-up summary\n');
  });

  it('preserves multi-line body in both outputs', () => {
    const body = 'Heading\n\nLine A\nLine B\nLine C';
    const out = prepareSummaryOutlookHandoff({
      subject: 'Activity digest',
      body,
    });
    // mailto encodes the LFs as %0A
    expect(out.mailtoUrl).toContain(
      'body=Heading%0A%0ALine%20A%0ALine%20B%0ALine%20C',
    );
    // Clipboard preserves the LFs verbatim
    expect(out.clipboardText).toContain(body);
  });

  it('round-trips a long body without truncating', () => {
    const longBody = 'X'.repeat(5000);
    const out = prepareSummaryOutlookHandoff({
      subject: 'S',
      body: longBody,
    });
    expect(out.mailtoUrl).toContain(`body=${longBody}`);
    expect(out.clipboardText).toContain(longBody);
  });

  it('does not include any cr664_* / _value / UUID-shaped strings in output for benign inputs', () => {
    const out = prepareSummaryOutlookHandoff({
      subject: 'Morning catch-up summary',
      body: 'Acme deal · 1 open task · 1 outstanding document.',
    });
    expect(out.mailtoUrl).not.toMatch(/cr664_/);
    expect(out.mailtoUrl).not.toMatch(/_value/);
    expect(out.mailtoUrl).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(out.clipboardText).not.toMatch(/cr664_/);
    expect(out.clipboardText).not.toMatch(/_value/);
  });
});

describe('Phase 101 — subject builders', () => {
  it('morningCatchUpOutlookSubject returns the verbatim brief copy', () => {
    expect(morningCatchUpOutlookSubject()).toBe(
      'Morning catch-up summary',
    );
  });

  it('activityTimelineOutlookSubject inserts the deal name after the em dash', () => {
    expect(
      activityTimelineOutlookSubject('Acme Working Capital'),
    ).toBe('Deal activity summary — Acme Working Capital');
  });

  it('activityTimelineOutlookSubject trims surrounding whitespace on dealName', () => {
    expect(activityTimelineOutlookSubject('   Acme Bridge   ')).toBe(
      'Deal activity summary — Acme Bridge',
    );
  });

  it('activityTimelineOutlookSubject falls back to "Deal activity summary" when dealName is blank', () => {
    expect(activityTimelineOutlookSubject('')).toBe('Deal activity summary');
    expect(activityTimelineOutlookSubject('   ')).toBe(
      'Deal activity summary',
    );
  });

  it('relationshipMemoryOutlookSubject inserts the client name after the em dash', () => {
    expect(
      relationshipMemoryOutlookSubject(
        'Acme Manufacturing, LLC',
        false,
      ),
    ).toBe('Relationship snapshot — Acme Manufacturing, LLC');
  });

  it('relationshipMemoryOutlookSubject swaps in the placeholder when isClientNameMissing is true', () => {
    expect(relationshipMemoryOutlookSubject('', true)).toBe(
      'Relationship snapshot — (no borrower name on record)',
    );
  });

  it('relationshipMemoryOutlookSubject swaps in the placeholder when display name is blank (defensive)', () => {
    expect(relationshipMemoryOutlookSubject('   ', false)).toBe(
      'Relationship snapshot — (no borrower name on record)',
    );
  });
});

describe('Phase 101 — conservative-copy vocabulary', () => {
  const out = prepareSummaryOutlookHandoff({
    recipient: '',
    subject: morningCatchUpOutlookSubject(),
    body:
      'Banker morning catch-up — 2026-05-19\n\n' +
      '3 visible items.\n\n' +
      'Top items:\n- [HIGH] Acme — Overdue task\n\n' +
      '— Local copy only. Not posted to Teams. Paste into Teams. ' +
      'You send the message manually.',
  });

  it.each([
    ['sent', /\bsent\b/i],
    ['delivered', /\bdelivered\b/i],
    ['synced', /\bsynced\b/i],
    ['notified', /\bnotified\b/i],
    ['Outlook connected', /Outlook\s+connected/i],
    ['email delivered', /email\s+delivered/i],
    ['connector-backed', /connector[- ]?backed/i],
    ['automated email', /automated\s+email/i],
    ['Graph connected', /Graph\s+connected/i],
  ])(
    'mailto + clipboard payloads never positively claim "%s"',
    (_label, pattern) => {
      // Strip the Phase 98/99/100 negation phrases inside the body
      // ("Not posted to Teams.") before checking forbidden positive
      // claims so a negation does not register.
      const stripped = out.clipboardText.replace(
        /Not posted to Teams\.?/g,
        '',
      );
      expect(stripped).not.toMatch(pattern);
      const urlStripped = out.mailtoUrl.replace(
        /Not%20posted%20to%20Teams\.?/g,
        '',
      );
      expect(urlStripped).not.toMatch(pattern);
    },
  );
});

describe('Phase 101 — module hygiene', () => {
  const source = readFileSync(
    resolve(__dirname, 'summaryOutlookHandoff.ts'),
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
  });

  it('reuses the Phase 63 emailHandoff helpers (does not redefine them)', () => {
    expect(source).toMatch(
      /from\s+['"]\.\.\/\.\.\/deals\/emailDelivery\/emailHandoff['"]/,
    );
    expect(source).not.toMatch(/function\s+buildMailtoUrl\b/);
    expect(source).not.toMatch(/function\s+buildHandoffClipboardText\b/);
  });

  it('source carries the verbatim Phase 101 brief copy phrases', () => {
    expect(source).toMatch(/Morning catch-up summary/);
    expect(source).toMatch(/Deal activity summary/);
    expect(source).toMatch(/Relationship snapshot/);
    expect(source).toMatch(/no borrower name on record/);
  });

  it('source never positively claims to send / deliver / sync / notify', () => {
    expect(source).not.toMatch(/we\s+send\b/i);
    expect(source).not.toMatch(/we\s+deliver\b/i);
    expect(source).not.toMatch(/we\s+sync\b/i);
    expect(source).not.toMatch(/we\s+notify\b/i);
    expect(source).not.toMatch(/Graph\.\w+/);
  });
});
