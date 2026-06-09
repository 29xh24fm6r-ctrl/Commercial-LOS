import { describe, it, expect } from 'vitest';
import {
  WORKSPACE_ROUTES,
  PRODUCT_STRATEGY_SURFACE_PARAM_NAME,
  PRODUCT_STRATEGY_SURFACE_PARAM_VALUE,
  PRODUCT_STRATEGY_SURFACE_URL,
  isProductStrategySurface,
} from './workspaceRoutes';

describe('Phase 142I — executive product strategy surface constants', () => {
  it('defines the surface URL under the executive route (executive-gated by construction)', () => {
    expect(PRODUCT_STRATEGY_SURFACE_URL.startsWith(WORKSPACE_ROUTES.executive)).toBe(true);
    expect(PRODUCT_STRATEGY_SURFACE_URL).toBe('/workspaces/executive?surface=product-strategy');
  });

  it('does not change the existing workspace routes', () => {
    expect(WORKSPACE_ROUTES.executive).toBe('/workspaces/executive');
    expect(Object.keys(WORKSPACE_ROUTES)).toEqual(['banker', 'team', 'manager', 'executive', 'admin']);
  });

  it('introduces no banker / team / manager / admin surface URL', () => {
    expect(PRODUCT_STRATEGY_SURFACE_URL).not.toContain('/workspaces/banker');
    expect(PRODUCT_STRATEGY_SURFACE_URL).not.toContain('/workspaces/team');
    expect(PRODUCT_STRATEGY_SURFACE_URL).not.toContain('/workspaces/manager');
    expect(PRODUCT_STRATEGY_SURFACE_URL).not.toContain('/workspaces/admin');
  });

  it('matches only the exact surface param value', () => {
    expect(PRODUCT_STRATEGY_SURFACE_PARAM_NAME).toBe('surface');
    expect(PRODUCT_STRATEGY_SURFACE_PARAM_VALUE).toBe('product-strategy');
    expect(isProductStrategySurface('product-strategy')).toBe(true);
    expect(isProductStrategySurface('portfolio')).toBe(false);
    expect(isProductStrategySurface(null)).toBe(false);
    expect(isProductStrategySurface(undefined)).toBe(false);
    expect(isProductStrategySurface('')).toBe(false);
  });
});
