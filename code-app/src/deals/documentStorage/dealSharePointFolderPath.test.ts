import { describe, expect, it } from 'vitest';
import { deriveDealSharePointFolderPath, sanitizeSharePointFileName, sanitizeSharePointPathSegment } from './dealSharePointFolderPath';

const base = { dealId: '10428', borrowerIdentity: 'borrower-1', companyLegalName: 'AkronIN LLC', documentPackageDate: '2026-03-15' };

describe('deal SharePoint folder path', () => {
  it('derives the governed annual path from the authoritative deal date', () => {
    expect(deriveDealSharePointFolderPath(base).companyFolderPath).toBe('/(a) Loans/2026 Loans/AkronIN LLC');
    expect(deriveDealSharePointFolderPath({ ...base, documentPackageDate: '2027-01-01' }).companyFolderPath).toBe('/(a) Loans/2027 Loans/AkronIN LLC');
  });
  it('reuses the persisted path after a company-name edit', () => {
    const result = deriveDealSharePointFolderPath({ ...base, companyLegalName: 'Renamed LLC', persistedCompanyFolderPath: '/(a) Loans/2026 Loans/AkronIN LLC' });
    expect(result.companyFolderPath).toBe('/(a) Loans/2026 Loans/AkronIN LLC');
    expect(result.reusedPersistedPath).toBe(true);
  });
  it('uses a stable deal suffix only for a detected collision', () => {
    expect(deriveDealSharePointFolderPath({ ...base, collisionDetected: true }).companyFolderPath).toBe('/(a) Loans/2026 Loans/AkronIN LLC - 10428');
  });
  it('sanitizes invalid, reserved, traversal, unicode, and long values', () => {
    expect(sanitizeSharePointPathSegment(' ACME: West / East. ')).toBe('ACME West East');
    expect(sanitizeSharePointPathSegment('CON')).toBe('_CON');
    expect(() => sanitizeSharePointPathSegment('..')).toThrow();
    expect(sanitizeSharePointPathSegment('e\u0301')).toBe('é');
    expect(sanitizeSharePointPathSegment('x'.repeat(200))).toHaveLength(120);
    expect(sanitizeSharePointFileName('tax:return?.pdf')).toBe('tax return.pdf');
  });
});
