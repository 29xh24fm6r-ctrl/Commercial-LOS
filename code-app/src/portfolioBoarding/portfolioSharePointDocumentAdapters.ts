/**
 * Phase 264 (P0) — SharePoint document storage adapters.
 *
 * Mirrors `outlookEmailAdapters.ts`: a DRY_RUN adapter (today's operational
 * default, real validation + honest "no link" result, zero network calls)
 * and a LIVE adapter that calls a `PortfolioSharePointConnectorPort` — the
 * low-level shape of the standard Microsoft "SharePoint Online" Power
 * Platform connector (CreateFolderIfNotExists / CreateFile / ListFolder),
 * the SAME kind of generated-service call `Office365OutlookService` already
 * makes for email. No `SharePointOnlineService` exists under
 * `src/generated/services/` yet (no operator has registered the connector as
 * a data source for this Code App), so this module never imports one — doing
 * so would break every build until that file existed. Instead
 * `createLiveSharePointDocumentAdapter` takes the connector as an explicit
 * constructor parameter, exactly like `ImportRunnerDeps`/`ExistingLoanDeps`
 * elsewhere in this codebase, so the logic is real and fully tested today
 * against a mock connector — an operator supplying the real generated
 * connector later is a one-line wiring change, not a rewrite.
 */

import {
  deriveLoanFolderPath,
  DEFAULT_LIBRARY_ROOT_PATH,
} from './portfolioSharePointDocumentSchemaPlan';
import { SHAREPOINT_DOCUMENT_MODE } from './portfolioSharePointDocumentMode';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';
import type {
  PortfolioSharePointDocumentPort,
  SharePointDocumentUploadInput,
  SharePointDocumentListInput,
  SharePointUploadResult,
  SharePointListResult,
} from './portfolioSharePointDocumentPort';

/** A file this large is almost certainly a mistake for a loan document; reject before any transport call. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * The low-level connector shape (standard SharePoint Online connector
 * action names/parameters). An operator-registered, SDK-regenerated
 * `SharePointOnlineService` would satisfy this shape.
 */
export interface PortfolioSharePointConnectorPort {
  createFolderIfNotExists(folderPath: string): Promise<{ success: boolean; error?: { message?: string; status?: number } }>;
  createFile(
    folderPath: string,
    fileName: string,
    contentType: string,
    content: Uint8Array,
  ): Promise<{
    success: boolean;
    data?: { itemId: string; webUrl?: string };
    error?: { message?: string; status?: number };
  }>;
  listFolder(folderPath: string): Promise<{
    success: boolean;
    data?: readonly { itemId: string; fileName: string; webUrl?: string }[];
    error?: { message?: string; status?: number };
  }>;
}

function validateUploadInput(input: SharePointDocumentUploadInput): string | undefined {
  if (!input.loanNumber || input.loanNumber.trim().length === 0) return 'A loan number is required.';
  if (!input.fileName || input.fileName.trim().length === 0) return 'A file name is required.';
  // Size is read as byteLength only — the whole (possibly very large) file is never scanned to validate.
  if (input.content.byteLength === 0) return 'The file is empty.';
  if (input.content.byteLength > MAX_UPLOAD_BYTES) {
    return `The file is larger than the ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB limit.`;
  }
  // The per-loan folder must resolve to a usable path (the schema plan sanitizes forbidden/traversal
  // input and never returns empty, so this is a defensive guard rather than a common failure).
  const folderPath = deriveLoanFolderPath(input.loanNumber, input.borrowerLegalName);
  if (folderPath.trim().length === 0) return 'The resolved SharePoint folder path is unusable.';
  return undefined;
}

/**
 * DRY_RUN adapter — today's operational default. Validates the input for
 * real (a banker gets real, honest feedback on an empty/oversized file) but
 * never calls any transport; `webUrl`/`itemId` are always undefined, and
 * `list` always returns an empty result (there is no real storage location
 * to list — never fabricated).
 */
export const dryRunSharePointDocumentAdapter: PortfolioSharePointDocumentPort = {
  mode: 'DRY_RUN',
  configured: false,
  async upload(input: SharePointDocumentUploadInput): Promise<SharePointUploadResult> {
    const invalidReason = validateUploadInput(input);
    if (invalidReason) return { kind: 'invalid-input', reason: invalidReason };
    return { kind: 'uploaded', webUrl: undefined, itemId: undefined, mode: 'DRY_RUN' };
  },
  async list(_input: SharePointDocumentListInput): Promise<SharePointListResult> {
    return { kind: 'listed', entries: [] };
  },
};

/** LIVE mode selected, but no connector has been registered for this Code App yet. Fails closed, never crashes. */
export const notYetRegisteredSharePointDocumentAdapter: PortfolioSharePointDocumentPort = {
  mode: 'LIVE',
  configured: false,
  async upload(): Promise<SharePointUploadResult> {
    return {
      kind: 'not-configured',
      reason:
        'SharePoint Online connector not yet registered for this Code App. An operator must add it as a ' +
        'data source and regenerate the SDK before live uploads can run.',
    };
  },
  async list(): Promise<SharePointListResult> {
    return {
      kind: 'not-configured',
      reason: 'SharePoint Online connector not yet registered for this Code App.',
    };
  },
};

// 408 / 429 are transient by HTTP convention; 5xx is transient; any other
// 4xx is permanent. No status (e.g. network drop) is transient so the
// banker can retry — mirrors classifyHttpStatus in outlookEmailAdapters.ts.
function classifyHttpStatus(status: number | undefined): 'transient-failure' | 'permanent-failure' {
  if (status === undefined) return 'transient-failure';
  if (status === 408 || status === 429) return 'transient-failure';
  if (status >= 500 && status <= 599) return 'transient-failure';
  if (status >= 400 && status <= 499) return 'permanent-failure';
  return 'transient-failure';
}

/**
 * Final LOS completion (Workstream P) — `error.message` here is a genuine raw connector/transport
 * failure (or, absent one, a generic internal fallback), and every caller below folds the
 * returned `message` straight into a `reason` field that ends up in `DocumentUploadResult.message`
 * (`usePortfolioLoanDocumentPersistence.ts`), which `PortfolioLoanBoardingDocumentUploadPanel.tsx`
 * renders verbatim ("Not uploaded — {ui.message}"). Mapped once, centrally, here -- the single
 * point all three connector-error call sites (folder ensure / file create / folder list) share --
 * rather than at each call site.
 */
function describeConnectorError(
  error: { message?: string; status?: number } | undefined,
  correlationId?: string,
): {
  message: string;
  status: number | undefined;
} {
  const rawMessage =
    error?.message && error.message.length > 0
      ? error.message
      : 'SharePoint connector reported a failure without a message.';
  return { message: mapBusinessSafeError(rawMessage, correlationId).safeMessage, status: error?.status };
}

export interface LiveSharePointDocumentAdapterOptions {
  /** Overrides DEFAULT_LIBRARY_ROOT_PATH for this bank's SharePoint site. */
  readonly libraryRootPath?: string;
}

/**
 * Real, working upload/list logic against an injected connector — ensures
 * the per-loan folder exists (idempotent), then uploads into it. Fully
 * tested against a mock `PortfolioSharePointConnectorPort` today; wiring a
 * real generated connector in is a construction-site change only.
 */
export function createLiveSharePointDocumentAdapter(
  connector: PortfolioSharePointConnectorPort,
  options: LiveSharePointDocumentAdapterOptions = {},
): PortfolioSharePointDocumentPort {
  const libraryRootPath = options.libraryRootPath ?? DEFAULT_LIBRARY_ROOT_PATH;

  return {
    mode: 'LIVE',
    configured: true,
    async upload(input: SharePointDocumentUploadInput): Promise<SharePointUploadResult> {
      const invalidReason = validateUploadInput(input);
      if (invalidReason) return { kind: 'invalid-input', reason: invalidReason };

      const folderPath = deriveLoanFolderPath(input.loanNumber, input.borrowerLegalName, libraryRootPath);

      try {
        const folderResult = await connector.createFolderIfNotExists(folderPath);
        if (!folderResult.success) {
          const { message, status } = describeConnectorError(folderResult.error, input.correlationId);
          return { kind: classifyHttpStatus(status), reason: message };
        }

        const uploadResult = await connector.createFile(folderPath, input.fileName, input.contentType, input.content);
        if (!uploadResult.success || !uploadResult.data) {
          const { message, status } = describeConnectorError(uploadResult.error, input.correlationId);
          return { kind: classifyHttpStatus(status), reason: message };
        }

        // A LIVE success MUST carry a genuine web URL — the value persisted to cr664_filereference.
        // If the connector reported success without one, FAIL CLOSED (a malformed connector response);
        // never manufacture a URL from folder/name assumptions.
        if (!uploadResult.data.webUrl || uploadResult.data.webUrl.trim().length === 0) {
          return {
            kind: 'permanent-failure',
            reason: 'SharePoint connector reported success but returned no file URL; nothing was recorded.',
          };
        }

        return {
          kind: 'uploaded',
          webUrl: uploadResult.data.webUrl,
          itemId: uploadResult.data.itemId,
          mode: 'LIVE',
        };
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        return { kind: 'transient-failure', reason: mapBusinessSafeError(raw, input.correlationId).safeMessage };
      }
    },
    async list(input: SharePointDocumentListInput): Promise<SharePointListResult> {
      const folderPath = deriveLoanFolderPath(input.loanNumber, undefined, libraryRootPath);
      try {
        const result = await connector.listFolder(folderPath);
        if (!result.success) {
          const { message, status } = describeConnectorError(result.error);
          return { kind: classifyHttpStatus(status), reason: message };
        }
        return {
          kind: 'listed',
          entries: (result.data ?? []).map((e) => ({ itemId: e.itemId, fileName: e.fileName, webUrl: e.webUrl })),
        };
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        return { kind: 'transient-failure', reason: mapBusinessSafeError(raw).safeMessage };
      }
    },
  };
}

/**
 * Mode-resolving factory, mirroring the Outlook email adapter's mode switch
 * in `outlookEmailAdapters.ts`. `connector` is only consulted in LIVE mode
 * (DRY_RUN never touches it); pass it once an operator has wired a real
 * `PortfolioSharePointConnectorPort`.
 */
export function getSharePointDocumentAdapter(connector?: PortfolioSharePointConnectorPort): PortfolioSharePointDocumentPort {
  if (SHAREPOINT_DOCUMENT_MODE !== 'LIVE') return dryRunSharePointDocumentAdapter;
  return connector ? createLiveSharePointDocumentAdapter(connector) : notYetRegisteredSharePointDocumentAdapter;
}
