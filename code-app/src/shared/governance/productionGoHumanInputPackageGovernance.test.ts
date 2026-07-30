import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PACKAGE = readFileSync(
  resolve(__dirname, '../../../docs/governance/PRODUCTION_GO_HUMAN_INPUT_PACKAGE_2026-07-30.md'),
  'utf8',
);

describe('Production GO consolidated human-input package', () => {
  it('keeps the verdict NO-GO and prohibits inferred values', () => {
    expect(PACKAGE).toMatch(/Production verdict remains \*\*NO-GO\*\*/);
    expect(PACKAGE).toMatch(/Do not enter a placeholder, shared account/);
    expect(PACKAGE).toMatch(/No mutation is authorized by an incomplete worksheet/);
  });

  it('collects all four distinct identity UPNs in one worksheet', () => {
    for (const identity of [
      'Independent credit approver',
      'Funding approver 1',
      'Funding approver 2',
      'Boarding/servicing operator',
    ]) {
      expect(PACKAGE).toContain(identity);
    }
    expect(PACKAGE).toMatch(/All four UPNs identify different real humans/);
    expect(PACKAGE).toMatch(/No identity has System Administrator for certification/);
  });

  it('collects every authoritative Skeeterhawk correction input', () => {
    for (const field of [
      'Servicing owner',
      'Servicing team',
      'Portfolio manager',
      'Loan status',
      'Current risk rating',
      'Core-system immutable loan ID',
      'Client link',
      'Origination link',
    ]) {
      expect(PACKAGE).toContain(field);
    }
    expect(PACKAGE).toContain('0100066127');
    expect(PACKAGE).toMatch(/Source system and immutable source record ID/);
  });

  it('requests all tenant-admin, records, and security confirmations', () => {
    for (const control of [
      'Dataverse auditing',
      'Retention and legal hold',
      'DLP and security-role assignments',
      'Approved retention duration',
      'OGL LOS Credit Approver',
      'OGL LOS Funding Approver',
      'OGL LOS Boarding Servicing Operator',
    ]) {
      expect(PACKAGE).toContain(control);
    }
  });

  it('keeps irreversible retention actions separately controlled', () => {
    expect(PACKAGE).toMatch(/Applying LTR[\s\S]*is not\s+authorized by this worksheet alone/);
    expect(PACKAGE).toMatch(/Preservation Lock/);
    expect(PACKAGE).toMatch(/distinct humans subsequently complete MFA/);
  });
});
