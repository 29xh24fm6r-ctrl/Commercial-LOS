// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// The Power Apps data SDK (`@microsoft/power-apps/data`) mis-resolves an internal
// extensionless import under vitest. Generated services only use `getClient` at
// runtime; mocking it lets the registry's static imports (which transitively reach
// generated services) resolve. The surfaces under test (platform, integrations) are
// SDK-free; this only unblocks module loading of the broader registry graph.
vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }));
import { FEATURE_SURFACES, getFeatureSurface } from './featureSurfaces';
import { FeatureSurfaceView } from './FeatureSurfaceRoute';
import {
  FEATURE_SURFACE_FLAG_DEFAULTS,
  isFeatureSurfaceFlagEnabled,
  type FeatureSurfaceFlagName,
} from './featureSurfaceFlags';

/**
 * Flags intentionally activated after smoke evidence. These are exempt from the
 * default-off invariant below, but every OTHER flag must remain fail-safe off.
 * PORTFOLIO_BOOK_DATA_ENABLED routes the Portfolio Command Center to the live
 * boarded-book feed (read-only); it is a data flag, not a routed write surface,
 * so it is not part of the FEATURE_SURFACES registry checked further down.
 */
const INTENTIONALLY_ENABLED_FLAGS: ReadonlySet<FeatureSurfaceFlagName> = new Set([
  'PORTFOLIO_BOOK_DATA_ENABLED',
  // CRM-C — the standalone CRM Command Center read surface is intentionally routed so
  // CRM is no longer a hidden BankerShell tab. Read-only (unified readiness + CRM
  // intelligence); no write path is enabled by this flag.
  'CRM_COMMAND_CENTER_ROUTE_ENABLED',
]);

/**
 * Phase 3 — feature-surface routing certification.
 *
 * Pins: every surface is gated by a real default-off flag; flag off → honest
 * not-enabled state; flag on → the read-only subsystem component mounts; the
 * registry is internally consistent. No surface enables a write.
 */

describe('feature-surface flags default off (read-first, fail-safe)', () => {
  it('every feature-surface flag defaults to false (except intentionally-activated ones)', () => {
    for (const [name, value] of Object.entries(FEATURE_SURFACE_FLAG_DEFAULTS)) {
      if (INTENTIONALLY_ENABLED_FLAGS.has(name as FeatureSurfaceFlagName)) {
        expect(value, `${name} is intentionally activated (smoke-evidenced)`).toBe(true);
      } else {
        expect(value, `${name} must default false`).toBe(false);
      }
    }
  });

  it('isFeatureSurfaceFlagEnabled reports false for every surface flag (except intentionally-routed ones)', () => {
    for (const s of FEATURE_SURFACES) {
      if (INTENTIONALLY_ENABLED_FLAGS.has(s.flag)) {
        expect(isFeatureSurfaceFlagEnabled(s.flag), `${s.flag} is intentionally routed`).toBe(true);
      } else {
        expect(isFeatureSurfaceFlagEnabled(s.flag)).toBe(false);
      }
    }
  });
});

describe('feature-surface registry integrity', () => {
  it('has at least one surface', () => {
    expect(FEATURE_SURFACES.length).toBeGreaterThan(0);
  });

  it('every surface references a declared flag and a unique key', () => {
    const keys = new Set<string>();
    for (const s of FEATURE_SURFACES) {
      expect(FEATURE_SURFACE_FLAG_DEFAULTS).toHaveProperty(s.flag);
      expect(keys.has(s.key), `duplicate key ${s.key}`).toBe(false);
      keys.add(s.key);
      expect(getFeatureSurface(s.key)).toBe(s);
    }
  });

  it('getFeatureSurface returns undefined for unknown / missing keys', () => {
    expect(getFeatureSurface('nope')).toBeUndefined();
    expect(getFeatureSurface(undefined)).toBeUndefined();
  });
});

describe('FeatureSurfaceView gating', () => {
  it('flag OFF → honest not-enabled state naming the flag (no component mounted)', () => {
    const surface = FEATURE_SURFACES[0];
    render(<FeatureSurfaceView surface={surface} enabled={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(`${surface.label} — not yet enabled`);
    expect(screen.getByText(surface.flag)).toBeInTheDocument();
  });

  it('flag ON → every registered subsystem mounts cleanly (not the boundary fallback)', () => {
    for (const surface of FEATURE_SURFACES) {
      const { unmount } = render(<FeatureSurfaceView surface={surface} enabled={true} />);
      // Neither the not-enabled state nor the error-boundary fallback may appear —
      // proving the real read-only component actually rendered with its empty input.
      expect(screen.queryByText(`${surface.label} — not yet enabled`)).toBeNull();
      expect(screen.queryByText(`${surface.label} — preview unavailable`)).toBeNull();
      unmount();
    }
  });
});
