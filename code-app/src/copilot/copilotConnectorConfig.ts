/**
 * Phase 137D — Copilot connector config resolver (PURE, disabled by default).
 *
 * A pure, client-side resolver that turns non-secret config flags into a
 * `CopilotConnectorConfig`. It is the gate a future Phase 137E+ transport
 * must pass before any live call is even attempted.
 *
 * Hard rules baked in here:
 *   - Missing / empty config → `not_configured` (the default).
 *   - Any secret-looking key or value → fail closed to `disabled`. Secrets
 *     (server-only Azure OpenAI endpoint/key, bearer tokens, sk- keys, long
 *     opaque strings, URLs) must NEVER reach the client; if one appears in
 *     the client-visible config, we refuse to resolve a live mode.
 *   - Live modes resolve ONLY with the exact Custom API name, a SYMBOLIC
 *     endpoint alias (never a URL), and a policy version.
 *
 * It performs NO network call, reads NO secret, and imports NO Dataverse
 * client. Resolving a live *config* does not enable anything by itself —
 * the adapter still needs an injected server-only transport, which does
 * not exist yet.
 */

export type CopilotConnectorRuntimeMode =
  | 'not_configured'
  | 'disabled'
  | 'live_read_only'
  | 'proposal_only';

/** The exact future Custom API name (Phase 137B). Live mode requires it. */
export const COPILOT_CUSTOM_API_NAME = 'cr664_RunLosCopilotAssist' as const;

/** The closed allowlist of SYMBOLIC endpoint aliases. Never a URL. */
export const ALLOWED_COPILOT_ENDPOINT_ALIASES: ReadonlyArray<string> = [
  'dataverse-custom-api',
];

export interface CopilotConnectorConfig {
  mode: CopilotConnectorRuntimeMode;
  customApiName?: typeof COPILOT_CUSTOM_API_NAME;
  endpointAlias?: string;
  policyVersion?: string;
  /** Human-readable explanation when the resolver fails closed. */
  reason?: string;
}

const KNOWN_RUNTIME_MODES: ReadonlyArray<CopilotConnectorRuntimeMode> = [
  'not_configured',
  'disabled',
  'live_read_only',
  'proposal_only',
];

// Config flag keys (client-visible, non-secret). Reading these names does
// not bring any secret into scope — the secret scan below rejects any env
// that actually carries one.
const KEY_MODE = 'VITE_COPILOT_MODE';
const KEY_CUSTOM_API = 'VITE_COPILOT_CUSTOM_API_NAME';
const KEY_ENDPOINT_ALIAS = 'VITE_COPILOT_ENDPOINT_ALIAS';
const KEY_POLICY_VERSION = 'VITE_COPILOT_POLICY_VERSION';

/**
 * Keys that imply a secret. Matches SECRET/TOKEN/KEY/PASSWORD plus any
 * AZURE/OPENAI-scoped key (which is server-only and must never appear in
 * client config). Written as a pattern so this file never embeds an actual
 * secret env name literal.
 */
const SECRET_KEY_PATTERN = /SECRET|TOKEN|KEY|PASSWORD|AZURE|OPENAI/i;

/** Values that look like secrets / live endpoints. */
const SECRET_VALUE_PATTERNS: ReadonlyArray<RegExp> = [
  /https?:\/\//i, // any URL endpoint
  /\bbearer\s+/i, // bearer token
  /\bsk-[A-Za-z0-9]/i, // OpenAI-style sk- key
  /[A-Za-z0-9+/=_-]{40,}/, // long opaque secret
];

function valueLooksSecret(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((re) => re.test(value));
}

function disabled(reason: string): CopilotConnectorConfig {
  return { mode: 'disabled', reason };
}

function notConfigured(reason?: string): CopilotConnectorConfig {
  return reason ? { mode: 'not_configured', reason } : { mode: 'not_configured' };
}

/**
 * Pure resolver. Given a non-secret env-like map, return the resolved
 * Copilot connector config. Defaults to `not_configured`. Never throws,
 * never performs IO.
 */
export function resolveCopilotConnectorConfig(
  envLike: Record<string, string | undefined> = {},
): CopilotConnectorConfig {
  // 1. Secret scan first. ANY secret-looking key or value fails closed.
  for (const [key, value] of Object.entries(envLike)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      return disabled(
        'A secret-looking configuration key was detected; failing closed. ' +
          'Secrets (Azure OpenAI endpoint/key, tokens) must remain server-side only.',
      );
    }
    if (typeof value === 'string' && value.length > 0 && valueLooksSecret(value)) {
      return disabled(
        'A secret-looking configuration value (URL / token / long secret) was ' +
          'detected; failing closed. No secret or live endpoint may live in client config.',
      );
    }
  }

  // 2. Mode resolution.
  const rawMode = (envLike[KEY_MODE] ?? '').trim();
  if (rawMode.length === 0) {
    return notConfigured('No Copilot mode configured.');
  }
  if (rawMode === 'not_configured') {
    return notConfigured();
  }
  if (rawMode === 'disabled') {
    return disabled('Copilot is disabled by configuration.');
  }
  if (!(KNOWN_RUNTIME_MODES as ReadonlyArray<string>).includes(rawMode)) {
    return disabled(`Unrecognized Copilot mode "${rawMode}".`);
  }

  // 3. rawMode is live_read_only or proposal_only — require the full,
  //    non-secret live contract before resolving a live mode.
  const customApiName = (envLike[KEY_CUSTOM_API] ?? '').trim();
  if (customApiName !== COPILOT_CUSTOM_API_NAME) {
    return disabled(
      `Live mode requires the exact ${COPILOT_CUSTOM_API_NAME} Custom API name.`,
    );
  }

  const endpointAlias = (envLike[KEY_ENDPOINT_ALIAS] ?? '').trim();
  if (endpointAlias.length === 0) {
    return disabled('Live mode requires a symbolic endpoint alias.');
  }
  // A symbolic alias is a short token — never a URL or host.
  if (/:\/\/|^https?:/i.test(endpointAlias) || endpointAlias.includes('.')) {
    return disabled(
      'endpointAlias must be a symbolic alias (e.g. "dataverse-custom-api"), not a URL.',
    );
  }
  if (!ALLOWED_COPILOT_ENDPOINT_ALIASES.includes(endpointAlias)) {
    return disabled(`Unknown endpoint alias "${endpointAlias}".`);
  }

  const policyVersion = (envLike[KEY_POLICY_VERSION] ?? '').trim();
  if (policyVersion.length === 0) {
    return disabled('Live mode requires a policyVersion.');
  }

  return {
    mode: rawMode as CopilotConnectorRuntimeMode,
    customApiName: COPILOT_CUSTOM_API_NAME,
    endpointAlias,
    policyVersion,
  };
}
