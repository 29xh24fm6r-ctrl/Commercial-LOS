// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminConfigurationPersistenceReadinessPanel } from './AdminConfigurationPersistenceReadinessPanel';
import { createDisabledAdminConfigurationPersistenceAdapter } from './createDisabledAdminConfigurationPersistenceAdapter';
import { deriveAdminConfigurationSchemaReadiness } from './deriveAdminConfigurationSchemaReadiness';

const readiness = createDisabledAdminConfigurationPersistenceAdapter().getReadiness();
const schemaState = deriveAdminConfigurationSchemaReadiness();

describe('Phase 142J — AdminConfigurationPersistenceReadinessPanel', () => {
  it('renders the disabled readiness and the disabled banner', () => {
    render(<AdminConfigurationPersistenceReadinessPanel readiness={readiness} schemaState={schemaState} />);
    expect(screen.getAllByText(/persistence is disabled by default/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Adapter mode')).toBeTruthy();
  });

  it('shows write and apply disabled', () => {
    render(<AdminConfigurationPersistenceReadinessPanel readiness={readiness} schemaState={schemaState} />);
    expect(screen.getByText('Write enabled')).toBeTruthy();
    expect(screen.getByText('Apply enabled')).toBeTruthy();
  });

  it('renders the planned tables and missing tables (schema not ready)', () => {
    render(<AdminConfigurationPersistenceReadinessPanel readiness={readiness} schemaState={schemaState} />);
    expect(screen.getByText(/Planned future tables/i)).toBeTruthy();
    expect(screen.getByText('Missing tables')).toBeTruthy();
  });

  it('exposes no enable / save / apply / seed / create controls and no fetch', () => {
    const { container } = render(<AdminConfigurationPersistenceReadinessPanel readiness={readiness} schemaState={schemaState} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['enable persistence', 'enable write', 'enable apply', 'seed schema', 'create schema', 'save proposal', 'apply proposal', 'deploy', 'publish', 'activate']) {
      expect(text).not.toContain(w);
    }
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });

  it('renders the controlled apply summary when provided (no controls)', () => {
    const { container } = render(<AdminConfigurationPersistenceReadinessPanel readiness={readiness} schemaState={schemaState} apply={{ previewReadyCount: 1, blockedCount: 2, dryRunOnly: true }} />);
    expect(screen.getByText(/Controlled apply \(142K\)/)).toBeTruthy();
    expect(container.querySelectorAll('button').length).toBe(0);
  });
});
