import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useBanker } from './BankerContext';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  evaluateBankerCreateRollout,
  type BankerCreateRolloutState,
} from '../deals/bankerNewDealCreateRollout';
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
  loadClientRelationshipOptions,
  loadTeamOptions,
  type CrmLinkOption,
} from '../crm/dealCrmLinkOptions';
import type { DealOriginationResult } from '../deals/dealOriginationOutcomes';

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
  | { kind: 'done'; result: DealOriginationResult }
  | { kind: 'error'; message: string };

type OptionsState =
  | { kind: 'loading' }
  | { kind: 'ready'; options: readonly CrmLinkOption[] }
  | { kind: 'error'; message: string };

type Step = 1 | 2 | 3;

function gateMessage(state: BankerCreateRolloutState): string {
  switch (state) {
    case 'unauthorized':
      return 'You are not authorized to create deals (no Dataverse systemuser / banker rights). No record has been created.';
    case 'references_not_approved':
      return 'Production Stage/Status references are not approved. No record has been created.';
    case 'resolver_not_ready':
      return 'Stage/Status references are not ready. No record has been created.';
    case 'environment_not_allowed':
      return 'New Deal create is not approved for this environment. No record has been created.';
    case 'disabled':
    default:
      return 'New Deal creation is not enabled in this environment. No record has been created.';
  }
}

export function BankerNewDealCreate() {
  const { bankerId, systemUserId, writeDisabledReason, email } = useBanker();
  const [step, setStep] = useState<Step>(1);
  const [dealName, setDealName] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedClient, setSelectedClient] = useState<CrmLinkOption | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<CrmLinkOption | null>(null);
  const [clients, setClients] = useState<OptionsState>({ kind: 'loading' });
  const [teams, setTeams] = useState<OptionsState>({ kind: 'loading' });
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });

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
  const live = rollout === 'live_controlled';

  // Load the EXISTING client / team options once the surface is live. The
  // loaders read Dataverse and NEVER create — search / select only.
  useEffect(() => {
    if (!live) return;
    // clients/teams start in { kind: 'loading' }; the async callbacks below
    // resolve them (no synchronous setState in the effect body).
    let alive = true;
    loadClientRelationshipOptions()
      .then((options) => alive && setClients({ kind: 'ready', options }))
      .catch((err: unknown) =>
        alive && setClients({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    loadTeamOptions()
      .then((options) => alive && setTeams({ kind: 'ready', options }))
      .catch((err: unknown) =>
        alive && setTeams({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      alive = false;
    };
  }, [live]);

  const clientRelationshipsExist = clients.kind === 'ready' && clients.options.length > 0;
  const clientStepSatisfied =
    selectedClient !== null || NEW_DEAL_ALLOW_CREATE_WITHOUT_CRM_CLIENT === true;
  const canSubmit =
    live &&
    step === 3 &&
    clientStepSatisfied &&
    dealName.trim().length > 0 &&
    submit.kind !== 'submitting' &&
    Boolean(systemUserId);

  async function onSubmit() {
    if (!canSubmit || !systemUserId) return;
    setSubmit({ kind: 'submitting' });
    try {
      const amt = amount.trim().length > 0 ? Number(amount) : undefined;
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
            existingClientId: selectedClient?.id,
            existingTeamId: selectedTeam?.id,
          },
          // Downstream automations all disabled this pilot.
          config: {},
          context: {
            authorized: true,
            stageLabel: 'Intake',
            statusLabel: 'Open',
            // Enforce the CRM-first client gate (honest blocker before create).
            requireCrmClient: true,
            allowCreateWithoutClient: NEW_DEAL_ALLOW_CREATE_WITHOUT_CRM_CLIENT,
            clientRelationshipsExist,
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
      setSubmit({ kind: 'done', result });
    } catch (err) {
      setSubmit({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
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
          <strong>Create disabled:</strong> {gateMessage(rollout)}
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
              onDealName={setDealName}
              onAmount={setAmount}
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
        <OptionPicker
          state={state}
          selected={selected}
          onSelect={onSelect}
          placeholder="Search client relationships…"
          testId="client"
          emptyLabel="No matching client relationship."
        />
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
  onDealName,
  onAmount,
  onBack,
  onSubmit,
  canSubmit,
  submitting,
  selectedClient,
  selectedTeam,
}: {
  dealName: string;
  amount: string;
  onDealName: (v: string) => void;
  onAmount: (v: string) => void;
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
        Amount (optional)
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
  const r = submit.result;
  switch (r.kind) {
    case 'success_created_only':
    case 'success_created_with_automation':
      return (
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
      return (
        <div style={styles.bannerError} role="alert" data-banker-new-deal-result="resolver_not_ready">
          Stage/Status references are not ready. No record has been created.
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
