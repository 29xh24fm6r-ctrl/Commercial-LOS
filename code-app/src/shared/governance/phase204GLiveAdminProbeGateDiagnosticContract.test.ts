import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PHASE 204G — the live admin-probe gate diagnostic is temporary, read-only, and
 * changes no authorization. This contract pins those properties at the source
 * level so the diagnostic can never silently grow a write affordance or widen
 * access, and confirms the live authorization path is untouched.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const QUERY = read('src/admin/adminWorkspaceEntitlementQuery.ts');
const CARD = read('src/admin/AdminEntitlementDiagnosticCard.tsx');
const CARD_CODE = stripComments(CARD);
const WORKSPACE = read('src/workspaces/BankerWorkspace.tsx');
const DOC_REL = 'docs/PHASE_204G_LIVE_ADMIN_PROBE_GATE_DIAGNOSTIC.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';

describe('204G — diagnostic is read-only and side-effect free', () => {
  it('the card has no write affordance, no SDK import, no operator email', () => {
    expect(CARD_CODE).not.toMatch(/<button/i);
    expect(CARD_CODE).not.toMatch(/<form\b/i);
    expect(CARD_CODE).not.toMatch(/\bonSubmit\b/);
    expect(CARD_CODE).not.toMatch(/\bonClick\b/);
    expect(CARD_CODE).not.toMatch(/from ['"][^'"]*\/generated\//);
    expect(CARD_CODE).not.toMatch(/mpaller@/i);
  });
  it('the card is gated behind the single diagnostic flag', () => {
    expect(CARD).toMatch(/ADMIN_ENTITLEMENT_DIAGNOSTIC_ENABLED/);
  });
});

describe('204G — diagnostic does not change authorization', () => {
  it('the live authorization gate still uses resolvePlatformUserUsableForAdminProbe + the identity deriver', () => {
    expect(QUERY).toMatch(/resolvePlatformUserUsableForAdminProbe\(user\)/);
    expect(QUERY).toMatch(/deriveHasAdminWorkspaceEntitlementForUser\(\{ currentUser, entitlements \}\)/);
  });
  it('the diagnostic loader is separate from the authorization loader', () => {
    expect(QUERY).toMatch(/export async function loadAdminWorkspaceEntitlement\(/);
    expect(QUERY).toMatch(/export async function loadAdminWorkspaceEntitlementDiagnostic\(/);
  });
  it('the diagnostic builder never surfaces GUID lookups (no losUserProfileId / platformUserId fields)', () => {
    // The diagnostic row/summary types must not expose the raw GUID lookups.
    const diagTypes = QUERY.slice(QUERY.indexOf('AdminEntitlementDiagnosticRow'));
    expect(diagTypes).not.toMatch(/readonly losUserProfileId\b/);
    expect(diagTypes).not.toMatch(/readonly platformUserId\b/);
  });
});

describe('204G — composed at the workspace layer (role isolation preserved)', () => {
  it('the card lives in src/admin (not in src/banker); the temporary banker-workspace diagnostic banner was removed in Phase 230B', () => {
    // Phase 230B removed the temporary diagnostic banner from the banker workspace
    // (production header cleanup); the card module remains in src/admin for any
    // future admin-surfaced use. It is no longer mounted in BankerWorkspace.
    expect(existsSync(resolve(ROOT, 'src/admin/AdminEntitlementDiagnosticCard.tsx'))).toBe(true);
    expect(WORKSPACE).not.toMatch(/<AdminEntitlementDiagnosticCard/);
  });
});

describe('204G — doc records the temporary diagnostic', () => {
  it('the doc exists and states it is temporary, read-only, no auth change', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    expect(DOC).toMatch(/temporary/i);
    expect(DOC).toMatch(/read-only/i);
    expect(DOC).toMatch(/no authorization|changes? no authorization|no auth/i);
  });
  it('keeps GUIDs redacted', () => {
    expect(DOC).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
