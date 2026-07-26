/**
 * Business-safe error mapping for the document requirement/receive/review
 * write family — Production Remediation Factory Arc N-01 / N-21 (scoped to
 * this write family only; the global error-mapping sweep across every
 * surface is its own later phase).
 *
 * Every raw error string reaching this module originates from a live
 * transport failure (Dataverse validation, network, plugin rejection) —
 * never from this codebase's own authored validation messages (those are
 * returned via a distinct outcome kind, e.g. `invalid-input`/`unauthorized`,
 * and are never routed through this mapper). A raw transport error is never
 * rendered to a banker: `safeMessage` is always a fixed, banker-facing
 * string; `technicalDetail` carries the original text for an internal
 * diagnostic surface only (never rendered in the primary banker-facing UI).
 */

export interface MappedDocumentWriteError {
  readonly safeMessage: string;
  readonly technicalDetail: string;
}

const GENERIC_SAFE_MESSAGE =
  "We couldn't save that action just now. Nothing was lost — please try again in a moment. " +
  'If this keeps happening, share this reference with support.';

/** Never displayed — only used to build a stable, non-identifying support reference. */
function shortReference(correlationId: string | undefined): string {
  if (!correlationId) return 'no correlation id';
  return correlationId;
}

/**
 * Maps ANY raw transport-error string to a fixed, business-safe message.
 * Deliberately does not attempt to selectively "clean up" or pass through
 * parts of the raw string — a raw Dataverse/OData/.NET error can contain
 * internal column names, namespaces, or stack fragments in any position, so
 * the only fail-closed posture is a single safe message for every case,
 * covering (among others) exactly the failure this write family exhibited in
 * production: an unknown-attribute rejection surfacing a raw
 * "Invalid property 'cr664_requirementstatus'" / OData / stack-trace-shaped
 * string straight to the banker.
 */
export function mapDocumentWriteError(
  rawMessage: string,
  correlationId?: string,
): MappedDocumentWriteError {
  const detail = rawMessage.trim().length > 0 ? rawMessage.trim() : 'empty error message';
  return {
    safeMessage: `${GENERIC_SAFE_MESSAGE} Reference: ${shortReference(correlationId)}.`,
    technicalDetail: detail,
  };
}
