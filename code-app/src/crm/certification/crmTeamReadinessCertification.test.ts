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

  it('at the committed baseline, everything is met EXCEPT operator attribution (honest, not faked)', () => {
    const cert = deriveCrmTeamReadinessCertification();
    expect(cert.certified).toBe(false);
    expect(cert.outstanding.map((o) => o.key)).toEqual(['operator-attribution']);
    // All non-attribution criteria are met by the delivered CRM-B…CRM-I work.
    const met = cert.criteria.filter((c) => c.met).map((c) => c.key);
    expect(met).toEqual([
      'command-center-routed',
      'roles-mounted',
      'hub-spine-reconciled',
      'live-hub-operational',
      'full-schema-evidence',
      'runtime-hydration',
      'seed-and-linkage',
      'inline-edit-wired',
      'authorization',
    ]);
    expect(cert.posture).toMatch(/attributable operator/i);
  });

  it('CERTIFIES team-ready only when a real attributed operator smoke lands (injection proves the wiring)', () => {
    const cert = deriveCrmTeamReadinessCertification({ certificationAttributionHigh: true });
    expect(cert.certified).toBe(true);
    expect(cert.outstanding).toEqual([]);
    expect(cert.posture).toMatch(/TEAM-READY/);
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
