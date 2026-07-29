import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = readFileSync(
  resolve(process.cwd(), 'scripts/dataverse/prepare-production-go-remediation.ps1'),
  'utf8',
);

describe('Production GO remediation script safety contract', () => {
  it('is dry-run by default and requires an approved manifest hash for apply', () => {
    expect(script).toMatch(/DefaultParameterSetName\s*=\s*'Inventory'/);
    expect(script).toMatch(
      /\[Parameter\(Mandatory,\s*ParameterSetName\s*=\s*'Apply'\)\][\s\S]*?\[string\]\$ApprovedManifestHash/,
    );
    expect(script).toMatch(/Manifest hash mismatch/);
  });

  it('uses captured ETags and has no delete or automatic merge path', () => {
    expect(script).toMatch(/If-Match/);
    expect(script).toMatch(/ApplyEvidencePath/);
    expect(script).toMatch(/requestedChanges/);
    expect(script).toMatch(/readback/);
    expect(script).toMatch(/operation\s*=\s*'review'/);
    expect(script).not.toMatch(/Invoke-RestMethod\s+-Method\s+Delete/i);
    expect(script).not.toMatch(/MergeRecords/i);
  });

  it('never prints or writes the access token', () => {
    expect(script).not.toMatch(/Write-(?:Host|Output).*\$token/i);
    expect(script).not.toMatch(/Set-Content.*token/i);
  });

  it('inventories every governed remediation domain', () => {
    for (const category of [
      'controlled-classification-conflict',
      'duplicate-deal',
      'duplicate-crm-organization',
      'duplicate-entitlement',
      'duplicate-boarding-link',
      'incomplete-boarded-loan',
      'controlled-parent-open-tasks',
      'controlled-crm-organization',
      'duplicate-document-taxonomy',
      'document-metadata-file-inconsistency',
      'final-memo-content-inconsistency',
    ]) {
      expect(script).toContain(category);
    }
  });

  it('uses the same controlled-name conventions as live operational surfaces', () => {
    // Regression for the live 8-vs-13 discrepancy: the inventory used to miss
    // bracketed smoke records, "WF-1A Test Deal", and versioned V1 smoke names.
    expect(script).toContain(
      String.raw`\[\s*(system\s*test|smoke\s*test|smoke|test|qa|demo|sandbox|do\s*not\s*use)`,
    );
    expect(script).toContain(String.raw`\btest\s*deal\b`);
    expect(script).toContain(String.raw`\b(?:v\d+\s+)?[\w\s-]*\bsmoke\b`);
    expect(script).toContain(String.raw`\bstage\s+advancement\s+smoke\b`);
  });
});
