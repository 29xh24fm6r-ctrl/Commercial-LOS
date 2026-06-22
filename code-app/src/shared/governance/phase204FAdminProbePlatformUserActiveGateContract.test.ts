import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolvePlatformUserUsableForAdminProbe } from '../../admin/adminWorkspaceEntitlementQuery';

/**
 * PHASE 204F — admin probe PlatformUser active-gate alignment with bootstrapFlow.ts.
 *
 * bootstrapFlow.ts boots the app on a PlatformUser row + a primary workspace and
 * does NOT gate on cr664_activestatus. The admin probe must not be stricter: it
 * must proceed to entitlement evaluation for any bootable user and fail closed
 * only on EXPLICIT deactivation (Inactive statecode or Disabled/Suspended identity).
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const QUERY = read('src/admin/adminWorkspaceEntitlementQuery.ts');
const BOOTSTRAP = read('src/bootstrap/bootstrapFlow.ts');
const DOC_REL = 'docs/PHASE_204F_ADMIN_PROBE_PLATFORMUSER_ACTIVE_GATE_ALIGNMENT.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';

describe('204F — probe is no stricter than bootstrap on PlatformUser activeness', () => {
  it('bootstrap does not gate on cr664_activestatus (the baseline this aligns to)', () => {
    expect(BOOTSTRAP).not.toMatch(/cr664_activestatus/);
  });
  it('the probe no longer requires cr664_activestatus === true', () => {
    expect(QUERY).not.toMatch(/cr664_activestatus !== true/);
    expect(QUERY).toMatch(/resolvePlatformUserUsableForAdminProbe\(user\)/);
  });
  it('the probe selects identitystatus + statecode for the explicit-deactivation gate', () => {
    expect(QUERY).toMatch(/'cr664_identitystatus'/);
    expect(QUERY).toMatch(/'statecode'/);
  });
});

describe('204F — resolver expected behavior', () => {
  const ACTIVE = 788190000;
  const DISABLED = 788190002;
  const SUSPENDED = 788190003;
  const u = (over: Record<string, unknown> = {}) => ({ statecode: 0, cr664_identitystatus: ACTIVE, cr664_activestatus: true, ...over });

  it('no row / Inactive / Disabled / Suspended => false', () => {
    expect(resolvePlatformUserUsableForAdminProbe(undefined)).toBe(false);
    expect(resolvePlatformUserUsableForAdminProbe(u({ statecode: 1 }))).toBe(false);
    expect(resolvePlatformUserUsableForAdminProbe(u({ cr664_identitystatus: DISABLED }))).toBe(false);
    expect(resolvePlatformUserUsableForAdminProbe(u({ cr664_identitystatus: SUSPENDED }))).toBe(false);
  });
  it('undefined / false activestatus over an active row => true (bootstrap parity)', () => {
    expect(resolvePlatformUserUsableForAdminProbe(u({ cr664_activestatus: undefined }))).toBe(true);
    expect(resolvePlatformUserUsableForAdminProbe(u({ cr664_activestatus: false }))).toBe(true);
    expect(resolvePlatformUserUsableForAdminProbe(u({ cr664_activestatus: true }))).toBe(true);
  });
});

describe('204F — doc records the mismatch', () => {
  it('the doc exists and explains the bootstrap vs probe gate mismatch', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    expect(DOC).toMatch(/bootstrapFlow/);
    expect(DOC).toMatch(/cr664_activestatus/);
    expect(DOC).toMatch(/statecode|identitystatus/);
  });
  it('keeps GUIDs redacted', () => {
    expect(DOC).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
