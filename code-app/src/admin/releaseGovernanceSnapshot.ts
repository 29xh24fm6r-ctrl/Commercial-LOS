import {
  deriveProductionEnvironmentVerification,
  type ActivationDomainKey,
} from './productionEnvironmentVerification';

/**
 * Current, read-only release-governance projection.
 *
 * Capability flags cannot make this view green by themselves. The six
 * live-write domains resolve through productionEnvironmentVerification, which
 * requires environment certification, an armed runtime gate, and accepted
 * high-confidence machine proof.
 */

export type LaunchRecommendation = 'GO' | 'CONDITIONAL_GO' | 'NO_GO';
export type LaunchDomainStatus = 'ready' | 'conditional' | 'blocked';

export interface LaunchReadinessDomain {
  readonly id: string;
  readonly label: string;
  readonly status: LaunchDomainStatus;
  readonly details: readonly string[];
  readonly requiredActions: readonly string[];
  readonly safetyNotes: readonly string[];
}

export interface ReleaseGovernanceSnapshot {
  readonly recommendation: LaunchRecommendation;
  readonly label: string;
  readonly summary: string;
  readonly domains: readonly LaunchReadinessDomain[];
}

export function launchRecommendationLabel(rec: LaunchRecommendation): string {
  if (rec === 'NO_GO') return 'NO GO';
  if (rec === 'CONDITIONAL_GO') return 'CONDITIONAL GO';
  return 'GO';
}

export function deriveReleaseGovernanceSnapshot(): ReleaseGovernanceSnapshot {
  const verification = deriveProductionEnvironmentVerification();
  const byKey = new Map(verification.domains.map((domain) => [domain.key, domain]));
  const enabled = (key: ActivationDomainKey) => byKey.get(key)?.enabled === true;
  const missing = (key: ActivationDomainKey) => [
    ...(byKey.get(key)?.missingSteps ?? []),
  ];
  const remainingEvidenceActions = verification.domains
    .filter((domain) => !domain.enabled)
    .flatMap((domain) => domain.missingSteps);

  const domains: LaunchReadinessDomain[] = [
    {
      id: 'banker-workspace',
      label: 'Banker Workspace',
      status: 'ready',
      details: [
        'The banker workspace is mounted, governed, and permission controlled.',
        'It loads behind fail-closed identity and entitlement checks with live data or honest empty states.',
      ],
      requiredActions: [],
      safetyNotes: ['Unauthorized users never receive banker workspace content.'],
    },
    {
      id: 'new-deal-create',
      label: 'New Deal Create',
      status: enabled('newDealCreate') ? 'ready' : 'conditional',
      details: [
        'The authorized-banker create path uses the governed adapter, production Stage/Status references, audit, and readback.',
        'Public and anonymous create remain deliberately unavailable.',
      ],
      requiredActions: enabled('newDealCreate') ? [] : missing('newDealCreate'),
      safetyNotes: [
        'Missing identity, authorization, approved references, or audit dependencies fail closed.',
      ],
    },
    {
      id: 'crm',
      label: 'OGB CRM / Relationship Command Center',
      status: enabled('crmWriteback') ? 'ready' : 'conditional',
      details: [
        'Internal OGB CRM relationship management and governed Dataverse persistence are active.',
        'A current live create/readback/update/readback/cleanup smoke is committed.',
        'External Salesforce or nCino synchronization is outside the internal OGB CRM scope.',
      ],
      requiredActions: enabled('crmWriteback') ? [] : missing('crmWriteback'),
      safetyNotes: [
        'Runtime schema verification, operator authorization, audit, and explicit kill switches remain enforced.',
      ],
    },
    {
      id: 'workflow-factory',
      label: 'Workflow Factory',
      status: 'ready',
      details: [
        'Task, checklist, upload, and stage controls are wired behind governed runtime checks.',
        'Outstanding per-domain launch proof is tracked once in the Final V1.0 Launch Decision.',
      ],
      requiredActions: [],
      safetyNotes: ['A write still fails closed when its runtime dependencies are absent.'],
    },
    {
      id: 'credit-committee-compliance',
      label: 'Credit / Committee / Compliance',
      status: 'ready',
      details: [
        'Credit, committee, compliance, adverse-action, and closing controls are mounted.',
        'Decision-support states never fabricate an approval or missing source fact.',
      ],
      requiredActions: [],
      safetyNotes: ['Governed approvals retain their own authorization and audit requirements.'],
    },
    {
      id: 'data-quality-no-fake-data',
      label: 'Data Quality / No Fake Data',
      status: 'ready',
      details: [
        'Production reference rows are canonicalized and obsolete active test rows are deactivated.',
        'Configuration reads show live values or explicit empty/error states; no sample data is substituted.',
      ],
      requiredActions: [],
      safetyNotes: ['The diagnostics sweep remains read-only until an operator creates a flag.'],
    },
    {
      id: 'permissions-entitlements',
      label: 'Permissions / Entitlements',
      status: 'ready',
      details: [
        'Permission-before-render and Dataverse identity resolution remain required across workspaces.',
      ],
      requiredActions: [],
      safetyNotes: ['No entitlement or route is widened by this projection.'],
    },
    {
      id: 'operator-admin-readiness',
      label: 'Operator / Admin Readiness',
      status: 'ready',
      details: [
        'The admin control tower, rollback paths, live diagnostics, and evidence integrity checks are present.',
      ],
      requiredActions: [],
      safetyNotes: ['The action queue is read-only and cannot flip a gate.'],
    },
    {
      id: 'build-release',
      label: 'Build / Release',
      status: 'ready',
      details: [
        'Generated Power Apps artifacts are preflighted and the production build is deterministic.',
      ],
      requiredActions: [],
      safetyNotes: ['Build steps perform no Dataverse mutation.'],
    },
    {
      id: 'final-launch-decision',
      label: 'Final V1.0 Launch Decision',
      status: verification.fullLaunchReady ? 'ready' : 'conditional',
      details: [
        verification.fullLaunchReady
          ? 'All six governed live-write domains have accepted high-confidence evidence.'
          : `${verification.enabledCount} of ${verification.domains.length} governed live-write domains have accepted high-confidence evidence. Internal gates are armed; missing machine proof remains visible.`,
      ],
      requiredActions: remainingEvidenceActions,
      safetyNotes: [
        'A source flag cannot turn this decision green without attributable machine proof.',
      ],
    },
  ];

  const anyBlocked = domains.some((domain) => domain.status === 'blocked');
  const anyConditional = domains.some((domain) => domain.status === 'conditional');
  const recommendation: LaunchRecommendation = anyBlocked
    ? 'NO_GO'
    : anyConditional
      ? 'CONDITIONAL_GO'
      : 'GO';

  return {
    recommendation,
    label: launchRecommendationLabel(recommendation),
    summary: verification.fullLaunchReady
      ? 'The OGB LOS foundation and all six governed live-write domains are certified with accepted high-confidence evidence.'
      : `The OGB LOS foundation is built, mounted, governed, and active. ${verification.enabledCount} of ${verification.domains.length} governed live-write domains currently have accepted high-confidence launch evidence; remaining items stay visible without misreporting an unproved pass.`,
    domains,
  };
}
