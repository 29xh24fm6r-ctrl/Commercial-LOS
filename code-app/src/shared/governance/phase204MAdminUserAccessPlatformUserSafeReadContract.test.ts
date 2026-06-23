import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 204M — the Admin User Access reads use only live-safe Dataverse fields.
 *
 * The formatted/display fields (cr664_identitystatusname, cr664_primaryworkspacename
 * on platform users; the workspace/accesslevel/profile display names on entitlements)
 * are not selectable in live Dataverse and fail the whole query. This contract pins
 * the safe-field reads and the read-only discipline of the query module.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const SRC = readFileSync(resolve(ROOT, 'src/admin/adminUserAccessQueries.ts'), 'utf8');

/** The contents of each `select: [...]` array in the query module. */
function selectArrays(): string[] {
  return [...SRC.matchAll(/select:\s*\[([\s\S]*?)\]/g)].map((m) => m[1]!);
}
function fieldsOf(arr: string): string[] {
  return [...arr.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe('204M — platform-user read selects only live-safe base fields', () => {
  it('does not select cr664_identitystatusname or cr664_primaryworkspacename', () => {
    for (const arr of selectArrays()) {
      expect(arr).not.toMatch(/cr664_identitystatusname/);
      expect(arr).not.toMatch(/cr664_primaryworkspacename/);
    }
  });
  it('the platform-user select is exactly the four safe base fields', () => {
    const platformSelect = selectArrays().find((a) => a.includes('cr664_platformuserid'));
    expect(platformSelect).toBeDefined();
    expect(fieldsOf(platformSelect!)).toEqual([
      'cr664_platformuserid',
      'cr664_email',
      'cr664_fullname',
      'cr664_activestatus',
    ]);
  });
});

describe('204M — entitlement read remains the Phase 204L four-field safe-read', () => {
  it('selects exactly the four safe entitlement fields and no display names', () => {
    const entSelect = selectArrays().find((a) => a.includes('cr664_entitlementname'));
    expect(entSelect).toBeDefined();
    expect(fieldsOf(entSelect!)).toEqual([
      'cr664_entitlementname',
      'cr664_accesslevel',
      '_cr664_losuserprofile_value',
      'statecode',
    ]);
    for (const arr of selectArrays()) {
      expect(arr).not.toMatch(/cr664_workspacename|cr664_accesslevelname|cr664_losuserprofilename|cr664_isdefault|cr664_workspaceentitlementsid/);
    }
  });
});

describe('204M — summary labels which read failed', () => {
  it('wraps both reads with a side-specific failure label', () => {
    expect(SRC).toMatch(/platform-user read failed/i);
    expect(SRC).toMatch(/entitlement read failed/i);
  });
});

describe('204M — the query module never writes', () => {
  it('calls no create/update/delete and no fetch/Graph', () => {
    expect(SRC).not.toMatch(/\.create\(|\.update\(|\.delete\(/);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
  });
});
