/**
 * Phase 61: build-time email delivery mode.
 *
 * The Phase 61 governed send is mode-gated. Two modes:
 *
 *   - DRY_RUN: the LIVE Outlook connector is never invoked. The full
 *     governed-write coordination still runs (audit + timeline events
 *     emit honestly), the UX surfaces the masked recipient + outcome,
 *     and the action returns `kind: 'success'` with `mode: 'DRY_RUN'`.
 *     Nothing leaves the client. This is the operational default until
 *     the Office 365 Outlook connector is registered for the Code App
 *     and the SDK is regenerated.
 *
 *   - LIVE: the (future) Office 365 Outlook connector service IS
 *     invoked. Today the LIVE adapter is a stub that returns a
 *     permanent failure with a clear "connector not yet registered"
 *     reason — the audit event records the failure honestly. When the
 *     connector is registered and the SDK regenerated, the LIVE
 *     adapter's `send` method swaps in the typed connector call;
 *     nothing else in the coordination changes.
 *
 * Discipline:
 *   - Mode is read ONCE at module load from `import.meta.env.VITE_EMAIL_MODE`.
 *     Toggling requires a rebuild + redeploy. No runtime mutation.
 *   - The value is exported as a constant so the UI can surface it
 *     verbatim ("Mode: DRY_RUN") without re-reading the env.
 *   - Any value other than the case-insensitive string "LIVE"
 *     resolves to DRY_RUN. The default is intentionally conservative:
 *     a missing or misspelled env var must NEVER silently enable LIVE.
 */

export type EmailMode = 'DRY_RUN' | 'LIVE';

function readEmailModeFromEnv(): EmailMode {
  // Vite exposes `import.meta.env` at build time. The optional chain
  // guards a non-Vite test environment where it may be undefined.
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const raw = String(env?.VITE_EMAIL_MODE ?? '').trim().toUpperCase();
  return raw === 'LIVE' ? 'LIVE' : 'DRY_RUN';
}

export const EMAIL_MODE: EmailMode = readEmailModeFromEnv();
