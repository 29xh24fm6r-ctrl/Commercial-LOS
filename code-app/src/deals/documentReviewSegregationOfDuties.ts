/**
 * Segregation-of-duties guard shared by both document-review write paths
 * (documentRequirementActions.ts's `review` action and documentActions.ts's
 * `markDocumentReviewed`) — Production Remediation Factory Arc N-16.
 *
 * Compares the resolved cr664_user identity that received a document against
 * the resolved cr664_user identity attempting to review it. Always compares
 * the durable resolved lookup id (extracted from the `/cr664_users(<id>)`
 * odata-bind string), never a display name or email — a display name is
 * editable free text and an email is not guaranteed unique/stable the way the
 * resolved cr664_user row id is.
 */

const CHANGED_BY_BIND_ID = /\/cr664_users\(([^)]+)\)/i;

/** Extracts the cr664_user row id out of a `/cr664_users(<id>)` odata-bind string. */
export function extractCoreUserId(bind: string | undefined): string | undefined {
  if (!bind) return undefined;
  const match = CHANGED_BY_BIND_ID.exec(bind);
  return match ? match[1].toLowerCase() : undefined;
}

/** True only when both ids are present and resolve to the same cr664_user row. */
export function isSameCoreUser(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export const SEGREGATION_OF_DUTIES_BLOCK_REASON =
  'The person who recorded this document as received cannot also mark it reviewed. Ask a different authorized reviewer to complete this step.';
