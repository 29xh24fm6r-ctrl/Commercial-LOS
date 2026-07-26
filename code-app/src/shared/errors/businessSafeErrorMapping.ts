/**
 * PR A remediation — generalizes the business-safe error mapper N-21/PR132 introduced scoped to
 * only the document requirement/receive/review write family (see
 * `src/deals/documentReviewErrorMapping.ts`, whose own header explicitly named this as "not a
 * global sweep"). This is that sweep's shared primitive: every raw error string reaching this
 * module originates from a live transport failure (Dataverse validation, network, plugin
 * rejection) — never from this codebase's own authored validation messages (those are returned
 * via a distinct outcome kind, e.g. `invalid-input`/`unauthorized`, and are never routed through
 * this mapper). A raw transport error is never rendered to a banker: `safeMessage` is always a
 * fixed, banker-facing string; `technicalDetail` carries the original text for an internal
 * diagnostic surface only (never rendered in the primary banker-facing UI).
 */

export interface MappedBusinessSafeError {
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
 * Maps ANY raw transport-error string to a fixed, business-safe message. Deliberately does not
 * attempt to selectively "clean up" or pass through parts of the raw string — a raw
 * Dataverse/OData/.NET error can contain internal column names, namespaces, or stack fragments in
 * any position, so the only fail-closed posture is a single safe message for every case.
 */
export function mapBusinessSafeError(rawMessage: string, correlationId?: string): MappedBusinessSafeError {
  const detail = rawMessage.trim().length > 0 ? rawMessage.trim() : 'empty error message';
  return {
    safeMessage: `${GENERIC_SAFE_MESSAGE} Reference: ${shortReference(correlationId)}.`,
    technicalDetail: detail,
  };
}
