// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
  loadClientLinkTargetOptions: (...a: unknown[]) => loadClientsMock(...a),
  loadTeamOptions: (...a: unknown[]) => loadTeamsMock(...a),
  OPTION_CAP: 200,
  isOptionListTruncated: (options: unknown[]) => options.length >= 200,
}));

// The org-bridge write is only exercised when a banker selects an unbridged CRM company
// (sourceKind: 'organization'); every other test in this file selects a plain client
// relationship, so this mock stays unused unless a test explicitly wires it.
const bridgeOrgMock = vi.fn();
vi.mock('../crm/write/bridgeOrgToClientRelationship', () => ({
  bridgeOrgToClientRelationship: (...a: unknown[]) => bridgeOrgMock(...a),
  bridgedClientRelationshipId: (outcome: { kind: string; clientRelationshipId?: string }) =>
    outcome.kind === 'created' || outcome.kind === 'linked-existing' || outcome.kind === 'audit-failed'
      ? (outcome.clientRelationshipId ?? null)
      : null,
  buildLiveBridgeOrgToClientDeps: vi.fn(() => ({})),
}));

// Pipeline-deal read for pre-create duplicate-detection candidates. Mocked
// (rather than left real) because dealQueries.ts statically imports the
// generated Dataverse SDK service, which vitest/jsdom cannot resolve.
const loadBankerPipelineMock = vi.fn();
vi.mock('./dealQueries', () => ({
  loadBankerPipeline: (...a: unknown[]) => loadBankerPipelineMock(...a),
}));

// Remediation 2026-07-22 (Workstream E) — the 3 reference-lookup dropdowns' live loader, and the
// follow-up profile-completion write + its live deps factory. DEAL_REFERENCE_LOOKUPS / types stay
// real (static config, no IO) via importOriginal; only the IO-bearing loader is mocked.
const loadReferenceOptionsMock = vi.fn();
vi.mock('../deals/write/dealReferenceOptions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../deals/write/dealReferenceOptions')>();
  return {
    ...actual,
    loadLiveDealReferenceOptionsByCategory: (...a: unknown[]) => loadReferenceOptionsMock(...a),
  };
});
const updateDealProfileMock = vi.fn();
vi.mock('../deals/write/updateDealProfile', () => ({
  updateDealProfile: (...a: unknown[]) => updateDealProfileMock(...a),
}));
vi.mock('../deals/write/buildLiveUpdateDealProfileDeps', () => ({
  buildLiveUpdateDealProfileDeps: vi.fn(() => ({})),
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
    roleType: undefined,
    creditAuthority: { approvalLimit: undefined, creditCommitteeMember: undefined, approvalOverrideAuthority: undefined },
    ...over,
  });
}

function renderCreate(
  props: {
    onCreated?: (createdDealId: string) => Promise<void> | void;
    dealPlacementConfirmation?: 'confirming' | 'timed-out';
  } = {},
) {
  return render(
    <MemoryRouter>
      <BankerNewDealCreate {...props} />
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
  loadBankerPipelineMock.mockResolvedValue([]);
  // Default: no active reference rows for any category — the 3 dropdowns stay unavailable
  // unless a test explicitly supplies options. Never blocks create either way.
  loadReferenceOptionsMock.mockResolvedValue({
    productType: { kind: 'empty', reason: 'no rows' },
    loanStructure: { kind: 'empty', reason: 'no rows' },
    pricingType: { kind: 'empty', reason: 'no rows' },
  });
  updateDealProfileMock.mockReset();
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
  // Step 3: name + amount (Remediation 2026-07-22, Workstream E — amount is now mandatory) + submit.
  await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
  await user.type(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement, '1000000');
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

  // Factory Arc Phase 11 — a resolved identity that is still not authorized
  // to create deals (e.g. a manager/team/portfolio-only role) is a distinct
  // scenario from a missing identity entirely — both must fail closed, but
  // the proof list requires each be independently exercised.
  it('a resolved identity that is not authorized to create deals also sees the honest disabled state', () => {
    setBanker({ systemUserId: 'sys-1', writeDisabledReason: 'Role does not permit deal creation.' });
    const { container } = renderCreate();
    const note = container.querySelector('[data-banker-new-deal-state]');
    expect(note?.getAttribute('data-banker-new-deal-state')).toBe('unauthorized');
    expect(note?.textContent).toMatch(/not authorized/i);
    expect(container.querySelector('[data-banker-new-deal-form]')).toBeNull();
    expect(loadClientsMock).not.toHaveBeenCalled();
  });
});

describe('Step 1 — client list truncation is surfaced honestly, never silently hidden', () => {
  it('shows a truncation notice when the client list hits the fetch cap (200)', async () => {
    loadClientsMock.mockResolvedValue(
      Array.from({ length: 200 }, (_, i) => ({ id: `client-${i}`, name: `Client ${i}`, sublabel: undefined, active: true })),
    );
    setBanker();
    const { container } = renderCreate();
    await waitFor(() => expect(container.querySelector('[data-new-deal-client-list-truncated]')).not.toBeNull());
  });

  it('shows no truncation notice for a client list under the cap', async () => {
    setBanker();
    const { container } = renderCreate();
    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    expect(container.querySelector('[data-new-deal-client-list-truncated]')).toBeNull();
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
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);

    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull(),
    );
    expect(screen.getByText(/Deal created\. Id deal-xyz/)).toBeInTheDocument();
    expect(container.querySelector('[data-banker-new-deal-open]')?.getAttribute('href')).toBe('/deals/deal-xyz');

    // Orchestrator called: downstream write automations disabled, duplicate
    // detection (warning-only, never writes) on, CRM-first gate on, and the
    // selected client/team carried into the form.
    const callArg = orchestrateMock.mock.calls[0]![0] as {
      config: unknown;
      form: { dealName: string; existingClientId?: string; existingTeamId?: string };
      context: { requireCrmClient?: boolean; existingDeals?: unknown[] };
    };
    expect(callArg.config).toEqual({ duplicateDetectionEnabled: true });
    expect(callArg.form.dealName).toBe('Acme WC');
    expect(callArg.form.existingClientId).toBe('client-guid-1');
    expect(callArg.form.existingTeamId).toBe('team-guid-1');
    expect(callArg.context.requireCrmClient).toBe(true);
    expect(callArg.context.existingDeals).toEqual([]);
  });
});

describe('N-36 remediation (Production Remediation Factory Arc Phase 10) — success banner never contradicts the parent\'s confirm-then-navigate status', () => {
  it('with no placement-confirmation status (isolated usage), keeps the original "it now appears" wording', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-xyz',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);

    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull(),
    );
    expect(screen.getByText(/It now appears in your Active Deals and Loan Workflow\./)).toBeInTheDocument();
    expect(container.querySelector('[data-banker-new-deal-placement="timed-out"]')).toBeNull();
  });

  it('when the parent could not confirm placement (timed-out), the banner never asserts "it now appears"', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-xyz',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    const user = userEvent.setup();
    const { container, rerender } = renderCreate({ dealPlacementConfirmation: 'confirming' });
    await completeHappyPath(user, container);

    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull(),
    );

    // The parent has now given up confirming — re-render with the same result but the updated
    // placement status, exactly as BankerShell does when dealCreateConfirm flips to 'timed-out'
    // while BankerNewDealCreate itself stays mounted with its already-resolved submit state.
    rerender(
      <MemoryRouter>
        <BankerNewDealCreate dealPlacementConfirmation="timed-out" />
      </MemoryRouter>,
    );

    expect(container.querySelector('[data-banker-new-deal-placement="timed-out"]')).not.toBeNull();
    expect(screen.queryByText(/It now appears in your Active Deals and Loan Workflow\./)).toBeNull();
    // The deal id, stage, and "Open deal" link are still honest and present — only the
    // over-claiming placement sentence is suppressed.
    expect(screen.getByText(/Deal created\. Id deal-xyz/)).toBeInTheDocument();
    expect(container.querySelector('[data-banker-new-deal-open]')?.getAttribute('href')).toBe('/deals/deal-xyz');
  });
});

describe('Remediation 2026-07-22 (Workstream D) — unbridged CRM company selection bridges before create', () => {
  it('runs the governed org bridge and creates the deal against the resulting client-relationship id, not the raw organization id', async () => {
    setBanker();
    loadClientsMock.mockResolvedValue([
      {
        id: 'org-guid-1',
        name: 'Omni Corp',
        sublabel: 'CRM Company — will create/link borrower client record',
        active: true,
        sourceKind: 'organization',
        organizationType: 'Borrower',
      },
    ]);
    bridgeOrgMock.mockResolvedValue({
      kind: 'created',
      clientRelationshipId: 'bridged-client-guid',
      clientName: 'Omni Corp',
      correlationId: 'corr-1',
      auditId: 'audit-1',
    });
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-xyz',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    const user = userEvent.setup();
    const { container } = renderCreate();

    await screen.findByRole('option', { name: /Omni Corp/i });
    await user.click(screen.getByRole('option', { name: /Omni Corp/i }));
    await user.click(container.querySelector('[data-new-deal-client-continue]') as HTMLButtonElement);
    await screen.findByRole('option', { name: /Commercial East/i });
    await user.click(screen.getByRole('option', { name: /Commercial East/i }));
    await user.click(container.querySelector('[data-new-deal-team-continue]') as HTMLButtonElement);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Omni Deal');
    // Remediation 2026-07-22 (Workstream E) — amount is now mandatory.
    await user.type(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement, '750000');
    await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);

    await waitFor(() => expect(orchestrateMock).toHaveBeenCalled());
    expect(bridgeOrgMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-guid-1', organizationName: 'Omni Corp' }),
      expect.anything(),
    );
    const callArg = orchestrateMock.mock.calls[0]![0] as { form: { existingClientId?: string } };
    // The bridged CLIENT RELATIONSHIP id is bound, never the raw CRM organization id.
    expect(callArg.form.existingClientId).toBe('bridged-client-guid');
    expect(callArg.form.existingClientId).not.toBe('org-guid-1');
  });

  it('surfaces an honest error and never calls the orchestrator when the bridge fails', async () => {
    setBanker();
    loadClientsMock.mockResolvedValue([
      { id: 'org-guid-1', name: 'Omni Corp', active: true, sourceKind: 'organization', organizationType: 'Borrower' },
    ]);
    bridgeOrgMock.mockResolvedValue({ kind: 'write-failed', error: 'Dataverse write denied', correlationId: 'corr-2' });
    const user = userEvent.setup();
    const { container } = renderCreate();

    await screen.findByRole('option', { name: /Omni Corp/i });
    await user.click(screen.getByRole('option', { name: /Omni Corp/i }));
    await user.click(container.querySelector('[data-new-deal-client-continue]') as HTMLButtonElement);
    await screen.findByRole('option', { name: /Commercial East/i });
    await user.click(screen.getByRole('option', { name: /Commercial East/i }));
    await user.click(container.querySelector('[data-new-deal-team-continue]') as HTMLButtonElement);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Omni Deal');
    // Remediation 2026-07-22 (Workstream E) — amount is now mandatory.
    await user.type(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement, '750000');
    await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByText(/Dataverse write denied/)).toBeInTheDocument();
    });
    expect(orchestrateMock).not.toHaveBeenCalled();
  });
});

describe('Pre-create duplicate detection — real candidates, real warning (not silently inert)', () => {
  it('loads this banker\'s pipeline deals and carries them into the orchestrator as duplicate-detection candidates', async () => {
    setBanker();
    loadBankerPipelineMock.mockResolvedValue([
      { id: 'deal-existing-1', name: 'Acme WC', clientName: 'Acme Holdings', amount: 500_000, createdOn: '2026-06-01T00:00:00Z' },
    ]);
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-xyz',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull(),
    );
    const callArg = orchestrateMock.mock.calls[0]![0] as {
      context: { existingDeals?: Array<{ dealId: string; dealName?: string }> };
    };
    expect(callArg.context.existingDeals).toEqual([
      expect.objectContaining({ dealId: 'deal-existing-1', dealName: 'Acme WC' }),
    ]);
  });

  it('a possible-duplicate warning from the orchestrator is surfaced to the banker, not silently dropped', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-xyz',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: {
        module: 'duplicate-detection',
        kind: 'possible_duplicate_found',
        detail: 'Possible duplicate(s) found; warning only.',
        candidates: ['deal-existing-1'],
      },
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="duplicate-warning"]')).not.toBeNull(),
    );
    expect(screen.getByText(/may duplicate an existing one/i)).toBeInTheDocument();
    // The deal is still created — a warning is not a block.
    expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull();
  });

  it('no duplicate found renders no warning banner', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-xyz',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull(),
    );
    expect(container.querySelector('[data-banker-new-deal-result="duplicate-warning"]')).toBeNull();
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

  // Factory Arc Phase 11 — the resolver_not_ready banner must render the
  // orchestrator's specific reason (missing/inactive/duplicate reference
  // data, or a real Dataverse read failure), never a single generic
  // sentence for every cause — this is the "missing reference data" /
  // "Dataverse failure" proof scenarios at the component level.
  it('resolver_not_ready renders the specific reason, not a generic sentence (missing reference data)', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'resolver_not_ready',
      userFacingMessage: 'No active Stage reference matches the configured code/name. No record has been created.',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="resolver_not_ready"]')).not.toBeNull(),
    );
    expect(screen.getByText(/No active Stage reference matches the configured code\/name/i)).toBeInTheDocument();
  });

  it('resolver_not_ready renders the specific reason for a real Dataverse read failure', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'resolver_not_ready',
      userFacingMessage: 'Could not reach Dataverse to verify Stage/Status references (timeout after 30s). No record has been created.',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="resolver_not_ready"]')).not.toBeNull(),
    );
    expect(screen.getByText(/Could not reach Dataverse to verify Stage\/Status references/i)).toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Remediation 2026-07-22 (Workstream E) — expanded loan-structure capture
// ---------------------------------------------------------------------------

describe('Workstream E — requested amount is mandatory for every create', () => {
  it('Create stays disabled with no amount typed, and an honest hint appears only for an invalid non-blank value', async () => {
    setBanker();
    const user = userEvent.setup();
    const { container } = renderCreate();

    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    await user.click(screen.getByRole('option', { name: /Acme Holdings LLC/i }));
    await user.click(container.querySelector('[data-new-deal-client-continue]') as HTMLButtonElement);
    await screen.findByRole('option', { name: /Commercial East/i });
    await user.click(screen.getByRole('option', { name: /Commercial East/i }));
    await user.click(container.querySelector('[data-new-deal-team-continue]') as HTMLButtonElement);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');

    const submitButton = container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
    expect(container.querySelector('[data-new-deal-amount-invalid]')).toBeNull();

    await user.type(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement, '0');
    expect((container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[data-new-deal-amount-invalid]')).not.toBeNull();

    await user.clear(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement);
    await user.type(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement, '500000');
    expect((container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelector('[data-new-deal-amount-invalid]')).toBeNull();
  });

  it('never calls the orchestrator while amount is blank/invalid, even if the button were force-clicked', async () => {
    setBanker();
    const user = userEvent.setup();
    const { container } = renderCreate();
    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    await user.click(screen.getByRole('option', { name: /Acme Holdings LLC/i }));
    await user.click(container.querySelector('[data-new-deal-client-continue]') as HTMLButtonElement);
    await screen.findByRole('option', { name: /Commercial East/i });
    await user.click(screen.getByRole('option', { name: /Commercial East/i }));
    await user.click(container.querySelector('[data-new-deal-team-continue]') as HTMLButtonElement);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
    await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);
    expect(orchestrateMock).not.toHaveBeenCalled();
  });
});

describe('Workstream E — expanded field capture: governed follow-up profile-completion write', () => {
  it('sends only the extra fields actually filled in as a follow-up updateDealProfile write once the deal is created, and confirms it to the banker', async () => {
    setBanker();
    loadReferenceOptionsMock.mockResolvedValue({
      productType: { kind: 'ready', options: [{ id: 'pt-1', name: 'Term Loan', active: true }] },
      loanStructure: { kind: 'empty', reason: 'no rows' },
      pricingType: { kind: 'empty', reason: 'no rows' },
    });
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-new-1',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    updateDealProfileMock.mockResolvedValue({
      kind: 'updated',
      dealId: 'deal-new-1',
      correlationId: 'corr-1',
      verified: {},
      changedLabels: ['Target close date', 'Collateral', 'Product type'],
      auditId: 'audit-1',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();

    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    await user.click(screen.getByRole('option', { name: /Acme Holdings LLC/i }));
    await user.click(container.querySelector('[data-new-deal-client-continue]') as HTMLButtonElement);
    await screen.findByRole('option', { name: /Commercial East/i });
    await user.click(screen.getByRole('option', { name: /Commercial East/i }));
    await user.click(container.querySelector('[data-new-deal-team-continue]') as HTMLButtonElement);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
    await user.type(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement, '1000000');
    // Only fill in target close date + collateral + the product-type dropdown; leave the rest unset.
    await user.type(container.querySelector('[data-banker-new-deal-target-close]') as HTMLInputElement, '2026-12-31');
    await user.type(container.querySelector('[data-banker-new-deal-collateral]') as HTMLTextAreaElement, 'Equipment lien');
    await user.selectOptions(
      container.querySelector('[data-banker-new-deal-reference="productType"]') as HTMLSelectElement,
      'pt-1',
    );
    await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);

    await waitFor(() => expect(updateDealProfileMock).toHaveBeenCalledTimes(1));
    const call = updateDealProfileMock.mock.calls[0]![0];
    expect(call.dealId).toBe('deal-new-1');
    expect(call.patch).toEqual({ targetCloseDate: '2026-12-31', collateralSummary: 'Equipment lien' });
    expect(call.referencePatch).toEqual({ productType: { id: 'pt-1', name: 'Term Loan' } });
    expect(call.allowedReferenceIds).toContain('pt-1');

    expect(
      await screen.findByText(/Additional loan-structure details saved/i),
    ).toBeInTheDocument();
  });

  // N-25 remediation (Production Remediation Factory Arc Phase 8) — loan purpose, term, and
  // ownership structure were previously absent from this wizard entirely (a stale disclaimer said
  // the schema didn't support them, even though updateDealProfile.ts already governs writing all
  // three). This proves the wizard now captures and sends them through the same governed
  // follow-up write as the other optional Step 3 fields.
  it('N-25: captures loan purpose, term months, and ownership structure and sends them in the follow-up write', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-new-25',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    updateDealProfileMock.mockResolvedValue({
      kind: 'updated',
      dealId: 'deal-new-25',
      correlationId: 'corr-25',
      verified: {},
      changedLabels: ['Loan Purpose', 'Loan Term (months)', 'Ownership Structure'],
      auditId: 'audit-25',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();

    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    await user.click(screen.getByRole('option', { name: /Acme Holdings LLC/i }));
    await user.click(container.querySelector('[data-new-deal-client-continue]') as HTMLButtonElement);
    await screen.findByRole('option', { name: /Commercial East/i });
    await user.click(screen.getByRole('option', { name: /Commercial East/i }));
    await user.click(container.querySelector('[data-new-deal-team-continue]') as HTMLButtonElement);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
    await user.type(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement, '1000000');
    await user.type(
      container.querySelector('[data-banker-new-deal-loan-purpose]') as HTMLInputElement,
      'Acquisition of commercial property',
    );
    await user.type(container.querySelector('[data-banker-new-deal-loan-term]') as HTMLInputElement, '60');
    await user.type(
      container.querySelector('[data-banker-new-deal-ownership-structure]') as HTMLInputElement,
      'LLC',
    );
    await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);

    await waitFor(() => expect(updateDealProfileMock).toHaveBeenCalledTimes(1));
    const call = updateDealProfileMock.mock.calls[0]![0];
    expect(call.dealId).toBe('deal-new-25');
    expect(call.patch).toEqual({
      loanPurpose: 'Acquisition of commercial property',
      loanTermMonths: '60',
      ownershipStructure: 'LLC',
    });
  });

  // N-25 remediation — a failed create must not lose what the banker already typed on retry.
  // No existing test asserted this preservation for ANY Step 3 field; the wizard's own state
  // management already provides it for free (no field is ever reset on failure) — this proves it.
  it('N-25: preserves purpose/term/ownership across a failed create so a retry does not lose banker-typed data', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'create_failed',
      createOutcome: { kind: 'failed', error: 'transient failure' },
      userFacingMessage: 'failed',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();

    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    await user.click(screen.getByRole('option', { name: /Acme Holdings LLC/i }));
    await user.click(container.querySelector('[data-new-deal-client-continue]') as HTMLButtonElement);
    await screen.findByRole('option', { name: /Commercial East/i });
    await user.click(screen.getByRole('option', { name: /Commercial East/i }));
    await user.click(container.querySelector('[data-new-deal-team-continue]') as HTMLButtonElement);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
    await user.type(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement, '1000000');
    await user.type(
      container.querySelector('[data-banker-new-deal-loan-purpose]') as HTMLInputElement,
      'Working capital',
    );
    await user.type(container.querySelector('[data-banker-new-deal-loan-term]') as HTMLInputElement, '36');
    await user.type(
      container.querySelector('[data-banker-new-deal-ownership-structure]') as HTMLInputElement,
      'S-Corp',
    );
    await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);

    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="create_failed"]')).not.toBeNull(),
    );
    expect((container.querySelector('[data-banker-new-deal-loan-purpose]') as HTMLInputElement).value).toBe(
      'Working capital',
    );
    expect((container.querySelector('[data-banker-new-deal-loan-term]') as HTMLInputElement).value).toBe('36');
    expect(
      (container.querySelector('[data-banker-new-deal-ownership-structure]') as HTMLInputElement).value,
    ).toBe('S-Corp');
  });

  it('does NOT issue a follow-up write when nothing beyond name/amount was filled in', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-new-2',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await completeHappyPath(user, container);

    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull(),
    );
    expect(updateDealProfileMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Additional loan-structure details saved/i)).not.toBeInTheDocument();
  });

  it('an honest partial banner appears (pointing at Complete/Edit Deal Profile) when the follow-up write fails, without retracting the create', async () => {
    setBanker();
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-new-3',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    updateDealProfileMock.mockResolvedValue({
      kind: 'write-failed',
      error: 'row locked',
      correlationId: 'corr-2',
    });
    const user = userEvent.setup();
    const { container } = renderCreate();
    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    await user.click(screen.getByRole('option', { name: /Acme Holdings LLC/i }));
    await user.click(container.querySelector('[data-new-deal-client-continue]') as HTMLButtonElement);
    await screen.findByRole('option', { name: /Commercial East/i });
    await user.click(screen.getByRole('option', { name: /Commercial East/i }));
    await user.click(container.querySelector('[data-new-deal-team-continue]') as HTMLButtonElement);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
    await user.type(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement, '1000000');
    await user.type(container.querySelector('[data-banker-new-deal-collateral]') as HTMLTextAreaElement, 'Equipment');
    await user.click(container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement);

    // The main create success banner still appears — a created deal is a created deal.
    expect(
      await screen.findByText(/Deal created/i),
    ).toBeInTheDocument();
    expect(await screen.findByText(/could not be saved: row locked/i)).toBeInTheDocument();
    expect(screen.getByText(/Complete\/Edit Deal Profile/i)).toBeInTheDocument();
  });
});

describe('Workstream E — duplicate-submit protection (rapid double-click)', () => {
  it('two rapid clicks on Create invoke the orchestrator only once', async () => {
    setBanker();
    let resolveOrchestrate!: (v: unknown) => void;
    orchestrateMock.mockImplementation(
      () => new Promise((resolve) => { resolveOrchestrate = resolve; }),
    );
    const user = userEvent.setup();
    const { container } = renderCreate();
    await screen.findByRole('option', { name: /Acme Holdings LLC/i });
    await user.click(screen.getByRole('option', { name: /Acme Holdings LLC/i }));
    await user.click(container.querySelector('[data-new-deal-client-continue]') as HTMLButtonElement);
    await screen.findByRole('option', { name: /Commercial East/i });
    await user.click(screen.getByRole('option', { name: /Commercial East/i }));
    await user.click(container.querySelector('[data-new-deal-team-continue]') as HTMLButtonElement);
    await user.type(container.querySelector('[data-banker-new-deal-name]') as HTMLInputElement, 'Acme WC');
    await user.type(container.querySelector('[data-banker-new-deal-amount]') as HTMLInputElement, '1000000');

    const submitButton = container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement;
    // A rapid double-click (fireEvent, back-to-back). Behavioral regression test for
    // "only one orchestrator call ever results from clicking Create twice in a row" —
    // covers the combination of the disabled-attribute re-render AND the synchronous
    // submittingRef guard together, not an isolated proof of either mechanism alone.
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    await waitFor(() => expect(orchestrateMock).toHaveBeenCalled());
    resolveOrchestrate({
      kind: 'success_created_only',
      createdDealId: 'deal-new-4',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull(),
    );
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
  });
});

describe('Workstream E — onCreated fires so a parent shell can refresh the board + pipeline total', () => {
  it('calls onCreated exactly once, with the EXACT createdDealId (never a no-argument fire-and-forget)', async () => {
    setBanker();
    const onCreated = vi.fn();
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-new-5',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    const user = userEvent.setup();
    const { container } = renderCreate({ onCreated });
    await completeHappyPath(user, container);

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith('deal-new-5');
  });

  it('does NOT call onCreated when create fails (no deal record exists) — never navigates', async () => {
    setBanker();
    const onCreated = vi.fn();
    orchestrateMock.mockResolvedValue({
      kind: 'create_failed',
      createOutcome: { kind: 'failed', error: 'boom' },
      userFacingMessage: 'failed',
    });
    const user = userEvent.setup();
    const { container } = renderCreate({ onCreated });
    await completeHappyPath(user, container);

    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="create_failed"]')).not.toBeNull(),
    );
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('calls onCreated with the exact createdDealId for a link_readback_mismatch partial outcome (deal still exists)', async () => {
    setBanker();
    const onCreated = vi.fn();
    orchestrateMock.mockResolvedValue({
      kind: 'link_readback_mismatch',
      createdDealId: 'deal-lrm-1',
      correlationId: 'corr-lrm',
      userFacingMessage: 'partial',
    });
    const user = userEvent.setup();
    const { container } = renderCreate({ onCreated });
    await completeHappyPath(user, container);

    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="link_readback_mismatch"]')).not.toBeNull(),
    );
    expect(onCreated).toHaveBeenCalledWith('deal-lrm-1');
  });

  it('calls onCreated with the exact createdDealId for an audit_failed_partial outcome (deal still exists)', async () => {
    setBanker();
    const onCreated = vi.fn();
    orchestrateMock.mockResolvedValue({
      kind: 'audit_failed_partial',
      createdDealId: 'deal-afp-1',
      correlationId: 'corr-abc',
      auditOutcome: { kind: 'failed', error: 'AuditEvent create returned non-success.' },
      userFacingMessage: 'partial',
    });
    const user = userEvent.setup();
    const { container } = renderCreate({ onCreated });
    await completeHappyPath(user, container);

    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="audit_failed_partial"]')).not.toBeNull(),
    );
    expect(onCreated).toHaveBeenCalledWith('deal-afp-1');
  });

  it('preserves the result banner and awaits the parent before allowing a re-entrant submit', async () => {
    setBanker();
    let resolveOnCreated!: () => void;
    const onCreated = vi.fn(
      () => new Promise<void>((resolve) => { resolveOnCreated = resolve; }),
    );
    orchestrateMock.mockResolvedValue({
      kind: 'success_created_only',
      createdDealId: 'deal-new-6',
      stageLabel: 'Intake',
      statusLabel: 'Open',
      userFacingMessage: 'ok',
      duplicateOutcome: { module: 'duplicate-detection', kind: 'no_duplicate_found' },
    });
    const user = userEvent.setup();
    const { container } = renderCreate({ onCreated });
    await completeHappyPath(user, container);

    // The result banner shows immediately — it does not wait for the parent's
    // confirm/navigate work to finish.
    await waitFor(() =>
      expect(container.querySelector('[data-banker-new-deal-result="success"]')).not.toBeNull(),
    );
    expect(onCreated).toHaveBeenCalledWith('deal-new-6');
    expect(orchestrateMock).toHaveBeenCalledTimes(1);

    // The parent (onCreated) has not resolved yet. A re-entrant submit attempt
    // must not re-invoke the orchestrator while this component is still
    // awaiting the parent's completion.
    const submitButton = container.querySelector('[data-banker-new-deal-submit]') as HTMLButtonElement;
    fireEvent.click(submitButton);
    await new Promise((r) => setTimeout(r, 0));
    expect(orchestrateMock).toHaveBeenCalledTimes(1);

    // Once the parent finishes, the re-entrancy guard releases.
    resolveOnCreated();
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });
});
