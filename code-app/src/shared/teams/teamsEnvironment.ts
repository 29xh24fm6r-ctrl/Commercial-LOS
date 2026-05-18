/**
 * Phase 86: Microsoft Teams environment helpers.
 *
 * Scope (deliberately small):
 *   - Try to initialize `@microsoft/teams-js` at runtime so the app
 *     can tell whether it is hosted inside Microsoft Teams. This is
 *     a best-effort, never-throw, non-blocking probe — the app must
 *     work identically whether or not Teams is reachable.
 *   - Build a Microsoft-documented `https://teams.microsoft.com/l/chat`
 *     deep link from a target email + optional topic + optional
 *     prefilled message. Pure function; deterministic; no SDK calls.
 *
 * Out of scope (each is its own blocked capability, NOT covered here):
 *   - No Graph calls.
 *   - No access-token acquisition; no auth flow.
 *   - No calendar read/write; no online-meeting creation.
 *   - No notifications (push to a user's Teams activity feed).
 *   - No channel / chat POSTing. The chat link OPENS the user's own
 *     Teams compose surface — the app never sends a message.
 *   - No Graph user lookup. The `userEmail` MUST come from a field
 *     the caller already has authorized access to (e.g. the signed-
 *     in banker's email via `useBanker()`).
 *
 * Caching: `initializeTeamsContext` memoizes its result so concurrent
 * callers share the same probe and a remount doesn't re-pay the SDK
 * load cost. Tests reset the cache via
 * `__resetTeamsEnvironmentForTests`. The cache is module-local; the
 * SDK itself is idempotent (calling `app.initialize()` twice is a
 * no-op).
 */

export interface TeamsHostContext {
  /** Microsoft Teams host product name when known (e.g. 'teams',
   *  'office', 'outlook'). Surfaced for diagnostics only — the app
   *  does NOT branch behavior on this. */
  hostName: string | undefined;
  /** Client type when known (e.g. 'web', 'desktop', 'ios',
   *  'android'). Diagnostics only. */
  hostClientType: string | undefined;
  /** Locale string when reported by the host (e.g. 'en-us').
   *  Diagnostics only. */
  appLocale: string | undefined;
  /** Tenant id when reported by the host. Never used to talk to
   *  any tenant API; logged for diagnostics only. */
  tenantId: string | undefined;
}

export type TeamsContextResult =
  | { kind: 'available'; context: TeamsHostContext }
  | { kind: 'unavailable'; reason: TeamsUnavailableReason };

export type TeamsUnavailableReason =
  | 'teams-sdk-load-failed'
  | 'not-running-in-teams'
  | 'context-unavailable';

let cached: TeamsContextResult | null = null;
let pending: Promise<TeamsContextResult> | null = null;

/**
 * Best-effort probe: dynamically load `@microsoft/teams-js`, call
 * `app.initialize()`, then read the host context. Returns
 * `{ kind: 'unavailable', reason }` on any failure — the app
 * continues to function normally outside Teams.
 *
 * Repeated calls share one probe (memoized). Reset for tests via
 * `__resetTeamsEnvironmentForTests`.
 */
export async function initializeTeamsContext(): Promise<TeamsContextResult> {
  if (cached) return cached;
  if (pending) return pending;
  pending = doInitialize().then((result) => {
    cached = result;
    pending = null;
    return result;
  });
  return pending;
}

async function doInitialize(): Promise<TeamsContextResult> {
  let teamsModule: typeof import('@microsoft/teams-js');
  try {
    teamsModule = await import('@microsoft/teams-js');
  } catch {
    return { kind: 'unavailable', reason: 'teams-sdk-load-failed' };
  }
  try {
    await teamsModule.app.initialize();
  } catch {
    return { kind: 'unavailable', reason: 'not-running-in-teams' };
  }
  try {
    const ctx = await teamsModule.app.getContext();
    return {
      kind: 'available',
      context: shapeHostContext(ctx),
    };
  } catch {
    return { kind: 'unavailable', reason: 'context-unavailable' };
  }
}

/**
 * Synchronous accessor for the most recent probe result. Returns
 * null when `initializeTeamsContext` has never resolved.
 */
export function getTeamsContextSafely(): TeamsContextResult | null {
  return cached;
}

/** Test-only reset. Production code never calls this. */
export function __resetTeamsEnvironmentForTests(): void {
  cached = null;
  pending = null;
}

interface RawTeamsAppHost {
  name?: string;
  clientType?: string;
}
interface RawTeamsApp {
  host?: RawTeamsAppHost;
  locale?: string;
}
interface RawTeamsUser {
  tenant?: { id?: string };
}
interface RawTeamsContext {
  app?: RawTeamsApp;
  user?: RawTeamsUser;
}

function shapeHostContext(ctx: RawTeamsContext): TeamsHostContext {
  return {
    hostName: ctx.app?.host?.name,
    hostClientType: ctx.app?.host?.clientType,
    appLocale: ctx.app?.locale,
    tenantId: ctx.user?.tenant?.id,
  };
}

// ---------------------------------------------------------------------------
// Pure deep-link builder
// ---------------------------------------------------------------------------

export interface TeamsChatLinkInput {
  /** Target user's email / UPN. MUST be sourced from an already-
   *  authorized field (e.g. signed-in banker via useBanker()); never
   *  inferred from borrower / client name / free-text fields. */
  userEmail: string;
  /** Optional Teams chat topic. Encoded into the URL; Teams shows it
   *  as the chat thread title. Caller may include the deal name. */
  topic?: string;
  /** Optional prefilled message body that Teams pastes into the
   *  compose box. Caller may include a short context line; the
   *  banker can edit before sending. The app never sends. */
  message?: string;
}

/**
 * Conservative email-shape check. Same shape Phase 61
 * `outlookEmailAdapters.isLikelyValidEmail` accepts; kept here as a
 * deliberate copy to avoid Phase 48 cross-domain imports.
 */
function isLikelyValidEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 5 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf('@');
  if (at <= 0) return false;
  if (at !== v.lastIndexOf('@')) return false;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length === 0) return false;
  if (domain.length < 3) return false;
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  return true;
}

/**
 * Build the well-known Microsoft Teams chat deep link. Returns null
 * when the input is unusable (empty / malformed email). The caller
 * MUST render a disabled affordance in the null case — never fall
 * back to a partial URL.
 *
 * Deep-link reference:
 *   https://teams.microsoft.com/l/chat/0/0
 *     ?users=<email>
 *    [&topic=<encoded topic>]
 *    [&message=<encoded message>]
 *
 * URLSearchParams handles the percent-encoding consistently.
 */
export function buildTeamsChatDeepLink(input: TeamsChatLinkInput): string | null {
  const email = input.userEmail.trim();
  if (!isLikelyValidEmail(email)) return null;
  const params = new URLSearchParams();
  params.set('users', email);
  const topic = input.topic?.trim() ?? '';
  if (topic.length > 0) params.set('topic', topic);
  const message = input.message?.trim() ?? '';
  if (message.length > 0) params.set('message', message);
  return `https://teams.microsoft.com/l/chat/0/0?${params.toString()}`;
}
