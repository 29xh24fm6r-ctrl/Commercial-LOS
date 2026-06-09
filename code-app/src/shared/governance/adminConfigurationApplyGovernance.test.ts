import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { ADMIN_CONFIG_APPLY_FEATURE_FLAG_DEFAULTS, resolveAdminConfigApplyFeatureFlags } from '../../adminConfig/adminConfigurationApplyFeatureFlags';
import { ADMIN_CONFIG_APPLY_STATUSES } from '../../adminConfig/adminConfigurationApplyTypes';
import { createAdminConfigurationControlledApplyEngine } from '../../adminConfig/createAdminConfigurationControlledApplyEngine';
import { buildAdminConfigurationProposal } from '../../adminConfig/buildAdminConfigurationProposal';

/**
 * Phase 142K — admin configuration controlled-apply governance.
 *
 * Pins the apply-disabled contract: execution off, dry-run only, dangerous flags
 * off; NO applied/deployed/published/activated/executed status; attemptApply
 * always blocked; applied/mutated always false; NO schema mutation, custom field,
 * route registration, integration enablement, permission widening, workflow
 * execution, Dataverse/CRM write, persistence write, fetch, external call, raw
 * secrets/PII, SQL/OData/eval/function payload, credit decision, or covenant
 * waiver. NOTE: statuses + plan steps deliberately NAME forbidden actions as data
 * — scans target EXECUTION call patterns only. Generate apply plans; do not apply.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/adminConfig/adminConfigurationApplyTypes.ts',
  'src/adminConfig/adminConfigurationApplyFeatureFlags.ts',
  'src/adminConfig/deriveAdminConfigurationApplyReadiness.ts',
  'src/adminConfig/buildAdminConfigurationApplyPlan.ts',
  'src/adminConfig/createAdminConfigurationControlledApplyEngine.ts',
  'src/adminConfig/deriveAdminConfigurationApplyWorkflow.ts',
  'src/adminConfig/AdminConfigurationApplyPreviewPanel.tsx',
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

describe('Phase 142K — files exist', () => {
  for (const rel of ['docs/PHASE_142K_ADMIN_CONFIGURATION_CONTROLLED_APPLY_WORKFLOW.md', ...PROD_FILES, 'src/shared/governance/adminConfigurationApplyGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142K — no apply / mutation / write / fetch execution', () => {
  it('no apply / deploy / publish / activate config execution', () => {
    const hits = SOURCES.filter((f) => /\b(applyProposal|applyConfig|applyConfiguration|deployProposal|publishProposal|activateProposal|executeApply)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no schema mutation / custom field / route registration execution', () => {
    const hits = SOURCES.filter((f) => /\b(mutateSchema|alterTable|createTable|createColumn|createField|createCustomField|registerRoute)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no integration enablement / permission widening / workflow execution', () => {
    const hits = SOURCES.filter((f) => /\b(enableIntegration|activateProvider|widenPermission|grantPermission|executeWorkflow|runWorkflow)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no credit approval/decline / covenant waiver execution', () => {
    const hits = SOURCES.filter((f) => /\b(approveCredit|declineCredit|waiveCovenant|grantWaiver)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse / persistence write execution', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord|saveProposal|saveReviewDecision|saveAuditEntry)\s*\(|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / eval / Function payload and no external URL', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\beval\s*\(|new\s+Function\b/.test(f.code) || /https?:\/\//.test(f.raw));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('components have no button / onClick control', () => {
    for (const c of SOURCES.filter((f) => f.isComponent)) {
      expect(c.code).not.toMatch(/<button/i);
      expect(c.code).not.toMatch(/onClick/);
    }
  });

  it('no literal SSN / email fixtures', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/\b\d{3}-\d{2}-\d{4}\b/.test(f.code)) hits.push(`${f.rel} ssn`);
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx registers no apply preview panel route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/AdminConfigurationApplyPreviewPanel/);
  });
});

describe('Phase 142K — behavioral: apply disabled, no unsafe status', () => {
  it('execution off, dry-run on, dangerous flags off by default', () => {
    const d = ADMIN_CONFIG_APPLY_FEATURE_FLAG_DEFAULTS;
    expect(d.ADMIN_CONFIG_APPLY_EXECUTION_ENABLED).toBe(false);
    expect(d.ADMIN_CONFIG_APPLY_DRY_RUN_ONLY).toBe(true);
    expect(d.ADMIN_CONFIG_SCHEMA_MUTATION_ALLOWED).toBe(false);
    const f = resolveAdminConfigApplyFeatureFlags({ applyExecutionEnabled: true });
    expect(f.ADMIN_CONFIG_APPLY_EXECUTION_ENABLED).toBe(false);
  });

  it('exposes no applied / deployed / published / activated / executed / live status', () => {
    for (const s of ADMIN_CONFIG_APPLY_STATUSES) {
      expect(s).not.toMatch(/^applied$|^deployed$|^published$|^activated$|^executed$|^live$/);
    }
  });

  it('attemptApply is always blocked with applied=false and mutated=false', () => {
    const proposal = { ...buildAdminConfigurationProposal({ proposalId: 'P1', proposalType: 'platform_object_change', title: 'View', summary: 'metadata', proposedChangeSummary: 'reorder', requestedBy: 'admin-1', clock: CLOCK }), status: 'approved_not_applied' as const };
    const engine = createAdminConfigurationControlledApplyEngine({ flags: resolveAdminConfigApplyFeatureFlags() });
    const r = engine.attemptApply(proposal);
    expect(r.ok).toBe(false);
    expect(r.applied).toBe(false);
    expect(r.mutated).toBe(false);
    expect(r.auditSummary.wroteToDataverse).toBe(false);
  });
});
