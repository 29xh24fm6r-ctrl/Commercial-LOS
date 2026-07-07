// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

vi.mock('./BankerContext', () => ({ useBanker: vi.fn() }));

// Mock the dynamically-imported governed modules so no SDK loads and outcomes
// are controlled. These are loaded only on submit.
const orchestrateMock = vi.fn();
vi.mock('../deals/dealOriginationOrchestrator', () => ({
  orchestrateDealOrigination: (...args: unknown[]) => orchestrateMock(...args),
}));
vi.mock('../deals/newDealCreateAdapter', () => ({
  buildLiveNewDealCreateDeps: vi.fn(() => ({ enabled: false })),
  createGovernedNewDeal: vi.fn(),
}));
vi.mock('../deals/newDealReferenceReader', () => ({
  resolveProductionNewDealReferences: vi.fn(),
}));

// The CRM-first surface loads EXISTING client / team options on mount. Mock the
// loaders so no Dataverse read happens and options are controlled.
const loadClientsMock = vi.fn();
const loadTeamsMock = vi.fn();
vi.mock('../crm/dealCrmLinkOptions', () => ({
  loadClientRelationshipOptions: (...a: unknown[]) => loadClientsMock(...a),
  loadTeamOptions: (...a: unknown[]) => loadTeamsMock(...a),
}));

import { useBanker } from './BankerContext';
import { BankerNewDealCreate } from './BankerNewDealCreate';

const useBankerMock = vi.mocked(useBanker);

function setBanker(over: Partial<ReturnType<typeof useBanker>> = {}) {
  useBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    ...over,
  });
}

function renderCreate() {
  return render(
    <MemoryRouter>
      <BankerNewDealCreate />
    </MemoryRouter>,
  );
}

const CLIENTS = [
  { id: 'client-guid-1', name: 'Acme Holdings LLC', sublabel: 'LLC · Manufacturing', active: true },
  { id: 'client-guid-2', name: 'Beta Foods Inc', sublabel: 'Corporation', active: true },
];
const TEAMS = [{ id: 'team-guid-1', name: 'Commercial East', active: true }];

beforeEach(() => {
  vi.clearAllMocks();
  orchestrateMock.mockReset();
  loadClientsMock.mockResolvedValue(CLIENTS);
  loadTeamsMock.mockResolvedValue(TEAMS);
});

/** Drive the flow to a created deal: select client → team → details → submit. */
async function completeHappyPath(user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  await screen.findByRole('option', { name: /Acme Holdings LLC/i });
  await user.click(screen.getByRole('option', { name: /Acme Holdings LLC/i }));
  await user.click(container.querySelector('[data-new-deal-client-continue]') as HTMLButtonElement);
  // Step 2: pick a team, continue.
  await screen.findByRole('option', { name: /Commercial East/i });
  await user.click(screen.getByRole('option', { name: /Commercial East/i }));
  await user.click(container.querySelector('[data-new-deal-team-continue]') as HTMLButtonElement);
  // Step 3: name + submit.
  await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
  await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);
}

describe('CRM-first New Deal create surface — gating', () => {
  it('authorized banker (pilot on) sees the enabled 3-step flow starting at Step 1: CRM Client', async () => {
    setBanker();
    const { container } = renderCreate();
    expect(screen.getByRole('region', { name: 'New Deal' })).toBeInTheDocument();
    expect(screen.getByText('Create enabled')).toBeInTheDocument();
    expect(container.querySelector('[data-banker-new-deal-form]')).not.toBeNull();
    // Stepper shows all three labelled steps.
    expect(screen.getByText('Step 1: CRM Client')).toBeInTheDocument();
    expect(screen.getByText('Step 2: Owning Team')).toBeInTheDocument();
    expect(screen.getByText('Step 3: Deal Details')).toBeInTheDocument();
    // Client options load; step 1 is active.
    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    expect(container.querySelector('[data-new-deal-client-step]')).not.toBeNull();
  });

  it('an unauthorized banker (no systemuser) sees an honest disabled state, no form', () => {
    setBanker({ systemUserId: undefined, writeDisabledReason: 'No systemuser binding.' });
    const { container } = renderCreate();
    const note = container.querySelector('[data-banker-new-deal-state]');
    expect(note?.getAttribute('data-banker-new-deal-state')).toBe('unauthorized');
    expect(note?.textContent).toMatch(/not authorized/i);
    expect(container.querySelector('[data-banker-new-deal-form]')).toBeNull();
    // Loaders never run when the surface is not live.
    expect(loadClientsMock).not.toHaveBeenCalled();
  });
});

describe('Step 1 — CRM Client is required before the deal can proceed', () => {
  it('cannot continue past Step 1 without selecting a client (honest inline blocker)', async () => {
    setBanker();
    const { container } = renderCreate();
    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    // Continue is disabled and the required hint is shown.
    expect(container.querySelector('[data-new-deal-client-continue]')).toBeDisabled();
    expect(container.querySelector('[data-new-deal-client-required]')).not.toBeNull();
    expect(orchestrateMock).not.toHaveBeenCalled();
  });

  it('when NO CRM client relationships exist, shows the honest create/import blocker (no fabrication)', async () => {
    loadClientsMock.mockResolvedValue([]);
    setBanker();
    const { container } = renderCreate();
    await waitFor(() => expect(container.querySelector('[data-new-deal-no-client]')).not.toBeNull());
    expect(screen.getByText(/No CRM client relationship exists yet/i)).toBeInTheDocument();
    expect(container.querySelector('[data-new-deal-create-client-route]')).not.toBeNull();
    // Continue stays disabled — the deal cannot proceed without a client.
    expect(container.querySelector('[data-new-deal-client-continue]')).toBeDisabled();
  });

  it('selecting a client enables Continue', async () => {
    setBanker();
    const { container } = renderCreate();
    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    await userEvent.setup().click(screen.getByRole('option', { name: /Acme Holdings LLC/i }));
    expect(container.querySelector('[data-new-deal-client-continue]')).not.toBeDisabled();
  });
});

describe('Happy path — existing client + team bind and readback via the orchestrator', () => {
  it('carries the selected client + team ids into the governed create and renders the real id', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-xyz',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);

    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull(),
    );
    expect(screen.getByText(/Deal created\. Id deal-xyz/)).toBeInTheDocument();
    expect(container.querySelector('[data-banker-new-deal-open]')?.getAttribute('href')).toBe('/deals/deal-xyz');

    // Orchestrator called: downstream disabled (config {}), CRM-first gate on,
    // and the selected client/team carried into the form.
    const callArg = orchestrateMock.mock.calls[0]![0] as {
      config: unknown;
      form: { dealName: string; existingClientId?: string; existingTeamId?: string };
      context: { requireCrmClient?: boolean };
    };
    expect(callArg.config).toEqual({});
    expect(callArg.form.dealName).toBe('Acme WC');
    expect(callArg.form.existingClientId).toBe('client-guid-1');
    expect(callArg.form.existingTeamId).toBe('team-guid-1');
    expect(callArg.context.requireCrmClient).toBe(true);
  });
});

describe('Result banners — honest partials are never a clean success', () => {
  it('client_required renders an honest blocker (defense-in-depth from the pipeline)', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'client_required',
      userFacingMessage: 'Select the CRM client relationship for this deal in Step 1 before continuing.',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="client_required"]')).not.toBeNull(),
    );
    expect(screen.getByText(/Select the CRM client relationship/i)).toBeInTheDocument();
  });

  it('link_readback_mismatch renders a distinct warning (created but link unverified)', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'link_readback_mismatch',
      createdDealId: 'deal-xyz',
      correlationId: 'corr-lrm',
      userFacingMessage: 'partial',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="link_readback_mismatch"]')).not.toBeNull(),
    );
    expect(container.querySelector('[data-banker-new-deal-result="success"]')).toBeNull();
    expect(screen.getByText(/could not be verified on readback/i)).toBeInTheDocument();
    expect(screen.getByText(/Correlation id: corr-lrm/)).toBeInTheDocument();
  });

  it('audit_failed_partial renders a distinct, honest warning (not a clean success)', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'audit_failed_partial',
      createdDealId: 'deal-xyz',
      correlationId: 'corr-abc',
      auditOutcome: { kind: 'failed', error: 'AuditEvent create returned non-success.' },
      userFacingMessage: 'partial',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="audit_failed_partial"]')).not.toBeNull(),
    );
    expect(container.querySelector('[data-banker-new-deal-result="success"]')).toBeNull();
    expect(screen.getByText(/audit record failed/i)).toBeInTheDocument();
  });

  it('create_failed shows no confirmed deal id', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'create_failed',
      createOutcome: { kind: 'failed', error: 'boom' },
      userFacingMessage: 'failed',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="create_failed"]')).not.toBeNull(),
    );
    expect(screen.getByText(/could not be created/i)).toBeInTheDocument();
  });
});
