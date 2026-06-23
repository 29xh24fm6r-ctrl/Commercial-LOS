import { describe, it, expect } from 'vitest';
import {
  formatAdminAccessLevel,
  formatSafeReadWorkspaceName,
  formatProfileReference,
  adminEntitlementGroup,
} from './adminUserAccessDisplay';

describe('Phase 204N — formatAdminAccessLevel', () => {
  it('formats known option-set values as label + raw', () => {
    expect(formatAdminAccessLevel('788190000')).toBe('Full — 788190000');
    expect(formatAdminAccessLevel('788190001')).toBe('ReadOnly — 788190001');
    expect(formatAdminAccessLevel('788190002')).toBe('Admin — 788190002');
  });
  it('formats unknown values without hiding the raw value', () => {
    expect(formatAdminAccessLevel('999')).toBe('Unknown — 999');
  });
  it('formats blank/undefined as a dash', () => {
    expect(formatAdminAccessLevel(undefined)).toBe('—');
    expect(formatAdminAccessLevel('')).toBe('—');
  });
});

describe('Phase 204N — formatSafeReadWorkspaceName', () => {
  it('explains the blank workspace via the safe-read contract', () => {
    expect(formatSafeReadWorkspaceName(undefined)).toBe('Not selected by safe-read contract');
    expect(formatSafeReadWorkspaceName('')).toBe('Not selected by safe-read contract');
    expect(formatSafeReadWorkspaceName('   ')).toBe('Not selected by safe-read contract');
  });
  it('shows a present value verbatim (no fabrication)', () => {
    expect(formatSafeReadWorkspaceName('Banker Workspace')).toBe('Banker Workspace');
  });
});

describe('Phase 204N — formatProfileReference', () => {
  it('shows the raw profile GUID when present', () => {
    expect(formatProfileReference('4fa22088-0c56-f111-bec7-70a8a59be491')).toBe(
      '4fa22088-0c56-f111-bec7-70a8a59be491',
    );
  });
  it('shows "Not linked" when missing', () => {
    expect(formatProfileReference(undefined)).toBe('Not linked');
    expect(formatProfileReference('')).toBe('Not linked');
  });
});

describe('Phase 204N — adminEntitlementGroup (display-only, from numeric access level)', () => {
  it('buckets by numeric access level only', () => {
    expect(adminEntitlementGroup('788190002')).toBe('Admin');
    expect(adminEntitlementGroup('788190000')).toBe('Full');
    expect(adminEntitlementGroup('788190001')).toBe('ReadOnly');
    expect(adminEntitlementGroup('999')).toBe('Other');
    expect(adminEntitlementGroup(undefined)).toBe('Other');
  });
});
