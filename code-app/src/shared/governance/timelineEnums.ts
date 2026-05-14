/**
 * Phase 50: schema-verified timeline-event enum values.
 *
 * The cr664_DealTimelineEvent.cr664_visibilityscope column is set to
 * the same value across every governed deal-domain write — the
 * banker who fired the write and their manager are the legitimate
 * audience for the timeline row. Before Phase 50 this value was
 * duplicated inline as `TIMELINE_VISIBILITY_BANKER_AND_MANAGER` in
 * each of dealTaskActions, documentActions, and creditMemoActions.
 *
 * What is INTENTIONALLY not extracted:
 *   - cr664_eventtype values. They vary by domain:
 *       TASK_COMPLETED       = 788190005
 *       DOCUMENT_REQUESTED   = 788190009
 *       NOTE_LOGGED          = 788190002 (used by credit-memo save)
 *     Each action's eventtype constant is the right thing for that
 *     action to own; flagging them as "shared" would invite incorrect
 *     reuse.
 *   - cr664_eventsubtype string literals (e.g.
 *     TIMELINE_SUBTYPE_CREDIT_MEMO_DRAFT_SAVED). Domain-specific.
 *
 * Discipline:
 *   - This module is pure data. No I/O, no SDK import, no role module.
 *     Phase 48's cross-role isolation sweep covers the latter two.
 *   - Update via deliberate edit if the upstream Power Apps option
 *     set changes; the value cascades to every timeline emission
 *     at once.
 */

/** cr664_DealTimelineEvent.cr664_visibilityscope → "Banker and Manager". */
export const TIMELINE_VISIBILITY_BANKER_AND_MANAGER = 788190000;
