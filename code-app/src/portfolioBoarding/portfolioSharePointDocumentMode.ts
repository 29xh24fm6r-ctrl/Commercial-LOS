/**
 * Phase 264 (P0) — build-time SharePoint document-storage mode.
 *
 * Two modes, mirroring the Outlook email mode discipline (`emailMode.ts`):
 *
 *   - DRY_RUN: no SharePoint connector call is ever made. The full document
 *     metadata + audit coordination still runs — the file's existence and
 *     the operator's intent to store it are recorded honestly — but the
 *     result carries `webUrl: undefined` / `itemId: undefined`. This is the
 *     operational default: it lets a bank exercise the whole "attach a
 *     document" workflow safely before any SharePoint connector exists.
 *
 *   - LIVE: the SharePoint Online connector IS invoked. Today no such
 *     connector is registered for this Code App (no `SharePointOnlineService`
 *     exists under `src/generated/services/` the way `Office365OutlookService`
 *     does), so `getSharePointDocumentAdapter()` returns an adapter that
 *     fails closed with a clear "connector not yet registered" reason
 *     rather than crash or fabricate a link. Once an operator registers the
 *     SharePoint Online connector as a data source for this Code App and
 *     regenerates the SDK, `createLiveSharePointDocumentAdapter` (already
 *     written, already tested against a mock connector) can be constructed
 *     with the real generated connector and swapped in — no other code
 *     changes.
 *
 * Discipline:
 *   - Mode is read ONCE at module load from
 *     `import.meta.env.VITE_SHAREPOINT_MODE`. Toggling requires a rebuild +
 *     redeploy. No runtime mutation.
 *   - Only the case-insensitive string "LIVE" resolves to LIVE. Any other
 *     value (including missing or misspelled) resolves to DRY_RUN. The
 *     default is intentionally conservative: a typo must NEVER silently
 *     enable a real network call.
 */

export type SharePointDocumentMode = 'DRY_RUN' | 'LIVE';

function readSharePointModeFromEnv(): SharePointDocumentMode {
  // Vite exposes `import.meta.env` at build time. The optional chain guards
  // a non-Vite test environment where it may be undefined.
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const raw = String(env?.VITE_SHAREPOINT_MODE ?? '').trim().toUpperCase();
  return raw === 'LIVE' ? 'LIVE' : 'DRY_RUN';
}

export const SHAREPOINT_DOCUMENT_MODE: SharePointDocumentMode = readSharePointModeFromEnv();
