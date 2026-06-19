// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CrmSpineRecoveryConsole } from './CrmSpineRecoveryConsole';
import { CRM_SPINE_SCHEMA_APPLY_ACK, type CrmSpineLiveGateConfig } from './crmSalesforceSpineLiveGates';

/** Phase 193C — operator recovery console (cockpit) rendering + gating. */

const satisfiedGate: CrmSpineLiveGateConfig = {
  schemaApplyEnabled: 'true',
  livePersistenceEnabled: 'true',
  acknowledgement: CRM_SPINE_SCHEMA_APPLY_ACK,
  targetEnvironmentPresent: true,
  operatorAuthorized: true,
  correlationId: 'corr-1',
};

describe('cockpit renders all required panels', () => {
  it('shows inspect, plan, dry-run, eligibility, persistence gate, acknowledgement, last-operation', () => {
    render(<CrmSpineRecoveryConsole snapshot={[]} />);
    for (const id of [
      'crm-recovery-inspect',
      'crm-recovery-plan',
      'crm-recovery-dry-run',
      'crm-recovery-live-eligibility',
      'crm-recovery-persistence-gate',
      'crm-recovery-acknowledgement',
      'crm-recovery-last-operation',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByTestId('crm-recovery-acknowledgement').textContent).toMatch(/APPLY_CRM_SPINE_SCHEMA/);
    cleanup();
  });

  it('shows missing-gate blockers when the gate is unsatisfied', () => {
    render(<CrmSpineRecoveryConsole snapshot={[]} />);
    expect(screen.getByTestId('crm-recovery-live-eligibility-blockers')).toBeInTheDocument();
    cleanup();
  });

  it('renders last-operation outcome with correlation id and partial details', () => {
    render(
      <CrmSpineRecoveryConsole
        snapshot={[]}
        lastOperation={{ label: 'live apply', outcome: 'partial_success', correlationId: 'corr-xyz', partialDetails: '3 created, 1 failed' }}
      />,
    );
    expect(screen.getByTestId('crm-recovery-correlation-id').textContent).toMatch(/corr-xyz/);
    expect(screen.getByTestId('crm-recovery-partial-details').textContent).toMatch(/3 created, 1 failed/);
    cleanup();
  });
});

describe('live apply button gating', () => {
  it('is disabled and inert when the gate is not satisfied', () => {
    const onExecute = vi.fn();
    render(<CrmSpineRecoveryConsole snapshot={[]} onExecuteLiveApply={onExecute} />);
    const btn = screen.getByTestId('crm-recovery-execute-live-apply') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onExecute).not.toHaveBeenCalled();
    cleanup();
  });

  it('is enabled and fires the callback only when the schema-apply gate is satisfied', () => {
    const onExecute = vi.fn();
    render(<CrmSpineRecoveryConsole snapshot={[]} gateConfig={satisfiedGate} onExecuteLiveApply={onExecute} />);
    const btn = screen.getByTestId('crm-recovery-execute-live-apply') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onExecute).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('wires the read-only action callbacks', () => {
    const onInspect = vi.fn();
    render(<CrmSpineRecoveryConsole snapshot={[]} onRunInspect={onInspect} />);
    fireEvent.click(screen.getByTestId('crm-recovery-run-inspect'));
    expect(onInspect).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
