import { describe, it, expect } from 'vitest';
import {
  evaluateCrmIntakeGate,
  crmIntakeGatePasses,
  crmIntakeBlockerMessage,
  NEW_DEAL_REQUIRE_CRM_CLIENT,
  NO_CRM_CLIENT_EXISTS_MESSAGE,
  CRM_CLIENT_REQUIRED_MESSAGE,
} from './newDealCrmIntakeGate';

/**
 * CRM-first intake gate.
 *
 * Pins the governed rule that a New Deal cannot proceed without a CRM client
 * relationship unless an admin/gate explicitly allows it — and that a missing
 * client produces an HONEST blocker (before any create), distinguishing "no
 * client exists yet" from "pick one".
 */

describe('evaluateCrmIntakeGate', () => {
  it('governed default requires a CRM client', () => {
    expect(NEW_DEAL_REQUIRE_CRM_CLIENT).toBe(true);
  });

  it('proceeds when an existing client relationship is selected', () => {
    const out = evaluateCrmIntakeGate({ selectedClientId: 'client-1', clientRelationshipsExist: true });
    expect(out).toEqual({ kind: 'ready', clientId: 'client-1' });
    expect(crmIntakeGatePasses(out)).toBe(true);
    expect(crmIntakeBlockerMessage(out)).toBe('');
  });

  it('blocks (pick one) when clients exist but none was selected', () => {
    const out = evaluateCrmIntakeGate({ clientRelationshipsExist: true });
    expect(out.kind).toBe('blocked_client_required');
    expect(crmIntakeGatePasses(out)).toBe(false);
    expect(crmIntakeBlockerMessage(out)).toBe(CRM_CLIENT_REQUIRED_MESSAGE);
  });

  it('blocks with the create/import message when NO client relationships exist yet', () => {
    const out = evaluateCrmIntakeGate({ clientRelationshipsExist: false });
    expect(out.kind).toBe('blocked_no_client_exists');
    expect(crmIntakeBlockerMessage(out)).toBe(NO_CRM_CLIENT_EXISTS_MESSAGE);
    expect(crmIntakeGatePasses(out)).toBe(false);
  });

  it('treats a blank / whitespace selection as no selection', () => {
    expect(evaluateCrmIntakeGate({ selectedClientId: '   ', clientRelationshipsExist: true }).kind).toBe(
      'blocked_client_required',
    );
  });

  it('proceeds without a client ONLY when the admin/gate explicitly allows it', () => {
    const out = evaluateCrmIntakeGate({ allowCreateWithoutClient: true, clientRelationshipsExist: false });
    expect(out.kind).toBe('ready_without_client');
    expect(crmIntakeGatePasses(out)).toBe(true);
  });

  it('a selected client always wins over the allowance', () => {
    const out = evaluateCrmIntakeGate({ selectedClientId: 'client-9', allowCreateWithoutClient: true });
    expect(out).toEqual({ kind: 'ready', clientId: 'client-9' });
  });
});
