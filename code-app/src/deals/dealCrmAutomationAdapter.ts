/**
 * Phase 172A -- CRM automation adapter (DISABLED by default).
 *
 * After a deal is created, this can link CRM-side origination artifacts via an
 * APPROVED relationship/lookup only. Disabled by default; no CRM service is
 * imported here (IO is injected), so nothing runs while off. No schema change,
 * no fake CRM activity, no external HTTP.
 */

import type { CrmAutomationOutcome } from './dealOriginationOutcomes';
import {
  isCrmAutomationEnabled,
  type DealOriginationFeatureFlagConfig,
} from './dealOriginationFeatureFlags';

const MODULE = 'crm-automation';

/** Allow-listed CRM link payload keys (an approved lookup bind only). */
export const CRM_AUTOMATION_ALLOWED_FIELDS = Object.freeze([
  'cr664_Deal@odata.bind',
  'cr664_correlationid',
] as const);

export interface CrmAutomationInput {
  readonly dealId: string | undefined;
  readonly actorSystemUserId: string | undefined;
  readonly authorized: boolean;
  readonly correlationId: string;
  readonly config?: DealOriginationFeatureFlagConfig;
  /** Whether an approved CRM relationship/lookup to the deal exists. */
  readonly crmLinkSupported?: boolean;
  /** Test-only gate override. Production never sets it (uses config). */
  readonly enabledOverride?: boolean;
}

/** Injected CRM link IO; never constructed/called while disabled. */
export type RunCrmLink = (
  payload: Record<string, unknown>,
) => Promise<{ ok: boolean; id?: string; error?: string }>;

export async function runDealCrmAutomation(
  input: CrmAutomationInput,
  runCrmLink?: RunCrmLink,
): Promise<CrmAutomationOutcome> {
  const enabled = input.enabledOverride ?? isCrmAutomationEnabled(input.config);
  if (!enabled) {
    return { module: MODULE, kind: 'disabled', detail: 'CRM automation gate is off.' };
  }
  if (!input.dealId) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No created deal id.' };
  }
  if (!input.authorized || !input.actorSystemUserId) {
    return { module: MODULE, kind: 'unauthorized', detail: 'Actor not authorized for CRM write.' };
  }
  if (!input.crmLinkSupported) {
    return {
      module: MODULE,
      kind: 'skipped_not_applicable',
      detail: 'No approved CRM relationship/lookup to the deal exists.',
    };
  }
  if (!runCrmLink) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No CRM transport injected.' };
  }
  const payload = {
    'cr664_Deal@odata.bind': `/cr664_loandeals(${input.dealId})`,
    cr664_correlationid: input.correlationId,
  };
  const stray = Object.keys(payload).filter(
    (k) => !(CRM_AUTOMATION_ALLOWED_FIELDS as readonly string[]).includes(k),
  );
  if (stray.length > 0) {
    return { module: MODULE, kind: 'validation_error', detail: `Disallowed CRM field(s): ${stray.join(', ')}.` };
  }
  try {
    const res = await runCrmLink(payload);
    if (!res.ok) return { module: MODULE, kind: 'failed', detail: res.error ?? 'CRM link failed.' };
    return { module: MODULE, kind: 'success', correlationId: input.correlationId };
  } catch (err) {
    return { module: MODULE, kind: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}
