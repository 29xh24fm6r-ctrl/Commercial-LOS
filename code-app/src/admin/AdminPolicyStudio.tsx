import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  addAuthorityAssignment,
  clonePolicyVersion,
  comparePolicyVersions,
  createPolicyProfile,
  editDraftVersion,
  emptyPolicyStudioState,
  POLICY_STUDIO_TEMPLATES,
  simulatePolicyVersion,
  transitionPolicyVersion,
  validateStudioVersion,
} from '../governance/policyStudioEngine';
import type {
  CommitteeConfiguration,
  ExposureTier,
  PolicyProfileKind,
  PolicySimulationInput,
  PolicyStudioState,
  PolicyStudioVersion,
  RoleCombinationControl,
} from '../governance/policyStudioTypes';
import {
  GOVERNED_CREDIT_ACTIONS,
  type GovernedCreditAction,
} from '../governance/bankCreditGovernanceEngine';
import { Card, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  loadGovernanceRuntimeState,
  type GovernanceRuntimeState,
} from './governanceRuntimeHydration';

const ACTIONS: readonly GovernedCreditAction[] = GOVERNED_CREDIT_ACTIONS;

const now = () => new Date().toISOString();
const list = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const optionalNumber = (value: string) => value.trim() === '' ? undefined : Number(value);

interface AdminPolicyStudioProps {
  readonly actorId: string;
  readonly runtimeLoader?: () => Promise<GovernanceRuntimeState>;
}

const loadingRuntimeState: GovernanceRuntimeState = {
  code: 'QUERY_FAILED',
  isGo: false,
  diagnostic: 'Live Dataverse governance evidence is being resolved. Status remains fail-closed until hydration completes.',
  queriedAt: '',
  queryPhase: 'loading',
};

export function AdminPolicyStudio({ actorId, runtimeLoader = loadGovernanceRuntimeState }: AdminPolicyStudioProps) {
  const [state, setState] = useState<PolicyStudioState>(emptyPolicyStudioState);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [message, setMessage] = useState('Choose or create a browser-local draft to begin authoring.');
  const [runtime, setRuntime] = useState<GovernanceRuntimeState>(loadingRuntimeState);
  const [runtimeLoading, setRuntimeLoading] = useState(true);

  useEffect(() => {
    let current = true;
    void runtimeLoader()
      .then((result) => {
        if (current) setRuntime(result);
      })
      .catch((error: unknown) => {
        if (!current) return;
        setRuntime({
          code: 'QUERY_FAILED',
          isGo: false,
          diagnostic: `Live governance hydration failed closed: ${error instanceof Error ? error.message : 'unknown query failure'}`,
          queriedAt: new Date().toISOString(),
          queryPhase: 'loader',
        });
      })
      .finally(() => {
        if (current) setRuntimeLoading(false);
      });
    return () => { current = false; };
  }, [runtimeLoader]);

  const versions = state.profiles.flatMap((profile) => profile.versions);
  const selected = versions.find((version) => version.studioVersionId === selectedVersionId);
  const profile = selected
    ? state.profiles.find((item) => item.profileId === selected.profileId)
    : undefined;

  function apply(
    operation: (current: PolicyStudioState) => PolicyStudioState,
    success: string,
  ) {
    try {
      setState((current) => operation(current));
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The policy operation failed closed.');
    }
  }

  function create(input: { bankKey: string; name: string; templateKind: PolicyProfileKind }) {
    const next = createPolicyProfile(state, { ...input, actorId, now: now() });
    const created = next.profiles.at(-1)!.versions[0]!;
    setState(next);
    setSelectedVersionId(created.studioVersionId);
    setMessage('Draft profile created from a generic template. No production record was written.');
  }

  function edit(patch: Parameters<typeof editDraftVersion>[2], success: string) {
    if (!selected) return;
    apply((current) => editDraftVersion(current, selected, patch, actorId, now()), success);
  }

  return (
    <section aria-label="Bank Credit Policy Studio" style={styles.section}>
      <Card>
        <CardHeader
          title="Bank Credit Policy Studio"
          subtitle="Author, validate, compare, and simulate versioned delegated-authority policy."
          trailing={(
            <StatusPill active={!runtimeLoading && runtime.isGo} loading={runtimeLoading}>
              {runtimeLoading ? 'CHECKING · live Dataverse' : runtime.isGo ? 'GO · production active' : `NO-GO · ${runtime.code.toLowerCase().replaceAll('_', ' ')}`}
            </StatusPill>
          )}
        />
        <RuntimeEvidencePanel runtime={runtime} loading={runtimeLoading} />
        <div role="note" style={styles.noGo}>
          Production status above is read-only and derived from live Dataverse evidence. Draft authoring
          below is browser-local and cannot activate or mutate the production policy.
        </div>

        <div style={styles.grid}>
          <CreateProfileForm onCreate={create} />
          <div style={styles.panel}>
            <h3 style={styles.heading}>Policy versions</h3>
            <label style={styles.label}>
              Selected version
              <select
                aria-label="Selected policy version"
                style={styles.input}
                value={selectedVersionId}
                onChange={(event) => setSelectedVersionId(event.target.value)}
              >
                <option value="">Choose a version</option>
                {state.profiles.flatMap((item) => item.versions.map((version) => (
                  <option key={version.studioVersionId} value={version.studioVersionId}>
                    {item.name} · v{version.versionNumber} · {version.status}
                  </option>
                )))}
              </select>
            </label>
            {selected && (
              <div style={styles.buttonRow}>
                <ActionButton onClick={() => {
                  const next = clonePolicyVersion(state, selected, actorId, now());
                  const cloned = next.profiles
                    .find((item) => item.profileId === selected.profileId)!.versions.at(-1)!;
                  setState(next);
                  setSelectedVersionId(cloned.studioVersionId);
                  setMessage('Version cloned into an independently editable draft.');
                }}>Clone</ActionButton>
                <ActionButton onClick={() => {
                  const report = validateStudioVersion(selected);
                  setMessage(report.diagnostics.map((item) => `${item.code}: ${item.message}`).join(' · '));
                }}>Validate</ActionButton>
                <ActionButton onClick={() => apply(
                  (current) => transitionPolicyVersion(current, selected, 'SUBMIT', actorId, now()),
                  'Draft submitted for independent approval.',
                )}>Submit</ActionButton>
                <ActionButton onClick={() => apply(
                  (current) => transitionPolicyVersion(current, selected, 'APPROVE', actorId, now()),
                  'Policy approved by the authenticated administrator.',
                )}>Approve</ActionButton>
                <ActionButton onClick={() => apply(
                  (current) => transitionPolicyVersion(
                    current,
                    selected,
                    'SCHEDULE',
                    actorId,
                    now(),
                    new Date(Date.now() + 86_400_000).toISOString(),
                  ),
                  'Activation scheduled in the studio model; production remains inactive.',
                )}>Schedule +1 day</ActionButton>
                <ActionButton onClick={() => apply(
                  (current) => transitionPolicyVersion(current, selected, 'ACTIVATE', actorId, now()),
                  'Version activated only in the in-browser studio model; production remains inactive.',
                )}>Activate studio model</ActionButton>
                <ActionButton onClick={() => apply(
                  (current) => transitionPolicyVersion(current, selected, 'RETIRE', actorId, now()),
                  'Version retired in the studio model.',
                )}>Retire</ActionButton>
              </div>
            )}
            <p role="status" aria-live="polite" style={styles.message}>{message}</p>
          </div>
        </div>

        {selected && profile && (
          <>
            <VersionSummary version={selected} bankKey={profile.bankKey} />
            <div style={styles.grid}>
              <TierEditor version={selected} onEdit={edit} />
              <RoleCombinationEditor version={selected} onEdit={edit} />
              <CommitteeEditor version={selected} onEdit={edit} />
              <AuthorityEditor
                version={selected}
                onAssign={(assignment) => apply(
                  (current) => addAuthorityAssignment(current, selected, assignment, actorId, now()),
                  'Scoped delegated authority added to this draft.',
                )}
              />
            </div>
            <div style={styles.grid}>
              <PolicyPreview version={selected} />
              <SimulationPanel version={selected} onMessage={setMessage} />
              <ComparisonPanel version={selected} state={state} />
              <AuditPanel version={selected} state={state} />
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

function CreateProfileForm({ onCreate }: {
  readonly onCreate: (input: { bankKey: string; name: string; templateKind: PolicyProfileKind }) => void;
}) {
  const [bankKey, setBankKey] = useState('');
  const [name, setName] = useState('');
  const [templateKind, setTemplateKind] = useState<PolicyProfileKind>('SINGLE_OFFICER');
  return (
    <form
      style={styles.panel}
      onSubmit={(event) => {
        event.preventDefault();
        if (bankKey.trim() && name.trim()) onCreate({ bankKey: bankKey.trim(), name: name.trim(), templateKind });
      }}
    >
      <h3 style={styles.heading}>Create policy profile</h3>
      <Field label="Institution key">
        <input required value={bankKey} onChange={(event) => setBankKey(event.target.value)} style={styles.input} />
      </Field>
      <Field label="Profile name">
        <input required value={name} onChange={(event) => setName(event.target.value)} style={styles.input} />
      </Field>
      <Field label="Operating model">
        <select
          value={templateKind}
          onChange={(event) => setTemplateKind(event.target.value as PolicyProfileKind)}
          style={styles.input}
        >
          {POLICY_STUDIO_TEMPLATES.map((template) => (
            <option key={template.kind} value={template.kind}>{template.title}</option>
          ))}
        </select>
      </Field>
      <p style={styles.help}>
        {POLICY_STUDIO_TEMPLATES.find((template) => template.kind === templateKind)!.description}
      </p>
      <ActionButton type="submit">Create draft</ActionButton>
    </form>
  );
}

function VersionSummary({ version, bankKey }: {
  readonly version: PolicyStudioVersion;
  readonly bankKey: string;
}) {
  const report = validateStudioVersion(version);
  return (
    <div style={styles.summary}>
      <Metric label="Institution" value={bankKey} />
      <Metric label="Profile" value={version.profileKind.replaceAll('_', ' ')} />
      <Metric label="Version" value={`v${version.versionNumber} · ${version.status}`} />
      <Metric label="Rules" value={String(version.policy.rules.length)} />
      <Metric label="Authority grants" value={String(version.authorityAssignments.length)} />
      <Metric label="Validation" value={report.valid ? 'Pass' : 'Blocked'} />
    </div>
  );
}

function TierEditor({ version, onEdit }: EditorProps) {
  const [label, setLabel] = useState('');
  const [minimumAmount, setMinimumAmount] = useState('');
  const [minimumExposure, setMinimumExposure] = useState('');
  const [approvalGroups, setApprovalGroups] = useState('');
  const [products, setProducts] = useState('');
  const [riskRatings, setRiskRatings] = useState('');
  const [geographies, setGeographies] = useState('');
  const [industries, setIndustries] = useState('');
  const [exceptionOnly, setExceptionOnly] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    const tierId = `tier-${version.exposureTiers.length + 1}`;
    const groupIds = list(approvalGroups);
    const tier: ExposureTier = {
      tierId,
      label: label.trim(),
      minimumAmount: optionalNumber(minimumAmount),
      minimumRelationshipExposure: optionalNumber(minimumExposure),
      requiredApprovalGroupIds: groupIds,
    };
    const routingRule = {
      ruleId: `route-${tierId}`,
      description: label.trim(),
      actions: ['APPROVE' as const],
      when: {
        minimumAmount: tier.minimumAmount,
        minimumRelationshipExposure: tier.minimumRelationshipExposure,
        products: list(products).length ? list(products) : undefined,
        riskRatings: list(riskRatings).length ? list(riskRatings) : undefined,
        geographies: list(geographies).length ? list(geographies) : undefined,
        industries: list(industries).length ? list(industries) : undefined,
        hasPolicyException: exceptionOnly || undefined,
      },
      requirements: {
        approvalGroups: groupIds.map((groupId) => {
          const committee = version.committees.find((item) => item.committeeId === groupId);
          return {
            groupId,
            approvalsRequired: committee?.approvalsRequired ?? 1,
            eligibleRoles: committee?.eligibleRoles,
            committeeId: committee?.committeeId,
            distinctActors: true,
            unanimous: committee?.unanimous,
          };
        }),
      },
      nonOverrideable: true,
    };
    onEdit({
      exposureTiers: [...version.exposureTiers, tier],
      policy: { ...version.policy, rules: [...version.policy.rules, routingRule] },
    }, 'Conditional exposure route added.');
    setLabel(''); setMinimumAmount(''); setMinimumExposure(''); setApprovalGroups('');
    setProducts(''); setRiskRatings(''); setGeographies(''); setIndustries(''); setExceptionOnly(false);
  }
  return (
    <Panel title="Amount, exposure & conditional routes">
      <CompactList items={version.exposureTiers.map((tier) =>
        `${tier.label}: amount ${money(tier.minimumAmount)}+, exposure ${money(tier.minimumRelationshipExposure)}+`)} />
      <form onSubmit={submit} style={styles.form}>
        <Field label="Tier label"><input required value={label} onChange={(e) => setLabel(e.target.value)} style={styles.input} /></Field>
        <Field label="Minimum amount"><input type="number" min="0" value={minimumAmount} onChange={(e) => setMinimumAmount(e.target.value)} style={styles.input} /></Field>
        <Field label="Minimum relationship exposure"><input type="number" min="0" value={minimumExposure} onChange={(e) => setMinimumExposure(e.target.value)} style={styles.input} /></Field>
        <Field label="Required approval / committee IDs"><input required value={approvalGroups} onChange={(e) => setApprovalGroups(e.target.value)} style={styles.input} /></Field>
        <Field label="Products"><input value={products} onChange={(e) => setProducts(e.target.value)} style={styles.input} /></Field>
        <Field label="Risk ratings"><input value={riskRatings} onChange={(e) => setRiskRatings(e.target.value)} style={styles.input} /></Field>
        <Field label="Geographies"><input value={geographies} onChange={(e) => setGeographies(e.target.value)} style={styles.input} /></Field>
        <Field label="Industries"><input value={industries} onChange={(e) => setIndustries(e.target.value)} style={styles.input} /></Field>
        <label style={styles.checkRow}><input type="checkbox" checked={exceptionOnly} onChange={(e) => setExceptionOnly(e.target.checked)} /> Policy-exception route</label>
        <ActionButton type="submit" disabled={version.status !== 'DRAFT'}>Add governed route</ActionButton>
      </form>
    </Panel>
  );
}

function RoleCombinationEditor({ version, onEdit }: EditorProps) {
  const [action, setAction] = useState<GovernedCreditAction>('APPROVE');
  const [priorAction, setPriorAction] = useState<GovernedCreditAction>('ORIGINATE');
  function add() {
    if (action === priorAction) return;
    const control: RoleCombinationControl = {
      controlId: `${action}-${priorAction}-${version.roleCombinationControls.length + 1}`,
      action,
      priorAction,
      permitted: false,
      nonOverrideable: true,
    };
    const nextRules = version.policy.rules.map((rule) => rule.actions.includes(action)
      ? {
          ...rule,
          requirements: {
            ...rule.requirements,
            independentFrom: [...new Set([...(rule.requirements.independentFrom ?? []), priorAction])],
          },
        }
      : rule);
    onEdit({
      roleCombinationControls: [...version.roleCombinationControls, control],
      policy: { ...version.policy, rules: nextRules },
    }, 'Non-overrideable independence control added.');
  }
  function toggle(control: RoleCombinationControl) {
    const nextControls = version.roleCombinationControls.map((item) =>
      item.controlId === control.controlId ? { ...item, permitted: !item.permitted } : item);
    const nextRules = version.policy.rules.map((rule) => {
      if (!rule.actions.includes(control.action)) return rule;
      const existing = rule.requirements.independentFrom ?? [];
      const independentFrom = control.permitted
        ? [...new Set([...existing, control.priorAction])]
        : existing.filter((action) => action !== control.priorAction);
      return { ...rule, requirements: { ...rule.requirements, independentFrom } };
    });
    onEdit({
      roleCombinationControls: nextControls,
      policy: { ...version.policy, rules: nextRules },
    }, 'Role-combination control updated.');
  }
  return (
    <Panel title="Role combinations & independence">
      {version.roleCombinationControls.length === 0
        ? <p style={styles.help}>This template explicitly permits combined duties when authority covers each action.</p>
        : version.roleCombinationControls.map((control) => (
          <label key={control.controlId} style={styles.checkRow}>
            <input
              type="checkbox"
              checked={!control.permitted}
              disabled={version.status !== 'DRAFT'}
              onChange={() => toggle(control)}
            />
            Require {control.action} to be independent from {control.priorAction}
            {control.nonOverrideable ? ' · non-overrideable' : ''}
          </label>
        ))}
      <div style={styles.form}>
        <Field label="Controlled action"><select value={action} onChange={(e) => setAction(e.target.value as GovernedCreditAction)} style={styles.input}>{ACTIONS.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Must be independent from"><select value={priorAction} onChange={(e) => setPriorAction(e.target.value as GovernedCreditAction)} style={styles.input}>{ACTIONS.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <ActionButton type="button" disabled={version.status !== 'DRAFT' || action === priorAction} onClick={add}>Add independence control</ActionButton>
      </div>
    </Panel>
  );
}

function CommitteeEditor({ version, onEdit }: EditorProps) {
  const committee = version.committees[0];
  const [name, setName] = useState(committee?.name ?? '');
  const [roles, setRoles] = useState(committee?.eligibleRoles.join(', ') ?? '');
  const [quorum, setQuorum] = useState(String(committee?.quorumRequired ?? 2));
  const [approvals, setApprovals] = useState(String(committee?.approvalsRequired ?? 2));
  const [recusals, setRecusals] = useState(committee?.recusedActors.join(', ') ?? '');
  const [abstentions, setAbstentions] = useState(committee?.abstentionsCountTowardQuorum ?? false);
  const [unanimous, setUnanimous] = useState(committee?.unanimous ?? false);
  const [maximumAmount, setMaximumAmount] = useState(String(committee?.maximumAmount ?? ''));
  const [maximumExposure, setMaximumExposure] = useState(String(committee?.maximumRelationshipExposure ?? ''));
  function save(event: FormEvent) {
    event.preventDefault();
    const next: CommitteeConfiguration = {
      committeeId: committee?.committeeId ?? 'credit-committee',
      name,
      eligibleRoles: list(roles),
      quorumRequired: Number(quorum),
      approvalsRequired: Number(approvals),
      unanimous,
      abstentionsCountTowardQuorum: abstentions,
      recusedActors: list(recusals),
      maximumAmount: optionalNumber(maximumAmount),
      maximumRelationshipExposure: optionalNumber(maximumExposure),
    };
    const nextRules = version.policy.rules.map((rule) => ({
      ...rule,
      requirements: {
        ...rule.requirements,
        approvalGroups: rule.requirements.approvalGroups?.map((group) =>
          group.committeeId === next.committeeId
            ? {
                ...group,
                approvalsRequired: next.approvalsRequired,
                eligibleRoles: next.eligibleRoles,
                unanimous: next.unanimous,
              }
            : group),
      },
    }));
    onEdit({
      committees: [next],
      policy: { ...version.policy, rules: nextRules },
    }, 'Committee configuration updated.');
  }
  return (
    <Panel title="Committee governance">
      <form onSubmit={save} style={styles.form}>
        <Field label="Committee name"><input required value={name} onChange={(e) => setName(e.target.value)} style={styles.input} /></Field>
        <Field label="Eligible voting roles"><input value={roles} onChange={(e) => setRoles(e.target.value)} style={styles.input} placeholder="credit-voter" /></Field>
        <Field label="Quorum"><input type="number" min="1" value={quorum} onChange={(e) => setQuorum(e.target.value)} style={styles.input} /></Field>
        <Field label="Approvals required"><input type="number" min="1" value={approvals} onChange={(e) => setApprovals(e.target.value)} style={styles.input} /></Field>
        <Field label="Committee amount limit"><input type="number" min="0" value={maximumAmount} onChange={(e) => setMaximumAmount(e.target.value)} style={styles.input} /></Field>
        <Field label="Committee relationship limit"><input type="number" min="0" value={maximumExposure} onChange={(e) => setMaximumExposure(e.target.value)} style={styles.input} /></Field>
        <Field label="Recused identity IDs"><input value={recusals} onChange={(e) => setRecusals(e.target.value)} style={styles.input} /></Field>
        <label style={styles.checkRow}><input type="checkbox" checked={unanimous} onChange={(e) => setUnanimous(e.target.checked)} /> Require unanimous approval</label>
        <label style={styles.checkRow}><input type="checkbox" checked={abstentions} onChange={(e) => setAbstentions(e.target.checked)} /> Abstentions count toward quorum</label>
        <ActionButton type="submit" disabled={version.status !== 'DRAFT'}>Save committee</ActionButton>
      </form>
    </Panel>
  );
}

function AuthorityEditor({ version, onAssign }: {
  readonly version: PolicyStudioVersion;
  readonly onAssign: (assignment: Parameters<typeof addAuthorityAssignment>[2]) => void;
}) {
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roles, setRoles] = useState('authorized-officer');
  const [actions, setActions] = useState<readonly GovernedCreditAction[]>(['APPROVE']);
  const [products, setProducts] = useState('');
  const [amount, setAmount] = useState('');
  const [exposure, setExposure] = useState('');
  const [risk, setRisk] = useState('');
  const [geography, setGeography] = useState('');
  const [industry, setIndustry] = useState('');
  const [exceptions, setExceptions] = useState('');
  const [through, setThrough] = useState('');
  const [temporary, setTemporary] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    onAssign({
      userId: userId.trim(),
      userDisplayName: displayName.trim(),
      roles: list(roles),
      actions,
      products: list(products),
      maximumAmount: optionalNumber(amount),
      maximumRelationshipExposure: optionalNumber(exposure),
      riskRatings: list(risk),
      geographies: list(geography),
      industries: list(industry),
      exceptionTypes: list(exceptions),
      effectiveFrom: now(),
      effectiveThrough: through ? new Date(through).toISOString() : undefined,
      temporary,
    });
  }
  return (
    <Panel title="Delegated authority">
      <p style={styles.help}>Enter a resolved identity ID. Job title or workspace access never creates authority.</p>
      <form onSubmit={submit} style={styles.form}>
        <Field label="Immutable user ID"><input required value={userId} onChange={(e) => setUserId(e.target.value)} style={styles.input} /></Field>
        <Field label="Display name"><input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={styles.input} /></Field>
        <Field label="Governance roles"><input value={roles} onChange={(e) => setRoles(e.target.value)} style={styles.input} /></Field>
        <fieldset style={styles.fieldset}>
          <legend style={styles.label}>Authorized actions</legend>
          <div style={styles.checkGrid}>{ACTIONS.map((action) => (
            <label key={action} style={styles.checkRow}>
              <input
                type="checkbox"
                checked={actions.includes(action)}
                onChange={(event) => setActions(event.target.checked
                  ? [...actions, action]
                  : actions.filter((item) => item !== action))}
              /> {action}
            </label>
          ))}</div>
        </fieldset>
        <Field label="Products"><input value={products} onChange={(e) => setProducts(e.target.value)} style={styles.input} /></Field>
        <Field label="Maximum amount"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={styles.input} /></Field>
        <Field label="Maximum relationship exposure"><input type="number" min="0" value={exposure} onChange={(e) => setExposure(e.target.value)} style={styles.input} /></Field>
        <Field label="Risk ratings"><input value={risk} onChange={(e) => setRisk(e.target.value)} style={styles.input} /></Field>
        <Field label="Geographies"><input value={geography} onChange={(e) => setGeography(e.target.value)} style={styles.input} /></Field>
        <Field label="Industries"><input value={industry} onChange={(e) => setIndustry(e.target.value)} style={styles.input} /></Field>
        <Field label="Exception types"><input value={exceptions} onChange={(e) => setExceptions(e.target.value)} style={styles.input} /></Field>
        <Field label="Effective through"><input type="datetime-local" value={through} onChange={(e) => setThrough(e.target.value)} style={styles.input} /></Field>
        <label style={styles.checkRow}><input type="checkbox" checked={temporary} onChange={(e) => setTemporary(e.target.checked)} /> Temporary delegation</label>
        <ActionButton type="submit" disabled={version.status !== 'DRAFT' || actions.length === 0}>Assign to draft</ActionButton>
      </form>
      <CompactList items={version.authorityAssignments.map((item) =>
        `${item.userDisplayName} · ${item.actions.join('/')} · ${money(item.maximumAmount)}`)} />
    </Panel>
  );
}

function PolicyPreview({ version }: { readonly version: PolicyStudioVersion }) {
  const report = validateStudioVersion(version);
  return (
    <Panel title="Pre-activation preview">
      <p style={report.valid ? styles.good : styles.bad}>{report.valid ? 'Structurally valid' : 'Activation blocked'}</p>
      <CompactList items={report.diagnostics.map((item) => `${item.severity} · ${item.code} · ${item.message}`)} />
      <p style={styles.help}>Preview never changes the active policy pointer.</p>
    </Panel>
  );
}

function SimulationPanel({ version, onMessage }: {
  readonly version: PolicyStudioVersion;
  readonly onMessage: (message: string) => void;
}) {
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState<GovernedCreditAction>('APPROVE');
  const [amount, setAmount] = useState('500000');
  const [exposure, setExposure] = useState('750000');
  const [decision, setDecision] = useState('');
  function simulate(event: FormEvent) {
    event.preventDefault();
    const input: PolicySimulationInput = {
      actorId,
      action,
      facts: {
        amount: Number(amount),
        totalRelationshipExposure: Number(exposure),
        product: 'Unspecified',
        collateral: [],
        riskRating: 'Unspecified',
        hasPolicyException: false,
        insiderStatus: false,
        concentration: [],
        industry: 'Unspecified',
        geography: 'Unspecified',
        governmentGuaranteedProgram: undefined,
        criticizedClassifiedStatus: undefined,
      },
      actionHistory: [],
      approvals: [],
    };
    const result = simulatePolicyVersion(version, input);
    setDecision(`${result.evaluation.decision}: ${result.explanation.join(' ')}`);
    onMessage('Hypothetical deal evaluated. No lifecycle action was executed.');
  }
  return (
    <Panel title="Hypothetical deal simulator">
      <form onSubmit={simulate} style={styles.form}>
        <Field label="Actor identity ID"><input required value={actorId} onChange={(e) => setActorId(e.target.value)} style={styles.input} /></Field>
        <Field label="Action"><select value={action} onChange={(e) => setAction(e.target.value as GovernedCreditAction)} style={styles.input}>{ACTIONS.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Deal amount"><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} style={styles.input} /></Field>
        <Field label="Relationship exposure"><input type="number" min="0" value={exposure} onChange={(e) => setExposure(e.target.value)} style={styles.input} /></Field>
        <ActionButton type="submit">Simulate route</ActionButton>
      </form>
      {decision && <p data-testid="policy-simulation-result" style={styles.result}>{decision}</p>}
    </Panel>
  );
}

function ComparisonPanel({ version, state }: {
  readonly version: PolicyStudioVersion;
  readonly state: PolicyStudioState;
}) {
  const previous = state.profiles
    .find((item) => item.profileId === version.profileId)?.versions
    .filter((item) => item.versionNumber < version.versionNumber)
    .sort((left, right) => right.versionNumber - left.versionNumber)[0];
  const comparison = useMemo(
    () => previous ? comparePolicyVersions(previous, version) : undefined,
    [previous, version],
  );
  return (
    <Panel title="Control-strength comparison">
      {!comparison
        ? <p style={styles.help}>Clone a version to compare changes.</p>
        : <>
            <CompactList items={comparison.weakerControls.map((item) => `WEAKER · ${item}`)} />
            <CompactList items={comparison.strongerControls.map((item) => `STRONGER · ${item}`)} />
            <CompactList items={comparison.neutralChanges} />
          </>}
    </Panel>
  );
}

function AuditPanel({ version, state }: {
  readonly version: PolicyStudioVersion;
  readonly state: PolicyStudioState;
}) {
  const entries = state.audit.filter((item) => item.studioVersionId === version.studioVersionId);
  return (
    <Panel title="Immutable studio audit">
      <CompactList items={entries.map((item) =>
        `${item.occurredAt} · ${item.action} · ${item.actorId} · ${item.reason}`)} />
    </Panel>
  );
}

interface EditorProps {
  readonly version: PolicyStudioVersion;
  readonly onEdit: (
    patch: Parameters<typeof editDraftVersion>[2],
    success: string,
  ) => void;
}

function Panel({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return <section style={styles.panel}><h3 style={styles.heading}>{title}</h3>{children}</section>;
}
function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <label style={styles.label}>{label}{children}</label>;
}
function ActionButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} style={styles.button}>{children}</button>;
}
function RuntimeEvidencePanel({ runtime, loading }: { readonly runtime: GovernanceRuntimeState; readonly loading: boolean }) {
  const evidence = runtime.evidence;
  const currency = (value: number | undefined) => value === undefined
    ? 'Not configured'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

  return (
    <div aria-label="Live governance evidence" style={{ ...styles.runtimePanel, ...(runtime.isGo && !loading ? styles.runtimePanelGo : {}) }}>
      <div style={styles.runtimeHeader}>
        <div>
          <strong>{loading ? 'Checking live governance configuration' : runtime.isGo ? 'Live governed configuration verified' : 'Live governance configuration blocked'}</strong>
          <div style={styles.help}>{runtime.diagnostic}</div>
        </div>
        <span style={styles.runtimeSource}>LIVE DATAVERSE</span>
      </div>
      {!loading && evidence && (
        <>
          <div style={styles.summary}>
            <Metric label="Governance profile" value={`${evidence.profile.displayName} (${evidence.profile.bankKey})`} />
            <Metric label="Approved policy" value={`${evidence.policy.policyId} · v${evidence.policy.versionNumber} · ${evidence.policy.status}`} />
            <Metric label="Active rules" value={String(evidence.rules.length)} />
            <Metric label="Authority grants" value={String(evidence.authorities.length)} />
          </div>
          <div style={styles.grid}>
            <div style={styles.panel}>
              <h3 style={styles.heading}>Approved policy rules</h3>
              <ol style={styles.list}>
                {evidence.rules.map((rule) => (
                  <li key={rule.id}>
                    <strong>{rule.ruleId}</strong> — {rule.description}{rule.nonOverrideable ? ' · non-overrideable' : ''}
                  </li>
                ))}
              </ol>
              <div style={styles.help}>Immutable policy hash: {evidence.policy.snapshotSha256}</div>
            </div>
            <div style={styles.panel}>
              <h3 style={styles.heading}>Active delegated authority</h3>
              {evidence.authorities.map((authority) => (
                <div key={authority.id} style={styles.evidenceItem}>
                  <strong>{authority.officerName}</strong>
                  <div>{authority.officerUpn}</div>
                  <div>Individual: {currency(authority.maximumAmount)}</div>
                  <div>Relationship: {currency(authority.maximumRelationshipExposure)}</div>
                  <div>Unsecured: {currency(authority.maximumUnsecuredAmount)}</div>
                </div>
              ))}
              <h3 style={{ ...styles.heading, marginTop: spacing.md }}>Active governance roles</h3>
              <ul style={styles.list}>
                {evidence.roleAssignments.map((assignment) => (
                  <li key={assignment.id}>{assignment.officerName} · {assignment.roleCode}</li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
      {!loading && !runtime.isGo && (
        <div role="alert" style={styles.blockedDiagnostic}>
          Diagnostic: {runtime.code} · phase: {runtime.queryPhase ?? 'evaluation'}
        </div>
      )}
    </div>
  );
}

function StatusPill({ children, active = false, loading = false }: { readonly children: ReactNode; readonly active?: boolean; readonly loading?: boolean }) {
  return <span style={{ ...styles.status, ...(active ? styles.statusGo : loading ? styles.statusLoading : {}) }}>{children}</span>;
}
function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return <div><div style={styles.metricLabel}>{label}</div><div style={styles.metricValue}>{value}</div></div>;
}
function CompactList({ items }: { readonly items: readonly string[] }) {
  if (items.length === 0) return null;
  return <ul style={styles.list}>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>;
}
function money(value: number | undefined) {
  return value === undefined ? 'unbounded' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const styles: Record<string, React.CSSProperties> = {
  section: { marginBottom: spacing.xl },
  noGo: { background: palette.atRiskBg, border: `1px solid ${palette.atRisk}`, borderRadius: radius.md, color: palette.text, padding: spacing.md, marginBottom: spacing.lg },
  runtimePanel: { border: `1px solid ${palette.blocked}`, borderRadius: radius.md, background: palette.blockedBg, padding: spacing.md, marginBottom: spacing.md },
  runtimePanelGo: { borderColor: palette.clear, background: palette.clearBg },
  runtimeHeader: { display: 'flex', justifyContent: 'space-between', gap: spacing.md, alignItems: 'flex-start', color: palette.text },
  runtimeSource: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: typography.letterSpacing.label, color: palette.textMuted, whiteSpace: 'nowrap' },
  blockedDiagnostic: { marginTop: spacing.sm, color: palette.blockedFg, fontWeight: typography.weight.semibold },
  evidenceItem: { color: palette.text, fontSize: typography.size.sm, lineHeight: 1.55 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: spacing.md, marginTop: spacing.md },
  panel: { border: `1px solid ${palette.border}`, borderRadius: radius.md, background: palette.surfaceAlt, padding: spacing.md, minWidth: 0 },
  heading: { margin: `0 0 ${spacing.sm}`, color: palette.text, fontSize: typography.size.base },
  form: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  label: { display: 'flex', flexDirection: 'column', gap: spacing.xxs, color: palette.textMuted, fontSize: typography.size.sm, marginBottom: spacing.sm },
  input: { width: '100%', boxSizing: 'border-box', padding: spacing.xs, border: `1px solid ${palette.borderStrong}`, borderRadius: radius.sm, background: palette.surface, color: palette.text, font: 'inherit' },
  button: { padding: `${spacing.xs} ${spacing.sm}`, border: `1px solid ${palette.primary}`, borderRadius: radius.sm, background: palette.primary, color: palette.primaryFg, font: 'inherit', fontWeight: typography.weight.semibold, cursor: 'pointer' },
  buttonRow: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  message: { minHeight: '2.5em', color: palette.textMuted, fontSize: typography.size.sm },
  help: { color: palette.textMuted, fontSize: typography.size.sm, lineHeight: typography.lineHeight.snug },
  status: { borderRadius: radius.pill, padding: `${spacing.xxs} ${spacing.sm}`, background: palette.blockedBg, color: palette.blockedFg, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
  statusGo: { background: palette.clearBg, color: palette.clearFg },
  statusLoading: { background: palette.neutralBg, color: palette.neutralFg },
  summary: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, background: palette.panelBg, borderRadius: radius.md },
  metricLabel: { color: palette.textSubtle, fontSize: typography.size.xs, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label },
  metricValue: { color: palette.text, fontWeight: typography.weight.semibold, marginTop: spacing.xxs },
  checkGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: spacing.xxs },
  checkRow: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, color: palette.text, fontSize: typography.size.sm, marginBottom: spacing.xs },
  fieldset: { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: spacing.sm },
  list: { margin: `${spacing.xs} 0`, paddingLeft: spacing.lg, color: palette.textMuted, fontSize: typography.size.sm, lineHeight: 1.5, overflowWrap: 'anywhere' },
  good: { color: palette.clear, fontWeight: typography.weight.bold },
  bad: { color: palette.blocked, fontWeight: typography.weight.bold },
  result: { background: palette.surface, border: `1px solid ${palette.borderStrong}`, borderRadius: radius.sm, padding: spacing.sm, color: palette.text, fontSize: typography.size.sm, overflowWrap: 'anywhere' },
};
