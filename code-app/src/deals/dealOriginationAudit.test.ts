import { describe, it, expect } from 'vitest';
import {
  buildOriginationAuditPayload,
  ORIGINATION_AUDIT_ALLOWED_FIELDS,
  AUDIT_EVENT_CATEGORY_LIFECYCLE,
  AUDIT_EVENT_TYPE_ASSIGNMENT_CHANGE,
  AUDIT_ENTITY_TYPE_LOAN_DEAL,
  AUDIT_OUTCOME_SUCCEEDED,
  type OriginationAuditInput,
} from './dealOriginationAudit';

/**
 * BUGFIX -- the governed audit create payload must match settable Dataverse
 * columns. The first live banker proof returned audit_failed_partial because the
 * payload set ownerid / owneridtype / statecode on create (Dataverse defaults
 * those; setting them rejected the POST). The actor is recorded via ChangedBy.
 */

const input: OriginationAuditInput = {
  eventName: 'New Deal Created',
  dealId: 'deal-1',
  actorSystemUserId: 'sys-1',
  correlationId: 'corr-1',
  outcome: AUDIT_OUTCOME_SUCCEEDED,
  sourceProcess: 'NewDealCreateAdapter/governed-create',
  notes: 'Governed New Deal create.',
};

describe('BUGFIX -- origination audit payload omits system-managed owner/state', () => {
  const payload = buildOriginationAuditPayload(input, '2026-06-16T00:00:00.000Z');

  it('does NOT set ownerid / owneridtype / statecode on create', () => {
    expect(payload).not.toHaveProperty('ownerid');
    expect(payload).not.toHaveProperty('owneridtype');
    expect(payload).not.toHaveProperty('statecode');
    expect(ORIGINATION_AUDIT_ALLOWED_FIELDS).not.toContain('ownerid');
    expect(ORIGINATION_AUDIT_ALLOWED_FIELDS).not.toContain('statecode');
  });

  it('every payload key is in the allow-list', () => {
    for (const key of Object.keys(payload)) {
      expect(ORIGINATION_AUDIT_ALLOWED_FIELDS).toContain(key);
    }
  });

  it('binds ChangedBy / ActorUser to /systemusers(<actor>) and carries the correlation id', () => {
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/systemusers(sys-1)');
    expect(payload['cr664_ActorUser@odata.bind']).toBe('/systemusers(sys-1)');
    expect(payload.cr664_correlationid).toBe('corr-1');
    expect(payload['cr664_LoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
  });

  it('uses verified, pinned option-set values + the supplied outcome', () => {
    expect(payload.cr664_eventcategory).toBe(AUDIT_EVENT_CATEGORY_LIFECYCLE);
    expect(payload.cr664_eventtype).toBe(AUDIT_EVENT_TYPE_ASSIGNMENT_CHANGE);
    expect(payload.cr664_entitytype).toBe(AUDIT_ENTITY_TYPE_LOAN_DEAL);
    expect(payload.cr664_outcomestatus).toBe(AUDIT_OUTCOME_SUCCEEDED);
  });

  it('hardcodes no Dataverse record GUID', () => {
    const blob = JSON.stringify(payload);
    expect(blob).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  });
});
