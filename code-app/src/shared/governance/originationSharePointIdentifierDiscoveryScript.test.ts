import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = readFileSync(resolve(process.cwd(), 'scripts/microsoft365/resolve-origination-sharepoint-identifiers.ps1'), 'utf8');

describe('SharePoint immutable-identifier discovery script', () => {
  it('is read-only and pins the approved target', () => {
    expect(script).toContain("Invoke-RestMethod -Method Get");
    expect(script).not.toMatch(/Invoke-RestMethod\s+-Method\s+(Post|Patch|Put|Delete)/i);
    expect(script).toContain('c1a62131-7946-44b9-bb4c-b4637a16f83c');
    expect(script).toContain("$expectedRootPath = '/(a) Loans'");
    expect(script).toContain('Expected exactly one Documents drive candidate');
  });

  it('does not print or persist the access token', () => {
    expect(script).not.toMatch(/Write-(Host|Output).*Token/i);
    expect(script).not.toMatch(/ConvertTo-Json[^\n]*Token/i);
    expect(script).toContain('$headers.Authorization = $null');
  });
});
