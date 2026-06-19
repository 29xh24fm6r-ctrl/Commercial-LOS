// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { deriveCrmAdminControlState } from './crmAdminControlModel';
import { CrmAdminControlPanel } from './CrmAdminControlPanel';
import { CRM_SPINE_SCHEMA_APPLY_ACK, CRM_SPINE_PERSISTENCE_ACK } from './crmSalesforceSpineLiveGates';

/** Phase 193I — admin controls + runbooks. */

const openSchema = { schemaApplyEnabled: 'true', livePersistenceEnabled: 'true', acknowledgement: CRM_SPINE_SCHEMA_APPLY_ACK, targetEnvironmentPresent: true, operatorAuthorized: true, correlationId: 'c' };
const openPersistence = { livePersistenceEnabled: 'true', acknowledgement: CRM_SPINE_PERSISTENCE_ACK, targetEnvironmentPresent: true, operatorAuthorized: true, correlationId: 'c' };

describe('admin control model', () => {
  it('reports gates closed by default (fail-closed)', () => {
    const s = deriveCrmAdminControlState({});
    expect(s.liveSchemaApplyEnabled).toBe(false);
    expect(s.livePersistenceEnabled).toBe(false);
    expect(s.controlSummary).toBe('gates-closed');
    expect(s.blockers.length).toBeGreaterThan(0);
  });

  it('reports all-gates-open only when both gates are satisfied', () => {
    const s = deriveCrmAdminControlState({ schemaGateConfig: openSchema, persistenceGateConfig: openPersistence });
    expect(s.controlSummary).toBe('all-gates-open');
  });

  it('collects recent correlation ids from operations/failures/partials', () => {
    const s = deriveCrmAdminControlState({
      lastOperation: { label: 'apply', outcome: 'apply_completed', correlationId: 'corr-1' },
      lastFailure: { label: 'persist', outcome: 'failed_dataverse', correlationId: 'corr-2' },
      partialSuccesses: [{ label: 'link', outcome: 'partial_success', correlationId: 'corr-3' }],
    });
    expect(s.recentCorrelationIds).toEqual(expect.arrayContaining(['corr-1', 'corr-2', 'corr-3']));
  });
});

describe('admin control panel', () => {
  it('renders both gates closed by default', () => {
    render(<CrmAdminControlPanel input={{}} />);
    const el = screen.getByTestId('crm-admin-controls');
    expect(el.getAttribute('data-summary')).toBe('gates-closed');
    expect(screen.getByTestId('crm-admin-schema-gate').getAttribute('data-enabled')).toBe('false');
    expect(screen.getByTestId('crm-admin-persistence-gate').getAttribute('data-enabled')).toBe('false');
    cleanup();
  });

  it('shows environment, last operation, and correlation ids', () => {
    render(
      <CrmAdminControlPanel
        input={{
          environmentTarget: { present: true, label: 'org-sandbox' },
          lastOperation: { label: 'dry-run', outcome: 'dry_run_completed', correlationId: 'corr-9' },
        }}
      />,
    );
    expect(screen.getByTestId('crm-admin-environment').getAttribute('data-env-present')).toBe('true');
    expect(screen.getByTestId('crm-admin-last-operation').textContent).toMatch(/dry_run_completed/);
    expect(screen.getByTestId('crm-admin-correlation-ids').textContent).toMatch(/corr-9/);
    cleanup();
  });
});
