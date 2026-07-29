import { committedFinalLaunchEvidenceIntegrity } from '../access/committedFinalLaunchEvidence';
import {
  CURRENT_CRM_VERIFICATION_EVIDENCE,
  CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
  hydrateVerifiedBoardingSchemaState,
  hydrateVerifiedCrmSchemaState,
} from './runtimeVerifiedSchemaBridge';
import { deriveProductionEnvironmentVerification } from './productionEnvironmentVerification';

export const FINAL_CERTIFICATION_STATUSES = [
  'code-complete',
  'schema-provisioned',
  'datasource-registered',
  'runtime-enabled',
  'live-smoke-tested',
  'blocked-missing-evidence',
  'blocked-dual-user-testing',
  'intentionally-deferred',
] as const;

export type FinalCertificationStatus = (typeof FINAL_CERTIFICATION_STATUSES)[number];

export interface FinalCertificationFinding {
  readonly id: string;
  readonly status: FinalCertificationStatus;
  readonly capability: string;
  readonly evidence: string;
  readonly nextAction?: string;
}

export interface FinalOperatingCertification {
  readonly productionGo: false;
  readonly currentEnabledCount: number;
  readonly activationDomainCount: number;
  readonly findings: readonly FinalCertificationFinding[];
  readonly summary: string;
}

const CODE_COMPLETE: readonly FinalCertificationFinding[] = [
  {
    id: 'code-lifecycle',
    status: 'code-complete',
    capability: 'Canonical deal lifecycle: Intake through servicing handoff',
    evidence: 'Governed requirement engine, stage controls, durable record panels, audit, and timeline paths are present in source.',
  },
  {
    id: 'code-portfolio',
    status: 'code-complete',
    capability: 'Origination-to-portfolio boarding and monitoring',
    evidence: 'Auto-boarding, Booking QC, servicing-owner assignment, originated-deal traceability, and portfolio monitoring surfaces are present in source.',
  },
  {
    id: 'code-binary-upload',
    status: 'code-complete',
    capability: 'Binary deal-document upload and authenticated download',
    evidence:
      'Dataverse File upload, durable byte readback, authenticated download, requirement reconciliation, audit, and timeline paths are implemented and production-verified.',
  },
];

const DUAL_USER_BLOCKS: readonly FinalCertificationFinding[] = [
  {
    id: 'dual-document-review',
    status: 'blocked-dual-user-testing',
    capability: 'Document review segregation of duties',
    evidence: 'Policy is unit-tested with simulated identities; no recorded live two-user execution exists.',
    nextAction: 'Run Test 1 in the two-user certification runbook with two distinct Dataverse users.',
  },
  {
    id: 'dual-credit-approval',
    status: 'blocked-dual-user-testing',
    capability: 'Credit approval segregation of duties',
    evidence: 'Self-approval prevention is coded; live proof by a different authorized approver is not recorded.',
    nextAction: 'Run Test 2 in the two-user certification runbook.',
  },
  {
    id: 'dual-funding',
    status: 'blocked-dual-user-testing',
    capability: 'Funding dual control',
    evidence: 'Requester/approver and second-approver rules are coded; distinct live actors have not been certified.',
    nextAction: 'Run Test 3 in the two-user certification runbook with the required distinct actors.',
  },
];

const INTENTIONALLY_DEFERRED: readonly FinalCertificationFinding[] = [
  {
    id: 'deferred-borrower-portal',
    status: 'intentionally-deferred',
    capability: 'External borrower portal',
    evidence: 'External identity, invitation, role, file, messaging, and notification dependencies remain outside the shipped app.',
  },
  {
    id: 'deferred-annual-review',
    status: 'intentionally-deferred',
    capability: 'Portfolio annual-review persistence',
    evidence: 'The current annual-review surface is a preview; no approved durable persistence design exists.',
  },
];

export function deriveFinalOperatingCertification(): FinalOperatingCertification {
  const verification = deriveProductionEnvironmentVerification();
  const crm = hydrateVerifiedCrmSchemaState(CURRENT_CRM_VERIFICATION_EVIDENCE);
  const portfolio = hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE);
  const smoke = committedFinalLaunchEvidenceIntegrity();
  const findings: FinalCertificationFinding[] = [...CODE_COMPLETE];

  if (crm.hydrated) {
    findings.push(
      {
        id: 'schema-crm',
        status: 'schema-provisioned',
        capability: 'CRM relationship schema',
        evidence: 'Recorded verification reports all 10 planned CRM tables live with the measured column set and no conflicts.',
      },
      {
        id: 'datasource-crm',
        status: 'datasource-registered',
        capability: 'CRM Power Apps datasources',
        evidence: 'Recorded verification reports 10/10 generated services and 10/10 registered datasources.',
      },
    );
  }
  if (portfolio.hydrated) {
    findings.push(
      {
        id: 'schema-portfolio',
        status: 'schema-provisioned',
        capability: 'Portfolio and boarding schema',
        evidence: 'Recorded verification reports all 13 planned portfolio tables and required relationships live with no conflicts.',
      },
      {
        id: 'datasource-portfolio',
        status: 'datasource-registered',
        capability: 'Portfolio Power Apps datasources',
        evidence: 'Recorded verification reports 13/13 generated services and 13/13 registered datasources.',
      },
    );
  }

  for (const domain of verification.domains) {
    if (domain.enabled) {
      findings.push({
        id: `runtime-${domain.key}`,
        status: 'runtime-enabled',
        capability: domain.label,
        evidence: 'Operator certification, runtime gate, and required evidence currently resolve enabled together.',
      });
    }
  }

  findings.push({
    id: 'smoke-new-deal',
    status: 'live-smoke-tested',
    capability: 'New Deal create',
    evidence: 'The controlled banker pilot create has recorded production smoke and verified reference rows.',
  });
  findings.push({
    id: 'smoke-binary-document',
    status: 'live-smoke-tested',
    capability: 'Binary deal-document upload and authenticated download',
    evidence:
      'The 2026-07-29 managed-Edge acceptance uploaded, durably read back, and downloaded 238 bytes with matching SHA-256; requirement, actor, audit, and timeline records reconciled.',
  });
  for (const [capability, report] of Object.entries(smoke)) {
    if (report?.accepted && report.confidence === 'HIGH') {
      findings.push({
        id: `smoke-${capability}`,
        status: 'live-smoke-tested',
        capability,
        evidence: 'Committed smoke evidence is attributable, machine-proven, accepted, and HIGH confidence.',
      });
    }
  }
  for (const domain of verification.domains) {
    if (!domain.evidenceHigh) {
      findings.push({
        id: `evidence-${domain.key}`,
        status: 'blocked-missing-evidence',
        capability: domain.label,
        evidence: domain.evidenceIssues.join(' ') || 'Required launch evidence is not recorded at HIGH confidence.',
        nextAction: domain.missingSteps[0],
      });
    }
  }
  findings.push({
    id: 'evidence-controlled-lifecycle',
    status: 'blocked-missing-evidence',
    capability: 'Controlled production lifecycle: Underwriting through portfolio monitoring',
    evidence: 'The final controlled production E2E runbook is authored but explicitly records that it has not been executed.',
    nextAction: 'Run the controlled production E2E with disposable test deals after prerequisites are verified.',
  });

  findings.push(...DUAL_USER_BLOCKS, ...INTENTIONALLY_DEFERRED);

  return {
    productionGo: false,
    currentEnabledCount: verification.enabledCount,
    activationDomainCount: verification.domains.length,
    findings,
    summary:
      `NOT PRODUCTION GO. ${verification.enabledCount}/${verification.domains.length} activation domains currently resolve enabled. ` +
      'Missing live lifecycle evidence and required multi-user certification remain blocking.',
  };
}
