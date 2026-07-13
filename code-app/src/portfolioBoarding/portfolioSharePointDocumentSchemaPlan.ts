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
 * Sanitize one folder/file name segment for SharePoint. It is deterministic and
 * never throws:
 *   - drops control characters (0x00–0x1F, 0x7F);
 *   - replaces the SharePoint-forbidden characters `" * : < > ? / \ |` with a
 *     hyphen (so an embedded `/` or `\` can NEVER create an unintended nested
 *     path);
 *   - collapses internal whitespace and trims;
 *   - strips leading/trailing dots so a value like `.`, `..`, or `report.`
 *     can never become a navigable/traversal segment or an invalid trailing-dot
 *     name (SharePoint rejects trailing dots) — internal dots (e.g. `LN.1001`)
 *     are preserved;
 *   - falls back to `Unnamed` when nothing usable survives (never an empty
 *     segment, never a fabricated real value).
 */
/** Drop control characters (0x00-0x1F, 0x7F) without a control-char regex literal in source. */
function stripControlChars(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code !== undefined && (code < 0x20 || code === 0x7f)) continue;
    out += ch;
  }
  return out;
}

export function sanitizeSharePointPathSegment(value: string): string {
  const cleaned = stripControlChars(value)
    .replace(FORBIDDEN_PATH_CHARS, '-')
    .trim()
    .replace(/\s+/g, ' ');
  // Neutralize path-traversal / trailing-dot behavior: `.` and `..` become empty,
  // `report.` → `report`. Internal dots survive.
  const deDotted = cleaned.replace(/^\.+/, '').replace(/\.+$/, '').trim();
  const truncated = deDotted.slice(0, MAX_FOLDER_SEGMENT_LENGTH).trim();
  return truncated.length > 0 ? truncated : 'Unnamed';
}

/**
 * One folder per boarded loan: `{libraryRoot}/{loanNumber} - {borrower}`.
 * Falls back to just the loan number when no USABLE borrower name is available
 * (never fabricates a borrower name to fill the gap). A borrower value that has
 * no usable characters after sanitization — blank, all-forbidden, or a `.`/`..`
 * traversal value — is treated as absent, so the folder is `{loanNumber}` alone
 * rather than a meaningless `{loanNumber} - Unnamed`.
 */
export function deriveLoanFolderPath(
  loanNumber: string,
  borrowerLegalName: string | undefined,
  libraryRootPath: string = DEFAULT_LIBRARY_ROOT_PATH,
): string {
  const safeLoanNumber = sanitizeSharePointPathSegment(loanNumber);
  const safeBorrower = borrowerLegalName ? sanitizeSharePointPathSegment(borrowerLegalName) : '';
  const hasUsableBorrower = safeBorrower.length > 0 && safeBorrower !== 'Unnamed';
  const folderName = hasUsableBorrower ? `${safeLoanNumber} - ${safeBorrower}` : safeLoanNumber;
  const safeRoot = libraryRootPath.replace(/^\/+|\/+$/g, '');
  return `${safeRoot}/${folderName}`;
}
