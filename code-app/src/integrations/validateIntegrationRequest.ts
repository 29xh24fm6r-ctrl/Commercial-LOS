/**
 * Phase 142F — Integration request validation gate.
 *
 * PURE, READ-ONLY. Evaluates whether an integration request COULD proceed and
 * returns the first blocking reason. In this phase it NEVER returns "ready":
 * live external calls are disabled regardless of configuration, so the terminal
 * state for a fully-configured future adapter is `blocked_live_calls_disabled`.
 * Write modes, missing permission/approval/permissible-purpose, PII / credit
 * report transmission, and missing transport all fail closed.
 */

import type {
  IntegrationAdapterDefinition,
  IntegrationAdapterMode,
  IntegrationAdapterReadiness,
  IntegrationAdapterReadinessValue,
  IntegrationAdapterBlocker,
  IntegrationAdapterWarning,
  IntegrationAdapterRequest,
  IntegrationCapabilityDefinition,
  IntegrationErrorCode,
  IntegrationHumanApprovalState,
  IntegrationPermissionContext,
  IntegrationPolicyState,
} from './integrationAdapterTypes';

export interface ValidateIntegrationRequestInput {
  provider: IntegrationAdapterDefinition;
  request: IntegrationAdapterRequest;
  permissionContext?: IntegrationPermissionContext;
  approvalState?: IntegrationHumanApprovalState;
  policyState?: IntegrationPolicyState;
  transportConfigured?: boolean;
  /** Effective mode override (defaults to provider.mode = `disabled`). */
  mode?: IntegrationAdapterMode;
}

const WRITE_MODES: readonly IntegrationAdapterMode[] = ['live_write_disabled', 'live_write_enabled_future'];

function block(code: IntegrationErrorCode, message: string): IntegrationAdapterBlocker {
  return { code, message };
}

function findCapability(
  provider: IntegrationAdapterDefinition,
  request: IntegrationAdapterRequest,
): IntegrationCapabilityDefinition | undefined {
  return provider.capabilities.find((c) => c.capability === request.capability);
}

const CONFIGURE_ACTION = { code: 'configure_integration', label: 'Configure transport and obtain policy + human approval before any future use (no external call now).' };

export function validateIntegrationRequest(
  input: ValidateIntegrationRequestInput,
): IntegrationAdapterReadiness {
  const { provider, request } = input;
  const mode = input.mode ?? provider.mode;
  const perms = new Set(input.permissionContext?.grantedPermissions ?? []);
  const approvals = new Set(input.approvalState?.approvals ?? []);
  const policy = input.policyState ?? {};
  const warnings: IntegrationAdapterWarning[] = [];

  function result(status: IntegrationAdapterReadinessValue, blocker: IntegrationAdapterBlocker): IntegrationAdapterReadiness {
    return {
      providerKey: provider.providerKey,
      category: provider.category,
      status,
      allowed: false,
      blockers: [blocker],
      warnings,
      nextBestAction: CONFIGURE_ACTION,
    };
  }

  // 1. Disabled / mock-disabled — nothing proceeds.
  if (mode === 'disabled' || mode === 'mock_disabled') {
    return result('disabled_not_configured', block('integration_disabled', `${provider.displayName} is disabled; no external call occurs.`));
  }

  // 2. Any write mode is forbidden in this phase (core banking write, payment posting, etc.).
  if (WRITE_MODES.includes(mode)) {
    return result('blocked_policy', block('integration_write_forbidden', `${provider.displayName} write modes are forbidden in this phase.`));
  }

  // 3. Capability must be supported by this provider.
  const capability = findCapability(provider, request);
  if (!capability) {
    return result('blocked_unsupported_capability', block('integration_unsupported_capability', `Capability ${request.capability} is not supported by ${provider.displayName}.`));
  }

  // 4. Permission must be granted.
  const missingPermission = provider.permissionRequirements.find((p) => !perms.has(p.permissionKey));
  if (missingPermission) {
    return result('blocked_permission', block('integration_permission_denied', `Missing permission: ${missingPermission.permissionKey}.`));
  }

  // 5. Human approval must be present when required.
  if (provider.humanApproval.required && (!provider.humanApproval.approvalKey || !approvals.has(provider.humanApproval.approvalKey))) {
    return result('blocked_human_approval', block('integration_human_approval_required', `${provider.displayName} requires explicit human approval.`));
  }

  // 6. Credit bureau (and other permissible-purpose providers) require a permissible purpose.
  if (provider.requiresPermissiblePurpose) {
    const purposes = new Set(policy.permissiblePurposes ?? []);
    if (!request.purpose || !purposes.has(request.purpose)) {
      return result('blocked_permissible_purpose', block('integration_permissible_purpose_required', `${provider.displayName} requires a permissible purpose.`));
    }
  }

  // 7. PII / credit report external transmission is blocked unless future policy explicitly allows.
  if (capability.externalTransmission) {
    const s = capability.dataSensitivity;
    if (s === 'credit_report_data' && policy.creditReportDataAllowed !== true) {
      return result('blocked_pii', block('integration_pii_blocked', 'Credit report data may not be transmitted in this phase.'));
    }
    const piiSensitivities = ['borrower_pii', 'tax_data', 'account_balance_data', 'payment_data'];
    if (piiSensitivities.includes(s) && policy.piiTransmissionAllowed !== true) {
      return result('blocked_pii', block('integration_pii_blocked', `${s} may not be transmitted externally in this phase.`));
    }
  }

  // 8. External transport must be configured.
  if (input.transportConfigured !== true) {
    return result('blocked_transport', block('integration_external_transport_missing', `${provider.displayName} has no configured external transport.`));
  }

  // 9. Dry-run never calls transport; live calls are disabled this phase regardless.
  if (mode === 'dry_run') {
    warnings.push({ code: 'dry_run_no_transport', message: 'Dry-run mode performs no external transport call.' });
  }
  if (provider.category === 'credit_scoring') {
    warnings.push({ code: 'scoring_decision_support_only', message: 'Scoring is decision support only and cannot approve or decline credit.' });
  }
  return result('blocked_live_calls_disabled', block('integration_live_calls_disabled', 'Live external calls are disabled in this phase.'));
}
