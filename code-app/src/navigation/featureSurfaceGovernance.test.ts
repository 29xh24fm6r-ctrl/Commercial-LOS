import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FEATURE_SURFACES } from './featureSurfaces';
import { INTENTIONALLY_UNROUTED_PATHS } from './intentionallyUnrouted';
import { FEATURE_SURFACE_FLAG_DEFAULTS } from './featureSurfaceFlags';

/**
 * Phase 6 — governance truth-up cross-check.
 *
 * Closes the "dashboard says wired but it's orphaned" blind spot for routed feature
 * surfaces: a surface in the registry CLAIMS its subsystem is reachable, so its entry
 * module must NOT still be allow-listed as an intentional orphan, must exist on disk,
 * and must actually be statically imported by featureSurfaces.tsx. It also pins that
 * every surface route flag stays default-off (read-first, no surprise enablement).
 */

const REPO_ROOT = resolve(__dirname, '..', '..');
const REGISTRY_SRC = readFileSync(resolve(__dirname, 'featureSurfaces.tsx'), 'utf8');

describe('Phase 6 — routed surface entry modules are genuinely reachable', () => {
  it('no routed surface entry module is still allow-listed as orphaned', () => {
    const contradictions = FEATURE_SURFACES.filter((s) =>
      INTENTIONALLY_UNROUTED_PATHS.has(s.entryModule),
    ).map((s) => `${s.key} → ${s.entryModule}`);
    expect(contradictions).toEqual([]);
  });

  it('every routed surface entry module exists on disk', () => {
    const missing = FEATURE_SURFACES.filter(
      (s) => !existsSync(resolve(REPO_ROOT, s.entryModule)),
    ).map((s) => `${s.key} → ${s.entryModule}`);
    expect(missing).toEqual([]);
  });

  it('every routed surface entry module is statically imported by the registry', () => {
    // Reachability collapse depends on the static import actually being present.
    const notImported = FEATURE_SURFACES.filter((s) => {
      const dir = s.entryModule.replace(/^src\//, '../').replace(/\.tsx?$/, '');
      return !REGISTRY_SRC.includes(`from '${dir}'`);
    }).map((s) => `${s.key} → ${s.entryModule}`);
    expect(notImported).toEqual([]);
  });
});

describe('Phase 6 — surface flags remain default-off', () => {
  it('every surface references a flag that defaults false', () => {
    for (const s of FEATURE_SURFACES) {
      expect(FEATURE_SURFACE_FLAG_DEFAULTS[s.flag]).toBe(false);
    }
  });
});
