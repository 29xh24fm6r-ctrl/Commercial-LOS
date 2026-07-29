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
    expect(report.currentEnabledCount).toBe(5);
    expect(report.activationDomainCount).toBe(6);
    expect(report.findings.filter((finding) => finding.status === 'runtime-enabled').map((finding) => finding.capability)).toEqual([
      'New Deal create',
      'CRM writeback / live persistence',
      'Document checklist generation',
      'Stage advancement',
      'Portfolio boarding live persistence',
    ]);
  });

  it('keeps controlled lifecycle and distinct-user proof explicitly blocked', () => {
    const report = deriveFinalOperatingCertification();
    expect(report.findings.find((finding) => finding.id === 'evidence-controlled-lifecycle')?.status).toBe('blocked-missing-evidence');
    expect(report.findings.filter((finding) => finding.status === 'blocked-dual-user-testing')).toHaveLength(3);
  });

  it('reports binary document storage as implemented and live-proven rather than deferred', () => {
    const report = deriveFinalOperatingCertification();
    expect(report.findings.find((finding) => finding.id === 'code-binary-upload')?.status).toBe('code-complete');
    expect(report.findings.find((finding) => finding.id === 'smoke-binary-document')?.status).toBe('live-smoke-tested');
    expect(report.findings.some((finding) => finding.id === 'deferred-binary-upload')).toBe(false);
  });
});
