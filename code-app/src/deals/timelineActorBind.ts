import type { ActorChangedByResolution } from './newDealAuditActorResolver';

/**
 * cr664_EventBy on cr664_dealtimelineevent targets the custom cr664_user table
 * (NOT systemuser) — exactly like the audit's REQUIRED cr664_ChangedBy lookup.
 * Binding a systemuser id is rejected by Dataverse as
 *   "Entity 'cr664_User' With Id = <systemuser id> Does Not Exist".
 *
 * This returns the cr664_EventBy bind as a spreadable payload fragment from the
 * SAME resolved cr664_user actor the audit uses, or an EMPTY object (omitting the
 * optional lookup) when the actor cannot resolve — fail-closed, never a faked or
 * systemuser identity. Every governed deal-timeline write spreads this instead of
 * hardcoding `'cr664_EventBy@odata.bind': /systemusers(<id>)`.
 */
export function timelineEventByBind(
  actor: ActorChangedByResolution,
): { readonly 'cr664_EventBy@odata.bind': string } | Record<string, never> {
  return actor.ok && actor.changedByBind
    ? { 'cr664_EventBy@odata.bind': actor.changedByBind }
    : {};
}
