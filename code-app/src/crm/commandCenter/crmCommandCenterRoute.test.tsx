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
