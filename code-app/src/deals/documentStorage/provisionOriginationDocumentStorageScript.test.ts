import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = readFileSync(resolve(process.cwd(), 'scripts/dataverse/provision-origination-document-storage.ps1'), 'utf8');

describe('origination document storage provisioning script', () => {
  it('is additive, dry-run-first, environment-bound, and idempotent', () => {
    expect(script).toMatch(/\[switch\]\$Apply/);
    expect(script).toMatch(/\[switch\]\$Force/);
    expect(script).toMatch(/Get-DataverseToken \$OrgUrl/);
    expect(script).toMatch(/Test-DataverseToken \$OrgUrl \$token/);
    expect(script).toMatch(/New-DataverseTableIfMissing/);
    expect(script).toMatch(/New-DataverseRelationshipIfMissing/);
    expect(script).not.toMatch(/\bDELETE\b|-Method\s+Patch|Remove-/i);
  });

  it('plans mappings, exceptions, due diligence, relationships, keys, and SDK regeneration gate', () => {
    for (const expected of [
      'cr664_documentrequirementfilemap',
      'cr664_documentexception',
      'cr664_duediligencedefinition',
      'cr664_documentrequirementfilemap_correlation_key',
      'cr664_documentexception_correlation_key',
      'cr664_duediligencedefinition_stable_key',
      'Generated SDK regeneration and SharePoint connector registration remain separate fail-closed gates',
    ]) expect(script).toContain(expected);
  });
});
