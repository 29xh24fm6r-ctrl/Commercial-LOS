/**
 * Phase 187H / G-6 — shared audit-actor bind guard.
 *
 * The cr664_auditevent.cr664_ChangedBy lookup is REQUIRED and targets the custom
 * cr664_user table (live metadata: Targets = ["cr664_user"], entity set
 * `cr664_users`) — NEVER systemuser. The live New Deal audit POST proved a
 * systemuser id bound here is rejected ("Entity 'cr664_User' With Id = <id> Does
 * Not Exist"). The generated SDK types every @odata.bind as a bare string, so it
 * cannot stop a wrong-target bind at compile time; this runtime guard is the
 * metadata-backed backstop every governed audit emitter calls before POST.
 *
 * Pure, SDK-free, id-free errors — safe to use anywhere.
 */

/** The entity set cr664_ChangedBy / cr664_ActorUser must bind to. */
export const CORE_USER_ENTITY_SET = 'cr664_users';

/** The wrong target that the 12 legacy emitters used (Phase 187F). */
export const SYSTEM_USER_ENTITY_SET = 'systemusers';

/** Extract the entity-set segment from an `/entityset(<id>)` @odata.bind value. */
export function bindEntitySet(bind: string | undefined): string | null {
  const m = /^\/([a-zA-Z0-9_]+)\(/.exec((bind ?? '').trim());
  return m ? m[1] : null;
}

/** True iff `bind` is a well-formed `/cr664_users(<id>)` reference. */
export function isCoreUserBind(bind: string | undefined): boolean {
  return bindEntitySet(bind) === CORE_USER_ENTITY_SET;
}

/**
 * Throw unless `bind` targets cr664_users. Use immediately before emitting any
 * audit payload whose cr664_ChangedBy was assembled. The message names the
 * offending entity set (never an id) so a failure is diagnosable without leaking
 * record ids. The systemuser case is called out explicitly because it is the
 * known regression.
 */
export function assertChangedByCoreUserBind(bind: string | undefined): void {
  const set = bindEntitySet(bind);
  if (set === CORE_USER_ENTITY_SET) return;
  if (set === SYSTEM_USER_ENTITY_SET) {
    throw new Error(
      `audit cr664_ChangedBy bound to /${SYSTEM_USER_ENTITY_SET}(...) but it targets ` +
        `cr664_user — resolve the actor's cr664_user id via the platform-user bridge ` +
        `and bind /${CORE_USER_ENTITY_SET}(<id>). Never bind a systemuser id.`,
    );
  }
  throw new Error(
    `audit cr664_ChangedBy must bind /${CORE_USER_ENTITY_SET}(<id>); got ` +
      `${set ? `/${set}(...)` : 'a non-@odata.bind value'}.`,
  );
}
