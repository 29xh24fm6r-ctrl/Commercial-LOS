/**
 * Phase 264 (P0) — SharePoint document storage port.
 *
 * The typed interface every SharePoint document-storage mechanism conforms
 * to, mirroring the Outlook email port (`outlookEmailPort.ts`). Every loan's
 * documents live in their OWN folder — `deriveLoanFolderPath` (in
 * `portfolioSharePointDocumentSchemaPlan.ts`) is the single source of truth
 * for that path — so a bank can browse/share one loan's file the same way it
 * shares any other SharePoint folder.
 *
 * Result shape:
 *   - 'uploaded' — the file was accepted. In DRY_RUN this means "the adapter
 *     validated the inputs and recorded the attempt"; `webUrl`/`itemId` are
 *     undefined (no fake link is ever returned). In LIVE this means the
 *     connector returned a 2xx and the real SharePoint item's web URL/id.
 *   - 'not-configured' — no SharePoint connector is wired for this
 *     environment yet (LIVE mode selected but the connector doesn't exist,
 *     or DRY_RUN's caller asked for a real link that never exists there).
 *   - 'invalid-input' — the file/loan input failed local validation before
 *     any transport call was attempted (empty file, oversized, loan number
 *     missing). Always permanent; retrying the same input cannot help.
 *   - 'transient-failure' — the connector reported a recoverable failure
 *     (network, throttle, 5xx). The caller may surface a "try again"
 *     affordance.
 *   - 'permanent-failure' — the connector reported a non-recoverable failure
 *     (permission denied, site not found, connector not wired). The caller
 *     must NOT retry without operator action.
 *
 * Discipline:
 *   - The port is pure data + method signatures. No SDK import, no Power
 *     Apps package import, no role-module import.
 *   - The mode discriminator lets the UI surface the active mode without
 *     re-reading import.meta.env.
 *   - Never fabricate a webUrl/itemId. Absent means absent.
 */

export interface SharePointDocumentUploadInput {
  readonly loanNumber: string;
  readonly borrowerLegalName: string | undefined;
  readonly documentType: string;
  readonly fileName: string;
  readonly contentType: string;
  /** Raw file bytes. The port never inspects contents beyond size. */
  readonly content: Uint8Array;
  /** Correlation id stamped on the audit row the caller emits. The adapter
   *  does not write it anywhere; provided so connector-side logs can be
   *  correlated with the Dataverse audit rows if the connector supports it. */
  readonly correlationId: string;
}

export type SharePointUploadResult =
  | { kind: 'uploaded'; webUrl: string | undefined; itemId: string | undefined; mode: 'DRY_RUN' | 'LIVE' }
  | { kind: 'not-configured'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'transient-failure'; reason: string }
  | { kind: 'permanent-failure'; reason: string };

export interface SharePointDocumentListInput {
  readonly loanNumber: string;
}

export interface SharePointDocumentListEntry {
  readonly itemId: string;
  readonly fileName: string;
  readonly webUrl: string | undefined;
}

export type SharePointListResult =
  | { kind: 'listed'; entries: readonly SharePointDocumentListEntry[] }
  | { kind: 'not-configured'; reason: string }
  | { kind: 'transient-failure'; reason: string }
  | { kind: 'permanent-failure'; reason: string };

export interface PortfolioSharePointDocumentPort {
  /** Discriminator surfaced to the UI so it can render an unambiguous mode badge. */
  readonly mode: 'DRY_RUN' | 'LIVE';
  /** Whether this instance can plausibly do real work (a connector is wired). Never true for DRY_RUN. */
  readonly configured: boolean;
  upload(input: SharePointDocumentUploadInput): Promise<SharePointUploadResult>;
  list(input: SharePointDocumentListInput): Promise<SharePointListResult>;
}
