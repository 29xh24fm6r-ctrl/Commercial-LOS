import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildGrantAccessPreview,
  ADMIN_ACCESS_LEVELS,
  USER_ACCESS_LIVE_WRITE_ENABLED,
  USER_ACCESS_SCOPE_DISCLAIMER,
  USER_ACCESS_WRITE_BLOCKER,
} from './adminUserAccessModel';

/**
 * Phase 169B -- User & Access Management model (Case B, preview-only).
 */

describe('Phase 169B -- live write stays disabled (Case B)', () => {
  it('USER_ACCESS_LIVE_WRITE_ENABLED is false', () => {
    expect(USER_ACCESS_LIVE_WRITE_ENABLED).toBe(false);
  });

  it('the scope disclaimer separates app entitlements from Dataverse security roles', () => {
    expect(USER_ACCESS_SCOPE_DISCLAIMER).toMatch(/app-level entitlements/i);
    expect(USER_ACCESS_SCOPE_DISCLAIMER).toMatch(/does not grant Microsoft tenant access or Dataverse security roles/i);
    expect(USER_ACCESS_SCOPE_DISCLAIMER).toMatch(/Power Platform admin center/i);
  });

  it('the write blocker explains the missing governed write path', () => {
    expect(USER_ACCESS_WRITE_BLOCKER).toMatch(/No governed app-level entitlement write adapter exists/i);
    expect(USER_ACCESS_WRITE_BLOCKER).toMatch(/cr664_PrimaryWorkspace/);
  });
});

describe('Phase 169B -- grant preview validates and stays write-free', () => {
  const valid = {
    email: 'person@oldglorybank.com',
    fullName: 'Pat Person',
    workspaceName: 'Banker Workspace',
    accessLevel: 'ReadOnly' as const,
  };

  it('never enables a live write', () => {
    expect(buildGrantAccessPreview(valid).liveWriteEnabled).toBe(false);
  });

  it('blocks a blank email', () => {
    const p = buildGrantAccessPreview({ ...valid, email: '   ' });
    expect(p.ok).toBe(false);
    expect(p.errors.join(' ')).toMatch(/Email \/ UPN is required/i);
  });

  it('blocks an invalid email', () => {
    const p = buildGrantAccessPreview({ ...valid, email: 'not-an-email' });
    expect(p.ok).toBe(false);
    expect(p.errors.join(' ')).toMatch(/valid email/i);
  });

  it('blocks a blank workspace', () => {
    const p = buildGrantAccessPreview({ ...valid, workspaceName: '' });
    expect(p.ok).toBe(false);
    expect(p.errors.join(' ')).toMatch(/Workspace to grant is required/i);
  });

  it('accepts well-formed input and plans only allowed app-level fields', () => {
    const p = buildGrantAccessPreview(valid);
    expect(p.ok).toBe(true);
    const labels = p.plannedFields.map((f) => f.label);
    // Only allowed app-level fields -- no system/security columns.
    expect(labels).toEqual([
      'cr664_email',
      'cr664_fullname',
      'cr664_entitlementname',
      'cr664_accesslevel',
    ]);
    for (const banned of ['systemuserid', 'roleid', 'securityrole', 'businessunitid', 'ownerid']) {
      expect(labels.join(' ').toLowerCase()).not.toContain(banned);
    }
  });

  it('never emits a Dataverse GUID in the preview', () => {
    const p = buildGrantAccessPreview(valid);
    const blob = JSON.stringify(p);
    expect(blob).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });

  it('describes binds as server-side resolution by stable identifier (not GUIDs)', () => {
    const p = buildGrantAccessPreview(valid);
    expect(p.requiresServerSideResolution.join(' ')).toMatch(/cr664_PrimaryWorkspace/);
    expect(p.requiresServerSideResolution.join(' ')).toMatch(/no hardcoded GUID/i);
  });

  it('exposes exactly the three app access levels', () => {
    expect(ADMIN_ACCESS_LEVELS).toEqual(['Full', 'ReadOnly', 'Admin']);
  });
});

describe('Phase 169B -- model source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'adminUserAccessModel.ts'), 'utf8');

  it('contains no fetch / XHR / Graph / Dataverse write primitives', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
  });

  it('hardcodes no Dataverse GUID', () => {
    expect(SRC).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});
