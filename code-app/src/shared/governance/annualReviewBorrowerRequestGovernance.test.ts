import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { resolveAnnualReviewBorrowerRequestRecipients } from '../../annualReview/resolveAnnualReviewBorrowerRequestRecipients';
import { deriveAnnualReviewRequestFeatureFlagState } from '../../annualReview/annualReviewRequestFeatureFlags';
import { createEmptyCrmMaster, type CrmMaster } from '../../shared/crm/crmTypes';

/**
 * Phase 141M — Annual review borrower request governance.
 *
 * Pins the workflow safety contract: no outreach primitives, no upload-link
 * generation, no send/approve-and-send state, no sent status, safeForSend always
 * false, no CRM/Dataverse writes, no direct fetch in components, no fake data,
 * masked contacts, and fail-closed authorization.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/annualReview/annualReviewBorrowerRequestTypes.ts',
  'src/annualReview/annualReviewRequestFeatureFlags.ts',
  'src/annualReview/resolveAnnualReviewBorrowerRequestRecipients.ts',
  'src/annualReview/buildAnnualReviewBorrowerRequestPackage.ts',
  'src/annualReview/buildAnnualReviewBorrowerRequestDraft.ts',
  'src/annualReview/deriveAnnualReviewBorrowerRequestWorkflow.ts',
  'src/annualReview/AnnualReviewBorrowerRequestPanel.tsx',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  isComponent: rel.endsWith('.tsx'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

const LOAN = 'LOAN-1';
function viableMaster(over: Partial<{ doNotContact: boolean; noAuth: boolean }> = {}): CrmMaster {
  return {
    ...createEmptyCrmMaster(),
    organizations: [{ orgId: 'ORG1', legalName: 'Synthetic Org', orgType: 'customer', status: 'active' }],
    people: [{ personId: 'P1', fullName: 'Synthetic Contact', orgId: 'ORG1', personType: 'customer_contact', status: 'active', doNotContact: over.doNotContact }],
    contactPoints: [{ contactPointId: 'CP1', ownerType: 'person', ownerId: 'P1', channel: 'email', value: 'present', isPrimary: true, verified: true }],
    relationships: [{ relationshipId: 'R1', fromEntityType: 'organization', fromEntityId: 'ORG1', toEntityType: 'person', toEntityId: 'P1', relationshipType: 'borrower', loanId: LOAN }],
    contactAuthorizations: over.noAuth ? [] : [{ authId: 'A1', personId: 'P1', authType: 'financial_disclosure' }],
  };
}

describe('Phase 141M — files exist', () => {
  for (const rel of ['docs/PHASE_141M_ANNUAL_REVIEW_BORROWER_REQUEST_WORKFLOW.md', ...PROD_FILES]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 141M — no outreach / no upload-link generation in source', () => {
  it('no email / SMS / Twilio / mailto primitives', () => {
    const hits = SOURCES.filter((f) => /\b(sendEmail|SendEmailV2|sendSms|twilio)\b|mailto:/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no upload-link generation', () => {
    const hits = SOURCES.filter((f) => /\b(generateUploadLink|createUploadLink|uploadLinkUrl|makeUploadLink)\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no sent status / approve-and-send state', () => {
    const hits = SOURCES.filter((f) => /['"]sent['"]|approved_and_sent|approveAndSend/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('safeForSend is only ever written as false', () => {
    for (const f of SOURCES) {
      expect(f.code).not.toMatch(/safeForSend:\s*true/);
    }
  });
});

describe('Phase 141M — no CRM / Dataverse writes; no fetch in components', () => {
  it('no write verbs (createRecord/updateRecord/deleteRecord/POST/PATCH/DELETE)', () => {
    const hits = SOURCES.filter((f) =>
      /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no direct fetch / Dataverse SDK in React components', () => {
    const hits = SOURCES.filter(
      (f) => f.isComponent && (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /@microsoft\/power-apps/.test(f.code) || /Cr664_\w+Service/.test(f.code)),
    );
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('the panel has no send / button affordance', () => {
    const panel = SOURCES.find((f) => f.isComponent)!;
    expect(panel.code).not.toMatch(/<button/i);
    expect(panel.code).not.toMatch(/onClick/);
  });
});

describe('Phase 141M — no fake borrower / contact data', () => {
  it('no sample emails / phones / dollar literals', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
    }
    expect(hits).toEqual([]);
  });

  it('no placeholder names', () => {
    const NAMES = [/\bAcme\b/i, /\bJohn\s+Smith\b/i, /\bContoso\b/i, /\bFabrikam\b/i];
    const hits: string[] = [];
    for (const f of SOURCES) for (const re of NAMES) if (re.test(f.code)) hits.push(f.rel);
    expect(hits).toEqual([]);
  });

  it('App.tsx registers no borrower-request route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/AnnualReviewBorrowerRequestPanel/);
  });
});

describe('Phase 141M — behavioral safety: masked, fail-closed, send off', () => {
  it('contact values are masked and safeForSend is always false', () => {
    const r = resolveAnnualReviewBorrowerRequestRecipients({ master: viableMaster(), loanId: LOAN, enabled: true, asOfDate: '2026-06-08' });
    expect(r.selectedContactValueMasked).toBe('•••@•••');
    expect(r.safeForSend).toBe(false);
    expect(JSON.stringify(r)).not.toContain('present');
  });

  it('do-not-contact blocks draft readiness', () => {
    const r = resolveAnnualReviewBorrowerRequestRecipients({ master: viableMaster({ doNotContact: true }), loanId: LOAN, enabled: true, asOfDate: '2026-06-08' });
    expect(r.decision).toBe('blocked_do_not_contact');
    expect(r.safeForDraft).toBe(false);
  });

  it('missing authorization blocks draft readiness', () => {
    const r = resolveAnnualReviewBorrowerRequestRecipients({ master: viableMaster({ noAuth: true }), loanId: LOAN, enabled: true, asOfDate: '2026-06-08' });
    expect(r.decision).toBe('blocked_no_authorized_contact');
    expect(r.safeForDraft).toBe(false);
  });

  it('the feature flags keep send + upload-link generation off', () => {
    const s = deriveAnnualReviewRequestFeatureFlagState({ sendEnabled: true, uploadLinkGenerationEnabled: true });
    expect(s.ANNUAL_REVIEW_BORROWER_REQUEST_SEND_ENABLED).toBe(false);
    expect(s.ANNUAL_REVIEW_UPLOAD_LINK_GENERATION_ENABLED).toBe(false);
  });
});
