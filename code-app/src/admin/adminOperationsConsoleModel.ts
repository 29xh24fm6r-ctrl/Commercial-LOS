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
    statusLine: 'New deal create remains disabled for V1.0.',
    blocker:
      'cr664_loandeal create requires Stage/Status reference binds, but no Stage/Status reference data source is registered (Phase 163).',
    nextStep:
      'Phase 169C / Phase 163 unblock: register Stage/Status reference data sources, refresh the generated SDK, add a fail-closed default resolver, then wire a governed create.',
  }),
  Object.freeze({
    id: 'portfolio-boarding',
    title: 'Portfolio Boarding',
    status: 'disabled',
    liveWriteEnabledHere: false,
    statusLine:
      'Phase 140 boarding schema plans and derivations exist; the live Dataverse persistence adapter is disabled by default.',
    blocker:
      'PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED defaults to false; no boarding write is wired into this console.',
    nextStep:
      'Phase 169D: mount the boarding intake surface read-only with the persistence adapter explicitly gated and audited.',
  }),
  Object.freeze({
    id: 'crm-onboarding',
    title: 'CRM Onboarding',
    status: 'disabled',
    liveWriteEnabledHere: false,
    statusLine:
      'CRM Dataverse schema plan and persistence adapter exist; live persistence is disabled by default.',
    blocker:
      'CRM_LIVE_PERSISTENCE_ENABLED defaults to false; no CRM organization/person/relationship write is wired into this console.',
    nextStep:
      'Phase 169E: mount CRM org/person/relationship onboarding read-only with the persistence adapter explicitly gated and audited.',
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
 * console re-derives authorization from the bootstrap-resolved route so
 * that, even if it were ever mounted outside the gate, it fails closed
 * rather than rendering admin surfaces. Admin is a primary-route-gated
 * workspace today (entitled additional routes surface only the manager
 * workspace), mirroring the Executive primary-name gating pattern.
 */
export function isAdminConsoleAuthorized(route: string | undefined): boolean {
  return route === WORKSPACE_ROUTES.admin;
}
