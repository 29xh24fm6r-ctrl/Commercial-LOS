import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveWorkspaceRoute, WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import {
  deriveHasAdminWorkspaceEntitlement,
  type AdminEntitlementCandidate,
} from '../../admin/adminWorkspaceEntitlementQuery';

/**
 * PHASE 204B — admin workspace live reference alignment contract.
 *
 * The probe recognizes the live "Admin Control Center" reference row via the
 * canonical resolver, enforces all four authorization gates, never hard-codes
 * the operator email into app rendering, and the doc describes an idempotent
 * data repair.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
const DOC_REL = 'docs/PHASE_204B_ADMIN_WORKSPACE_LIVE_REFERENCE_ALIGNMENT.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';

const P = ['profile-matt'];
const ent = (over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate => ({
  accessLevelName: 'Admin',
  workspaceName: 'Admin Control Center',
  losUserProfileId: 'profile-matt',
  active: true,
  ...over,
});
const authorize = (entitlements: AdminEntitlementCandidate[], profiles = P) =>
  deriveHasAdminWorkspaceEntitlement({ userLosProfileIds: profiles, entitlements });

describe('204B — canonical resolver recognizes the live reference rows', () => {
  it('Admin Control Center → admin; Admin Workspace → admin (backward compat)', () => {
    expect(resolveWorkspaceRoute('Admin Control Center')).toBe(WORKSPACE_ROUTES.admin);
    expect(resolveWorkspaceRoute('Admin Workspace')).toBe(WORKSPACE_ROUTES.admin);
  });
  it('preserves Banker / Team / Manager / Executive mappings', () => {
    expect(resolveWorkspaceRoute('Banker Workspace')).toBe(WORKSPACE_ROUTES.banker);
    expect(resolveWorkspaceRoute('Team Workspace')).toBe(WORKSPACE_ROUTES.team);
    expect(resolveWorkspaceRoute('Manager Command Center')).toBe(WORKSPACE_ROUTES.manager);
    expect(resolveWorkspaceRoute('Executive Dashboard')).toBe(WORKSPACE_ROUTES.executive);
  });
});

describe('204B — all four authorization gates enforced', () => {
  it('authorizes only with active + profile-match + Admin/Full + admin-resolved workspace', () => {
    expect(authorize([ent({ accessLevelName: 'Admin' })])).toBe(true);
    expect(authorize([ent({ accessLevelName: 'Full' })])).toBe(true);
  });
  it('does not authorize from access level alone (wrong workspace)', () => {
    expect(authorize([ent({ workspaceName: 'Banker Workspace' })])).toBe(false);
  });
  it('does not authorize from another user / owner without profile match', () => {
    expect(authorize([ent({ losUserProfileId: 'profile-ckingma' })])).toBe(false);
  });
  it('does not authorize an inactive or ReadOnly entitlement, or with no profile', () => {
    expect(authorize([ent({ active: false })])).toBe(false);
    expect(authorize([ent({ accessLevelName: 'ReadOnly' })])).toBe(false);
    expect(authorize([ent()], [])).toBe(false);
  });
});

describe('204B — app code does not hard-code the operator email', () => {
  it('the probe / console / entitlements modules contain no mpaller email literal', () => {
    for (const rel of [
      'src/admin/adminWorkspaceEntitlementQuery.ts',
      'src/admin/AdminOperationsConsole.tsx',
      'src/bootstrap/workspaceEntitlements.ts',
    ]) {
      expect(read(rel)).not.toMatch(/mpaller@oldglorybank\.com/i);
    }
  });
});

describe('204B — doc records the idempotent data repair', () => {
  it('the Phase 204B doc exists and binds the existing rows by GUID', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
    expect(DOC).toMatch(/idempotent/i);
    expect(DOC).toMatch(/Admin Control Center/);
    expect(DOC).toMatch(/Matthew Paller - Admin Full Access/);
    expect(DOC).toMatch(/AccessLevel.*Admin|Admin.*AccessLevel/);
    expect(DOC).toMatch(/IsDefault.*No|No.*IsDefault/);
    expect(DOC).toMatch(/Active/);
    expect(DOC).toMatch(/bind .*GUID|by GUID/i);
  });
  it('the doc keeps GUIDs redacted (no real GUID committed)', () => {
    expect(DOC).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(DOC).toMatch(/redacted/i);
  });
});
