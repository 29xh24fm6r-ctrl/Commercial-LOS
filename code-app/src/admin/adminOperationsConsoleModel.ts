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

/**
 * Phase 257 — a module's management affordance.
 *   - `route`      a real link to the active workspace where the capability
 *                  is managed.
 *   - `in-console` the capability is managed directly inside this console
 *                  (e.g. the governed workspace-entitlement dropdown).
 *   - `external`   the capability is genuinely outside the app (e.g. Microsoft
 *                  tenant security roles) — no in-app affordance, by design.
 */
export type AdminConsoleManageAction =
  | { readonly kind: 'route'; readonly route: string; readonly label: string }
  | { readonly kind: 'in-console'; readonly anchor: string; readonly label: string }
  | { readonly kind: 'external'; readonly label: string };

export interface AdminConsoleModule {
  readonly id: string;
  readonly title: string;
  readonly status: AdminConsoleModuleStatus;
  /**
   * Whether THIS console / app exposes a live write surface for the module.
   */
  readonly liveWriteEnabledHere: boolean;
  /** One-line current-state summary. */
  readonly statusLine: string;
  /** Scope / honest limitation for the module (not a launch blocker unless status='preview'). */
  readonly blocker: string;
  /** Where / how to manage the module. */
  readonly nextStep: string;
  /** Phase 257 — the management affordance for the module. */
  readonly manage: AdminConsoleManageAction;
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
    status: 'active',
    liveWriteEnabledHere: true,
    statusLine:
      'Change a user’s workspace with a governed, audited write — attributed to you, verified by readback, and recorded.',
    blocker:
      'Creating a brand-new platform user (with their Dataverse identity) is provisioned by an operator, not from the app.',
    nextStep:
      'Use the Workspace entitlement controls below to set each user’s primary workspace.',
    manage: { kind: 'in-console', anchor: 'admin-user-access', label: 'Manage workspace entitlement below' } as const,
  }),
  Object.freeze({
    id: 'new-deal-intake',
    title: 'New Deal Intake',
    status: 'active',
    liveWriteEnabledHere: true,
    statusLine:
      'New Deal create is live for authorized bankers through the governed, audited create path.',
    blocker:
      'Public / anonymous create stays disabled; only authorized bankers create deals.',
    nextStep:
      'Create deals from the Banker Workspace “+ New Deal” action — each create resolves the production Stage (Intake) and Status (Open) references and is audited.',
    manage: { kind: 'route', route: WORKSPACE_ROUTES.banker, label: 'Open Banker Workspace' } as const,
  }),
  Object.freeze({
    id: 'portfolio-boarding',
    title: 'Portfolio Boarding',
    status: 'active',
    liveWriteEnabledHere: true,
    statusLine:
      'Internal portfolio boarding is active through governed Dataverse persistence.',
    blocker:
      'No external boarding sync is enabled; this is the internal OGB workflow / boarding system.',
    nextStep:
      'Board and service closed / legacy loans from the Portfolio workspace.',
    manage: { kind: 'route', route: WORKSPACE_ROUTES.manager, label: 'Open Portfolio workspace' } as const,
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
      'Manage relationships, contacts, and activity from the CRM Hub in the Banker workspace.',
    manage: { kind: 'route', route: WORKSPACE_ROUTES.banker, label: 'Open CRM workspace' } as const,
  }),
  Object.freeze({
    id: 'security-roles',
    title: 'Security / Dataverse Roles',
    status: 'preview',
    liveWriteEnabledHere: false,
    statusLine: 'This console manages LOS app-level entitlements only.',
    blocker:
      'Microsoft tenant / Dataverse security roles cannot be granted from here; there is no in-app platform security-role API.',
    nextStep:
      'Assign platform security roles in the Power Platform admin center.',
    manage: { kind: 'external', label: 'Managed in the Power Platform admin center' } as const,
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
