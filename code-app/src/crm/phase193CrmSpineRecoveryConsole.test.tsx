// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CrmSpineRecoveryConsole } from './CrmSpineRecoveryConsole';
import { CRM_SPINE_SCHEMA_APPLY_ACK, type CrmSpineLiveGateConfig } from './crmSalesforceSpineLiveGates';

/** Phase 193 — recovery console (operator cockpit) rendering + gating. */

const satisfiedGate: CrmSpineLiveGateConfig = {
  schemaApplyEnabled: 'true',
  livePersistenceEnabled: 'true',
  acknowledgement: CRM_SPINE_SCHEMA_APPLY_ACK,
  targetEnvironmentPresent: true,
  operatorAuthorized: true,
};

describe('recovery console renders the operator cockpit', () => {
  it('shows inspect, plan, dry-run, eligibility, persistence gate, and last-operation sections', () => {
    render(<CrmSpineRecoveryConsole snapshot={[]} />);
    expect(screen.getByTestId('crm-spine-recovery-console')).toBeInTheDocument();
    for (const id of [
      'crm-recovery-inspect',
      'crm-recovery-plan',
      'crm-recovery-dry-run',
      'crm-recovery-live-eligibility',
      'crm-recovery-persistence-gate',
      'crm-recovery-last-operation',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    cleanup();
  });

  it('dry-run row reports executed: false', () => {
    render(<CrmSpineRecoveryConsole snapshot={[]} />);
    expect(screen.getByTestId('crm-recovery-dry-run').textContent).toMatch(/executed: false/i);
    cleanup();
  });

  it('renders the last operation outcome when provided', () => {
    render(
      <CrmSpineRecoveryConsole
        snapshot={[]}
        lastOperation={{ label: 'live apply', outcome: 'partial_success', blockedReason: 'one step failed' }}
      />,
    );
    const el = screen.getByTestId('crm-recovery-last-operation');
    expect(el.getAttribute('data-last-outcome')).toBe('partial_success');
    expect(el.textContent).toMatch(/one step failed/);
    cleanup();
  });
});

describe('live apply button gating', () => {
  it('is disabled and does not fire when the gate is not satisfied', () => {
    const onExecute = vi.fn();
    render(<CrmSpineRecoveryConsole snapshot={[]} onExecuteLiveApply={onExecute} />);
    const btn = screen.getByTestId('crm-recovery-execute-live-apply') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId('crm-spine-recovery-console').getAttribute('data-live-apply-eligible')).toBe('false');
    fireEvent.click(btn);
    expect(onExecute).not.toHaveBeenCalled();
    cleanup();
  });

  it('is enabled and fires the callback when the schema-apply gate is satisfied', () => {
    const onExecute = vi.fn();
    render(<CrmSpineRecoveryConsole snapshot={[]} gateConfig={satisfiedGate} onExecuteLiveApply={onExecute} />);
    const btn = screen.getByTestId('crm-recovery-execute-live-apply') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(screen.getByTestId('crm-spine-recovery-console').getAttribute('data-live-apply-eligible')).toBe('true');
    fireEvent.click(btn);
    expect(onExecute).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('wires the read-only action callbacks', () => {
    const onInspect = vi.fn();
    const onDryRun = vi.fn();
    render(<CrmSpineRecoveryConsole snapshot={[]} onRunInspect={onInspect} onRunDryRunApply={onDryRun} />);
    fireEvent.click(screen.getByTestId('crm-recovery-run-inspect'));
    fireEvent.click(screen.getByTestId('crm-recovery-run-dry-run'));
    expect(onInspect).toHaveBeenCalledTimes(1);
    expect(onDryRun).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
