import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { deriveExecutiveProductStrategyDashboard } from '../../competitive/deriveExecutiveProductStrategyDashboard';
import { deriveCompetitiveRoadmap } from '../../competitive/deriveCompetitiveRoadmap';
import { deriveCompetitiveDifferentiators } from '../../competitive/deriveCompetitiveDifferentiators';

/**
 * Phase 142H — executive product strategy governance.
 *
 * Pins the strategy / read-only contract: NO action buttons, start-phase,
 * create-task, apply-config, enable-integration, register-route, final-export,
 * approve/decline credit, covenant waiver, borrower outreach, upload-link, fetch,
 * external link, iframe, or Dataverse/CRM write; NO fake operational data, NO
 * live-integration / final-approval claim, NO competitor overclaim. NOTE: the
 * disclaimer banners deliberately NAME these forbidden actions as copy — scans
 * target EXECUTION call patterns and structural-true flags only.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/competitive/executiveStrategyTypes.ts',
  'src/competitive/deriveExecutiveProductStrategyDashboard.ts',
  'src/competitive/deriveCompetitiveDifferentiators.ts',
  'src/competitive/deriveCompetitiveGaps.ts',
  'src/competitive/deriveCompetitiveRoadmap.ts',
  'src/competitive/ExecutiveProductStrategyPanel.tsx',
  'src/competitive/CompetitiveReferencePlatformPanel.tsx',
  'src/competitive/CompetitiveSafetyPosturePanel.tsx',
  'src/competitive/CompetitiveCapabilityDashboard.tsx',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const SOURCES = PROD_FILES.map((rel) => ({
  rel: relative(REPO_ROOT, resolve(REPO_ROOT, rel)).split(sep).join('/'),
  isComponent: rel.endsWith('.tsx'),
  raw: readFileSync(resolve(REPO_ROOT, rel), 'utf8'),
  code: stripComments(readFileSync(resolve(REPO_ROOT, rel), 'utf8')),
}));

const CLOCK = '2026-06-09T00:00:00.000Z';

describe('Phase 142H — files exist', () => {
  for (const rel of ['docs/PHASE_142H_EXECUTIVE_PRODUCT_STRATEGY_SURFACE.md', ...PROD_FILES, 'src/shared/governance/executiveProductStrategyGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142H — no action controls / fetch / external links', () => {
  it('panels have no button / onClick / toggle control', () => {
    for (const c of SOURCES.filter((f) => f.isComponent)) {
      expect(c.code).not.toMatch(/<button/i);
      expect(c.code).not.toMatch(/onClick/);
      expect(c.code).not.toMatch(/type="(checkbox|radio)"/);
    }
  });

  it('no start-phase / create-task / apply-config execution', () => {
    const hits = SOURCES.filter((f) => /\b(startPhase|beginPhase|createTask|addTask|applyConfig|applyConfiguration)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no enable-integration / register-route / final-export execution', () => {
    const hits = SOURCES.filter((f) => /\b(enableIntegration|activateProvider|registerRoute|exportFinal|finalExport|publishExport)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no approve/decline credit / covenant waiver execution', () => {
    const hits = SOURCES.filter((f) => /\b(approveCredit|declineCredit|waiveCovenant|grantWaiver)\s*\(|finalCreditDecision/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no borrower outreach / upload-link execution', () => {
    const hits = SOURCES.filter((f) => /\b(sendEmail|sendSms|sendOutreach|sendBorrower|generateUploadLink|createUploadLink)\s*\(|mailto:|twilio/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / XMLHttpRequest, no external URL, no iframe, no anchor link', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /https?:\/\//.test(f.raw) || /<iframe/i.test(f.code) || /<a\s/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 142H — no fake data / overclaim / live-claim', () => {
  it('no dollar literals / sample emails / phones', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
    }
    expect(hits).toEqual([]);
  });

  it('no live-integration / final-approval structural-true flags', () => {
    const hits = SOURCES.filter((f) => /containsLiveIntegration:\s*true|containsFinalApproval:\s*true|containsOperationalData:\s*true/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no competitor overclaim language', () => {
    const hits = SOURCES.filter((f) => /better than|superior to|beats\s+\w/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('App.tsx registers no executive strategy panel route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/ExecutiveProductStrategyPanel|CompetitiveSafetyPosturePanel|CompetitiveReferencePlatformPanel/);
  });
});

describe('Phase 142H — behavioral: read-only strategy', () => {
  it('the dashboard state claims no live integration / final approval / operational data', () => {
    const s = deriveExecutiveProductStrategyDashboard({ generatedAt: CLOCK });
    expect(s.auditSummary.containsLiveIntegration).toBe(false);
    expect(s.auditSummary.containsFinalApproval).toBe(false);
    expect(s.auditSummary.containsOperationalData).toBe(false);
    expect(s.safetyPosture.containsLiveIntegration).toBe(false);
  });

  it('no roadmap phase enables a final credit decision', () => {
    for (const p of deriveCompetitiveRoadmap()) {
      expect(p.riskClass).not.toBe('credit_decision_final_forbidden');
    }
  });

  it('planned differentiators are labeled planned', () => {
    for (const d of deriveCompetitiveDifferentiators().filter((x) => x.status === 'planned')) {
      expect(d.detail.toLowerCase()).toMatch(/planned|future/);
    }
  });
});
