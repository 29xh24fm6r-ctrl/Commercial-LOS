import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 156 — Controlled External Platform Activation Certification.
 *
 * Pins the safety contract for Phases 150-155: all docs exist, all source
 * files exist, no vendor names in UI panel string literals, safety booleans
 * pinned in every source file, no fetch/XHR/axios, no secrets/env, and no
 * syncNow/pushNow/writeNow/enableLive handlers.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const EXT_DIR = resolve(REPO_ROOT, 'src/integrations/externalPlatforms');

// ── helpers ──

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function extractStringLiterals(code: string): string[] {
  const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const matches: string[] = [];
  const re = /(['"`])((?:(?!\1).)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    matches.push(m[2]);
  }
  return matches;
}

function isLikelyUserFacing(lit: string): boolean {
  if (/^[a-z_]+$/.test(lit) && lit.length < 30) return false;
  if (lit.startsWith('./') || lit.startsWith('../') || lit.startsWith('../../')) return false;
  return true;
}

// ── file inventories ──

const REQUIRED_DOCS = [
  'docs/PHASE_150_EXTERNAL_PLATFORM_CONNECTOR_READINESS.md',
  'docs/PHASE_151_EXTERNAL_PLATFORM_READ_ONLY_LIVE_PULL_PILOT.md',
  'docs/PHASE_152_ENTITY_MATCHING_AGAINST_LIVE_EXTERNAL_RECORDS.md',
  'docs/PHASE_153_SYNC_PREVIEW_USING_LIVE_EXTERNAL_RECORDS.md',
  'docs/PHASE_154_DRY_RUN_WRITEBACK_AGAINST_EXTERNAL_SCHEMA.md',
  'docs/PHASE_155_ALLOWLISTED_EXTERNAL_WRITE_PILOT_SCAFFOLD.md',
  'docs/PHASE_156_CONTROLLED_EXTERNAL_PLATFORM_ACTIVATION_CERTIFICATION.md',
];

const REQUIRED_SOURCE = [
  'src/integrations/externalPlatforms/externalPlatformConnectorReadiness.ts',
  'src/integrations/externalPlatforms/externalPlatformReadOnlyAdapter.ts',
  'src/integrations/externalPlatforms/externalEntityMatchAgainstLiveRecords.ts',
  'src/integrations/externalPlatforms/liveExternalSyncPreview.ts',
  'src/integrations/externalPlatforms/externalWritebackSchemaValidator.ts',
  'src/integrations/externalPlatforms/externalDryRunWritebackPlan.ts',
  'src/integrations/externalPlatforms/externalAllowlistedWritePilot.ts',
  'src/integrations/externalPlatforms/externalPlatformRecordMapper.ts',
  'src/integrations/externalPlatforms/ExternalPlatformConnectorReadinessPanel.tsx',
  'src/integrations/externalPlatforms/ExternalPlatformReadOnlyPanel.tsx',
  'src/integrations/externalPlatforms/ExternalEntityMatchReviewPanel.tsx',
  'src/integrations/externalPlatforms/LiveExternalSyncPreviewPanel.tsx',
  'src/integrations/externalPlatforms/ExternalDryRunWritebackPanel.tsx',
  'src/integrations/externalPlatforms/ExternalAllowlistedWritePilotPanel.tsx',
];

const UI_PANELS = [
  'ExternalPlatformConnectorReadinessPanel.tsx',
  'ExternalPlatformReadOnlyPanel.tsx',
  'ExternalEntityMatchReviewPanel.tsx',
  'LiveExternalSyncPreviewPanel.tsx',
  'ExternalDryRunWritebackPanel.tsx',
  'ExternalAllowlistedWritePilotPanel.tsx',
];

const VENDOR_PATTERNS = [
  /\bSalesforce\b/i,
  /\bnCino\b/i,
  /\bDataverse\b/i,
  /\bDynamics\b/i,
  /\bHubSpot\b/i,
  /\bPandaDoc\b/i,
];

// Source files (non-test, non-panel) for safety boolean / network / handler scans.
const SOURCE_FILES = readdirSync(EXT_DIR)
  .filter((e) => (e.endsWith('.ts') || e.endsWith('.tsx')) && !e.endsWith('.test.ts') && !e.endsWith('.test.tsx'))
  .map((e) => ({
    name: e,
    path: resolve(EXT_DIR, e),
    code: stripComments(readFileSync(resolve(EXT_DIR, e), 'utf8')),
  }));

// ── 1. docs exist ──

describe('Phase 156 — all Phase 150-156 docs exist', () => {
  for (const rel of REQUIRED_DOCS) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

// ── 2. source files exist ──

describe('Phase 156 — all source files exist', () => {
  for (const rel of REQUIRED_SOURCE) {
    it(`${rel} exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

// ── 3. no vendor names in UI panel string literals ──

describe('Phase 156 — no vendor names in UI panel string literals', () => {
  for (const panel of UI_PANELS) {
    it(`${panel} has no vendor product names in user-facing strings`, () => {
      const code = readFileSync(resolve(EXT_DIR, panel), 'utf8');
      const literals = extractStringLiterals(code).filter(isLikelyUserFacing);
      for (const lit of literals) {
        for (const pattern of VENDOR_PATTERNS) {
          expect(
            lit,
            `${panel} contains vendor name in string literal: "${lit}"`,
          ).not.toMatch(pattern);
        }
      }
    });
  }
});

// ── 4. safety booleans pinned in source ──

describe('Phase 156 — safety booleans pinned in source', () => {
  const SAFETY_FILES: Record<string, readonly string[]> = {
    'externalPlatformConnectorReadiness.ts': [
      'liveConnectionAttempted: false',
      'liveReadPerformed: false',
      'liveWritePerformed: false',
      'credentialsStoredInCode: false',
      'externalSystemChanged: false',
    ],
    'externalPlatformReadOnlyAdapter.ts': [
      'liveWritePerformed: false',
      'externalSystemChanged: false',
      'credentialsExposed: false',
    ],
    'externalEntityMatchAgainstLiveRecords.ts': [
      'autoLinked: false',
      'liveWritePerformed: false',
      'externalSystemChanged: false',
    ],
    'liveExternalSyncPreview.ts': [
      'liveWritePerformed: false',
      'externalSystemChanged: false',
      'crmRecordCreated: false',
      'crmRecordUpdated: false',
      'crmRecordLinked: false',
    ],
    'externalWritebackSchemaValidator.ts': [
      'liveWritePerformed: false',
      'externalSystemChanged: false',
    ],
    'externalAllowlistedWritePilot.ts': [
      'liveWritePilotEnabled: false',
      'liveWritePerformed: false',
      'externalSystemChanged: false',
    ],
  };

  for (const [file, booleans] of Object.entries(SAFETY_FILES)) {
    for (const bool of booleans) {
      it(`${file} pins ${bool}`, () => {
        const src = readFileSync(resolve(EXT_DIR, file), 'utf8');
        expect(src).toContain(bool);
      });
    }
  }
});

// ── 5. no fetch / XHR / axios in source ──

describe('Phase 156 — no fetch/XHR/axios in source', () => {
  for (const f of SOURCE_FILES) {
    it(`${f.name} has no direct fetch/XHR/axios`, () => {
      expect(f.code).not.toMatch(/\bfetch\s*\(/);
      expect(f.code).not.toMatch(/\bXMLHttpRequest\b/);
      expect(f.code).not.toMatch(/\baxios\b/);
    });
  }
});

// ── 6. no secrets / env values ──

describe('Phase 156 — no secrets or env values in source', () => {
  for (const f of SOURCE_FILES) {
    it(`${f.name} has no secrets or env references`, () => {
      expect(f.code).not.toMatch(/process\.env\b/);
      expect(f.code).not.toMatch(/import\.meta\.env\b/);
      expect(f.code).not.toMatch(/API_KEY|API_SECRET|ACCESS_TOKEN|CLIENT_SECRET/i);
      expect(f.code).not.toMatch(/Bearer\s+[A-Za-z0-9._\-]{20,}/);
    });
  }
});

// ── 7. no syncNow / pushNow / writeNow / enableLive handlers ──

describe('Phase 156 — no dangerous action handlers', () => {
  for (const f of SOURCE_FILES) {
    it(`${f.name} has no syncNow/pushNow/writeNow/enableLive handlers`, () => {
      expect(f.code).not.toMatch(/\bsyncNow\b/);
      expect(f.code).not.toMatch(/\bpushNow\b/);
      expect(f.code).not.toMatch(/\bwriteNow\b/);
      expect(f.code).not.toMatch(/\benableLive\b/);
    });
  }
});
