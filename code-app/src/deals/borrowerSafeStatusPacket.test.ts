import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DealDetail } from './dealQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import {
  buildBorrowerSafeStatusPacket,
  type BorrowerSafeStatusPacketContext,
} from './borrowerSafeStatusPacket';

/**
 * Phase 66 — borrower-safe status packet generator tests.
 *
 * The packet is generated locally and copied by the banker; it is
 * never written to Dataverse and never sent by the app. These tests
 * pin THREE concerns:
 *   1. derivation correctness — sections render the right counts +
 *      names from the inputs, with conservative phrasing.
 *   2. exclusion discipline — bank-internal fields the brief lists
 *      (risk, alerts, credit memo, profitability, audit ledger,
 *      collateral, pricing, underwriting conclusions, approval
 *      status) are NEVER referenced. The generator only reads
 *      borrower-safe inputs; this is asserted at the static-source
 *      level by checking the generator file does not import the
 *      modules that own those internal fields.
 *   3. conservative-copy discipline — the deterministic template
 *      text NEVER contains "approved", "denied", "cleared",
 *      "accepted", "validated", "final", "portal", "secure
 *      message", or "uploaded by borrower".
 */

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-77',
    name: 'Acme Working Capital',
    clientName: 'Acme Manufacturing, LLC',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-09-30T00:00:00Z',
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'Two personal',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 275,
    collateralSummary: 'A/R, inventory',
    createdOn: '2026-01-15T00:00:00Z',
    stageEntryDate: '2026-05-01T00:00:00Z',
    isClosed: false,
    ...overrides,
  };
}

function emptyDocs(): DealDocumentsResult {
  return { outstanding: [], received: [], reviewed: [] };
}

function fullDocs(): DealDocumentsResult {
  return {
    outstanding: [
      {
        id: 'd-1',
        name: 'Personal Financial Statement',
        dueDate: '2026-06-15T00:00:00Z',
        requestDate: '2026-05-12T00:00:00Z',
        receivedDate: undefined,
        reviewer: undefined,
        uploaded: false,
        modifiedOn: undefined,
        status: 'outstanding',
      },
      {
        id: 'd-2',
        name: 'YTD P&L',
        dueDate: undefined,
        requestDate: undefined,
        receivedDate: undefined,
        reviewer: undefined,
        uploaded: false,
        modifiedOn: undefined,
        status: 'outstanding',
      },
    ],
    received: [
      {
        id: 'd-3',
        name: 'Tax Returns 2024',
        dueDate: '2026-05-01T00:00:00Z',
        requestDate: '2026-04-10T00:00:00Z',
        receivedDate: '2026-05-10T00:00:00Z',
        reviewer: undefined,
        uploaded: true,
        modifiedOn: undefined,
        status: 'received',
      },
    ],
    reviewed: [
      {
        id: 'd-4',
        name: 'Articles of Organization',
        dueDate: '2026-04-15T00:00:00Z',
        requestDate: '2026-03-20T00:00:00Z',
        receivedDate: '2026-04-05T00:00:00Z',
        reviewer: 'M. Paller',
        uploaded: true,
        modifiedOn: undefined,
        status: 'reviewed',
      },
    ],
  };
}

function ctx(
  overrides: Partial<BorrowerSafeStatusPacketContext> = {},
): BorrowerSafeStatusPacketContext {
  return {
    deal: baseDeal(),
    documents: fullDocs(),
    bankerName: 'M. Paller',
    now: new Date('2026-05-15T12:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Subject + framing
// ---------------------------------------------------------------------------

describe('Phase 66 — buildBorrowerSafeStatusPacket: subject + framing', () => {
  it('subject names the deal', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    expect(pkt.subject).toBe('Status update — Acme Working Capital');
  });

  it('subject falls back to "your loan" when the deal has no name', () => {
    const pkt = buildBorrowerSafeStatusPacket(
      ctx({ deal: baseDeal({ name: '' }) }),
    );
    expect(pkt.subject).toBe('Status update — your loan');
  });

  it('body greets the client by name when available', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    expect(pkt.body).toContain('Hi Acme Manufacturing, LLC,');
  });

  it('body uses "Hi there," when client name is missing', () => {
    const pkt = buildBorrowerSafeStatusPacket(
      ctx({ deal: baseDeal({ clientName: undefined }) }),
    );
    expect(pkt.body).toContain('Hi there,');
  });

  it('body ends with the banker signoff', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    expect(pkt.body.endsWith('Thank you,\nM. Paller')).toBe(true);
  });

  it('body signs "Thank you," with no name when banker name is missing', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx({ bankerName: undefined }));
    expect(pkt.body.endsWith('Thank you,')).toBe(true);
    expect(pkt.body).not.toContain('\nundefined');
  });

  it('body labels the framing line "Last updated:" with the supplied date', () => {
    const pkt = buildBorrowerSafeStatusPacket(
      ctx({ now: new Date('2026-05-15T12:00:00Z') }),
    );
    expect(pkt.body).toMatch(/Last updated: [A-Z][a-z]+ \d{1,2}, 2026\./);
  });

  it('body contains the working-summary disclaimer (no "final", no "decision-claim")', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    expect(pkt.body).toContain(
      'This is a working summary from our records.',
    );
    expect(pkt.body).toContain('please confirm details with your banker');
  });
});

// ---------------------------------------------------------------------------
// 2. Section derivation
// ---------------------------------------------------------------------------

describe('Phase 66 — section derivation', () => {
  it('renders "Items requested (N):" with each outstanding name', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    expect(pkt.body).toContain('Items requested (2):');
    expect(pkt.body).toContain('- Personal Financial Statement');
    expect(pkt.body).toContain('- YTD P&L');
  });

  it('appends due-date + requested-on metadata when present', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    expect(pkt.body).toMatch(
      /- Personal Financial Statement \(due [A-Z][a-z]+ \d{1,2}, 2026\) — requested on [A-Z][a-z]+ \d{1,2}, 2026/,
    );
  });

  it('omits date metadata when the underlying field is missing', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    // YTD P&L has no due / request date in fullDocs(). The line is
    // the bare name without parenthetical metadata.
    const ytdLine = pkt.body
      .split('\n')
      .find((line) => line.includes('YTD P&L'));
    expect(ytdLine).toBeDefined();
    expect(ytdLine).not.toMatch(/\bdue\b/i);
    expect(ytdLine).not.toMatch(/\brequested on\b/i);
  });

  it('renders "Items received (N):" with received-on metadata', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    expect(pkt.body).toContain('Items received (1):');
    expect(pkt.body).toMatch(
      /- Tax Returns 2024 — received on [A-Z][a-z]+ \d{1,2}, 2026/,
    );
  });

  it('renders "Items under bank review (N):" with names only (no reviewer)', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    expect(pkt.body).toContain('Items under bank review (1):');
    expect(pkt.body).toContain('- Articles of Organization');
    // Reviewer name is INTERNAL — the section must not leak who
    // reviewed the doc.
    const reviewLine = pkt.body
      .split('\n')
      .find((line) => line.includes('Articles of Organization'));
    expect(reviewLine).not.toMatch(/reviewer|reviewed by/i);
  });

  it('renders "Next requested actions:" with "Please send: <name>" lines', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    expect(pkt.body).toContain('Next requested actions:');
    expect(pkt.body).toContain('Please send: Personal Financial Statement');
    expect(pkt.body).toContain('Please send: YTD P&L');
  });

  it('zero-state: empty outstanding → "No outstanding items at this time."', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx({ documents: emptyDocs() }));
    expect(pkt.body).toContain('Items requested (0):');
    expect(pkt.body).toContain('No outstanding items at this time.');
    expect(pkt.body).toContain('No items requested at this time.');
  });

  it('zero-state: empty received → "Nothing received yet."', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx({ documents: emptyDocs() }));
    expect(pkt.body).toContain('Nothing received yet.');
  });

  it('zero-state: empty reviewed → "Nothing under review at this time."', () => {
    const pkt = buildBorrowerSafeStatusPacket(ctx({ documents: emptyDocs() }));
    expect(pkt.body).toContain('Nothing under review at this time.');
  });

  it('caps each section at 25 items and notes the overflow', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `d-${i}`,
      name: `Doc ${i}`,
      dueDate: undefined,
      requestDate: undefined,
      receivedDate: undefined,
      reviewer: undefined,
      uploaded: false,
      modifiedOn: undefined,
      status: 'outstanding' as const,
    }));
    const pkt = buildBorrowerSafeStatusPacket(
      ctx({
        documents: { outstanding: many, received: [], reviewed: [] },
      }),
    );
    expect(pkt.body).toContain('Items requested (40):');
    expect(pkt.body).toContain('Doc 0');
    expect(pkt.body).toContain('Doc 24');
    expect(pkt.body).not.toContain('Doc 25');
    expect(pkt.body).toContain('…and 15 more.');
  });
});

// ---------------------------------------------------------------------------
// 3. Borrower-safe exclusion — bank-internal content does NOT appear
// ---------------------------------------------------------------------------

describe('Phase 66 — borrower-safe exclusion', () => {
  it('does NOT mention pricing margin, collateral summary, customer type, or product type', () => {
    // Build a deal whose internal fields contain distinctive strings;
    // assert the packet body NEVER quotes those strings.
    const internal = baseDeal({
      collateralSummary:
        'SECRET COLLATERAL: lien on equipment + ABL borrowing base',
      productType: 'SECRET-PRODUCT-RLOC-A1',
      loanStructure: 'SECRET-STRUCTURE-Senior Secured',
      customerType: 'SECRET-CUSTOMER-TYPE',
      industry: 'SECRET-INDUSTRY',
      guarantorStructure: 'SECRET-GUARANTOR',
      pricingType: 'SECRET-PRICING',
      spreadIndex: 'SECRET-INDEX',
      spreadMargin: 99999,
    });
    const pkt = buildBorrowerSafeStatusPacket(ctx({ deal: internal }));
    expect(pkt.body).not.toContain('SECRET');
    expect(pkt.body).not.toContain('99999');
    expect(pkt.body).not.toContain('collateral');
    expect(pkt.body).not.toContain('margin');
    expect(pkt.body).not.toContain('SOFR');
  });

  it('does NOT mention amount, banker assignment, target close date, or stage entry date', () => {
    // The brief excludes internal task assignments, audit data, etc.
    // It does NOT explicitly forbid the amount — but the borrower
    // already knows their own loan amount, so the conservative call
    // is to omit it from this artifact. Pin that conservative
    // posture.
    const pkt = buildBorrowerSafeStatusPacket(ctx());
    expect(pkt.body).not.toContain('4500000');
    expect(pkt.body).not.toContain('4,500,000');
    expect(pkt.body).not.toContain('targetClose');
    // The deal's stage IS bank-internal classification. The packet
    // does not surface it (the borrower experiences stages as opaque
    // bank-internal progress).
    expect(pkt.body).not.toMatch(/\bUnderwriting\b/);
    expect(pkt.body).not.toMatch(/\bstageEntry\b/i);
  });

  it('static-source: generator does NOT import any internal-data module', () => {
    // The exclusion is enforced structurally: the generator's source
    // file must not pull in credit memo, alert, profitability,
    // audit, or task-action modules. Static-source assertion so a
    // future edit that adds the wrong import fails CI.
    // The source file is co-located with this test.
    const src = readFileSync(
      resolve(__dirname, 'borrowerSafeStatusPacket.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/from\s+['"][^'"]*creditMemo/i);
    expect(src).not.toMatch(/from\s+['"][^'"]*alert/i);
    expect(src).not.toMatch(/from\s+['"][^'"]*profitability/i);
    expect(src).not.toMatch(/from\s+['"][^'"]*audit/i);
    expect(src).not.toMatch(/from\s+['"][^'"]*dealTaskActions/i);
    expect(src).not.toMatch(/from\s+['"][^'"]*dealTaskQueries/i);
    expect(src).not.toMatch(/from\s+['"][^'"]*activityQueries/i);
    expect(src).not.toMatch(/from\s+['"][^'"]*dataQuality/i);
    // The generator MUST be pure: no SDK service import, no
    // power-apps package import.
    expect(src).not.toMatch(/from\s+['"][^'"]*generated\/services/i);
    expect(src).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
  });
});

// ---------------------------------------------------------------------------
// 4. Conservative-copy: forbidden phrases never appear in template text
// ---------------------------------------------------------------------------

describe('Phase 66 — conservative-copy discipline', () => {
  // Inputs that try to coax the generator into emitting a forbidden
  // term. The doc names + client name are deliberately neutral; the
  // assertions below pin that the GENERATOR'S OWN TEMPLATE TEXT does
  // not include any forbidden phrase. We can't control what a banker
  // types into a document name — but the templates we DO control must
  // never include these terms.
  const neutralCtx = ctx({
    deal: baseDeal({ clientName: 'Acme Co' }),
    documents: {
      outstanding: [
        {
          id: 'd-1',
          name: 'Bank statements',
          dueDate: undefined,
          requestDate: undefined,
          receivedDate: undefined,
          reviewer: undefined,
          uploaded: false,
          modifiedOn: undefined,
          status: 'outstanding',
        },
      ],
      received: [],
      reviewed: [],
    },
  });

  const FORBIDDEN_TERMS: readonly string[] = [
    'approved',
    'denied',
    'cleared',
    'accepted',
    'validated',
    'final',
    'portal',
    'secure message',
    'uploaded by borrower',
  ];

  for (const term of FORBIDDEN_TERMS) {
    it(`never uses "${term}" in the generated packet`, () => {
      const pkt = buildBorrowerSafeStatusPacket(neutralCtx);
      const combined = `${pkt.subject}\n${pkt.body}`;
      const re = new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}\\b`, 'i');
      expect(
        re.test(combined),
        `forbidden term "${term}" appeared in packet: ${combined}`,
      ).toBe(false);
    });
  }

  it('uses the canonical Phase 66 section labels verbatim', () => {
    const pkt = buildBorrowerSafeStatusPacket(neutralCtx);
    expect(pkt.body).toMatch(/^Items requested \(/m);
    expect(pkt.body).toMatch(/^Items received \(/m);
    expect(pkt.body).toMatch(/^Items under bank review \(/m);
    expect(pkt.body).toMatch(/^Next requested actions:/m);
  });

  it('never claims the email was sent / delivered (Phase 23 + 45 discipline)', () => {
    const pkt = buildBorrowerSafeStatusPacket(neutralCtx);
    expect(pkt.body).not.toMatch(/\bemail (sent|delivered)\b/i);
    expect(pkt.body).not.toMatch(/\bsent\s+(an?\s+)?email\b/i);
    expect(pkt.body).not.toMatch(/\bnotification\b/i);
  });

  it('never implies a borrower portal / upload affordance', () => {
    const pkt = buildBorrowerSafeStatusPacket(neutralCtx);
    expect(pkt.body).not.toMatch(/\bportal\b/i);
    expect(pkt.body).not.toMatch(/\bsign in\b/i);
    expect(pkt.body).not.toMatch(/\blogin\b/i);
    expect(pkt.body).not.toMatch(/\bupload (the|a|your)\b/i);
    expect(pkt.body).not.toMatch(/\bclick to upload\b/i);
    expect(pkt.body).not.toMatch(/\bdrag (and )?drop\b/i);
  });
});
