// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { deriveOperatorLaunchConsole, type OperatorLaunchConsoleInput } from './operatorLaunchConsoleModel';
import { OperatorLaunchConsole } from './OperatorLaunchConsole';

/** Phase 210 / A4 — operator launch console. */

const input: OperatorLaunchConsoleInput = {
  capabilities: [
    {
      key: 'entitlement-grant', label: 'Entitlement Grant', category: 'admin',
      flags: [{ name: 'ADMIN_ENTITLEMENT_WRITE_ENABLED', value: false, required: true }, { name: 'singleRecordSmoke', value: false, required: true }],
      latestSmoke: null, rollback: 'Set ADMIN_ENTITLEMENT_WRITE_ENABLED off.',
    },
    {
      key: 'new-deal-create', label: 'New Deal Create', category: 'deal',
      flags: [{ name: 'NEW_DEAL_CREATE_ADAPTER_ENABLED', value: true, required: true }, { name: 'PRODUCTION_REFERENCES_APPROVED', value: true, required: true }],
      latestSmoke: { outcome: 'created', actor: 'op', correlationId: 'corr-9', at: '2026-06-20T00:00:00Z' },
      rollback: 'Disable NEW_DEAL_CREATE_ADAPTER_ENABLED.',
    },
    {
      key: 'document-upload', label: 'Document Upload', category: 'document',
      flags: [{ name: 'UPLOAD_ENABLED', value: false, required: true }],
      blockers: ['File column missing on document checklist target'],
      latestSmoke: null, rollback: 'N/A — schema not present.',
    },
  ],
};

describe('capability state derivation', () => {
  it('classifies enabled / disabled / blocked with reasons', () => {
    const s = deriveOperatorLaunchConsole(input);
    const byKey = new Map(s.capabilities.map((c) => [c.key, c]));
    expect(byKey.get('new-deal-create')!.state).toBe('enabled');
    expect(byKey.get('entitlement-grant')!.state).toBe('disabled');
    expect(byKey.get('entitlement-grant')!.reason).toMatch(/ADMIN_ENTITLEMENT_WRITE_ENABLED/);
    expect(byKey.get('document-upload')!.state).toBe('blocked');
    expect(byKey.get('document-upload')!.reason).toMatch(/File column/);
  });

  it('counts and never flips from UI', () => {
    const s = deriveOperatorLaunchConsole(input);
    expect(s.counts).toEqual({ enabled: 1, disabled: 1, blocked: 1 });
    expect(s.canFlipFromUi).toBe(false);
  });

  it('shows no smoke as none (not fabricated)', () => {
    const s = deriveOperatorLaunchConsole(input);
    expect(s.capabilities.find((c) => c.key === 'entitlement-grant')!.latestSmoke).toBeNull();
  });
});

describe('console rendering', () => {
  it('renders each capability with state, smoke, and rollback, and no write controls', () => {
    render(<OperatorLaunchConsole input={input} />);
    const root = screen.getByTestId('operator-launch-console');
    expect(root.getAttribute('data-can-flip')).toBe('false');
    expect(screen.getByTestId('capability-new-deal-create').getAttribute('data-state')).toBe('enabled');
    expect(screen.getByTestId('capability-document-upload').getAttribute('data-state')).toBe('blocked');
    expect(screen.getByTestId('capability-new-deal-create-smoke').textContent).toMatch(/corr-9/);
    expect(screen.getByTestId('capability-entitlement-grant-smoke').textContent).toMatch(/none/);
    expect(screen.getByTestId('capability-document-upload-rollback').textContent).toMatch(/rollback:/);
    // Observe-only: no buttons / inputs anywhere in the console.
    expect(within(root).queryByRole('button')).toBeNull();
    expect(within(root).queryByRole('textbox')).toBeNull();
    cleanup();
  });
});
