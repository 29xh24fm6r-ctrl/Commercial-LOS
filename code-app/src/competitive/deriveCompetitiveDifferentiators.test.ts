import { describe, it, expect } from 'vitest';
import { deriveCompetitiveDifferentiators } from './deriveCompetitiveDifferentiators';

describe('Phase 142H — competitive differentiators', () => {
  const diffs = deriveCompetitiveDifferentiators();

  it('includes shipped OGB differentiators', () => {
    const shipped = diffs.filter((d) => d.status === 'shipped').map((d) => d.key);
    expect(shipped).toContain('regulated_bank_governance');
    expect(shipped).toContain('evidence_backed_annual_review');
    expect(shipped).toContain('admin_configuration_review_queue');
  });

  it('labels planned capabilities as planned', () => {
    const planned = diffs.filter((d) => d.status === 'planned');
    expect(planned.length).toBeGreaterThanOrEqual(1);
    for (const d of planned) expect(d.detail.toLowerCase()).toMatch(/planned|future/);
  });

  it('makes no live integration claim', () => {
    const integ = diffs.find((d) => d.key === 'disabled_by_default_integrations');
    expect(integ?.detail.toLowerCase()).toMatch(/disabled|no provider is live/);
  });

  it('makes no final credit approval claim and no competitor overclaim', () => {
    const s = JSON.stringify(diffs);
    expect(s).not.toMatch(/final credit approval|approveCredit|beats |better than nCino|superior to/i);
  });
});
