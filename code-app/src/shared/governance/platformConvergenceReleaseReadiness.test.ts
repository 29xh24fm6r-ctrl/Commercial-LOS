import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

/**
 * Phase 142T — platform convergence release readiness certification.
 *
 * Certification / governance only — no runtime feature is added. This test pins
 * that the Phase 142J–142S convergence stack remains a no-live-action, no-write,
 * disabled/read-only platform layer: required docs exist, the certification doc
 * states the required guarantees, the production source contains no prohibited
 * execution patterns, and the disabled/read-only result booleans are present.
 *
 * NOTE: only PRODUCTION source files are scanned for execution patterns (never
 * docs or test files), and the inline content-safety REGEX LITERALS (e.g.
 * `eval\\s*\\(`) do not match the execution scans because they carry escapes, not
 * literal calls — exactly as the per-phase governance tests already prove.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// ── Production source files for the Phase 142J–142S convergence stack ────────
const CONVERGENCE_PROD_FILES: readonly string[] = [
  // 142J — admin configuration persistence adapter
  'src/adminConfig/adminConfigurationPersistenceTypes.ts',
  'src/adminConfig/adminConfigurationDataverseSchemaPlan.ts',
  'src/adminConfig/deriveAdminConfigurationSchemaReadiness.ts',
  'src/adminConfig/adminConfigurationPersistenceMapper.ts',
  'src/adminConfig/adminConfigurationPersistenceAdapter.ts',
  'src/adminConfig/createDisabledAdminConfigurationPersistenceAdapter.ts',
  'src/adminConfig/createAdminConfigurationDataversePersistenceAdapter.ts',
  'src/adminConfig/adminConfigurationPersistenceFeatureFlags.ts',
  'src/adminConfig/resolveAdminConfigurationPersistenceAdapter.ts',
  'src/adminConfig/AdminConfigurationPersistenceReadinessPanel.tsx',
  // 142K — admin configuration controlled apply workflow
  'src/adminConfig/adminConfigurationApplyTypes.ts',
  'src/adminConfig/deriveAdminConfigurationApplyReadiness.ts',
  'src/adminConfig/buildAdminConfigurationApplyPlan.ts',
  'src/adminConfig/createAdminConfigurationControlledApplyEngine.ts',
  'src/adminConfig/adminConfigurationApplyFeatureFlags.ts',
  'src/adminConfig/deriveAdminConfigurationApplyWorkflow.ts',
  'src/adminConfig/AdminConfigurationApplyPreviewPanel.tsx',
  // 142L — fake integration transport proof harness
  'src/adminConfig/adminConfigurationTransport.ts',
  // 142M — credit committee package review queue
  'src/committee/creditCommitteePackageQueue.ts',
  'src/committee/CreditCommitteePackageReviewQueuePanel.tsx',
  // 142N — package export seam
  'src/committee/creditPackageExportAdapter.ts',
  'src/committee/CreditPackageExportPanel.tsx',
  // 142O — PandaDoc e-sign seam
  'src/committee/eSignEnvelopeAdapter.ts',
  'src/committee/ESignEnvelopePanel.tsx',
  // 142P — core banking lookup seam
  'src/integrations/coreBanking/coreBankingLookupAdapter.ts',
  'src/integrations/coreBanking/CoreBankingLookupPanel.tsx',
  // 142Q — AML/KYC and credit bureau policy gate
  'src/integrations/policyGates/amlKycCreditBureauPolicyGate.ts',
  'src/integrations/policyGates/AmlKycCreditBureauPolicyGatePanel.tsx',
  // 142R — servicing lifecycle read-only mapper
  'src/servicing/servicingLifecycleMapper.ts',
  'src/servicing/ServicingLifecycleMapperPanel.tsx',
  // 142S — profitability / ROE availability model
  'src/executive/productProfitabilityAvailabilityModel.ts',
  'src/executive/ProductProfitabilityAvailabilityPanel.tsx',
];

const PHASE_DOCS: readonly string[] = [
  'docs/PHASE_142J_ADMIN_CONFIGURATION_PERSISTENCE_ADAPTER.md',
  'docs/PHASE_142K_ADMIN_CONFIGURATION_CONTROLLED_APPLY_WORKFLOW.md',
  'docs/PHASE_142L_INTEGRATION_TRANSPORT_PROOF_HARNESS.md',
  'docs/PHASE_142M_CREDIT_COMMITTEE_PACKAGE_REVIEW_QUEUE.md',
  'docs/PHASE_142N_LIVE_PACKAGE_EXPORT_ADAPTER_SEAM.md',
  'docs/PHASE_142O_ESIGN_ENVELOPE_ADAPTER_SEAM.md',
  'docs/PHASE_142P_CORE_BANKING_READ_ONLY_LOOKUP_ADAPTER.md',
  'docs/PHASE_142Q_AML_KYC_CREDIT_BUREAU_POLICY_GATE.md',
  'docs/PHASE_142R_SERVICING_LIFECYCLE_READ_ONLY_DATAVERSE_MAPPER.md',
  'docs/PHASE_142S_EXECUTIVE_PRODUCT_PROFITABILITY_ROE_AVAILABILITY_MODEL.md',
];

const CERT_DOC = 'docs/PHASE_142T_PLATFORM_CONVERGENCE_RELEASE_READINESS_CERTIFICATION.md';

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = CONVERGENCE_PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  raw: readFileSync(resolve(REPO_ROOT, rel), 'utf8'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

const ALL_RAW = SOURCES.map((s) => s.raw).join('\n');

// ── 1. Required docs exist ───────────────────────────────────────────────────
describe('Phase 142T — required docs exist', () => {
  for (const rel of [CERT_DOC, ...PHASE_DOCS, 'src/shared/governance/platformConvergenceReleaseReadiness.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
  for (const rel of CONVERGENCE_PROD_FILES) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

// ── 2. Certification doc contains required phrases ───────────────────────────
describe('Phase 142T — certification doc contains required guarantees', () => {
  const doc = readFileSync(resolve(REPO_ROOT, CERT_DOC), 'utf8');
  const REQUIRED: ReadonlyArray<[string, RegExp]> = [
    ['no-live-action', /no-live-action/i],
    ['no-write', /no-write/i],
    ['disabled/read-only', /disabled\s*\/\s*read-only/i],
    ['no Dataverse/CRM writes', /no Dataverse\s*\/\s*CRM writes/i],
    ['no external calls', /no live external calls|no external calls/i],
    ['no schema mutation', /no schema mutation/i],
    ['no permission widening', /no permission widening/i],
    ['no voting', /no voting/i],
    ['no credit decisioning', /no credit decisioning/i],
    ['no money movement', /no money movement/i],
    ['no fake success', /no fake success/i],
    ['live activation prerequisites', /live.?activation prerequisites/i],
    ['explicit non-certifications', /explicit non-certifications/i],
  ];
  for (const [label, rx] of REQUIRED) {
    it(`mentions ${label}`, () => {
      expect(doc).toMatch(rx);
    });
  }
});

// ── 3. Cross-stack source scan (production source only) ──────────────────────
describe('Phase 142T — cross-stack source has no prohibited execution patterns', () => {
  it('no fetch / XMLHttpRequest / axios', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no POST / PATCH / PUT / DELETE method string', () => {
    const hits = SOURCES.filter((f) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]|\b(POST|PATCH|PUT|DELETE)\b\s*:/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Graph / Outlook / Power Automate', () => {
    const hits = SOURCES.filter((f) => /\bGraph\b|\bOutlook\b|power[\s_-]?automate/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no sendMail / webhook registration', () => {
    const hits = SOURCES.filter((f) => /\bsendMail\s*\(|registerWebhook\s*\(|createWebhook\s*\(|subscribeWebhook\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no PandaDoc / provider token / secret / env var', () => {
    const hits = SOURCES.filter((f) => /process\.env|PANDADOC[_A-Z]*\s*[:=]|(api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*['"][^'"]+['"]/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no Dataverse create / update / upsert / delete call', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord|upsert\w*)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no eval / Function constructor', () => {
    const hits = SOURCES.filter((f) => /\beval\s*\(|new\s+Function\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no external URL', () => {
    const hits = SOURCES.filter((f) => /https?:\/\//.test(f.raw));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

// ── 4. Disabled / read-only result contract scan ─────────────────────────────
describe('Phase 142T — disabled/read-only result contracts are present', () => {
  const REQUIRED_BOOLEANS: readonly string[] = [
    'liveExportPerformed: false',
    'externalDeliveryPerformed: false',
    'fileUploaded: false',
    'emailSent: false',
    'liveEnvelopeCreated: false',
    'documentUploaded: false',
    'recipientEmailSent: false',
    'webhookRegistered: false',
    'liveLookupPerformed: false',
    'customerDataRetrieved: false',
    'accountDataRetrieved: false',
    'balanceDataRetrieved: false',
    'transactionDataRetrieved: false',
    'livePullPerformed: false',
    'reportRetrieved: false',
    'scoreRetrieved: false',
    'allowedForLivePullNow: false',
    'readOnly: true',
    'liveServicingSyncPerformed: false',
    'coreBankingSyncPerformed: false',
    'loanBoarded: false',
    'paymentScheduleGenerated: false',
    'profitabilityCalculated: false',
    'roeCalculated: false',
    'yieldCalculated: false',
    'marginCalculated: false',
    'feeIncomeCalculated: false',
  ];
  for (const literal of REQUIRED_BOOLEANS) {
    it(`pins "${literal}" in the convergence source`, () => {
      expect(ALL_RAW.includes(literal)).toBe(true);
    });
  }
});
