import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { deriveServicingLifecycleStage } from '../../servicing/deriveServicingLifecycleStage';
import { deriveServicingCollateralSecurityStatus } from '../../servicing/deriveServicingCollateralSecurityStatus';
import { deriveServicingInsuranceTicklerStatus } from '../../servicing/deriveServicingInsuranceTicklerStatus';
import { deriveServicingCovenantReportingStatus } from '../../servicing/deriveServicingCovenantReportingStatus';
import { deriveServicingMaturityRenewalStatus } from '../../servicing/deriveServicingMaturityRenewalStatus';
import { deriveServicingLifecycleSnapshot } from '../../servicing/deriveServicingLifecycleSnapshot';

/**
 * Phase 142E — servicing / lifecycle governance.
 *
 * Pins the read-only, metadata/deriver-driven contract: NO payment posting,
 * disbursement, accounting entry, repayment-schedule mutation, loan booking /
 * closing / transfer, stage change, task creation, tickler update, covenant
 * waiver, credit approval, borrower outreach, upload-link / email / SMS, CRM /
 * Dataverse write, or fetch in components. NO fake balances / payment /
 * collateral data. NOTE: the model deliberately names disabled capabilities as
 * structural fields (`readOnly: true`, `containsFakeBalance: false`,
 * `containsPaymentPosting: false`) — scans target EXECUTION patterns, not these.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/servicing/servicingLifecycleTypes.ts',
  'src/servicing/deriveServicingLifecycleStage.ts',
  'src/servicing/deriveServicingObligations.ts',
  'src/servicing/deriveServicingCollateralSecurityStatus.ts',
  'src/servicing/deriveServicingInsuranceTicklerStatus.ts',
  'src/servicing/deriveServicingCovenantReportingStatus.ts',
  'src/servicing/deriveServicingMaturityRenewalStatus.ts',
  'src/servicing/deriveServicingLifecycleSnapshot.ts',
  'src/servicing/ServicingLifecyclePanel.tsx',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  isComponent: rel.endsWith('.tsx'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

describe('Phase 142E — files exist', () => {
  for (const rel of ['docs/PHASE_142E_SERVICING_LIFECYCLE_MODEL.md', ...PROD_FILES]) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142E — no money / accounting / schedule / booking execution', () => {
  it('panels have no button / onClick mutation control', () => {
    for (const c of SOURCES.filter((f) => f.isComponent)) {
      expect(c.code).not.toMatch(/<button/i);
      expect(c.code).not.toMatch(/onClick/);
    }
  });

  it('no payment posting / disbursement / accounting-entry execution', () => {
    const hits = SOURCES.filter((f) => /\b(postPayment|applyPayment|disburse|disburseFunds|postEntry|postJournal|postAccounting)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no repayment-schedule mutation execution', () => {
    const hits = SOURCES.filter((f) => /\b(generateSchedule|mutateSchedule|updateSchedule|rebuildSchedule|amortize)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no loan booking / closing / transfer / stage change execution', () => {
    const hits = SOURCES.filter((f) => /\b(bookLoan|closeLoan|transferLoan|boardLoan|changeStage|updateStage|moveStage)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no task creation / tickler update / covenant waiver / credit approval execution', () => {
    const hits = SOURCES.filter((f) => /\b(createTask|addTask|updateTickler|createTickler|waiveCovenant|grantWaiver|approveCredit|declineCredit)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 142E — no outreach / writes / fetch / fake data', () => {
  it('no borrower outreach / upload-link / email / SMS execution', () => {
    const hits = SOURCES.filter((f) => /\b(sendEmail|sendSms|sendBorrower|generateUploadLink|createUploadLink|sendRequest)\s*\(|mailto:|twilio/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / Dataverse SDK in React components', () => {
    const hits = SOURCES.filter((f) => f.isComponent && (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /@microsoft\/power-apps/.test(f.code)));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fabricated balances / payments / collateral value / LTV', () => {
    const hits = SOURCES.filter((f) => /containsFakeBalance:\s*true|containsPaymentPosting:\s*true|\bltv\s*=|appraisedValue\s*=/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no sample emails / phones / dollar literals / external URLs / placeholder names', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
      if (/https?:\/\//.test(f.code)) hits.push(`${f.rel} url`);
      if (/\bAcme\b|\bContoso\b|\bJohn\s+Smith\b/i.test(f.code)) hits.push(`${f.rel} name`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx registers no servicing lifecycle panel route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/ServicingLifecyclePanel/);
  });
});

describe('Phase 142E — behavioral: read-only, missing-means-missing', () => {
  const AS_OF = '2026-06-09';

  function snapshot() {
    const input = { lifecycleId: 'L1', asOfDate: AS_OF, boardedLoan: { verified: true } } as const;
    const { insuranceStatus, ticklerStatus } = deriveServicingInsuranceTicklerStatus({ insurance: { accepted: true, evidencePresent: true, expirationDate: '2027-01-01' }, ticklers: [], asOfDate: AS_OF });
    return deriveServicingLifecycleSnapshot({
      input, stage: deriveServicingLifecycleStage(input), obligations: [],
      collateralSecurityStatus: deriveServicingCollateralSecurityStatus({ collateralItems: [{ collateralId: 'CL1', hasEvidence: true, perfected: true }] }),
      insuranceStatus, ticklerStatus,
      covenantReportingStatus: deriveServicingCovenantReportingStatus({ covenantResults: [{ covenantId: 'C1', status: 'pass' }] }),
      maturityRenewalStatus: deriveServicingMaturityRenewalStatus({ maturityDate: '2030-01-01', asOfDate: AS_OF }),
    });
  }

  it('the snapshot audit summary is read-only and posts no balances / payments', () => {
    const s = snapshot();
    expect(s.auditSummary.readOnly).toBe(true);
    expect(s.auditSummary.containsFakeBalance).toBe(false);
    expect(s.auditSummary.containsPaymentPosting).toBe(false);
  });

  it('missing collateral / insurance context stays missing (no fabrication)', () => {
    expect(deriveServicingCollateralSecurityStatus({}).status).toBe('unknown_missing_data');
    const { insuranceStatus } = deriveServicingInsuranceTicklerStatus({ asOfDate: AS_OF });
    expect(insuranceStatus.status).toBe('unknown_missing_data');
  });

  it('the snapshot serializes no waiver / approval / send / money language', () => {
    expect(JSON.stringify(snapshot())).not.toMatch(/\bwaive\b|approveCredit|sendEmail|mailto:|postPayment|disburse/i);
  });
});
