import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import { deriveConfigurableWorkflowRoute } from '../../workflow/deriveConfigurableWorkflowRoute';

/**
 * Phase 142C — workflow routing governance.
 *
 * Pins the read-only decision-support contract for the routing engine: no credit
 * approval/decline, no committee voting, no covenant waiver, no stage update, no
 * task creation, no borrower outreach, no upload-link generation, no CRM/
 * Dataverse writes, no fetch in components, no eval/function routing rules, and
 * no SQL/OData. NOTE: the model deliberately *names* the disabled capabilities as
 * structural fields (`finalApproval: false`, `votingEnabled: false`, …) — the
 * scans target EXECUTION patterns, never those safety fields.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const WORKFLOW_DIR = resolve(REPO_ROOT, 'src/workflow');

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const FILES = readdirSync(WORKFLOW_DIR)
  .filter((e) => (e.endsWith('.ts') || e.endsWith('.tsx')) && !e.endsWith('.test.ts') && !e.endsWith('.test.tsx'))
  .map((e) => {
    const file = resolve(WORKFLOW_DIR, e);
    return { rel: relative(REPO_ROOT, file).split(sep).join('/'), isComponent: e.endsWith('.tsx'), code: stripComments(readFileSync(file, 'utf8')) };
  });

const REQUIRED_142C = [
  'docs/PHASE_142C_CONFIGURABLE_WORKFLOW_ROUTING_AND_CREDIT_COMMITTEE.md',
  'src/workflow/workflowRoutingConfigTypes.ts',
  'src/workflow/workflowRouteRuleRegistry.ts',
  'src/workflow/deriveConfigurableWorkflowRoute.ts',
  'src/workflow/deriveCreditCommitteeRoute.ts',
  'src/workflow/deriveWorkflowStageSequence.ts',
  'src/workflow/deriveWorkflowRoutingReadiness.ts',
  'src/workflow/WorkflowRoutingPanel.tsx',
];

describe('Phase 142C — files exist', () => {
  for (const rel of REQUIRED_142C) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142C — no approval / vote / waiver / stage / task execution', () => {
  it('no credit approval / decline action', () => {
    const hits = FILES.filter((f) => /\b(approveCredit|declineCredit|recommendApproval)\s*\(|finalApproval:\s*true/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no committee voting action', () => {
    const hits = FILES.filter((f) => /\b(recordVote|castVote|enableVoting|submitToCommittee)\s*\(|votingEnabled:\s*true/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no covenant waiver execution', () => {
    const hits = FILES.filter((f) => /\b(waiveCovenant|grantWaiver|applyWaiver)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no stage update / task creation execution', () => {
    const hits = FILES.filter((f) => /\b(updateStage|setStage|mutateStage|createTask|addTask)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });
});

describe('Phase 142C — no outreach / writes / fetch / dynamic rules', () => {
  it('no borrower outreach / upload-link generation', () => {
    const hits = FILES.filter((f) => /\b(sendEmail|sendSms|twilio|generateUploadLink|createUploadLink)\b|mailto:/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no CRM / Dataverse write verbs', () => {
    const hits = FILES.filter((f) => /\b(createRecord|updateRecord|deleteRecord)\b|method:\s*'(POST|PATCH|DELETE)'/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no fetch / Dataverse SDK in workflow React components', () => {
    const hits = FILES.filter((f) => f.isComponent && (/\b(fetch|XMLHttpRequest)\s*\(/.test(f.code) || /@microsoft\/power-apps/.test(f.code)));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no eval / dynamic function routing rules and no SQL/OData', () => {
    const hits = FILES.filter((f) => /\beval\s*\(|new\s+Function\s*\(|\$filter|\bSELECT\b[\s\S]{0,40}\bFROM\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('no external URLs / sample emails / phones / dollar literals', () => {
    const hits: string[] = [];
    for (const f of FILES) {
      if (/https?:\/\//.test(f.code)) hits.push(`${f.rel} url`);
      if (/['"`][a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}['"`]/i.test(f.code)) hits.push(`${f.rel} email`);
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(f.code)) hits.push(`${f.rel} phone`);
      if (/\$\s*\d/.test(f.code)) hits.push(`${f.rel} $-literal`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx registers no workflow routing route', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/WorkflowRoutingPanel|workflowRouteRuleRegistry/);
  });
});

describe('Phase 142C — behavioral: read-only decision support', () => {
  it('route derivation is read-only and never approves credit / mutates workflow', () => {
    for (const input of [{ productType: 'sba_7a' as const, amount: 200000 }, { amount: 60000000 }, {}]) {
      const r = deriveConfigurableWorkflowRoute({ input });
      expect(r.readOnly).toBe(true);
      expect(r.canApproveCredit).toBe(false);
      expect(r.canMutateWorkflow).toBe(false);
      expect(r.creditCommittee.votingEnabled).toBe(false);
      expect(r.creditCommittee.approvalEnabled).toBe(false);
    }
  });
});
