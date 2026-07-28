import { describe, expect, it } from 'vitest';
import { deriveFinalOperatingCertification, FINAL_CERTIFICATION_STATUSES } from './finalOperatingCertification';

describe('final operating certification', () => {
  it('uses every required certification category and never declares production GO', () => {
    const report = deriveFinalOperatingCertification();
    expect(report.productionGo).toBe(false);
    expect(report.summary).toMatch(/NOT PRODUCTION GO/);
    expect(new Set(report.findings.map((finding) => finding.status))).toEqual(new Set(FINAL_CERTIFICATION_STATUSES));
  });

  it('reports only the evidence-backed current activation state', () => {
    const report = deriveFinalOperatingCertification();
    expect(report.currentEnabledCount).toBe(1);
    expect(report.activationDomainCount).toBe(6);
    expect(report.findings.filter((finding) => finding.status === 'runtime-enabled').map((finding) => finding.capability)).toEqual([
      'New Deal create',
    ]);
  });

  it('keeps controlled lifecycle and distinct-user proof explicitly blocked', () => {
    const report = deriveFinalOperatingCertification();
    expect(report.findings.find((finding) => finding.id === 'evidence-controlled-lifecycle')?.status).toBe('blocked-missing-evidence');
    expect(report.findings.filter((finding) => finding.status === 'blocked-dual-user-testing')).toHaveLength(3);
  });
});
