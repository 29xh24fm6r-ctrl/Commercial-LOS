/**
 * Phase 61: build-time email delivery mode.
 * Phase 63: added HANDOFF mode for no-admin operational rollout.
 *
 * Three modes:
 *
 *   - DRY_RUN: the LIVE Outlook connector is never invoked. The full
 *     governed-write coordination still runs (audit + timeline events
 *     emit honestly), the UX surfaces the masked recipient + outcome,
 *     and the action returns `kind: 'success'` with `mode: 'DRY_RUN'`.
 *     Nothing leaves the client. This is the operational default until
 *     either the Office 365 Outlook connector is registered (→ LIVE)
 *     or the customer chooses the no-admin handoff path (→ HANDOFF).
 *
 *   - LIVE: the (future) Office 365 Outlook connector service IS
 *     invoked. Today the LIVE adapter is a stub that returns a
 *     permanent failure with a clear "connector not yet registered"
 *     reason — the audit event records the failure honestly. When the
 *     connector is registered and the SDK regenerated, the LIVE
 *     adapter's `send` method swaps in the typed connector call;
 *     nothing else in the coordination changes.
 *
 *   - HANDOFF (Phase 63): the app DOES NOT send email at all. Instead
 *     it prepares a borrower-safe subject + body, surfaces an "Open in
 *     Outlook" mailto link and a "Copy email" clipboard fallback, and
 *     records an audit + timeline entry stating the banker prepared a
 *     handoff. The banker sends from their own Outlook client. No
 *     connector. No Graph API. No tenant-admin permission. This is the
 *     intended production mode until the Office 365 Outlook connector
 *     is registered for the Code App.
 *
 * Discipline:
 *   - Mode is read ONCE at module load from `import.meta.env.VITE_EMAIL_MODE`.
 *     Toggling requires a rebuild + redeploy. No runtime mutation.
 *   - The value is exported as a constant so the UI can surface it
 *     verbatim ("Mode: DRY_RUN") without re-reading the env.
 *   - Only the case-insensitive strings "LIVE" and "HANDOFF" resolve
 *     to their respective modes. Any other value (including missing
 *     or misspelled) resolves to DRY_RUN. The default is intentionally
 *     conservative: a typo must NEVER silently enable LIVE send.
 */

export type EmailMode = 'DRY_RUN' | 'LIVE' | 'HANDOFF';

function readEmailModeFromEnv(): EmailMode {
  // Vite exposes `import.meta.env` at build time. The optional chain
  // guards a non-Vite test environment where it may be undefined.
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const raw = String(env?.VITE_EMAIL_MODE ?? '').trim().toUpperCase();
  if (raw === 'LIVE') return 'LIVE';
  if (raw === 'HANDOFF') return 'HANDOFF';
  return 'DRY_RUN';
}

export const EMAIL_MODE: EmailMode = readEmailModeFromEnv();
