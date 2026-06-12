import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * BUGFIX-CRM-VENDOR-BRAND-COPY-REMOVAL-1 — governance certification.
 *
 * Proves that production UI source files rendering CRM surfaces do not
 * expose third-party vendor/product names to the user. Internal code
 * identifiers (property names, type aliases, enum values) are allowed
 * temporarily, but user-facing string literals must use neutral OGB
 * language.
 */

const REPO_SRC = resolve(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_SRC, rel), 'utf8');
}

/**
 * Extract string literals from source (single and double quoted).
 * This is a best-effort scan — it catches the vast majority of
 * user-facing copy without a full AST parse.
 */
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

const UI_FILES = [
  'banker/BankerCrmIntelligencePanel.tsx',
  'crm/workspaceIntegration/CrmBankerWorkingSurface.tsx',
  'crm/workspaceIntegration/CrmManagerWorkingSurface.tsx',
  'crm/workspaceIntegration/CrmExecutiveWorkingSurface.tsx',
  'crm/workspaceIntegration/crmWorkspacePreviewInputs.ts',
  'crm/commandCenter/CrmCommandCenter.tsx',
  'crm/commandCenter/CrmCommandCenterShell.tsx',
  'crm/commandCenter/CrmWorkspaceEntryCard.tsx',
  'crm/commandCenter/crmCommandCenterViewModel.ts',
  'crm/commandCenter/CrmRelationshipIntelligenceStory.tsx',
];

const VENDOR_PATTERNS = [
  /\bSalesforce\b/i,
  /\bnCino\b/i,
];

/**
 * User-facing strings are those that appear as labels, titles, subtitles,
 * descriptions, safety copy, aria-labels, etc. Internal identifiers like
 * `provider: 'salesforce'` or `id: 'ncino'` are code-level enum values
 * that are not rendered to users. We filter out short single-word
 * lowercase strings that look like internal identifiers.
 */
function isLikelyUserFacing(lit: string): boolean {
  // Skip short single-word lowercase identifiers (enum values, IDs)
  if (/^[a-z_]+$/.test(lit) && lit.length < 30) return false;
  // Skip import paths
  if (lit.startsWith('./') || lit.startsWith('../') || lit.startsWith('../../')) return false;
  return true;
}

describe('BUGFIX-CRM-VENDOR-BRAND-COPY-REMOVAL-1 — no vendor names in UI string literals', () => {
  for (const rel of UI_FILES) {
    it(`${rel} has no vendor product names in user-facing strings`, () => {
      const code = readSrc(rel);
      const literals = extractStringLiterals(code).filter(isLikelyUserFacing);
      for (const lit of literals) {
        for (const pattern of VENDOR_PATTERNS) {
          expect(
            lit,
            `${rel} contains vendor name in string literal: "${lit}"`,
          ).not.toMatch(pattern);
        }
      }
    });
  }
});

describe('BUGFIX-CRM-VENDOR-BRAND-COPY-REMOVAL-1 — neutral labels present', () => {
  it('CrmBankerWorkingSurface uses neutral CRM and Lending Workflow labels', () => {
    const src = readSrc('crm/workspaceIntegration/CrmBankerWorkingSurface.tsx');
    const literals = extractStringLiterals(src);
    const labels = literals.join(' ');
    expect(labels).toContain('CRM');
    expect(labels).toContain('Lending Workflow');
    expect(labels).toContain('read-only');
  });

  it('BankerCrmIntelligencePanel uses neutral subtitle', () => {
    const src = readSrc('banker/BankerCrmIntelligencePanel.tsx');
    const literals = extractStringLiterals(src);
    const allCopy = literals.join(' ');
    expect(allCopy).toContain('CRM and lending workflow preview intelligence');
  });

  it('CrmCommandCenter VM uses neutral labels', () => {
    const src = readSrc('crm/commandCenter/crmCommandCenterViewModel.ts');
    const literals = extractStringLiterals(src);
    const allCopy = literals.join(' ');
    expect(allCopy).toContain('CRM System');
    expect(allCopy).toContain('Lending Workflow');
  });
});
