/**
 * Phase 264 (P0) — SharePoint document storage TARGET PLAN.
 *
 * A pure, declarative description of the SharePoint folder structure the
 * portfolio-boarding document feature stores against — one folder per
 * boarded loan, so a bank can browse/share an individual loan's file the
 * same way it shares any other SharePoint folder (the explicit ask this
 * plan satisfies). This file is CONSTANTS + PURE FUNCTIONS ONLY — it makes
 * no live calls, creates no folders, and uploads nothing. It is the plan the
 * live adapter (`portfolioSharePointDocumentAdapters.ts`) derives paths from,
 * and the contract an operator's SharePoint site/library provisioning
 * fulfills — mirrors the discipline of
 * `portfolioLoanBoardingDataverseSchemaPlan.ts` for the Dataverse side.
 *
 * Safety note: this plan does NOT assume Dataverse's native
 * "Document Management" SharePoint integration (sharepointsite /
 * sharepointdocumentlocation system tables) — that mechanism is designed for
 * the classic model-driven document grid control, not a Code App's generic
 * data client. Instead, the live adapter calls the standard SharePoint
 * Online Power Platform connector directly (the same generated-service
 * pattern already used for Office 365 Outlook — see
 * `outlookEmailAdapters.ts` — once an operator registers that connector as a
 * data source for this Code App and the SDK is regenerated).
 */

export const SHAREPOINT_SCHEMA_PLAN_VERSION = '264.1';

/**
 * Default document-library-relative root folder. A bank may override this at
 * adapter-construction time (see `createLiveSharePointDocumentAdapter`); this
 * is only the default when no override is supplied.
 */
export const DEFAULT_LIBRARY_ROOT_PATH = 'Portfolio Loans';

const FORBIDDEN_PATH_CHARS = /["*:<>?/\\|]/g;
const MAX_FOLDER_SEGMENT_LENGTH = 128;

/**
 * SharePoint forbids `" * : < > ? / \ |` in folder/file names. Replaces each
 * with a hyphen, collapses whitespace, and trims — never throws, never
 * silently drops the whole segment even if every character were forbidden.
 */
export function sanitizeSharePointPathSegment(value: string): string {
  const replaced = value.replace(FORBIDDEN_PATH_CHARS, '-').trim().replace(/\s+/g, ' ');
  const truncated = replaced.slice(0, MAX_FOLDER_SEGMENT_LENGTH).trim();
  return truncated.length > 0 ? truncated : 'Unnamed';
}

/**
 * One folder per boarded loan: `{libraryRoot}/{loanNumber} - {borrower}`.
 * Falls back to just the loan number when no borrower name is available
 * (never fabricates a borrower name to fill the gap).
 */
export function deriveLoanFolderPath(
  loanNumber: string,
  borrowerLegalName: string | undefined,
  libraryRootPath: string = DEFAULT_LIBRARY_ROOT_PATH,
): string {
  const safeLoanNumber = sanitizeSharePointPathSegment(loanNumber);
  const folderName = borrowerLegalName && borrowerLegalName.trim().length > 0
    ? `${safeLoanNumber} - ${sanitizeSharePointPathSegment(borrowerLegalName)}`
    : safeLoanNumber;
  const safeRoot = libraryRootPath.replace(/^\/+|\/+$/g, '');
  return `${safeRoot}/${folderName}`;
}
