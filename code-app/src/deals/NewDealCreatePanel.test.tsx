// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NewDealCreatePanel } from './NewDealCreatePanel';
import type { NewDealCreateEnablementInput } from './newDealCreateEnablement';

/**
 * Phase 170N -- governed New Deal create surface, visibly DISABLED by default.
 *
 * The panel renders the controller's pure view-state; no generated service is
 * imported (the controller's static graph is SDK-free), so rendering performs
 * no Dataverse call. The submit control is disabled in every committed config.
 */

function approvedNonProd(over: Partial<NewDealCreateEnablementInput> = {}): NewDealCreateEnablementInput {
  return {
    config: { adapterEnabled: true, auditWired: true, allowedNonProdEnvironments: ['pilot'] },
    environment: { name: 'pilot', isProduction: false },
    authorization: { isAdminOrDev: true, actorSystemUserId: 'sys-1' },
    resolverReady: true,
    ...over,
  };
}

describe('Phase 170N -- NewDealCreatePanel disabled-by-default', () => {
  it('renders the disabled state and a disabled submit control by default', () => {
    const { container } = render(<NewDealCreatePanel />);
    expect(screen.getByText('Off (default)')).toBeInTheDocument();
    const state = container.querySelector('[data-new-deal-create-state]');
    expect(state?.getAttribute('data-new-deal-create-state')).toBe('disabled');
    expect(state?.textContent).toMatch(/not enabled in this environment/i);
    expect(state?.textContent).toMatch(/No record has been created/i);
    const submit = container.querySelector('[data-new-deal-create-submit]') as HTMLButtonElement;
    expect(submit).toBeDisabled();
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    expect(submit.textContent).toMatch(/not available/i);
  });

  it('renders honest unauthorized / environment / resolver states (submit stays disabled)', () => {
    const cases: Array<[NewDealCreateEnablementInput, string, RegExp]> = [
      [approvedNonProd({ authorization: { isAdminOrDev: false } }), 'unauthorized', /not authorized/i],
      [approvedNonProd({ environment: { name: 'staging' } }), 'environment_not_allowed', /not approved for this environment/i],
      [approvedNonProd({ resolverReady: false }), 'resolver_not_ready', /not ready/i],
      [{ config: { adapterEnabled: 'x' as unknown as boolean } }, 'config_invalid', /configuration is invalid/i],
    ];
    for (const [enablement, kind, copy] of cases) {
      const { container, unmount } = render(<NewDealCreatePanel enablement={enablement} />);
      const state = container.querySelector('[data-new-deal-create-state]');
      expect(state?.getAttribute('data-new-deal-create-state')).toBe(kind);
      expect(state?.textContent).toMatch(copy);
      const submit = container.querySelector('[data-new-deal-create-submit]') as HTMLButtonElement;
      expect(submit).toBeDisabled();
      unmount();
    }
  });

  it('stays disabled even with a fully-approved controlled config (public intake floor is off)', () => {
    const { container } = render(<NewDealCreatePanel enablement={approvedNonProd()} />);
    const state = container.querySelector('[data-new-deal-create-state]');
    // The controller floors on NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED (false), so
    // the surface never reaches `ready` in this phase.
    expect(state?.getAttribute('data-new-deal-create-state')).toBe('disabled');
    const submit = container.querySelector('[data-new-deal-create-submit]') as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });

  it('the panel contains no enabled button and never shows a fake success', () => {
    const { container } = render(<NewDealCreatePanel enablement={approvedNonProd()} />);
    for (const b of Array.from(container.querySelectorAll('button'))) {
      expect(b).toBeDisabled();
    }
    // No fake success CLAIM: while not `ready`, the state note must say no
    // record was created (the honest footnote separately explains the policy).
    const state = container.querySelector('[data-new-deal-create-state]');
    expect(state?.getAttribute('data-new-deal-create-state')).not.toBe('ready');
    expect(state?.textContent).toMatch(/No record has been created/i);
    expect(within(container).getByText(/reports success only after a real write/i)).toBeInTheDocument();
  });
});
