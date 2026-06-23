import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 169A -- Admin Operations Console (read-only shell).
 *
 * This module is the honest, side-effect-free status model behind the
 * admin Operations Console. It performs NO writes, NO Dataverse calls,
 * and NO network access. It only describes, per administrative module,
 * the current capability state so an authorized admin can see what is
 * read-only, what is blocked, and what the next safe step is.
 *
 * Phase 169A deliberately wires ZERO live write surfaces into the
 * console. Every module reports `liveWriteEnabledHere: false`. Live
 * surfaces arrive only in later, separately-gated phases (169B user/
 * access, 169C new-deal intake, 169D portfolio boarding, 169E CRM
 * onboarding) and only where an existing governed write path is proven.
 */

/** Coarse status badge for an admin console module. */
export type AdminConsoleModuleStatus =
  | 'active'
  | 'read-only' // a read/list path exists; no write wired here yet
  | 'blocked' // a hard upstream blocker prevents enablement
  | 'disabled' // capability exists but its live adapter is off by default
  | 'preview'; // informational / plan-only surface

export interface AdminConsoleModule {
  readonly id: string;
  readonly title: string;
  readonly status: AdminConsoleModuleStatus;
  /**
   * Whether THIS console exposes a live write surface for the module.
   * Phase 169A: always false. This is the honest gate the UI reads to
   * keep every action a disabled placeholder.
   */
  readonly liveWriteEnabledHere: boolean;
  /** One-line current-state summary. */
  readonly statusLine: string;
  /** What blocks live enablement of this module in the console. */
  readonly blocker: string;
  /** The next safe step (named phase / governed prerequisite). */
  readonly nextStep: string;
}

/**
 * The five required Operations Console modules. Static, auditable, and
 * honest. No values are derived from runtime data; nothing here can
 * fabricate a user, deal, loan, or CRM record.
 *
 * Source-of-truth references (cited as documentation only -- not
 * imported, to keep src/admin/ free of feature-module coupling):
 *   - New Deal blocker: docs/PHASE_163_STAGE_STATUS_REFERENCE_UNBLOCK.md
 *     and NOT_WIRED `new-deal-create` / `stage-reference-data-source`.
 *   - Portfolio adapter default-off:
 *     portfolioBoarding/portfolioLoanBoardingFeatureFlags
 *     (PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED = false).
 *   - CRM adapter default-off: crm/crmFeatureFlags
 *     (CRM_LIVE_PERSISTENCE_ENABLED = false).
 */
export const ADMIN_CONSOLE_MODULES: readonly AdminConsoleModule[] = Object.freeze([
  Object.freeze({
    id: 'user-access',
    title: 'User & Access Management',
    status: 'read-only',
    liveWriteEnabledHere: false,
    statusLine:
      'Platform user, workspace entitlement, and LOS profile tables are registered read data sources.',
    blocker:
      'No governed app-level entitlement write path is wired into this console yet.',
    nextStep:
      'Phase 169B: add a permission-gated, audited app-level entitlement write only where an existing Dataverse service supports it.',
  }),
  Object.freeze({
    id: 'new-deal-intake',
    title: 'New Deal Intake',
    status: 'blocked',
    liveWriteEnabledHere: false,
    statusLine:
      'Readiness proven in TEST; create disabled pending production reference approval and a governed create adapter.',
    blocker:
      'The Stage/Status reference data sources are registered and the fail-closed resolver reads them at runtime (Ready in TEST), but the active rows are TEST labels (not production-approved) and no governed audited create adapter is wired. Separate from Advance Stage / stage-progression ordering.',
    nextStep:
      'Phase 170J+: approve/seed production Stage/Status reference rows, add a governed audited create adapter, run a single-record create smoke, then enable + New Deal.',
  }),
  Object.freeze({
    id: 'portfolio-boarding',
    title: 'Portfolio Boarding',
    status: 'active',
    liveWriteEnabledHere: true,
    statusLine:
      'Internal portfolio boarding is active through governed Dataverse persistence.',
    blocker:
      'No external boarding sync is enabled; this is the internal OGB nCino-like workflow/boarding system.',
    nextStep:
      'Use Portfolio Workspace / Portfolio Boarding for internal loan boarding and servicing workflow.',
  }),
  Object.freeze({
    id: 'crm-onboarding',
    title: 'CRM Onboarding',
    status: 'active',
    liveWriteEnabledHere: true,
    statusLine:
      'Internal OGB CRM is active through governed Dataverse persistence.',
    blocker:
      'No external Salesforce or nCino sync is enabled; this is the internal OGB CRM relationship system.',
    nextStep:
      'Use CRM relationship management, contacts, vendors, and timeline as the internal CRM system.',
  }),
  Object.freeze({
    id: 'security-roles',
    title: 'Security / Dataverse Roles',
    status: 'preview',
    liveWriteEnabledHere: false,
    statusLine: 'This console manages LOS app-level entitlements only.',
    blocker:
      'Microsoft tenant / Dataverse security roles cannot be granted from here; no governed platform security-role API is present in-app.',
    nextStep:
      'Assign platform security roles in the Power Platform admin center. App-level entitlement management arrives in Phase 169B.',
  }),
]);

/**
 * The single governance disclaimer shown at the top of the console so an
 * admin never mistakes app-level entitlement management for platform
 * security-role assignment.
 */
export const ADMIN_CONSOLE_SECURITY_DISCLAIMER =
  'This console manages LOS app-level entitlements. Microsoft / Dataverse security roles may still need to be assigned in the Power Platform admin center.';

/**
 * Admin authorization proof for the console (defense in depth).
 *
 * The admin workspace route is already gated by `WorkspaceGate`. The
 * console re-derives authorization so that, even if it were ever mounted
 * outside the gate, it fails closed rather than rendering admin surfaces.
 *
 * A user is authorized when admin is their bootstrap-resolved PRIMARY route,
 * OR (Phase 204) they hold an existing Admin-workspace entitlement that the
 * `useEntitledRoutes` admin probe confirmed ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the same entitlement that let
 * `WorkspaceGate` admit them to the admin route. `adminEntitled` defaults to
 * false so the check stays fail-closed for any caller that does not pass it.
 */
export function isAdminConsoleAuthorized(
  route: string | undefined,
  adminEntitled = false,
): boolean {
  return route === WORKSPACE_ROUTES.admin || adminEntitled === true;
}
