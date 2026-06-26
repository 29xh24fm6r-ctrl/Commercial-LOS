import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 204N — read-only detail polish must NOT widen Dataverse reads or add a
 * write path. This contract pins that the safe-read selects are unchanged, the new
 * display module is pure (no SDK / network), and the panel surfaces the safe-read
 * explanation while keeping grant disabled.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const QUERIES = read('src/admin/adminUserAccessQueries.ts');
const DISPLAY = read('src/admin/adminUserAccessDisplay.ts');
const PANEL = read('src/admin/UserAccessManagementPanel.tsx');

function selectArrays(src: string): string[] {
  return [...src.matchAll(/select:\s*\[([\s\S]*?)\]/g)].map((m) => m[1]!);
}
function fieldsOf(arr: string): string[] {
  return [...arr.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe('204N — safe-read selects are unchanged (no widening)', () => {
  it('platform-user select stays exactly the four safe fields', () => {
    const platform = selectArrays(QUERIES).find((a) => a.includes('cr664_platformuserid'));
    expect(fieldsOf(platform!)).toEqual([
      'cr664_platformuserid',
      'cr664_email',
      'cr664_fullname',
      'cr664_activestatus',
    ]);
  });
  it('entitlement select stays exactly the four safe fields', () => {
    const ent = selectArrays(QUERIES).find((a) => a.includes('cr664_entitlementname'));
    expect(fieldsOf(ent!)).toEqual([
      'cr664_entitlementname',
      'cr664_accesslevel',
      '_cr664_losuserprofile_value',
      'statecode',
    ]);
  });
  it('no select array reintroduces an unsafe formatted/display field', () => {
    for (const arr of [...selectArrays(QUERIES)]) {
      expect(arr).not.toMatch(
        /cr664_identitystatusname|cr664_primaryworkspacename|cr664_accesslevelname|cr664_workspacename|cr664_losuserprofilename|cr664_isdefault|cr664_workspaceentitlementsid/,
      );
    }
  });
});

describe('204N — the query module never writes', () => {
  it('calls no create/update/delete and no fetch/Graph', () => {
    expect(QUERIES).not.toMatch(/\.create\(|\.update\(|\.delete\(/);
    expect(QUERIES).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(QUERIES).not.toMatch(/\bfetch\s*\(/);
    expect(QUERIES).not.toMatch(/graph\.microsoft\.com/i);
  });
});

describe('204N — the display module is pure (no Dataverse / network)', () => {
  it('imports no generated service and performs no read', () => {
    expect(DISPLAY).not.toMatch(/from ['"][^'"]*\/generated\//);
    expect(DISPLAY).not.toMatch(/getAll|\.create\(|\.update\(|\.delete\(/);
    expect(DISPLAY).not.toMatch(/\bfetch\s*\(/);
  });
  it('never fabricates a display name for a blank field', () => {
    // The honest blank labels are the only literals the helpers return for blanks.
    expect(DISPLAY).toMatch(/Not selected by safe-read contract/);
    expect(DISPLAY).toMatch(/Not linked/);
  });
});

describe('204N — panel polish is read-only and explains the safe-read', () => {
  it('uses the display helpers, not raw-only numbers', () => {
    expect(PANEL).toMatch(/formatAdminAccessLevel/);
    expect(PANEL).toMatch(/formatProfileReference/);
    expect(PANEL).toMatch(/formatSafeReadWorkspaceName/);
  });
  it('includes safe-read explanatory copy and (Phase 259) honest add-user operator guidance', () => {
    expect(PANEL).toMatch(/intentionally not selected from Dataverse/i);
    // Phase 259 (Remediation A): the disabled preview grant form is replaced
    // by honest operator guidance for provisioning a new user.
    expect(PANEL).toMatch(/provisioned by an operator/i);
  });
  it('introduces no write call in the panel', () => {
    expect(PANEL).not.toMatch(/\bfetch\s*\(/);
    expect(PANEL).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(PANEL).not.toMatch(/\.create\(|\.update\(|\.delete\(/);
  });
});
