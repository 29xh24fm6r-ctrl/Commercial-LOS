import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

import {
  submitESignEnvelope,
  prepareESignEnvelopeRequest,
} from '../../committee/eSignEnvelopeAdapter';

/**
 * Phase 142O — PandaDoc e-sign envelope adapter governance.
 *
 * Pins the disabled-by-default seam contract: NO PandaDoc SDK import / client /
 * token / env var / secret, NO webhook registration, NO fetch / XMLHttpRequest /
 * axios, NO POST/PATCH/PUT/DELETE, NO Graph / Outlook / Power Automate, NO
 * Dataverse create/update/upsert/delete, NO sendMail / upload execution, NO
 * "sent for signature / envelope created successfully / delivered successfully"
 * copy, NO approve/deny/vote handler, NO eval/Function, NO fake/sample/mock data.
 * Every outcome keeps liveEnvelopeCreated / documentUploaded / recipientEmailSent
 * / webhookRegistered / externalDeliveryPerformed false. NOTE: PandaDoc is named
 * only as disabled provider metadata, and the result type NAMES the live-effect
 * fields as literal-false — scans target EXECUTION patterns and misleading copy.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const PROD_FILES = [
  'src/committee/eSignEnvelopeAdapter.ts',
  'src/committee/ESignEnvelopePanel.tsx',
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

const CLOCK = '2026-06-10T00:00:00.000Z';

describe('Phase 142O — files exist', () => {
  for (const rel of ['docs/PHASE_142O_ESIGN_ENVELOPE_ADAPTER_SEAM.md', ...PROD_FILES, 'src/shared/governance/eSignEnvelopeGovernance.test.ts']) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 142O — no PandaDoc SDK / token / network / webhook / write', () => {
  it('imports only relative modules + react (no PandaDoc SDK / API client)', () => {
    for (const f of SOURCES) {
      const specifiers = Array.from(f.code.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
      for (const spec of specifiers) {
        expect(spec === 'react' || spec.startsWith('.'), `${f.rel} imports ${spec}`).toBe(true);
      }
    }
  });

  it('uses no PandaDoc token / env var / secret reference', () => {
    const hits = SOURCES.filter((f) => /process\.env|PANDADOC[_A-Z]*\s*[:=]|(api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*['"][^'"]+['"]/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('constructs no PandaDoc client and registers no webhook', () => {
    const hits = SOURCES.filter((f) => /new\s+PandaDoc\w*|PandaDocClient|registerWebhook\s*\(|createWebhook\s*\(|subscribeWebhook\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no fetch / XMLHttpRequest / axios', () => {
    const hits = SOURCES.filter((f) => /\b(fetch|XMLHttpRequest)\s*\(|\baxios\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('introduces no POST / PATCH / PUT / DELETE method string', () => {
    const hits = SOURCES.filter((f) => /method:\s*['"](POST|PATCH|PUT|DELETE)['"]|\b(POST|PATCH|PUT|DELETE)\b\s*:/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no Graph / Outlook / Power Automate connector', () => {
    const hits = SOURCES.filter((f) => /\bGraph\b|\bOutlook\b|power[\s_-]?automate|\bflow\.run\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no Dataverse create / update / upsert / delete call', () => {
    const hits = SOURCES.filter((f) => /\b(createRecord|updateRecord|deleteRecord|upsert\w*)\s*\(/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no sendMail / file upload / envelope-send execution', () => {
    const hits = SOURCES.filter((f) => /\b(sendMail|sendEmail|uploadFile|fileUpload|upload|sendEnvelope|createEnvelope|requestSignature)\s*\(/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no eval / Function constructor', () => {
    const hits = SOURCES.filter((f) => /\beval\s*\(|new\s+Function\b/.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no approve / deny / vote action handler or button / form', () => {
    const hits = SOURCES.filter((f) => /\b(onApprove|onDeny|onVote|castVote|approvePackage|denyPackage|recordVote)\s*\(?/i.test(f.code) || /<button/i.test(f.code) || /onClick/i.test(f.code) || /<form\b/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no misleading sent-for-signature / created / delivered copy', () => {
    const hits = SOURCES.filter((f) => /sent for signature|envelope created successfully|delivered successfully|signature complete|envelope sent successfully|signed successfully/i.test(f.code));
    expect(hits.map((h) => h.rel)).toEqual([]);
  });

  it('uses no fake / sample / mock data and no external URL', () => {
    const hits: string[] = [];
    for (const f of SOURCES) {
      if (/\b(sampleData|mockData|fakeData|SAMPLE_\w+|MOCK_\w+|FAKE_\w+|dummyData)\b/.test(f.code)) hits.push(`${f.rel} mock`);
      if (/https?:\/\//.test(f.raw)) hits.push(`${f.rel} url`);
    }
    expect(hits).toEqual([]);
  });

  it('App.tsx mounts no e-sign panel route (mounting deferred)', () => {
    const app = readFileSync(resolve(REPO_ROOT, 'src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/ESignEnvelopePanel|eSignEnvelopeAdapter/);
  });
});

describe('Phase 142O — behavioral: disabled, no live PandaDoc effect', () => {
  function req(over: Record<string, unknown> = {}) {
    return { ...prepareESignEnvelopeRequest({ dealId: 'D1', dealName: 'Deal One', requestedByDisplayName: 'admin-1', requestedAt: CLOCK }), ...over };
  }

  it('always returns disabled or rejected — never a success outcome', () => {
    expect(['disabled', 'rejected']).toContain(submitESignEnvelope(req()).status);
  });

  it('keeps every live-effect flag false on disabled and rejected outcomes', () => {
    for (const r of [submitESignEnvelope(req()), submitESignEnvelope(null)]) {
      expect(r.liveEnvelopeCreated).toBe(false);
      expect(r.documentUploaded).toBe(false);
      expect(r.recipientEmailSent).toBe(false);
      expect(r.webhookRegistered).toBe(false);
      expect(r.externalDeliveryPerformed).toBe(false);
    }
  });

  it('produces a deterministic, non-real-looking envelope seam proof id', () => {
    const id = submitESignEnvelope(req()).envelopeSeamProofId;
    expect(id).toBe(submitESignEnvelope(req()).envelopeSeamProofId);
    expect(id).toMatch(/^esign_seam_disabled_/);
  });
});
