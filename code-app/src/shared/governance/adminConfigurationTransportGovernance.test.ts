import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import {
  submitAdminConfigurationApplyProof,
  buildAdminConfigurationApplyProofRequest,
  type AdminConfigurationApplyProofRequest,
} from '../../adminConfig/adminConfigurationTransport';
import { buildAdminConfigurationApplyPlan } from '../../adminConfig/buildAdminConfigurationApplyPlan';
import { deriveAdminConfigurationApplyReadiness } from '../../adminConfig/deriveAdminConfigurationApplyReadiness';
import { buildAdminConfigurationProposal } from '../../adminConfig/buildAdminConfigurationProposal';
import { validateAdminConfigurationProposal } from '../../adminConfig/validateAdminConfigurationProposal';
import { resolveAdminConfigApplyFeatureFlags } from '../../adminConfig/adminConfigurationApplyFeatureFlags';

/**
 * Phase 142L — admin configuration FAKE transport governance.
 *
 * Pins the fake/offline proof-only contract: NO fetch / XMLHttpRequest / axios /
 * network client, NO Dataverse/CRM write, NO POST/PATCH/PUT/DELETE method, NO
 * eval/Function, NO executable payload path, NO misleading "apply now / deploy
 * now / live applied" copy. Every outcome keeps `proofOnly: true` and
 * `liveWritePerformed: false`; rejected requests stay rejected; the audit summary
 * is deterministic.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/adminConfig/adminConfigurationTransport.ts',
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

const TRANSPORT = SOURCES.find((s) => s.rel.endsWith('adminConfigurationTransport.ts'))!;
const CLOCK = '2026-06-10T00:00:00.000Z';
const FLAGS = resolveAdminConfigApplyFeatureFlags();

function sampleRequest(): AdminConfigurationApplyProofRequest {
  const base = buildAdminConfigurationProposal({ proposalId: 'P1', proposalType: 'platform_object_change', title: 'View', summary: 'metadata', proposedChangeSummary: 'reorder', requestedBy: 'admin-1', clock: CLOCK });
  const proposal = { ...base, status: 'approved_not_applied' as const };
  const readiness = deriveAdminConfigurationApplyReadiness({ proposal, validation: validateAdminConfigurationProposal({ proposal }), flags: FLAGS });
  const plan = buildAdminConfigurationApplyPlan({ proposal, readiness });
  return buildAdminConfigurationApplyProofRequest(plan, { requestedAt: CLOCK, actor: 'admin-1' });
}

describe('Phase 142L — files exist', () => {
  for (const rel of ['docs/PHASE_142L_INTEGRATION_TRANSPORT_PROOF_HARNESS.md', ...PROD_FILES, 'src/shared/governance/adminConfigurationTransportGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142L — no live transport / network / write', () => {
  it('imports only relative modules + react (no network client)', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

  it('uses no fetch / XMLHttpRequest / axios', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no Dataverse / CRM write execution', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord|saveProposal|saveReviewDecision)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('introduces no POST / PATCH / PUT / DELETE method string', () => {
    const hits = SOURCES.filter((f) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]|['"](POST|PATCH|PUT|DELETE)['"]\s*,?\s*\/\/\s*method/i.test(f.code) || /\b(POST|PATCH|PUT|DELETE)\b\s*:/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no eval / Function constructor', () => {
    const hits = SOURCES.filter((f) => /\beval\s*\(|new\s+Function\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no misleading live-apply copy', () => {
    const hits = SOURCES.filter((f) => /apply now|deploy now|live applied|applied live|deployed live|applied to the live/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('the transport is explicitly named fake / offline / proof-only', () => {
    expect(/fake_transport_only/.test(TRANSPORT.code)).toBe(true);
    expect(/proofOnly/.test(TRANSPORT.code)).toBe(true);
  });
});

describe('Phase 142L — behavioral: proof-only, no live write', () => {
  it('records a proof but never performs a live write', () => {
    const r = submitAdminConfigurationApplyProof(sampleRequest());
    expect(r.status).toBe('proof_recorded');
    expect(r.proofOnly).toBe(true);
    expect(r.liveWritePerformed).toBe(false);
    expect(r.auditSummary.liveWritePerformed).toBe(false);
  });

  it('keeps liveWritePerformed false on every rejected outcome', () => {
    for (const r of [
      submitAdminConfigurationApplyProof(null),
      submitAdminConfigurationApplyProof({ ...sampleRequest(), proofOnly: false as unknown as true }),
    ]) {
      expect(r.status).toBe('rejected');
      expect(r.liveWritePerformed).toBe(false);
      expect(r.proofOnly).toBe(true);
    }
  });

  it('produces a deterministic audit summary / proof id', () => {
    const a = submitAdminConfigurationApplyProof(sampleRequest());
    const b = submitAdminConfigurationApplyProof(sampleRequest());
    expect(a.transportProofId).toBe(b.transportProofId);
    expect(a.auditSummary).toEqual(b.auditSummary);
  });
});
