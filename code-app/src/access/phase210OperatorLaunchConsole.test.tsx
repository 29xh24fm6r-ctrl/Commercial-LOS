// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { deriveOperatorLaunchConsole } from './operatorLaunchConsoleModel';
import type { OperatorLaunchConsoleInput } from './operatorLaunchConsoleModel';
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

// Factory Arc Phase 4 — Platform Operations Workspace extended the model/UI with
// route/DI/auth/audit-sink state, latest write evidence, enablement provenance, and
// a console-level deployment commit. All additive/optional — this proves the new
// fields render honestly (undefined vs null vs a real value are visually distinct)
// without weakening the observe-only contract already pinned above.
const phase4Input: OperatorLaunchConsoleInput = {
  deploymentCommit: 'abc1234',
  capabilities: [
    {
      key: 'new-deal-create', label: 'New Deal Create', category: 'deal',
      flags: [{ name: 'BANKER_CREATE_PILOT_ENABLED', value: true, required: true }],
      rollback: 'Set BANKER_CREATE_PILOT_ENABLED = false.',
      routeState: 'Mounted — "+ New Deal" button.',
      diState: 'Live write adapter wired: newDealCreateAdapter.ts.',
      actorAuthorizationRequirement: 'Resolved Dataverse systemuser + banker authorization.',
      auditSinkState: 'Writes audited via dealOriginationAudit.ts.',
      latestSuccessfulWrite: { actor: 'mpaller@oldglorybank.com', at: '2026-07-10T00:00:00Z', correlationId: 'corr-42' },
      latestFailedWrite: null,
      enabledBy: null,
      enabledOn: null,
    },
    {
      key: 'audit-event-writes', label: 'Audit-event writes', category: 'observability',
      flags: [],
      rollback: 'N/A — no independent flag.',
      // routeState/diState/etc intentionally omitted -> undefined -> renders "unknown".
      // latestSuccessfulWrite/latestFailedWrite intentionally omitted -> "not yet correlated".
    },
  ],
};

describe('Factory Arc Phase 4 — extended fields render honestly', () => {
  it('renders a real deployment commit at the console level', () => {
    render(<OperatorLaunchConsole input={phase4Input} />);
    expect(screen.getByTestId('operator-launch-console-deployment-commit').textContent).toMatch(/abc1234/);
    cleanup();
  });

  it('shows "unknown" for a null deployment commit, never a fabricated value', () => {
    render(<OperatorLaunchConsole input={{ ...phase4Input, deploymentCommit: null }} />);
    expect(screen.getByTestId('operator-launch-console-deployment-commit').textContent).toMatch(/unknown/);
    cleanup();
  });

  it('renders route/DI/auth/audit-sink state and the latest successful write when supplied', () => {
    render(<OperatorLaunchConsole input={phase4Input} />);
    const wiring = screen.getByTestId('capability-new-deal-create-wiring');
    expect(wiring.textContent).toMatch(/Mounted/);
    expect(wiring.textContent).toMatch(/newDealCreateAdapter/);
    expect(wiring.textContent).toMatch(/Resolved Dataverse systemuser/);
    expect(wiring.textContent).toMatch(/dealOriginationAudit/);

    const writes = screen.getByTestId('capability-new-deal-create-writes');
    expect(writes.textContent).toMatch(/2026-07-10T00:00:00Z/);
    expect(writes.textContent).toMatch(/mpaller@oldglorybank\.com/);
    expect(writes.textContent).toMatch(/latest failure:\s*none recorded/);
    cleanup();
  });

  it('distinguishes "not yet correlated" (undefined) from a real null/value, and "unknown" wiring text when omitted', () => {
    render(<OperatorLaunchConsole input={phase4Input} />);
    const writes = screen.getByTestId('capability-audit-event-writes-writes');
    expect(writes.textContent).toMatch(/not yet correlated/);
    const wiring = screen.getByTestId('capability-audit-event-writes-wiring');
    expect(wiring.textContent).toMatch(/unknown/);
    cleanup();
  });

  it('shows an honest enablement line — no fabricated actor/date for a static flag constant', () => {
    render(<OperatorLaunchConsole input={phase4Input} />);
    const enablement = screen.getByTestId('capability-new-deal-create-enablement');
    expect(enablement.textContent).toMatch(/no change-history source for this flag/i);
    cleanup();
  });

  it('the extended fields still introduce no write control', () => {
    render(<OperatorLaunchConsole input={phase4Input} />);
    const root = screen.getByTestId('operator-launch-console');
    expect(within(root).queryByRole('button')).toBeNull();
    expect(within(root).queryByRole('textbox')).toBeNull();
    cleanup();
  });
});
