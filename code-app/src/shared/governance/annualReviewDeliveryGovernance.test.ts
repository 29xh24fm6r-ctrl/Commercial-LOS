import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { resolveAnnualReviewDeliveryAdapters, type AnnualReviewDeliveryFacadeInput } from '../../annualReview/resolveAnnualReviewDeliveryAdapters';
import { deriveAnnualReviewDeliveryFeatureFlagState } from '../../annualReview/annualReviewDeliveryFeatureFlags';
import type { AnnualReviewBorrowerRequestRecipientDecision, AnnualReviewBorrowerRequestPackage } from '../../annualReview/annualReviewBorrowerRequestTypes';

/**
 * Phase 141N — borrower delivery adapter seam governance.
 *
 * Pins the delivery safety contract: no live upload-link / token / URL, no email
 * provider (SendEmailV2 / Graph / Office365 / Gmail / SMTP / mailto), no SMS
 * provider (Twilio), no raw contact in audit, no send button / sent state,
 * attemptDelivery blocked by default, dry-run-only + send-off defaults, no
 * fetch in components, no CRM/Dataverse writes, no fake data.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/annualReview/annualReviewDeliveryFeatureFlags.ts',
  'src/annualReview/annualReviewDeliveryTypes.ts',
  'src/annualReview/validateAnnualReviewDeliveryRequest.ts',
  'src/annualReview/annualReviewUploadLinkAdapter.ts',
  'src/annualReview/annualReviewEmailDeliveryAdapter.ts',
  'src/annualReview/annualReviewSmsDeliveryAdapter.ts',
  'src/annualReview/resolveAnnualReviewDeliveryAdapters.ts',
  'src/annualReview/buildAnnualReviewDeliveryAuditSummary.ts',
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

function readyDecision(): AnnualReviewBorrowerRequestRecipientDecision {
  return {
    selectedRecipientId: 'P1', selectedDisplayName: 'Synthetic Contact', selectedContactPointId: 'CP1', selectedContactValueMasked: '•••@•••',
    decision: 'ready_for_human_approval', confidence: 'high', blockers: [], warnings: [], requiresHumanSelection: false, safeForDraft: true, safeForSend: false,
    candidates: [{ candidateId: 'P1', personId: 'P1', organizationId: 'ORG1', displayName: 'Synthetic Contact', roleTypes: ['borrower_contact'], contactPoints: [{ contactPointId: 'CP1', channel: 'email', masked: '•••@•••', usable: true }], authorizationFlags: { financialRequests: true, uploadLinks: true, loanNotices: true }, communicationPreferences: { doNotContact: false, restrictedUse: false, prohibitedMethods: [] }, source: 'crm', confidence: 'high', blockers: [], warnings: [] }],
  };
}
const PKG = { packageId: 'p', annualReviewId: 'AR1', borrowerName: 'Synthetic Borrower', requestItems: [], recipientDecision: readyDecision(), approvalState: 'draft_only', deliveryMode: 'draft_preview', status: 'draft_only', blockers: [], auditSummary: { itemCount: 0, containsContactValue: false, redactedFields: [] } } as unknown as AnnualReviewBorrowerRequestPackage;
function facadeInput(): AnnualReviewDeliveryFacadeInput {
  return { request: { channel: 'email', intent: 'annual_review_financial_request', annualReviewId: 'AR1' }, package: PKG, recipientDecision: readyDecision(), approval: { state: 'approved_not_sent' } };
}

describe('Phase 141N — files exist', () => {
  for (const rel of ['docs/PHASE_141N_BORROWER_DELIVERY_ADAPTER_SEAMS.md', ...PROD_FILES]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 141N — no live link / provider / outreach primitives in source', () => {
  it('no live URL or upload token generation', () => {
    const hits = SOURCES.filter((f) => /https?:\/\/|\b(uploadToken|generateToken|randomUUID|randomBytes|secureUploadUrl)\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no email provider (SendEmailV2 / Graph / Office365 / Gmail / SMTP / mailto)', () => {
    const hits = SOURCES.filter((f) => /SendEmailV2|graph\.microsoft|office365|\bgmail\b|\bsmtp\b|mailto:/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no SMS provider (Twilio / messaging gateway)', () => {
    const hits = SOURCES.filter((f) => /\b(twilio|messagebird|nexmo|vonage|plivo)\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no sent / delivered / failed-delivery terminal state', () => {
    const hits = SOURCES.filter((f) => /['"]sent['"]|['"]delivered['"]|failed_delivery/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 141N — no writes / no fetch in components / no fake data', () => {
  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / Dataverse SDK in React components', () => {
    const hits = SOURCES.filter((f) => f.isComponent && (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /@microsoft\/power-apps/.test(f.code)));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('the panel has no send button / approve-and-send', () => {
    const panel = SOURCES.find((f) => f.isComponent)!;
    expect(panel.code).not.toMatch(/<button/i);
    expect(panel.code).not.toMatch(/onClick/);
    expect(panel.code.toLowerCase()).not.toContain('approve and send');
  });

  it('no sample emails / phones / dollar literals / placeholder names', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
      if (/\bAcme\b|\bJohn\s+Smith\b|\bContoso\b|\bFabrikam\b/i.test(f.code)) hits.push(`${f.rel} name`);
    }
    expect(hits).toEqual([]);
  });
});

describe('Phase 141N — behavioral: blocked by default, masked, redacted', () => {
  it('the resolver returns disabled adapters and attemptDelivery is blocked by default', () => {
    const set = resolveAnnualReviewDeliveryAdapters();
    expect(set.uploadLinkAdapter.enabled).toBe(false);
    expect(set.emailAdapter.enabled).toBe(false);
    expect(set.smsAdapter.enabled).toBe(false);
    const r = set.attemptDelivery('email', facadeInput());
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
  });

  it('the default flags keep send off and dry-run on', () => {
    const f = deriveAnnualReviewDeliveryFeatureFlagState();
    expect(f.ANNUAL_REVIEW_DELIVERY_SEND_ENABLED).toBe(false);
    expect(f.ANNUAL_REVIEW_DELIVERY_DRY_RUN_ONLY).toBe(true);
    expect(f.ANNUAL_REVIEW_DELIVERY_APPROVAL_REQUIRED).toBe(true);
  });

  it('previews mask the contact and carry no raw phone/email/token/url', () => {
    const set = resolveAnnualReviewDeliveryAdapters();
    const r = set.previewDelivery('email', facadeInput());
    const serialized = JSON.stringify(r);
    expect(serialized).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(serialized).not.toMatch(/https?:\/\//);
  });

  it('App.tsx registers no delivery route / panel', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/AnnualReviewBorrowerRequestPanel|annualReviewDelivery/i);
  });
});
