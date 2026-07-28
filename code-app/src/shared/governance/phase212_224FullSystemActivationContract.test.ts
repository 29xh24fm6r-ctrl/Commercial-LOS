import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 212–224 — full-system activation governance.
 *
 * Pins, across the entire activation arc, that the launch package is governed and
 * fail-closed: no fake smoke, no gate flip without a governed write, no real
 * Dataverse writes / connector sends in tests, no hardcoded GUIDs, no unsafe
 * readiness claim, no entitlement deletion, no borrower-email inference, and no
 * delivery overclaim.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const ACT_DIR = resolve(ROOT, 'src/activation');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const sourceFiles = readdirSync(ACT_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const testFiles = readdirSync(ACT_DIR).filter((f) => f.endsWith('.test.ts'));
const sources = sourceFiles.map((f) => ({ f, src: read(`src/activation/${f}`) }));
const tests = testFiles.map((f) => ({ f, src: read(`src/activation/${f}`) }));

describe('212–224 — write flags are disabled by default in source', () => {
  // Phase 256B launched CHECKLIST_WRITE_ENABLED (initialized true after its GO document-checklist
  // smoke); Completion Phase A reset it to the safe default (off) to finish the gates-down sweep.
  // The remaining activation write flags stay fail-closed by default.
  const flags = [
    'NEW_DEAL_CREATE_ADAPTER_ENABLED',
    'NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED',
    'BANKER_NEW_DEAL_CREATE_ENABLED',
    'ADVANCE_STAGE_WRITE_ENABLED',
    'CRM_LIVE_PERSISTENCE_ENABLED',
    'PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED',
    'PORTFOLIO_BOARDING_ROUTE_ENABLED',
  ];
  it('every still-gated launch write flag is initialized to false', () => {
    const all = sources.map((s) => s.src).join('\n');
    for (const flag of flags) {
      expect(all).toMatch(new RegExp(`${flag}\\s*=\\s*false`));
    }
  });

  it('document upload is initialized true after live File-column certification', () => {
    const all = sources.map((s) => s.src).join('\n');
    expect(all).toMatch(/DOCUMENT_UPLOAD_ENABLED\s*=\s*true/);
  });

  it('the checklist write flag is reset to false (Completion Phase A safe-off)', () => {
    const all = sources.map((s) => s.src).join('\n');
    expect(all).toMatch(/CHECKLIST_WRITE_ENABLED\s*=\s*false/);
  });
});

describe('212–224 — no source flips a gate (no env / config write)', () => {
  it('reads no process.env / import.meta.env and writes no config', () => {
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/process\.env|import\.meta\.env/);
    }
  });
});

describe('212–224 — no real Dataverse writes / SDK pull in the static graph', () => {
  it('only adminEntitlementActivation references the generated SDK, and only via dynamic import', () => {
    for (const { f, src } of sources) {
      if (f === 'adminEntitlementActivation.ts') {
        // Allowed: dynamic import inside the runtime transport seam only.
        expect(src).not.toMatch(/^import .*\/generated\//m);
        expect(src).toMatch(/await import\(\s*['"][^'"]*\/generated\//);
      } else {
        expect(src, f).not.toMatch(/\/generated\//);
      }
    }
  });
  it('no test file invokes a real SDK service, fetch, or connector send', () => {
    for (const { f, src } of tests) {
      expect(src, f).not.toMatch(/\/generated\//);
      expect(src, f).not.toMatch(/\bfetch\s*\(/);
      expect(src, f).not.toMatch(/graph\.microsoft\.com|Office365|SendEmail/i);
    }
  });
});

describe('212–224 — no hardcoded Dataverse GUIDs in source', () => {
  it('no source file embeds a GUID literal', () => {
    for (const { f, src } of sources) {
      expect(src, f).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    }
  });
});

describe('212–224 — revoke never deletes; deactivate only', () => {
  it('the entitlement activation revoke transport calls update (deactivate), never delete', () => {
    const src = read('src/activation/adminEntitlementActivation.ts');
    expect(src).toMatch(/deactivateEntitlement/);
    expect(src).toMatch(/statecode:\s*1/);
    expect(src).not.toMatch(/\.delete\(/);
  });
});

describe('212–224 — borrower comms: no email inference, no delivery overclaim', () => {
  const src = read('src/activation/borrowerCommsActivation.ts');
  it('rejects a name-inferred recipient', () => {
    expect(src).toMatch(/inferred-from-name/);
    expect(src).toMatch(/not allowed/i);
  });
  it('never claims delivery for a connector send', () => {
    expect(src).toMatch(/not a delivery confirmation/i);
    expect(src).not.toMatch(/['"][^'"]*\bdelivered\b[^'"]*['"]/i);
  });
});

describe('212–224 — document upload: metadata cannot mark received unless upload succeeds', () => {
  it('markReceived is only reached after a successful upload', () => {
    const src = read('src/activation/documentUploadActivation.ts');
    const uploadIdx = src.indexOf('transport.upload(');
    const markIdx = src.indexOf('transport.markReceived(');
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(markIdx).toBeGreaterThan(uploadIdx);
    expect(src).toMatch(/upload_failed/);
  });
});

describe('212–224 — full-system aggregator is fail-closed (NO_GO by default)', () => {
  it('NO_GO is the default branch and GO requires no reasons', () => {
    const src = read('src/activation/fullSystemActivation.ts');
    expect(src).toMatch(/reasons\.length > 0[\s\S]*decision = 'NO_GO'/);
    expect(src).toMatch(/decision = 'GO'/);
  });
});

describe('212–224 — smoke evidence is never fabricated', () => {
  it('every activation module derives smoke readiness from the Phase 211 registry, not a literal pass', () => {
    const writeCapModules = [
      'adminEntitlementActivation.ts',
      'newDealCreateActivation.ts',
      'stageProgressionActivation.ts',
      'crmActivation.ts',
      'portfolioBoardingActivation.ts',
      'checklistGenerationActivation.ts',
      'borrowerCommsActivation.ts',
      'documentUploadActivation.ts',
    ];
    for (const m of writeCapModules) {
      expect(read(`src/activation/${m}`), m).toMatch(/deriveCapabilitySmokeReadiness/);
    }
  });
});
