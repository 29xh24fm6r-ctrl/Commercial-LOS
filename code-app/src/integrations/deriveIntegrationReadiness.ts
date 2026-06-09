/**
 * Phase 142F — Integration readiness deriver.
 *
 * PURE, READ-ONLY. Derives which integration categories an upstream
 * product/process/workflow/lifecycle context would REQUIRE, and reports each
 * provider's (disabled) readiness, the missing policy approvals, and the missing
 * transports. Integration readiness is NOT data readiness; a missing integration
 * never fabricates a result. No provider is called; the next best action is
 * always "configure / approve", never "execute".
 */

import type {
  IntegrationAdapterDefinition,
  IntegrationAdapterReadiness,
  IntegrationCategory,
  IntegrationHumanApprovalState,
  IntegrationPermissionContext,
  IntegrationPolicyState,
  IntegrationProviderKey,
} from './integrationAdapterTypes';
import { INTEGRATION_PROVIDER_REGISTRY } from './integrationProviderRegistry';
import { validateIntegrationRequest } from './validateIntegrationRequest';

export interface DeriveIntegrationReadinessInput {
  registry?: readonly IntegrationAdapterDefinition[];
  permissionContext?: IntegrationPermissionContext;
  approvalState?: IntegrationHumanApprovalState;
  policyState?: IntegrationPolicyState;
  /** providerKey → whether a transport adapter is configured. */
  transportRegistry?: Readonly<Record<string, boolean>>;
  /** Requirement hints from upstream 142C/D/E metadata. */
  workflowRouteKey?: string;
  templateRequiresCreditBureau?: boolean;
  templateRequiresAmlKyc?: boolean;
  templateServicingExpectations?: readonly string[];
  servicingStage?: string;
}

export interface IntegrationProviderReadinessEntry {
  providerKey: IntegrationProviderKey;
  category: IntegrationCategory;
  displayName: string;
  required: boolean;
  readiness: IntegrationAdapterReadiness;
}

export interface IntegrationReadinessNextAction {
  code: string;
  label: string;
}

export interface IntegrationReadinessAuditSummary {
  requiredCount: number;
  blockedCount: number;
  containsLiveCall: false;
  containsPiiTransmission: false;
  readOnly: true;
}

export interface IntegrationReadinessResult {
  providerReadiness: readonly IntegrationProviderReadinessEntry[];
  requiredIntegrations: readonly IntegrationProviderKey[];
  optionalIntegrations: readonly IntegrationProviderKey[];
  blockedIntegrations: readonly IntegrationProviderKey[];
  missingPolicyApprovals: readonly string[];
  missingTransports: readonly IntegrationProviderKey[];
  nextBestActions: readonly IntegrationReadinessNextAction[];
  auditSummary: IntegrationReadinessAuditSummary;
}

const CREDIT_ROUTE_RX = /credit|underwrit|committee|sba|commercial|construction|working_capital/i;
const ONBOARDING_ROUTE_RX = /onboard|borrower|new_|origination|kyc/i;

function requiredCategories(input: DeriveIntegrationReadinessInput): Set<IntegrationCategory> {
  const required = new Set<IntegrationCategory>();
  const route = input.workflowRouteKey ?? '';

  if (input.templateRequiresCreditBureau || CREDIT_ROUTE_RX.test(route)) {
    required.add('credit_bureau');
    required.add('credit_scoring');
  }
  if (input.templateRequiresAmlKyc || ONBOARDING_ROUTE_RX.test(route)) {
    required.add('aml_kyc');
    required.add('sanctions_screening');
  }
  if (input.servicingStage) {
    required.add('core_banking');
    required.add('servicing_system');
  }
  return required;
}

export function deriveIntegrationReadiness(
  input: DeriveIntegrationReadinessInput = {},
): IntegrationReadinessResult {
  const registry = input.registry ?? INTEGRATION_PROVIDER_REGISTRY;
  const required = requiredCategories(input);
  const approvals = new Set(input.approvalState?.approvals ?? []);

  const providerReadiness: IntegrationProviderReadinessEntry[] = registry.map((def) => {
    const readiness = validateIntegrationRequest({
      provider: def,
      request: { providerKey: def.providerKey, capability: def.capabilities[0]?.capability ?? 'retrieve_reporting_status' },
      permissionContext: input.permissionContext,
      approvalState: input.approvalState,
      policyState: input.policyState,
      transportConfigured: input.transportRegistry?.[def.providerKey] === true,
      mode: 'disabled',
    });
    return { providerKey: def.providerKey, category: def.category, displayName: def.displayName, required: required.has(def.category), readiness };
  });

  const requiredIntegrations = providerReadiness.filter((p) => p.required).map((p) => p.providerKey);
  const optionalIntegrations = providerReadiness.filter((p) => !p.required).map((p) => p.providerKey);
  // Every provider is disabled this phase, so all are blocked.
  const blockedIntegrations = providerReadiness.filter((p) => !p.readiness.allowed).map((p) => p.providerKey);

  const missingPolicyApprovals: string[] = [];
  const missingTransports: IntegrationProviderKey[] = [];
  for (const def of registry) {
    if (!required.has(def.category)) continue;
    if (def.humanApproval.required && (!def.humanApproval.approvalKey || !approvals.has(def.humanApproval.approvalKey))) {
      if (def.humanApproval.approvalKey) missingPolicyApprovals.push(def.humanApproval.approvalKey);
    }
    if (input.transportRegistry?.[def.providerKey] !== true) missingTransports.push(def.providerKey);
  }

  const nextBestActions: IntegrationReadinessNextAction[] = [];
  if (requiredIntegrations.length > 0) {
    nextBestActions.push({ code: 'configure_required_integrations', label: 'Configure transport and obtain policy / human approval for required integrations (no external call).' });
  }
  if (missingPolicyApprovals.length > 0) {
    nextBestActions.push({ code: 'obtain_policy_approvals', label: 'Obtain the outstanding human / policy approvals before any future integration use.' });
  }
  if (nextBestActions.length === 0) {
    nextBestActions.push({ code: 'review_integration_registry', label: 'Review the integration registry (all providers disabled / read-only).' });
  }

  return {
    providerReadiness,
    requiredIntegrations,
    optionalIntegrations,
    blockedIntegrations,
    missingPolicyApprovals: Array.from(new Set(missingPolicyApprovals)),
    missingTransports,
    nextBestActions,
    auditSummary: {
      requiredCount: requiredIntegrations.length,
      blockedCount: blockedIntegrations.length,
      containsLiveCall: false,
      containsPiiTransmission: false,
      readOnly: true,
    },
  };
}
