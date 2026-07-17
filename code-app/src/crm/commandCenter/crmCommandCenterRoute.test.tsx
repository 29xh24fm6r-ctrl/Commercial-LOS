// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }));

import { FEATURE_SURFACES, getFeatureSurface } from '../../navigation/featureSurfaces';
import { isFeatureSurfaceFlagEnabled } from '../../navigation/featureSurfaceFlags';
import { INTENTIONALLY_UNROUTED_PATHS } from '../../navigation/intentionallyUnrouted';
import { deriveUnifiedCrmReadiness, CRM_TEAM_READINESS_LEDGER } from '../readiness/unifiedCrmReadiness';
import { CrmCommandCenterRoute } from './CrmCommandCenterRoute';

describe('CRM-C — routed CRM Command Center', () => {
  it('registers a standalone crm-command-center surface for the banker workspace', () => {
    const surface = getFeatureSurface('crm-command-center');
    expect(surface).toBeTruthy();
    expect(surface?.workspace).toBe('banker');
    expect(surface?.flag).toBe('CRM_COMMAND_CENTER_ROUTE_ENABLED');
    expect(surface?.entryModule).toBe('src/crm/commandCenter/CrmCommandCenterRoute.tsx');
  });

  it('has the CRM command center route flag intentionally enabled', () => {
    expect(isFeatureSurfaceFlagEnabled('CRM_COMMAND_CENTER_ROUTE_ENABLED')).toBe(true);
  });

  it('the routed entry module is no longer allow-listed as an intentional orphan', () => {
    expect(INTENTIONALLY_UNROUTED_PATHS.has('src/crm/commandCenter/CrmCommandCenterRoute.tsx')).toBe(false);
    expect(INTENTIONALLY_UNROUTED_PATHS.has('src/crm/commandCenter/CrmCommandCenter.tsx')).toBe(false);
    expect(INTENTIONALLY_UNROUTED_PATHS.has('src/crm/commandCenter/crmCommandCenterViewModel.ts')).toBe(false);
  });

  it('the ledger records the Command Center as routed and the unified route-mount dimension is ready', () => {
    expect(CRM_TEAM_READINESS_LEDGER.commandCenterRouted).toBe(true);
    const r = deriveUnifiedCrmReadiness();
    expect(r.dimensions.find((d) => d.key === 'route-mount')?.status).toBe('ready');
  });

  it('renders the unified readiness header and the read-only cockpit (no write affordance)', () => {
    render(<CrmCommandCenterRoute />);
    expect(screen.getByText('Team readiness')).toBeInTheDocument();
    // The single readiness story is present (dimension labels render).
    expect(screen.getByText(/Full schema contract/)).toBeInTheDocument();
    // The read-only cockpit safety copy still renders.
    expect(screen.getByText(/Read-only CRM intelligence\. No live writes\./)).toBeInTheDocument();
  });

  it('is one of the registered feature surfaces', () => {
    expect(FEATURE_SURFACES.some((s) => s.key === 'crm-command-center')).toBe(true);
  });
});

/**
 * Factory Arc Phase 12 — CrmCommandCenterRoute audience-aware dimension filtering.
 *
 * Finding A (release-governance data leak): this route used to render
 * deriveUnifiedCrmReadiness()'s full 10-dimension model — including
 * "certification-attribution," a release/launch-evidence attribution fact
 * (see crmCertificationAttribution.ts, now in src/access/) — to every
 * workspace that mounts it (banker/team/manager), not just admin. These
 * tests pin the fix: non-admin audiences never see that dimension or a
 * count that includes it; admin sees the full, unfiltered model.
 */
describe('Factory Arc Phase 12 — CrmCommandCenterRoute audience filtering', () => {
  it('the default (team) audience never renders the certification-attribution dimension', () => {
    render(<CrmCommandCenterRoute />);
    expect(screen.queryByText(/Live-persistence certification attribution/i)).not.toBeInTheDocument();
  });

  it('an explicit "team" audience behaves identically to the default', () => {
    render(<CrmCommandCenterRoute audience="team" />);
    expect(screen.queryByText(/Live-persistence certification attribution/i)).not.toBeInTheDocument();
  });

  it('the admin audience DOES render the certification-attribution dimension', () => {
    render(<CrmCommandCenterRoute audience="admin" />);
    expect(screen.getByText(/Live-persistence certification attribution/i)).toBeInTheDocument();
  });

  it('the non-admin readiness subtitle count is computed over the filtered (9-dimension) list, not the full model', () => {
    const full = deriveUnifiedCrmReadiness();
    expect(full.totalCount).toBe(10);
    render(<CrmCommandCenterRoute />);
    // The subtitle must never reference the full model's totalCount (10) or
    // claim team-ready based on a dimension the viewer cannot see.
    expect(screen.queryByText(/10 readiness dimensions/i)).not.toBeInTheDocument();
    const nineOfNine = screen.queryByText(/9\/9 readiness dimensions ready/i);
    const allReady = screen.queryByText(/CRM is team-ready across all dimensions\./i);
    expect(nineOfNine || allReady).toBeTruthy();
  });

  it('the admin subtitle count is computed over the full (10-dimension) list', () => {
    render(<CrmCommandCenterRoute audience="admin" />);
    const tenOfTen = screen.queryByText(/10\/10 readiness dimensions ready/i);
    const allReady = screen.queryByText(/CRM is team-ready across all dimensions\./i);
    expect(tenOfTen || allReady).toBeTruthy();
  });

  it('non-admin rendered dimension badge count is exactly 9 (10 minus certification-attribution)', () => {
    render(<CrmCommandCenterRoute />);
    const badges = screen.getAllByText(/^READY$|^BLOCKED$/);
    expect(badges).toHaveLength(9);
  });

  it('admin rendered dimension badge count is exactly 10 (full model)', () => {
    render(<CrmCommandCenterRoute audience="admin" />);
    const badges = screen.getAllByText(/^READY$|^BLOCKED$/);
    expect(badges).toHaveLength(10);
  });
});
