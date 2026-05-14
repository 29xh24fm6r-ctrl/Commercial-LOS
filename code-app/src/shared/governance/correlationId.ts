/**
 * Phase 46: shared correlation-id generator for governed writes.
 *
 * Every governed write generates a correlation id ONCE per attempt and
 * stamps it onto every emitted audit event and (for deal-domain writes)
 * every emitted timeline event. The id is the only durable link
 * between the three-write coordination's three rows in Dataverse.
 *
 * Before Phase 46 this generator was duplicated inline in every action
 * module (dealTaskActions, documentActions, creditMemoActions,
 * alertActions, dataQualityActions) with only the fallback prefix
 * differing. Phase 46 consolidates to one helper; callers pass their
 * own short prefix so the fallback ids remain debuggable.
 *
 * Discipline:
 *   - This module is pure. No I/O, no clock dependency beyond
 *     Date.now() for fallback, no Dataverse SDK import.
 *   - The crypto.randomUUID() path is preferred; the fallback exists
 *     only for the rare environment where the Web Crypto API is
 *     unavailable.
 *   - The prefix must be short (2-3 chars) and stable; it appears in
 *     audit logs and aids debugging when correlating across systems.
 */

/**
 * Generates a new correlation id for a governed write. Uses
 * crypto.randomUUID() when available; falls back to a prefixed
 * timestamp+random id when not.
 *
 * @param prefix - short stable identifier for the calling action
 *                 (e.g. 'dt' for deal-task, 'cm' for credit-memo).
 *                 Appears only in the fallback id.
 */
export function newCorrelationId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
