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
 *   - STRICT + fail-closed: ONLY the exact literal "LIVE" (after trimming
 *     surrounding whitespace) resolves to LIVE. Missing, blank, lowercase or
 *     mixed-case ("live" / "Live"), or any other value resolves to DRY_RUN.
 *     A typo or a loosely-cased value must NEVER silently enable a real
 *     network call. (This is intentionally stricter than the Outlook email
 *     mode, which upper-cases before comparing.)
 */

export type SharePointDocumentMode = 'DRY_RUN' | 'LIVE';

/**
 * Pure, fail-closed resolver from a raw env value to the mode. Exported so the
 * full case matrix (unset / blank / exact LIVE / lowercase / mixed-case /
 * unrelated) is directly testable without a build-time env stub. Only the
 * EXACT trimmed literal "LIVE" selects LIVE.
 */
export function resolveSharePointDocumentMode(raw: string | null | undefined): SharePointDocumentMode {
  return (raw ?? '').trim() === 'LIVE' ? 'LIVE' : 'DRY_RUN';
}

function readSharePointModeFromEnv(): SharePointDocumentMode {
  // Vite exposes `import.meta.env` at build time. The optional chain guards
  // a non-Vite test environment where it may be undefined.
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const raw = env?.VITE_SHAREPOINT_MODE;
  return resolveSharePointDocumentMode(raw == null ? undefined : String(raw));
}

export const SHAREPOINT_DOCUMENT_MODE: SharePointDocumentMode = readSharePointModeFromEnv();
