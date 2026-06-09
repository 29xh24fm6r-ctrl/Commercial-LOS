import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import {
  ADMIN_CONFIGURATION_PROPOSAL_STATUSES,
  ADMIN_CONFIGURATION_ALLOWED_REVIEWER_ACTIONS,
} from '../../adminConfig/adminConfigurationTypes';
import { buildAdminConfigurationProposal } from '../../adminConfig/buildAdminConfigurationProposal';
import { validateAdminConfigurationProposal } from '../../adminConfig/validateAdminConfigurationProposal';
import { deriveAdminConfigurationReviewDecision } from '../../adminConfig/deriveAdminConfigurationReviewDecision';

/**
 * Phase 142G — admin configuration governance.
 *
 * Pins the review-only contract: NO schema mutation, custom field, route
 * registration, integration enablement, permission widening, workflow execution,
 * Dataverse/CRM write, fetch, external call, credit approval/decline, covenant
 * waiver, borrower outreach, or upload-link generation. validForApply is always
 * false, and there is NO applied/deployed/published/activated status. NOTE: the
 * content-safety module and disclaimer banners deliberately NAME these forbidden
 * actions as detection regexes / copy — scans target EXECUTION call patterns and
 * quoted secret assignments only.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/adminConfig/adminConfigurationTypes.ts',
  'src/adminConfig/adminConfigurationContentSafety.ts',
  'src/adminConfig/buildAdminConfigurationProposal.ts',
  'src/adminConfig/validateAdminConfigurationProposal.ts',
  'src/adminConfig/deriveAdminConfigurationReviewQueue.ts',
  'src/adminConfig/deriveAdminConfigurationReviewDecision.ts',
  'src/adminConfig/AdminConfigurationReviewQueuePanel.tsx',
  'src/adminConfig/AdminConfigurationSummaryPanel.tsx',
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

describe('Phase 142G — files exist', () => {
  for (const rel of ['docs/PHASE_142G_ADMIN_CONFIGURATION_REVIEW_QUEUE.md', ...PROD_FILES, 'src/shared/governance/adminConfigurationGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142G — no execution / write / fetch', () => {
  it('panels have no button / onClick mutation control', () => {
    for (const c of SOURCES.filter((f) => f.isComponent)) {
      expect(c.code).not.toMatch(/<button/i);
      expect(c.code).not.toMatch(/onClick/);
    }
  });

  it('no schema mutation / custom field / route registration execution', () => {
    const hits = SOURCES.filter((f) => /\b(mutateSchema|alterSchema|createTable|dropTable|addColumn|createCustomField|createField|registerRoute|registerPanelRoute)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no integration enablement / permission widening / workflow execution', () => {
    const hits = SOURCES.filter((f) => /\b(enableIntegration|activateProvider|enableProvider|widenPermission|grantPermission|executeWorkflow|runWorkflow|applyWorkflow)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no apply / deploy / publish / activate config execution', () => {
    const hits = SOURCES.filter((f) => /\b(applyConfig|applyConfiguration|deployConfig|publishConfig|activateConfig)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no credit approval/decline / covenant waiver / borrower outreach / upload-link execution', () => {
    const hits = SOURCES.filter((f) => /\b(approveCredit|declineCredit|waiveCovenant|grantWaiver|sendEmail|sendSms|sendBorrower|generateUploadLink|createUploadLink)\s*\(|mailto:|twilio/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse write verbs', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / XMLHttpRequest call and no external URL', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /https?:\/\//.test(f.raw));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('imports only relative modules and react (no external package)', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });
});

describe('Phase 142G — no secrets / PII fixtures, no apply-ready status', () => {
  it('contains no quoted secret / token assignments', () => {
    const hits = SOURCES.filter((f) => /(api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]\s*['"][^'"]+['"]/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('contains no literal SSN / email / phone fixtures', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/\b\d{3}-\d{2}-\d{4}\b/.test(f.code)) hits.push(`${f.rel} ssn`);
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
    }
    expect(hits).toEqual([]);
  });

  it('has no applied / deployed / published / activated / executed status value', () => {
    for (const s of ADMIN_CONFIGURATION_PROPOSAL_STATUSES) {
      expect(s).not.toMatch(/^applied$|^deployed$|^published$|^activated$|^executed$/);
    }
    const hits = SOURCES.filter((f) => /status:\s*'(applied|deployed|published|activated|executed)'/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('exposes no forbidden reviewer action in the allowed set', () => {
    for (const forbidden of ['apply', 'deploy', 'publish', 'activate', 'enable_integration', 'mutate_schema', 'widen_permission', 'register_route', 'execute_workflow', 'approve_credit', 'waive_covenant']) {
      expect((ADMIN_CONFIGURATION_ALLOWED_REVIEWER_ACTIONS as readonly string[])).not.toContain(forbidden);
    }
  });

  it('App.tsx registers no admin configuration panel route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/AdminConfigurationReviewQueuePanel|AdminConfigurationSummaryPanel/);
  });
});

describe('Phase 142G — behavioral: review-only, never apply', () => {
  function proposal(type: Parameters<typeof buildAdminConfigurationProposal>[0]['proposalType']) {
    return buildAdminConfigurationProposal({
      proposalId: 'P1', proposalType: type, title: 'Proposal', summary: 'Metadata change.',
      proposedChangeSummary: 'Reorder columns.', requestedBy: 'admin-1', clock: CLOCK, submitForReview: true,
    });
  }

  it('schema / custom field / route registration proposals are blocked_unsafe', () => {
    for (const t of ['dataverse_schema_change', 'custom_field_change', 'route_registration_change'] as const) {
      expect(proposal(t).status).toBe('blocked_unsafe');
    }
  });

  it('validation is never apply-ready', () => {
    const r = validateAdminConfigurationProposal({ proposal: proposal('platform_object_change') });
    expect(r.validForApply).toBe(false);
    expect(r.auditSummary.validForApply).toBe(false);
  });

  it('no reviewer decision applies, writes, or mutates', () => {
    const d = deriveAdminConfigurationReviewDecision({ proposal: proposal('platform_object_change'), action: 'approve_for_future_implementation', decidedAt: CLOCK });
    expect(d.resultingStatus).toBe('approved_not_applied');
    expect(d.auditSummary.appliedConfig).toBe(false);
    expect(d.auditSummary.wroteToDataverse).toBe(false);
  });
});
