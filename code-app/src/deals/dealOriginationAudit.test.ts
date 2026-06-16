import { describe, it, expect } from 'vitest';
import {
  buildOriginationAuditPayload,
  buildNewDealAuditPayload,
  summarizeAuditPayloadShape,
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

  it('binds ChangedBy to /systemusers(<actor>) (authoritative) and carries the correlation id', () => {
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/systemusers(sys-1)');
    expect(payload.cr664_correlationid).toBe('corr-1');
    expect(payload['cr664_LoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
  });

  it('does NOT bind a systemuser id into the cr664_user-targeted cr664_ActorUser lookup', () => {
    // cr664_ActorUser targets the custom cr664_user table; binding a systemuser
    // id there failed the live audit POST. It is omitted (optional, no resolver).
    expect(payload).not.toHaveProperty('cr664_ActorUser@odata.bind');
    expect(ORIGINATION_AUDIT_ALLOWED_FIELDS).not.toContain('cr664_ActorUser@odata.bind');
    // No systemusers bind targets anything other than ChangedBy.
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string' && value.startsWith('/systemusers(')) {
        expect(key).toBe('cr664_ChangedBy@odata.bind');
      }
    }
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

  it('buildOriginationAuditPayload is the canonical builder (same alias)', () => {
    expect(buildOriginationAuditPayload).toBe(buildNewDealAuditPayload);
  });

  it('change-detail fields are included only when provided and stay allow-listed', () => {
    const p = buildNewDealAuditPayload(
      { ...input, fieldName: 'cr664_dealname', oldValue: '', newValue: 'Acme', beforeState: 'No deal', afterState: 'Deal created' },
      '2026-06-16T00:00:00.000Z',
    );
    expect(p.cr664_fieldname).toBe('cr664_dealname');
    expect(p.cr664_newvalue).toBe('Acme');
    for (const key of Object.keys(p)) expect(ORIGINATION_AUDIT_ALLOWED_FIELDS).toContain(key);
    // Still only ChangedBy gets a systemusers bind; still no ActorUser.
    expect(p).not.toHaveProperty('cr664_ActorUser@odata.bind');
  });
});

describe('BUGFIX -- summarizeAuditPayloadShape is a safe, conclusive diagnostic', () => {
  const payload = buildNewDealAuditPayload(input, '2026-06-16T00:00:00.000Z');
  const shape = summarizeAuditPayloadShape(payload);

  it('lists the payload keys and the bind TARGET entity sets', () => {
    expect(shape).toMatch(/keys=\[/);
    expect(shape).toMatch(/cr664_ChangedBy@odata\.bind->systemusers/);
    expect(shape).toMatch(/cr664_LoanDeal@odata\.bind->cr664_loandeals/);
  });

  it('the ONLY ->systemusers bind shown is cr664_ChangedBy; no cr664_user target appears', () => {
    const systemuserTargets = shape.match(/([a-zA-Z0-9_@.]+)->systemusers/g) ?? [];
    expect(systemuserTargets.length).toBe(1);
    expect(systemuserTargets[0]).toMatch(/cr664_ChangedBy/);
    expect(shape).not.toMatch(/->cr664_users?\b/i);
  });

  it('exposes NO record ids / GUIDs / tokens (key names + entity sets only)', () => {
    expect(shape).not.toMatch(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    expect(shape).not.toMatch(/sys-1|deal-1|corr-1/); // no values, only keys/targets
  });
});
