import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';

/**
 * Phase 169D -- Admin Portfolio Boarding model (readiness / onboarding).
 *
 * Investigation outcome: CASE B. The Phase 140 portfolio boarding stack
 * is present (schema plan, Dataverse mapper, write adapter, document
 * upload adapter, persistence resolver, runtime schema gate, feature
 * flags), but live runtime persistence is DISABLED BY DEFAULT
 * (`PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false`) and the resolver
 * fails closed (it needs the live+route flags, an authorized operator, a
 * verified-schema gate, AND an injected client -- none wired in app
 * runtime). See docs/PHASE_169D_ADMIN_PORTFOLIO_BOARDING_ONBOARDING.md.
 *
 * This module is static and side-effect-free. It reads the real
 * default flag value so the panel reports the true state, and it wires
 * NO live write into the admin console. Every admin action stays
 * disabled in Phase 169D.
 */

/**
 * Whether THIS admin surface enables a live portfolio write/import/upload.
 * Always false in Phase 169D, independent of the underlying feature flag.
 */
export const PORTFOLIO_BOARDING_ADMIN_LIVE_WRITE_ENABLED = false as const;

/**
 * The real default state of the runtime persistence flag, read from the
 * canonical feature-flag defaults (not hardcoded here). Reported honestly
 * to the admin.
 */
export const PORTFOLIO_BOARDING_LIVE_PERSISTENCE_DEFAULT: boolean =
  PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED;

/** Why the admin surface stays disabled-by-default. */
export const PORTFOLIO_BOARDING_DISABLED_REASON =
  'Live portfolio boarding persistence is disabled by default. The resolver fails closed: it returns the live adapter only when the live + route flags are enabled, an authorized operator is present, the runtime schema gate verifies the target Dataverse schema, AND a Dataverse client is injected. None of these are wired in the app runtime, and this admin surface intentionally enables no write.';

export interface PortfolioBoardingDataGroup {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

/** The required boarding data groups (all real Phase 140 structures). */
export const PORTFOLIO_BOARDING_REQUIRED_DATA_GROUPS: readonly PortfolioBoardingDataGroup[] =
  Object.freeze([
    Object.freeze({ id: 'loan-master', label: 'Loan master', description: 'Core boarded-loan record and economics.' }),
    Object.freeze({ id: 'borrower', label: 'Borrower', description: 'Borrower identity and relationship.' }),
    Object.freeze({ id: 'collateral', label: 'Collateral', description: 'Collateral items and valuations.' }),
    Object.freeze({ id: 'guarantors', label: 'Guarantors', description: 'Guarantor parties and structure.' }),
    Object.freeze({ id: 'covenants', label: 'Covenants', description: 'Covenant package and reporting terms.' }),
    Object.freeze({ id: 'ticklers', label: 'Ticklers', description: 'Servicing ticklers and due dates.' }),
    Object.freeze({ id: 'insurance', label: 'Insurance', description: 'Insurance coverage and tracking.' }),
    Object.freeze({ id: 'documents', label: 'Documents / evidence references', description: 'Document and evidence metadata references (no binary upload here).' }),
    Object.freeze({ id: 'exceptions', label: 'Exceptions / reviews', description: 'Policy exceptions and review items.' }),
  ]);

export interface PortfolioBoardingReadinessItem {
  readonly label: string;
  readonly present: boolean;
  readonly detail: string;
}

/**
 * Honest readiness inventory: the source/adapter stack is present; live
 * persistence is off. `liveWriteEnabledHere` always reflects the admin
 * surface gate (false in 169D).
 */
export const PORTFOLIO_BOARDING_READINESS: readonly PortfolioBoardingReadinessItem[] =
  Object.freeze([
    Object.freeze({ label: 'Boarding schema plan + model', present: true, detail: 'Phase 140 schema plan and Dataverse mapper are present in src/portfolioBoarding.' }),
    Object.freeze({ label: 'Persistence adapter', present: true, detail: 'portfolioLoanBoardingDataverseAdapter / writeAdapter / persistence resolver are present.' }),
    Object.freeze({ label: 'Document upload adapter', present: true, detail: 'portfolioLoanDocumentUploadAdapter is present but gated; no binary upload is wired here.' }),
    Object.freeze({ label: 'Runtime schema gate', present: true, detail: 'portfolioBoardingRuntimeSchemaGate fails closed until the target schema is verified.' }),
    Object.freeze({
      label: 'Live runtime persistence enabled',
      present: PORTFOLIO_BOARDING_LIVE_PERSISTENCE_DEFAULT,
      detail: `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED default = ${String(PORTFOLIO_BOARDING_LIVE_PERSISTENCE_DEFAULT)}.`,
    }),
  ]);

export interface PortfolioBoardingNextStep {
  readonly order: number;
  readonly title: string;
  readonly detail: string;
}

/** The ordered next steps to safely enable live boarding (all pending). */
export const PORTFOLIO_BOARDING_NEXT_STEPS: readonly PortfolioBoardingNextStep[] =
  Object.freeze([
    Object.freeze({ order: 1, title: 'Verify Dataverse schema in the target environment', detail: 'Confirm the boarding tables/columns/relationships exist via the runtime schema gate verification.' }),
    Object.freeze({ order: 2, title: 'Regenerate / register SDK + data sources if needed', detail: 'Ensure the generated services and data-source manifest match the verified schema.' }),
    Object.freeze({ order: 3, title: 'Enable the adapter behind an explicit flag', detail: 'Turn on PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED (and route flag) intentionally in config, with an authorized operator and injected client.' }),
    Object.freeze({ order: 4, title: 'Run a controlled test-tenant write', detail: 'Board a single record in a test tenant and verify the audit trail before any broad use.' }),
    Object.freeze({ order: 5, title: 'Only then expose live admin create/import', detail: 'Gate the admin create/import behind the certified resolver; never bulk-import uncontrolled.' }),
  ]);

/** The explicit no-record-creation note shown on the panel. */
export const PORTFOLIO_BOARDING_NO_RECORD_NOTE =
  'This surface does not create portfolio loan records until live persistence is explicitly enabled and certified.';
