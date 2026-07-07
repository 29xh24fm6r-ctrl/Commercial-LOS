// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { deriveCrmTeamReadinessCertification } from './crmTeamReadinessCertification';

describe('CRM-J — unified CRM team-readiness certification', () => {
  it('enumerates the exact acceptance criteria, each backed by a unified readiness dimension', () => {
    const cert = deriveCrmTeamReadinessCertification();
    expect(cert.singleReadinessStory).toBe(true);
    const keys = cert.criteria.map((c) => c.key);
    expect(keys).toEqual([
      'command-center-routed',
      'roles-mounted',
      'hub-spine-reconciled',
      'live-hub-operational',
      'full-schema-evidence',
      'runtime-hydration',
      'seed-and-linkage',
      'inline-edit-wired',
      'authorization',
      'operator-attribution',
    ]);
    // Every criterion names the dimension that backs it.
    for (const c of cert.criteria) expect(typeof c.backedBy).toBe('string');
  });

  it('at the committed baseline (CRM-K), every criterion is met and CRM is certified team-ready', () => {
    const cert = deriveCrmTeamReadinessCertification();
    expect(cert.certified).toBe(true);
    expect(cert.outstanding).toEqual([]);
    // All ten criteria — including operator attribution (real attributed smoke) — are met.
    expect(cert.criteria.every((c) => c.met)).toBe(true);
    expect(cert.criteria.find((c) => c.key === 'operator-attribution')?.met).toBe(true);
    expect(cert.posture).toMatch(/TEAM-READY/);
  });

  it('still fails closed if operator attribution regresses (injected unattributable)', () => {
    const cert = deriveCrmTeamReadinessCertification({ certificationAttributionHigh: false });
    expect(cert.certified).toBe(false);
    expect(cert.outstanding.map((o) => o.key)).toEqual(['operator-attribution']);
    expect(cert.posture).toMatch(/attributable operator/i);
  });

  it('never certifies while seed/linkage regresses, even with attribution satisfied', () => {
    const cert = deriveCrmTeamReadinessCertification({
      certificationAttributionHigh: true,
      ledger: {
        commandCenterRouted: true,
        rolesMounted: { banker: true, team: true, manager: true, admin: true },
        canonicalSeedReady: false, // regressed
        newDealLinkageOperational: true,
        liveCreateWired: true,
        inlineEditWired: true,
      },
    });
    expect(cert.certified).toBe(false);
    expect(cert.outstanding.map((o) => o.key)).toContain('seed-and-linkage');
  });
});
