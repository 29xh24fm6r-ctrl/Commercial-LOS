import { describe, it, expect } from 'vitest';
import {
  createAnnualReviewPackageExportAdapter,
  createDisabledAnnualReviewPackageExportAdapter,
  type AnnualReviewPackageExportInput,
} from './annualReviewPackageExportAdapter';

/**
 * Phase 141P — package export adapter pins (disabled by default).
 */

const INPUT: AnnualReviewPackageExportInput = { packageType: 'annual_review_credit_memo', status: 'review_ready', sectionCount: 10, evidenceCount: 12 };

describe('Phase 141P — package export adapter', () => {
  it('export is disabled by default', () => {
    expect(createDisabledAnnualReviewPackageExportAdapter().enabled).toBe(false);
    // Even asking for it to be enabled keeps it off in this phase.
    expect(createAnnualReviewPackageExportAdapter({ exportEnabled: true }).enabled).toBe(false);
  });

  it('previewExport returns metadata only (no file, no export)', () => {
    const r = createDisabledAnnualReviewPackageExportAdapter().previewExport(INPUT);
    expect(r.ok).toBe(true);
    expect(r.data?.exportEnabled).toBe(false);
    expect(r.data?.hasGeneratedFile).toBe(false);
    expect(r.data?.sectionCount).toBe(10);
  });

  it('exportPackage is always blocked (no file generation)', () => {
    const r = createDisabledAnnualReviewPackageExportAdapter().exportPackage(INPUT);
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
    expect(['package_export_disabled', 'package_export_draft_only', 'package_approval_required']).toContain(r.errorCode);
  });

  it('produces no final export state', () => {
    const r = createDisabledAnnualReviewPackageExportAdapter().exportPackage(INPUT);
    expect(JSON.stringify(r)).not.toMatch(/\b(exported_final|filed|submitted)\b/);
  });
});
