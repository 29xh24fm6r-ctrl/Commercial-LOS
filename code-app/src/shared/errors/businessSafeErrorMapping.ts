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

const GENERIC_SAFE_READ_MESSAGE =
  "We couldn't load that information just now. Nothing was changed — please try again in a moment. " +
  'If this keeps happening, share this reference with support.';

/**
 * Final LOS Completion arc (146 Factory arc, Workstream 146-G) — the read-path sibling of
 * mapBusinessSafeError above. That mapper's copy ("We couldn't save that action") is a write-path
 * claim that is actively wrong for a load/list failure (nothing was ever "saved" to fail). Same
 * discipline otherwise: a raw transport error string (Dataverse/OData/network) is never rendered
 * to a banker; `safeMessage` is a fixed, banker-facing string; `technicalDetail` preserves the
 * original text for an internal diagnostic surface only.
 */
export function mapBusinessSafeReadError(rawMessage: string, correlationId?: string): MappedBusinessSafeError {
  const detail = rawMessage.trim().length > 0 ? rawMessage.trim() : 'empty error message';
  return {
    safeMessage: `${GENERIC_SAFE_READ_MESSAGE} Reference: ${shortReference(correlationId)}.`,
    technicalDetail: detail,
  };
}
