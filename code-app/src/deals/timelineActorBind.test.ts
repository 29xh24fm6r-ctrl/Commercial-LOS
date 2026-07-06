import { describe, it, expect } from 'vitest';
import { timelineEventByBind } from './timelineActorBind';

/**
 * cr664_EventBy targets cr664_user (never systemuser). The helper binds the
 * resolved cr664_user, or omits the optional lookup when the actor cannot
 * resolve — fail-closed, never a faked/systemuser identity.
 */
describe('timelineEventByBind', () => {
  it('binds the resolved cr664_user when the actor is ok', () => {
    expect(timelineEventByBind({ ok: true, changedByBind: '/cr664_users(u-1)' })).toEqual({
      'cr664_EventBy@odata.bind': '/cr664_users(u-1)',
    });
  });

  it('omits cr664_EventBy when the actor cannot resolve', () => {
    expect(timelineEventByBind({ ok: false, reason: 'no cr664_user identity' })).toEqual({});
  });

  it('omits cr664_EventBy when ok is true but no bind is present (defensive)', () => {
    expect(timelineEventByBind({ ok: true })).toEqual({});
  });

  it('never emits a /systemusers bind', () => {
    const bind = timelineEventByBind({ ok: true, changedByBind: '/cr664_users(u-1)' });
    expect(JSON.stringify(bind)).not.toContain('/systemusers');
  });
});
