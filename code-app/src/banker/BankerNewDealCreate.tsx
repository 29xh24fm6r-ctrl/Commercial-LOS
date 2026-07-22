import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useBanker } from './BankerContext';
import { Badge } from '../shared/Badge';
import { Cr664_loandealscr664_guarantorstructure } from '../generated/models/Cr664_loandealsModel';
import {
  updateDealProfile,
  type DealProfilePatch,
  type DealReferencePatch,
  type UpdateDealProfileOutcome,
} from '../deals/write/updateDealProfile';
import { buildLiveUpdateDealProfileDeps } from '../deals/write/buildLiveUpdateDealProfileDeps';
import {
  loadLiveDealReferenceOptionsByCategory,
  DEAL_REFERENCE_LOOKUPS,
  type DealReferenceLookupField,
  type DealReferenceOptionsByCategory,
} from '../deals/write/dealReferenceOptions';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  evaluateBankerCreateRollout,
  deriveNewDealCreateAvailability,
  type BankerCreateRolloutState,
} from '../deals/bankerNewDealCreateRollout';
import { describeUnavailability } from '../shared/governance/operationalCapabilityState';
import { toOperationalCapabilityState } from '../shared/governance/capabilityAvailability';
import {
  BANKER_CREATE_PILOT,
  bankerCreatePilotGateValues,
} from '../deals/bankerCreatePilotConfig';
import {
  NEW_DEAL_ALLOW_CREATE_WITHOUT_CRM_CLIENT,
  NO_CRM_CLIENT_EXISTS_MESSAGE,
} from '../deals/newDealCrmIntakeGate';
import { CREATE_CLIENT_RELATIONSHIP_ENABLED } from '../crm/write/createClientRelationship';
import {
  loadClientLinkTargetOptions,
  loadTeamOptions,
  isOptionListTruncated,
  OPTION_CAP,
  type CrmLinkOption,
} from '../crm/dealCrmLinkOptions';
import {
  bridgeOrgToClientRelationship,
  bridgedClientRelationshipId,
  buildLiveBridgeOrgToClientDeps,
  type BridgeOrgToClientOutcome,
} from '../crm/write/bridgeOrgToClientRelationship';

/** Honest, banker-safe description of a failed CRM-org bridge (never a raw error dump). */
function describeBridgeFailure(bridge: BridgeOrgToClientOutcome): string {
  switch (bridge.kind) {
    case 'unauthorized':
    case 'identity-unresolved':
    case 'not-eligible':
    case 'invalid-input':
      return bridge.reason;
    case 'write-failed':
      return bridge.error;
    case 'readback-mismatch':
      return 'The CRM client relationship could not be verified after creation.';
    default:
      return 'Could not create or find the CRM client relationship for the selected company.';
  }
}
import type { DealOriginationResult } from '../deals/dealOriginationOutcomes';
import type { ExistingDealSignal } from '../deals/newDealDuplicateDetection';

/**
 * Phase — CRM-first New Deal create.
 *
 * A governed loan deal must originate from a CRM client relationship, so the
 * create surface is a three-step flow:
 *   Step 1: CRM Client   — search & select an EXISTING cr664_clientrelationship
 *                          (or, if none exist, route to the controlled Create
 *                          CRM Client Relationship workflow — never fabricated).
 *   Step 2: Owning Team  — search & select an EXISTING cr664_team (optional).
 *   Step 3: Deal Details — name + amount, then the governed create.
 *
 * The selected client / team ids are carried into the governed origination
 * pipeline, which binds cr664_Client / cr664_Team at create time and reads them
 * back. A missing client is an honest blocker BEFORE create (never after) —
 * enforced by the orchestrator's CRM-first gate. This surface itself creates
 * nothing in the CRM: it is search / select / link-existing only. It reuses the
 * governed orchestrator + adapter (no forked create path); the live create runs
 * only on explicit submit via a dynamic import so the static graph stays
 * SDK-free. Public create + downstream automations stay disabled.
 */

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'done'; result: DealOriginationResult; profileOutcome?: UpdateDealProfileOutcome | 'skipped' }
  | { kind: 'error'; message: string };

type OptionsState =
  | { kind: 'loading' }
  | { kind: 'ready'; options: readonly CrmLinkOption[] }
  | { kind: 'error'; message: string };

/** Remediation 2026-07-22 (Workstream E) — the 3 reference-lookup dropdowns' load state. */
type RefLoadState = { kind: 'loading' } | { kind: 'ready'; byCategory: DealReferenceOptionsByCategory };

type Step = 1 | 2 | 3;

export interface BankerNewDealCreateProps {
  /**
   * Remediation 2026-07-22 (Workstream E) — fires the moment a deal record exists
   * (createdDealId is set), regardless of whether the downstream loan-structure
   * profile-completion write below also succeeds, so a parent shell can refresh
   * the board (PersonalPipeline) and pipeline-total KPI in-session instead of
   * requiring a tab switch or reload.
   */
  readonly onCreated?: () => void;
}

export function BankerNewDealCreate({ onCreated }: BankerNewDealCreateProps = {}) {
  const { bankerId, systemUserId, writeDisabledReason, email } = useBanker();
  const [step, setStep] = useState<Step>(1);
  const [dealName, setDealName] = useState('');
  const [amount, setAmount] = useState('');
  // Remediation 2026-07-22 (Workstream E) — expanded loan-structure capture. All optional at the
  // UI layer (a banker may not know every detail at Intake); only whichever of these are actually
  // filled in are sent as a governed follow-up profile-completion write once the deal exists (see
  // runProfileFollowUp below). None of these gate canSubmit except amount (see canSubmit).
  const [targetCloseDate, setTargetCloseDate] = useState('');
  const [collateralSummary, setCollateralSummary] = useState('');
  const [guarantorStructure, setGuarantorStructure] = useState('');
  const [amortizationMonths, setAmortizationMonths] = useState('');
  const [productTypeSel, setProductTypeSel] = useState('');
  const [loanStructureSel, setLoanStructureSel] = useState('');
  const [pricingTypeSel, setPricingTypeSel] = useState('');
  const [refOptions, setRefOptions] = useState<RefLoadState>({ kind: 'loading' });
  const [selectedClient, setSelectedClient] = useState<CrmLinkOption | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<CrmLinkOption | null>(null);
  const [clients, setClients] = useState<OptionsState>({ kind: 'loading' });
  const [teams, setTeams] = useState<OptionsState>({ kind: 'loading' });
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });
  // Loaded so pre-create duplicate detection (warning-only, never blocks by
  // default) has real candidates to compare against instead of an empty set.
  const [existingDeals, setExistingDeals] = useState<readonly ExistingDealSignal[]>([]);
  // Remediation 2026-07-22 (Workstream E) — a synchronous lock independent of React state batching.
  // canSubmit already guards on submit.kind !== 'submitting', but two rapid clicks can both read
  // that check before either click's setState has committed; this ref closes that race.
  const submittingRef = useRef(false);

  const bankerAuthorized = Boolean(systemUserId) && !writeDisabledReason;
  const rollout = useMemo<BankerCreateRolloutState>(
    () =>
      evaluateBankerCreateRollout({
        actorSystemUserId: systemUserId,
        bankerAuthorized,
        // Resolver readiness is verified at submit by the governed adapter,
        // which fails closed and surfaces resolver_not_ready honestly.
        resolverReady: true,
        productionReferencesApproved: BANKER_CREATE_PILOT.productionReferencesApproved,
        environmentIsProduction: BANKER_CREATE_PILOT.environmentIsProduction,
        productionRolloutApproved: BANKER_CREATE_PILOT.productionRolloutApproved,
        gateValues: bankerCreatePilotGateValues(),
      }),
    [systemUserId, bankerAuthorized],
  );
  // Factory Arc Phase 6 — the button's live/disabled state and its banker-facing
  // reason both derive from ONE normalized CapabilityAvailability, not from
  // branching on the raw BankerCreateRolloutState enum directly in the component.
  // Not memoized: new Date() inside a useMemo body defeats React Compiler's
  // memoization-preservation check, and this derivation is cheap regardless.
  const availability = deriveNewDealCreateAvailability(rollout, new Date().toISOString());
  const live = availability.available;

  // Load the EXISTING client / team options once the surface is live. The
  // loaders read Dataverse and NEVER create — search / select only.
  //
  // Remediation 2026-07-22 (Workstream D) — was loadClientRelationshipOptions (existing
  // cr664_clientrelationships only), which meant a real CRM Hub company with no bridged client
  // relationship yet was simply invisible here even though CRM Hub itself lists it, and even
  // though the in-deal "Link CRM client" modal already correctly offers it. Switched to
  // loadClientLinkTargetOptions -- the SAME union CRM Hub and the Link CRM client modal already
  // use -- so this list reconciles with CRM Hub's eligible set. Selecting an unbridged CRM company
  // (sourceKind: 'organization') runs the exact same governed bridge onSubmit below before create.
  useEffect(() => {
    if (!live) return;
    // clients/teams start in { kind: 'loading' }; the async callbacks below
    // resolve them (no synchronous setState in the effect body).
    let alive = true;
    loadClientLinkTargetOptions()
      .then((options) => alive && setClients({ kind: 'ready', options }))
      .catch((err: unknown) =>
        alive && setClients({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    loadTeamOptions()
      .then((options) => alive && setTeams({ kind: 'ready', options }))
      .catch((err: unknown) =>
        alive && setTeams({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    // Remediation 2026-07-22 (Workstream E) — the same live reference list
    // DealProfileEditModal.tsx already uses for Product Type / Loan Structure /
    // Pricing Type. loadLiveDealReferenceOptionsByCategory never rejects (a fetch
    // failure resolves to `unavailable` per-field); the field simply stays
    // unavailable rather than blocking create.
    loadLiveDealReferenceOptionsByCategory().then((byCategory) => alive && setRefOptions({ kind: 'ready', byCategory }));
    // Best-effort: duplicate detection degrades to "no candidates" (never
    // blocks, never throws into the create flow) if this read fails. Dynamic
    // import keeps the static graph SDK-free, matching the submit path below.
    if (bankerId) {
      import('./dealQueries')
        .then(({ loadBankerPipeline }) => loadBankerPipeline(bankerId))
        .then(
          (deals) =>
            alive &&
            setExistingDeals(
              deals.map((d) => ({
                dealId: d.id,
                dealName: d.name,
                clientName: d.clientName,
                bankerId,
                amount: d.amount,
                createdDateMs: d.createdOn ? Date.parse(d.createdOn) : undefined,
              })),
            ),
        )
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [live, bankerId]);

  const clientRelationshipsExist = clients.kind === 'ready' && clients.options.length > 0;
  const clientStepSatisfied =
    selectedClient !== null || NEW_DEAL_ALLOW_CREATE_WITHOUT_CRM_CLIENT === true;
  // Remediation 2026-07-22 (Workstream E) — requested amount is now mandatory for every deal this
  // wizard creates (every deal here opens at Intake; see the onSubmit context.stageLabel below).
  // No deal-level "Prospect" classification exists in the schema to exempt from this rule — only
  // the CRM organization entity carries a Prospect type, a different record one hop away — so the
  // rule applies to 100% of creates rather than fabricating an exemption this schema can't express.
  const amountNumber = Number(amount.trim());
  const amountValid = amount.trim().length > 0 && Number.isFinite(amountNumber) && amountNumber > 0;
  const canSubmit =
    live &&
    step === 3 &&
    clientStepSatisfied &&
    dealName.trim().length > 0 &&
    amountValid &&
    submit.kind !== 'submitting' &&
    Boolean(systemUserId);

  /**
   * Remediation 2026-07-22 (Workstream E) — governed follow-up write for the loan-structure
   * fields captured on this form beyond name/amount/client/team (which the create adapter's
   * allow-list keeps minimal — see newDealCreateAdapter.ts). Reuses updateDealProfile.ts /
   * buildLiveUpdateDealProfileDeps.ts UNCHANGED — the same authorize→validate→update→readback→
   * audit write DealProfileEditModal.tsx already uses, so this is a second call into an
   * already-proven path, not a new write surface. Returns 'skipped' when nothing beyond
   * name/amount was actually filled in (no follow-up write is issued in that case).
   */
  async function runProfileFollowUp(
    dealId: string,
    suid: string,
  ): Promise<UpdateDealProfileOutcome | 'skipped'> {
    const patch: DealProfilePatch = {};
    if (targetCloseDate.trim()) patch.targetCloseDate = targetCloseDate.trim();
    if (collateralSummary.trim()) patch.collateralSummary = collateralSummary.trim();
    if (guarantorStructure.trim()) patch.guarantorStructure = guarantorStructure.trim();
    if (amortizationMonths.trim()) patch.amortizationMonths = amortizationMonths.trim();

    const referencePatch: DealReferencePatch = {};
    const allowedReferenceIds: string[] = [];
    if (refOptions.kind === 'ready') {
      const selections: ReadonlyArray<[DealReferenceLookupField, string]> = [
        ['productType', productTypeSel],
        ['loanStructure', loanStructureSel],
        ['pricingType', pricingTypeSel],
      ];
      for (const [field, selectedId] of selections) {
        if (!selectedId) continue;
        const fieldResult = refOptions.byCategory[field];
        if (fieldResult.kind !== 'ready') continue;
        const option = fieldResult.options.find((o) => o.id === selectedId);
        if (!option) continue;
        referencePatch[field] = { id: option.id, name: option.name };
        allowedReferenceIds.push(...fieldResult.options.map((o) => o.id));
      }
    }

    if (Object.keys(patch).length === 0 && Object.keys(referencePatch).length === 0) {
      return 'skipped';
    }
    return updateDealProfile(
      {
        dealId,
        actorEmail: email,
        actorSystemUserId: suid,
        authorized: true,
        patch,
        referencePatch,
        allowedReferenceIds,
      },
      buildLiveUpdateDealProfileDeps(),
    );
  }

  async function onSubmit() {
    // Remediation 2026-07-22 (Workstream E) — synchronous re-entrancy guard: canSubmit's
    // `submit.kind !== 'submitting'` check can race a rapid double-click, since React may not
    // have committed the first click's setState before the second click's handler reads it.
    // This ref closes that gap independent of state batching.
    if (submittingRef.current) return;
    if (!canSubmit || !systemUserId) return;
    submittingRef.current = true;
    setSubmit({ kind: 'submitting' });
    try {
      // Remediation 2026-07-22 (Workstream D) — the deal's cr664_Client lookup targets a
      // cr664_clientrelationship, never a cr664_crmorganization directly. When the banker picked
      // an unbridged CRM company (sourceKind: 'organization'), run the SAME governed bridge the
      // in-deal "Link CRM client" modal already uses to create/find the canonical client
      // relationship, then use THAT id for the deal's Client lookup. Never creates a client
      // automatically outside this explicit selection + explicit submit.
      let resolvedClientId = selectedClient?.id;
      if (selectedClient?.sourceKind === 'organization') {
        const bridge = await bridgeOrgToClientRelationship(
          {
            organizationId: selectedClient.id,
            organizationName: selectedClient.name,
            organizationType: selectedClient.organizationType ?? '',
            website: selectedClient.website,
            taxIdPresent: selectedClient.taxIdPresent,
            actorEmail: email,
            actorSystemUserId: systemUserId,
            authorized: true,
          },
          buildLiveBridgeOrgToClientDeps(),
        );
        const bridgedId = bridgedClientRelationshipId(bridge);
        if (!bridgedId) {
          setSubmit({ kind: 'error', message: describeBridgeFailure(bridge) });
          return;
        }
        resolvedClientId = bridgedId;
      }
      // Remediation 2026-07-22 (Workstream E) — amount is now mandatory (canSubmit already
      // guards this), so amountNumber is always a valid, finite, positive number here.
      const amt = amountNumber;
      const [orchestratorMod, adapter, reader] = await Promise.all([
        import('../deals/dealOriginationOrchestrator'),
        import('../deals/newDealCreateAdapter'),
        import('../deals/newDealReferenceReader'),
      ]);
      const result = await orchestratorMod.orchestrateDealOrigination(
        {
          form: {
            dealName: dealName.trim(),
            assignedBankerId: bankerId,
            actorSystemUserId: systemUserId,
            // Resolves the audit cr664_ChangedBy cr664_user bind (fail-closed).
            actorEmail: email,
            amount: amt,
            // CRM-first: carry the selected existing client / team into create.
            existingClientId: resolvedClientId,
            existingTeamId: selectedTeam?.id,
          },
          // Downstream write automations all disabled this pilot. Duplicate
          // detection is a warning-only pre-create check (never writes, never
          // blocks unless exactDuplicateBlocks is set, which it isn't here) —
          // safe to run live.
          config: { duplicateDetectionEnabled: true },
          context: {
            authorized: true,
            stageLabel: 'Intake',
            statusLabel: 'Open',
            // Enforce the CRM-first client gate (honest blocker before create).
            requireCrmClient: true,
            allowCreateWithoutClient: NEW_DEAL_ALLOW_CREATE_WITHOUT_CRM_CLIENT,
            clientRelationshipsExist,
            existingDeals,
          },
        },
        {
          runGovernedCreate: async (form) => {
            const base = adapter.buildLiveNewDealCreateDeps();
            return adapter.createGovernedNewDeal(form, {
              ...base,
              enabled: true,
              // Approved PRODUCTION resolver (Intake / Open), TEST/PHASE filtered.
              resolveReferences: () => reader.resolveProductionNewDealReferences(),
            });
          },
        },
      );
      // Remediation 2026-07-22 (Workstream E) — the moment a deal record exists, let the parent
      // shell refresh the board + pipeline-total KPI, and (if any loan-structure fields were
      // filled in) run the governed follow-up write. Both happen regardless of downstream
      // automation outcome — a created deal is a created deal even if link/audit partially failed.
      let profileOutcome: UpdateDealProfileOutcome | 'skipped' | undefined;
      if (result.createdDealId) {
        onCreated?.();
        profileOutcome = await runProfileFollowUp(result.createdDealId, systemUserId);
      }
      setSubmit({ kind: 'done', result, profileOutcome });
    } catch (err) {
      setSubmit({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <section style={styles.wrap} aria-label="New Deal" data-banker-new-deal="panel">
      <header style={styles.head}>
        <div style={styles.titleRow}>
          <h3 style={styles.title}>New Deal</h3>
          <Badge variant={live ? 'clear' : 'neutral'} appearance="outline">
            {live ? 'Create enabled' : 'Create disabled'}
          </Badge>
        </div>
        <p style={styles.subtitle}>
          Create a governed loan deal from a CRM client relationship. Stage opens
          at <strong>Intake</strong> with status <strong>Open</strong>. Audited;
          public + New Deal and downstream automation remain disabled.
        </p>
      </header>

      {!live ? (
        <div style={styles.note} role="note" data-banker-new-deal-state={rollout}>
          <strong>Create disabled:</strong>{' '}
          {describeUnavailability(toOperationalCapabilityState(availability, 'Create deal'))}
        </div>
      ) : (
        <div style={styles.form} data-banker-new-deal-form>
          <Stepper step={step} selectedClient={selectedClient} selectedTeam={selectedTeam} />

          {step === 1 ? (
            <ClientStep
              state={clients}
              selected={selectedClient}
              onSelect={setSelectedClient}
              onContinue={() => setStep(2)}
            />
          ) : null}

          {step === 2 ? (
            <TeamStep
              state={teams}
              selected={selectedTeam}
              onSelect={setSelectedTeam}
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
            />
          ) : null}

          {step === 3 ? (
            <DetailsStep
              dealName={dealName}
              amount={amount}
              amountValid={amountValid}
              onDealName={setDealName}
              onAmount={setAmount}
              targetCloseDate={targetCloseDate}
              onTargetCloseDate={setTargetCloseDate}
              collateralSummary={collateralSummary}
              onCollateralSummary={setCollateralSummary}
              guarantorStructure={guarantorStructure}
              onGuarantorStructure={setGuarantorStructure}
              amortizationMonths={amortizationMonths}
              onAmortizationMonths={setAmortizationMonths}
              productTypeSel={productTypeSel}
              onProductTypeSel={setProductTypeSel}
              loanStructureSel={loanStructureSel}
              onLoanStructureSel={setLoanStructureSel}
              pricingTypeSel={pricingTypeSel}
              onPricingTypeSel={setPricingTypeSel}
              refOptions={refOptions}
              onBack={() => setStep(2)}
              onSubmit={onSubmit}
              canSubmit={canSubmit}
              submitting={submit.kind === 'submitting'}
              selectedClient={selectedClient}
              selectedTeam={selectedTeam}
            />
          ) : null}
        </div>
      )}

      <ResultBanner submit={submit} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<Step, string> = {
  1: 'Step 1: CRM Client',
  2: 'Step 2: Owning Team',
  3: 'Step 3: Deal Details',
};

/** Plain in-step heading (the "Step N:" prefix lives only in the stepper). */
const STEP_TITLES: Record<Step, string> = {
  1: 'CRM Client',
  2: 'Owning Team',
  3: 'Deal Details',
};

function Stepper({
  step,
  selectedClient,
  selectedTeam,
}: {
  step: Step;
  selectedClient: CrmLinkOption | null;
  selectedTeam: CrmLinkOption | null;
}) {
  const done: Record<Step, boolean> = {
    1: selectedClient !== null,
    2: selectedTeam !== null,
    3: false,
  };
  return (
    <ol style={styles.stepper} data-new-deal-stepper>
      {([1, 2, 3] as Step[]).map((s) => {
        const active = s === step;
        return (
          <li
            key={s}
            style={{ ...styles.stepChip, ...(active ? styles.stepChipActive : {}) }}
            data-new-deal-step={s}
            data-active={active ? 'true' : 'false'}
            aria-current={active ? 'step' : undefined}
          >
            {STEP_LABELS[s]}
            {done[s] ? <span style={styles.stepDone}> ✓</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ClientStep({
  state,
  selected,
  onSelect,
  onContinue,
}: {
  state: OptionsState;
  selected: CrmLinkOption | null;
  onSelect: (o: CrmLinkOption | null) => void;
  onContinue: () => void;
}) {
  const allowWithout = NEW_DEAL_ALLOW_CREATE_WITHOUT_CRM_CLIENT === true;
  const noneExist = state.kind === 'ready' && state.options.length === 0;
  return (
    <div style={styles.step} data-new-deal-client-step>
      <h4 style={styles.stepTitle}>{STEP_TITLES[1]}</h4>
      <p style={styles.stepHint}>
        Search and select the existing CRM client relationship this deal
        originates from.
      </p>

      {noneExist ? (
        <div style={styles.blocker} role="note" data-new-deal-no-client>
          <strong>{NO_CRM_CLIENT_EXISTS_MESSAGE}</strong>
          <p style={styles.blockerSub} data-new-deal-create-client-route>
            Use the controlled <em>Create CRM Client Relationship</em> workflow
            to add or import the client first
            {CREATE_CLIENT_RELATIONSHIP_ENABLED
              ? '.'
              : ' (that governed workflow is not yet enabled in this environment).'}
            {' '}This step never creates a client automatically.
          </p>
        </div>
      ) : (
        <>
          {state.kind === 'ready' && isOptionListTruncated(state.options) && (
            <p style={styles.stepHint} role="note" data-new-deal-client-list-truncated>
              Showing the first {OPTION_CAP} client relationships. If the client you&rsquo;re
              looking for isn&rsquo;t listed, it may not appear in this search yet — check the
              CRM Hub directly.
            </p>
          )}
          <OptionPicker
            state={state}
            selected={selected}
            onSelect={onSelect}
            placeholder="Search client relationships…"
            testId="client"
            emptyLabel="No matching client relationship."
          />
        </>
      )}

      <div style={styles.stepActions}>
        <button
          type="button"
          onClick={onContinue}
          disabled={!(selected !== null || allowWithout)}
          aria-disabled={!(selected !== null || allowWithout)}
          style={selected !== null || allowWithout ? styles.action : styles.actionDisabled}
          data-new-deal-client-continue
        >
          Continue to team →
        </button>
        {selected === null && !allowWithout ? (
          <span style={styles.requiredHint} data-new-deal-client-required>
            A CRM client is required to continue.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TeamStep({
  state,
  selected,
  onSelect,
  onBack,
  onContinue,
}: {
  state: OptionsState;
  selected: CrmLinkOption | null;
  onSelect: (o: CrmLinkOption | null) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div style={styles.step} data-new-deal-team-step>
      <h4 style={styles.stepTitle}>{STEP_TITLES[2]}</h4>
      <p style={styles.stepHint}>
        Search and select the existing owning team (optional). Nothing is created
        here — team assignment binds an existing cr664_team.
      </p>
      <OptionPicker
        state={state}
        selected={selected}
        onSelect={onSelect}
        placeholder="Search teams…"
        testId="team"
        emptyLabel="No matching team."
      />
      <div style={styles.stepActions}>
        <button type="button" onClick={onBack} style={styles.actionGhost} data-new-deal-team-back>
          ← Back
        </button>
        <button type="button" onClick={onContinue} style={styles.action} data-new-deal-team-continue>
          Continue to details →
        </button>
      </div>
    </div>
  );
}

function DetailsStep({
  dealName,
  amount,
  amountValid,
  onDealName,
  onAmount,
  targetCloseDate,
  onTargetCloseDate,
  collateralSummary,
  onCollateralSummary,
  guarantorStructure,
  onGuarantorStructure,
  amortizationMonths,
  onAmortizationMonths,
  productTypeSel,
  onProductTypeSel,
  loanStructureSel,
  onLoanStructureSel,
  pricingTypeSel,
  onPricingTypeSel,
  refOptions,
  onBack,
  onSubmit,
  canSubmit,
  submitting,
  selectedClient,
  selectedTeam,
}: {
  dealName: string;
  amount: string;
  amountValid: boolean;
  onDealName: (v: string) => void;
  onAmount: (v: string) => void;
  targetCloseDate: string;
  onTargetCloseDate: (v: string) => void;
  collateralSummary: string;
  onCollateralSummary: (v: string) => void;
  guarantorStructure: string;
  onGuarantorStructure: (v: string) => void;
  amortizationMonths: string;
  onAmortizationMonths: (v: string) => void;
  productTypeSel: string;
  onProductTypeSel: (v: string) => void;
  loanStructureSel: string;
  onLoanStructureSel: (v: string) => void;
  pricingTypeSel: string;
  onPricingTypeSel: (v: string) => void;
  refOptions: RefLoadState;
  onBack: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting: boolean;
  selectedClient: CrmLinkOption | null;
  selectedTeam: CrmLinkOption | null;
}) {
  return (
    <div style={styles.step} data-new-deal-details-step>
      <h4 style={styles.stepTitle}>{STEP_TITLES[3]}</h4>
      <div style={styles.summaryRow} data-new-deal-summary>
        <span>
          Client:{' '}
          <strong data-new-deal-summary-client>
            {selectedClient ? selectedClient.name : 'none (admin-allowed)'}
          </strong>
        </span>
        <span>
          Team:{' '}
          <strong data-new-deal-summary-team>{selectedTeam ? selectedTeam.name : 'none'}</strong>
        </span>
      </div>
      <label style={styles.label}>
        Deal name
        <input
          type="text"
          value={dealName}
          onChange={(e) => onDealName(e.target.value)}
          placeholder="e.g. Acme Working Capital"
          style={styles.input}
          data-banker-new-deal-name
          disabled={submitting}
        />
      </label>
      <label style={styles.label}>
        Amount
        <input
          type="number"
          value={amount}
          min="0"
          onChange={(e) => onAmount(e.target.value)}
          style={styles.input}
          data-banker-new-deal-amount
          disabled={submitting}
        />
      </label>
      {amount.trim().length > 0 && !amountValid ? (
        <span style={styles.requiredHint} data-new-deal-amount-invalid>
          Amount must be a positive number.
        </span>
      ) : null}
      <label style={styles.label}>
        Target close date (optional)
        <input
          type="date"
          value={targetCloseDate}
          onChange={(e) => onTargetCloseDate(e.target.value)}
          style={styles.input}
          data-banker-new-deal-target-close
          disabled={submitting}
        />
      </label>
      <label style={styles.label}>
        Collateral (optional)
        <textarea
          value={collateralSummary}
          onChange={(e) => onCollateralSummary(e.target.value)}
          rows={2}
          style={{ ...styles.input, resize: 'vertical' }}
          data-banker-new-deal-collateral
          disabled={submitting}
        />
      </label>
      <label style={styles.label}>
        Guaranty / guarantor structure (optional)
        <select
          value={guarantorStructure}
          onChange={(e) => onGuarantorStructure(e.target.value)}
          style={styles.input}
          data-banker-new-deal-guarantor-structure
          disabled={submitting}
        >
          <option value="">— Not set —</option>
          {Object.values(Cr664_loandealscr664_guarantorstructure).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </label>
      <label style={styles.label}>
        Amortization, months (optional)
        <input
          type="number"
          value={amortizationMonths}
          min="1"
          step="1"
          onChange={(e) => onAmortizationMonths(e.target.value)}
          style={styles.input}
          data-banker-new-deal-amortization
          disabled={submitting}
        />
      </label>
      <ReferenceSelect
        field="productType"
        value={productTypeSel}
        onChange={onProductTypeSel}
        state={refOptions}
        disabled={submitting}
      />
      <ReferenceSelect
        field="loanStructure"
        value={loanStructureSel}
        onChange={onLoanStructureSel}
        state={refOptions}
        disabled={submitting}
      />
      <ReferenceSelect
        field="pricingType"
        value={pricingTypeSel}
        onChange={onPricingTypeSel}
        state={refOptions}
        disabled={submitting}
      />
      <p style={styles.stepHint}>
        Loan purpose, term, and ownership status are not yet captured here — they need a new
        Dataverse field this environment does not have yet.
      </p>
      <div style={styles.stepActions}>
        <button type="button" onClick={onBack} style={styles.actionGhost} data-new-deal-details-back>
          ← Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-disabled={!canSubmit}
          style={canSubmit ? styles.action : styles.actionDisabled}
          data-banker-new-deal-submit
        >
          {submitting ? 'Creating…' : 'Create deal'}
        </button>
      </div>
    </div>
  );
}

/**
 * Remediation 2026-07-22 (Workstream E) — one of the 3 reference-lookup dropdowns
 * (Product Type / Loan Structure / Pricing Type), fed by the same live, category-scoped
 * cr664_producttypereferences list DealProfileEditModal.tsx already uses. No "current value"
 * concept at create time (unlike the profile-edit modal), so this is simpler: unset, or one
 * of the loaded active options. Stays a disabled hint (never a fabricated dropdown) while the
 * category's list is loading, empty, or unavailable.
 */
function ReferenceSelect({
  field,
  value,
  onChange,
  state,
  disabled,
}: {
  field: DealReferenceLookupField;
  value: string;
  onChange: (v: string) => void;
  state: RefLoadState;
  disabled: boolean;
}) {
  const label = DEAL_REFERENCE_LOOKUPS[field].label;
  if (state.kind === 'loading') {
    return (
      <label style={styles.label}>
        {label} (optional)
        <span style={styles.pickerNote} data-banker-new-deal-reference-loading={field}>
          Loading…
        </span>
      </label>
    );
  }
  const result = state.byCategory[field];
  if (result.kind !== 'ready') {
    return (
      <label style={styles.label}>
        {label} (optional)
        <span style={styles.pickerNote} data-banker-new-deal-reference-unavailable={field}>
          {result.reason}
        </span>
      </label>
    );
  }
  return (
    <label style={styles.label}>
      {label} (optional)
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.input}
        disabled={disabled}
        data-banker-new-deal-reference={field}
      >
        <option value="">— Not set —</option>
        {result.options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Search / select existing options (shared by client + team)
// ---------------------------------------------------------------------------

function OptionPicker({
  state,
  selected,
  onSelect,
  placeholder,
  testId,
  emptyLabel,
}: {
  state: OptionsState;
  selected: CrmLinkOption | null;
  onSelect: (o: CrmLinkOption | null) => void;
  placeholder: string;
  testId: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState('');
  if (state.kind === 'loading') {
    return (
      <div style={styles.pickerNote} data-new-deal-picker-loading={testId}>
        Loading…
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div style={styles.pickerError} role="alert" data-new-deal-picker-error={testId}>
        Could not load options. {state.message}
      </div>
    );
  }
  const q = query.trim().toLowerCase();
  const filtered = q.length === 0
    ? state.options
    : state.options.filter(
        (o) =>
          o.name.toLowerCase().includes(q) || (o.sublabel ?? '').toLowerCase().includes(q),
      );
  return (
    <div style={styles.picker}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        style={styles.input}
        data-new-deal-search={testId}
      />
      <ul style={styles.optionList} role="listbox" aria-label={placeholder} data-new-deal-options={testId}>
        {filtered.length === 0 ? (
          <li style={styles.pickerNote}>{emptyLabel}</li>
        ) : (
          filtered.map((o) => {
            const isSel = selected?.id === o.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onClick={() => onSelect(isSel ? null : o)}
                  style={{ ...styles.option, ...(isSel ? styles.optionSelected : {}) }}
                  data-new-deal-option={o.id}
                >
                  <span style={styles.optionName}>
                    {o.name}
                    {!o.active ? <span style={styles.inactiveTag}> · inactive</span> : null}
                  </span>
                  {o.sublabel ? <span style={styles.optionSub}>{o.sublabel}</span> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result banner
// ---------------------------------------------------------------------------

function ResultBanner({ submit }: { submit: SubmitState }) {
  if (submit.kind === 'idle' || submit.kind === 'submitting') return null;
  if (submit.kind === 'error') {
    return (
      <div style={styles.bannerError} role="alert" data-banker-new-deal-result="error">
        Create failed. No confirmed deal. {submit.message}
      </div>
    );
  }
  return (
    <>
      <OutcomeBanner result={submit.result} />
      <ProfileFollowUpBanner profileOutcome={submit.profileOutcome} />
    </>
  );
}

/**
 * Remediation 2026-07-22 (Workstream E) — honest outcome of the follow-up loan-structure
 * profile-completion write (target close date / collateral / guaranty / product-loan-pricing
 * type / amortization), separate from the main create outcome above: a created deal is still a
 * created deal even if this second, best-effort write did not fully persist. Points the banker
 * at the existing Complete/Edit Deal Profile surface (DealProfileEditModal.tsx) to finish it,
 * rather than silently dropping the values or blocking the create.
 */
function ProfileFollowUpBanner({
  profileOutcome,
}: {
  profileOutcome: UpdateDealProfileOutcome | 'skipped' | undefined;
}) {
  if (profileOutcome === undefined || profileOutcome === 'skipped') return null;
  if (profileOutcome.kind === 'updated') {
    return (
      <div style={styles.bannerOk} role="status" data-banker-new-deal-profile-followup="updated">
        ✓ Additional loan-structure details saved: {profileOutcome.changedLabels.join(', ')}.
      </div>
    );
  }
  const detail = describeProfileFollowUpFailure(profileOutcome);
  return (
    <div style={styles.bannerWarn} role="alert" data-banker-new-deal-profile-followup={profileOutcome.kind}>
      The deal was created, but the additional loan-structure details could not be saved: {detail}
      {' '}Use Complete/Edit Deal Profile on the deal to add them.
    </div>
  );
}

function describeProfileFollowUpFailure(outcome: Exclude<UpdateDealProfileOutcome, { kind: 'updated' }>): string {
  switch (outcome.kind) {
    case 'unauthorized':
    case 'identity-unresolved':
      return outcome.reason;
    case 'invalid-input':
      return outcome.reason;
    case 'empty-patch':
      return outcome.reason;
    case 'write-failed':
      return outcome.error;
    case 'readback-mismatch':
      return `the ${outcome.field} field did not verify on readback.`;
    case 'audit-failed':
      return `governance logging failed (${outcome.auditError ?? 'unknown'}).`;
    default:
      return 'an unexpected error occurred.';
  }
}

function OutcomeBanner({ result: r }: { result: DealOriginationResult }) {
  switch (r.kind) {
    case 'success_created_only':
    case 'success_created_with_automation':
      return (
        <>
          <div style={styles.bannerOk} role="status" data-banker-new-deal-result="success">
            ✓ Deal created. Id {r.createdDealId}. Stage {r.stageLabel} · Status {r.statusLabel}.{' '}
            It now appears in your Active Deals and Loan Workflow.{' '}
            {/* Client-side SPA navigation via react-router (the app's canonical
                deal-open pattern). A raw <a href> would trigger a full browser
                navigation to the Power Apps host path and break out of the app
                shell / hash route. */}
            <Link to={`/deals/${r.createdDealId}`} style={styles.openDealLink} data-banker-new-deal-open>
              Open deal →
            </Link>
          </div>
          {(r.duplicateOutcome?.kind === 'exact_duplicate_found' ||
            r.duplicateOutcome?.kind === 'possible_duplicate_found') && (
            <div style={styles.bannerWarn} role="alert" data-banker-new-deal-result="duplicate-warning">
              ⚠ This deal may duplicate an existing one on your pipeline ({r.duplicateOutcome.candidates?.length ?? 0} similar match
              {(r.duplicateOutcome.candidates?.length ?? 0) === 1 ? '' : 'es'}). The new deal was still created — review
              your Active Deals to confirm before continuing.
            </div>
          )}
        </>
      );
    case 'client_required':
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="client_required">
          {r.userFacingMessage} No deal has been created.
        </div>
      );
    case 'link_readback_mismatch':
      return (
        <div style={styles.bannerWarn} role="alert" data-banker-new-deal-result="link_readback_mismatch">
          The deal was created (id {r.createdDealId}) but its CRM client/team link
          could not be verified on readback. An operator must confirm the link.
          This is not a clean success. Correlation id: {r.correlationId}.
        </div>
      );
    case 'audit_failed_partial':
      return (
        <div style={styles.bannerWarn} role="alert" data-banker-new-deal-result="audit_failed_partial">
          The deal was created (id {r.createdDealId}) but its audit record failed.
          An operator must reattempt the audit. This is not a clean success.
          {' '}Correlation id: {r.correlationId}.
          {r.auditOutcome?.error ? (
            <span data-banker-new-deal-audit-error> Audit error: {r.auditOutcome.error}</span>
          ) : null}
        </div>
      );
    case 'create_failed':
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="create_failed">
          The deal could not be created. No record exists. {r.createOutcome.error ?? ''}
        </div>
      );
    case 'validation_error':
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="validation_error">
          Please fix your input and try again. No record has been created.
        </div>
      );
    case 'unauthorized':
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="unauthorized">
          You are not authorized to create deals. No record has been created.
        </div>
      );
    case 'resolver_not_ready':
      // Factory Arc Phase 11 — the specific reason (missing/inactive/duplicate
      // reference data, or a Dataverse read failure) lives on
      // r.userFacingMessage, set by the orchestrator from the adapter's own
      // resolverDetail() — never one generic sentence for every cause.
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="resolver_not_ready">
          {r.userFacingMessage}
        </div>
      );
    default:
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="other">
          {r.userFacingMessage}
        </div>
      );
  }
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.lg} ${spacing.xl}`,
  },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  titleRow: { display: 'flex', alignItems: 'center', gap: spacing.sm },
  title: { margin: 0, fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  note: {
    background: palette.surfaceAlt,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  form: { display: 'flex', flexDirection: 'column', gap: spacing.md, maxWidth: 520 },
  stepper: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  stepChip: {
    padding: `${spacing.xs} ${spacing.sm}`,
    borderRadius: radius.sm,
    border: `1px solid ${palette.border}`,
    background: palette.surfaceAlt,
    color: palette.textMuted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  stepChipActive: {
    background: palette.cobalt,
    color: palette.cobaltFg,
    border: `1px solid ${palette.cobalt}`,
  },
  stepDone: { color: palette.clear, fontWeight: typography.weight.bold },
  step: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  stepTitle: { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.bold, color: palette.text },
  stepHint: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  stepActions: { display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  requiredHint: { color: palette.atRisk, fontSize: typography.size.xs },
  blocker: {
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  blockerSub: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  picker: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  pickerNote: { color: palette.textMuted, fontSize: typography.size.sm, padding: `${spacing.xs} 0` },
  pickerError: {
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
  optionList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    maxHeight: 220,
    overflowY: 'auto',
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    width: '100%',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    borderBottom: `1px solid ${palette.border}`,
    padding: `${spacing.xs} ${spacing.sm}`,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  optionSelected: { background: palette.clearBg },
  optionName: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text },
  optionSub: { fontSize: typography.size.xs, color: palette.textMuted },
  inactiveTag: { color: palette.atRisk, fontWeight: typography.weight.regular },
  summaryRow: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: typography.size.sm, color: palette.textMuted },
  input: {
    padding: `${spacing.xs} ${spacing.sm}`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    fontSize: typography.size.sm,
    fontFamily: typography.family,
  },
  action: {
    alignSelf: 'flex-start',
    background: palette.cobalt,
    color: palette.cobaltFg,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.lg}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    fontFamily: typography.family,
    cursor: 'pointer',
  },
  actionGhost: {
    alignSelf: 'flex-start',
    background: 'transparent',
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.lg}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'pointer',
  },
  actionDisabled: {
    alignSelf: 'flex-start',
    background: palette.surfaceAlt,
    color: palette.textSubtle,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.lg}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    cursor: 'not-allowed',
  },
  bannerOk: {
    background: palette.clearBg,
    border: `1px solid ${palette.clear}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
  openDealLink: {
    color: palette.cobalt,
    fontWeight: typography.weight.bold,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  bannerWarn: {
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
  bannerError: {
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    color: palette.text,
    fontSize: typography.size.sm,
  },
};
