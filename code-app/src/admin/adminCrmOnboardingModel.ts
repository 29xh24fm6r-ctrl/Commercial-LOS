import { CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';
import { CRM_CONNECTOR_MODE } from '../crm/connectors/crmConnectorReadiness';

/**
 * Phase 169E -- Admin CRM Onboarding model (readiness / onboarding).
 *
 * Investigation outcome: CASE B. The Phase 141 CRM stack is present (schema
 * plan, Dataverse mapper, live persistence adapter, persistence resolver,
 * runtime schema gate, feature flags, connector readiness), but live
 * runtime CRM persistence is DISABLED BY DEFAULT
 * (`CRM_LIVE_PERSISTENCE_ENABLED = false`), the persistence resolver fails
 * closed, and the external connector mode is `disabled_by_default`. See
 * docs/PHASE_169E_ADMIN_CRM_ONBOARDING.md.
 *
 * This module is static and side-effect-free. It reads the real default
 * flag + connector mode so the panel reports the true state, and it wires
 * NO live write/import/sync into the admin console. Every admin action
 * stays disabled in Phase 169E.
 */

/**
 * CRM-I — the two concepts this constant previously CONFLATED, now split so neither gives
 * a false impression that global CRM live write is enabled:
 *
 *   - CRM_ADMIN_SURFACE_ACTIVE: the governed internal-CRM MANAGEMENT/onboarding admin
 *     surface is available (readiness + guidance). It performs no live write itself.
 *   - CRM_ADMIN_LIVE_WRITE_ENABLED: whether THIS admin surface enables a live CRM
 *     write/import/sync. It does NOT — live CRM writes are identity-gated in the CRM Hub,
 *     never from this surface — so this is honestly `false` (matching the Phase 169E doc).
 */
export const CRM_ADMIN_SURFACE_ACTIVE = true as const;
export const CRM_ADMIN_LIVE_WRITE_ENABLED = false as const;

/** The real default state of the CRM runtime persistence flag. */
export const CRM_LIVE_PERSISTENCE_DEFAULT: boolean =
  CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED;

/** The external CRM connector mode (Salesforce / nCino readiness audit). */
export const CRM_ADMIN_CONNECTOR_MODE = CRM_CONNECTOR_MODE;

/** Why the CRM admin surface stays disabled-by-default. */
export const CRM_ONBOARDING_DISABLED_REASON =
  'Internal OGB CRM management is live through the governed CRM Hub adapter. The separately gated internal writeback spine is enabled after a current live create/readback/update/cleanup certification; external Salesforce or nCino synchronization remains outside this internal CRM scope.';

export interface CrmOnboardingDataGroup {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

/** The required CRM onboarding data groups. */
export const CRM_ONBOARDING_REQUIRED_DATA_GROUPS: readonly CrmOnboardingDataGroup[] =
  Object.freeze([
    Object.freeze({ id: 'organizations', label: 'Organizations', description: 'CRM organization / company master records.' }),
    Object.freeze({ id: 'people', label: 'People', description: 'CRM person records.' }),
    Object.freeze({ id: 'contact-points', label: 'Contact points', description: 'Emails, phones, and addresses.' }),
    Object.freeze({ id: 'relationships', label: 'Relationships', description: 'Org-to-person and org-to-org relationships.' }),
    Object.freeze({ id: 'role-assignments', label: 'Role assignments', description: 'Party roles on relationships.' }),
    Object.freeze({ id: 'communication-preferences', label: 'Communication preferences', description: 'Channel and contactability preferences.' }),
    Object.freeze({ id: 'contact-authorizations', label: 'Contact authorizations', description: 'Authorization / consent flags.' }),
    Object.freeze({ id: 'vendor-profiles', label: 'Vendor profiles', description: 'Vendor / third-party profiles.' }),
    Object.freeze({ id: 'timeline-events', label: 'Timeline events', description: 'Relationship timeline / interaction events.' }),
    Object.freeze({ id: 'audit-entries', label: 'Audit entries', description: 'Governed audit trail for CRM writes.' }),
  ]);

export interface CrmOnboardingReadinessItem {
  readonly label: string;
  readonly present: boolean;
  readonly detail: string;
}

/**
 * Honest readiness inventory: the CRM source/adapter stack is present;
 * live persistence and the external connector are off.
 */
export const CRM_ONBOARDING_READINESS: readonly CrmOnboardingReadinessItem[] =
  Object.freeze([
    Object.freeze({ label: 'CRM schema plan + model', present: true, detail: 'Phase 141 CRM schema plan and Dataverse mapper are present in src/crm.' }),
    Object.freeze({ label: 'Persistence adapter', present: true, detail: 'crmLiveDataverseAdapter / crmPersistenceAdapter / resolveCrmPersistenceAdapter are present.' }),
    Object.freeze({ label: 'Runtime schema gate', present: true, detail: 'crmRuntimeSchemaGate fails closed until the target schema is verified.' }),
    Object.freeze({
      label: 'Live runtime persistence enabled',
      present: CRM_LIVE_PERSISTENCE_DEFAULT,
      detail: `CRM_LIVE_PERSISTENCE_ENABLED default = ${String(CRM_LIVE_PERSISTENCE_DEFAULT)}.`,
    }),
    Object.freeze({
      label: 'External CRM connector enabled',
      present: CRM_ADMIN_CONNECTOR_MODE !== 'disabled_by_default',
      detail: `Connector mode = ${CRM_ADMIN_CONNECTOR_MODE} (Salesforce / nCino readiness audit only; no live sync).`,
    }),
  ]);

export interface CrmOnboardingNextStep {
  readonly order: number;
  readonly title: string;
  readonly detail: string;
}

/** The ordered next steps to safely enable live CRM onboarding (all pending). */
export const CRM_ONBOARDING_NEXT_STEPS: readonly CrmOnboardingNextStep[] =
  Object.freeze([
    Object.freeze({ order: 1, title: 'Internal CRM schema verified', detail: 'The committed live schema evidence verifies all internal CRM tables, columns, and required relationships.' }),
    Object.freeze({ order: 2, title: 'Internal CRM persistence certified', detail: 'A current controlled live CRUD smoke passed with attributable operator identity and verified cleanup.' }),
    Object.freeze({ order: 3, title: 'Use the CRM Hub for governed writes', detail: 'Authorized users manage companies, contacts, relationships, tasks, and activity through the mounted CRM Hub.' }),
  ]);

/** The explicit no-record-creation / no-sync note shown on the panel. */
export const CRM_ONBOARDING_NO_RECORD_NOTE =
  'Internal CRM records are created through the governed CRM Hub. This diagnostics card does not start an external CRM synchronization.';
