import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Phase 149 — No-fake-production-data certification.
 * Scans all production source for prohibited fake-data patterns.
 * Excludes test files, docs, and scripts.
 */

const SRC_ROOT = resolve(__dirname, '..', '..');

function collectProductionFiles(dir: string): string[] {
  const results: string[] = [];
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return results;
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
      if (entry.name.includes('.story.') || entry.name.includes('.stories.')) continue;
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
      results.push(full);
    }
  }
  walk(dir);
  return results;
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const allFiles = collectProductionFiles(SRC_ROOT);

describe('Phase 149 — no-fake-production-data scan', () => {
  it('discovers production source files', () => {
    expect(allFiles.length).toBeGreaterThan(100);
  });

  const FAKE_DATA_PATTERNS: { pattern: RegExp; label: string }[] = [
    { pattern: /\bsampleDeal[s]?\b/, label: 'sampleDeal(s)' },
    { pattern: /\bmockDeal[s]?\b/, label: 'mockDeal(s)' },
    { pattern: /\bfakeDeal[s]?\b/, label: 'fakeDeal(s)' },
    { pattern: /\bdemoDeal[s]?\b/, label: 'demoDeal(s)' },
    { pattern: /\bsampleClient\b/, label: 'sampleClient' },
    { pattern: /\bmockClient\b/, label: 'mockClient' },
    { pattern: /\bfakeClient\b/, label: 'fakeClient' },
    { pattern: /\bdemoClient\b/, label: 'demoClient' },
    { pattern: /\bsampleData\b/, label: 'sampleData' },
    { pattern: /\bmockData\b/, label: 'mockData' },
    { pattern: /\bfakeData\b/, label: 'fakeData' },
    { pattern: /\bdemoData\b/, label: 'demoData' },
    { pattern: /\bhardcodedDeals\b/, label: 'hardcodedDeals' },
    { pattern: /\bplaceholderRows\b/, label: 'placeholderRows' },
    { pattern: /lorem ipsum/i, label: 'lorem ipsum' },
  ];

  for (const { pattern, label } of FAKE_DATA_PATTERNS) {
    it(`no production source contains ${label}`, () => {
      for (const file of allFiles) {
        const code = stripComments(readFileSync(file, 'utf8'));
        if (pattern.test(code)) {
          const rel = file.replace(SRC_ROOT, 'src');
          expect.fail(`${rel} contains prohibited pattern: ${label}`);
        }
      }
    });
  }

  const FAKE_SUCCESS_PATTERNS: { pattern: RegExp; label: string }[] = [
    { pattern: /synced successfully/i, label: 'synced successfully' },
    { pattern: /pushed successfully/i, label: 'pushed successfully' },
    { pattern: /Salesforce updated/i, label: 'Salesforce updated' },
    { pattern: /nCino updated/i, label: 'nCino updated' },
    { pattern: /connected successfully/i, label: 'connected successfully' },
    { pattern: /live write completed/i, label: 'live write completed' },
    { pattern: /exported successfully/i, label: 'exported successfully' },
    { pattern: /PandaDoc envelope created/i, label: 'PandaDoc envelope created' },
    { pattern: /bureau score found/i, label: 'bureau score found' },
    { pattern: /OFAC no match/i, label: 'OFAC no match' },
    { pattern: /KYC approved/i, label: 'KYC approved' },
    { pattern: /core match found/i, label: 'core match found' },
    { pattern: /profitability calculated/i, label: 'profitability calculated' },
    { pattern: /ROE calculated/i, label: 'ROE calculated' },
  ];

  for (const { pattern, label } of FAKE_SUCCESS_PATTERNS) {
    it(`no production source contains fake success: ${label}`, () => {
      for (const file of allFiles) {
        const code = stripComments(readFileSync(file, 'utf8'));
        if (pattern.test(code)) {
          const rel = file.replace(SRC_ROOT, 'src');
          expect.fail(`${rel} contains prohibited fake success: ${label}`);
        }
      }
    });
  }
});
