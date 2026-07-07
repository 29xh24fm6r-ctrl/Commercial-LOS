// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
// Env-resilience: unblock module loading of the generated Dataverse services (which pull the
// @microsoft/power-apps SDK) without loading the real SDK. Behaviour-free — this test drives the
// component through injected write fns, never a real query. (Same idiom as featureSurfaces.test.tsx.)
vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }));
import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrmWriteActions } from './CrmWriteActions';
import type { CrmWriteFns } from '../write/crmWriteActions';
import type { CrmWriteOutcome } from '../write/crmWriteAdapter';

/**
 * Phase 261 (B) — CRM write actions: a banker can add a company, add a contact,
 * log an activity, and create a follow-up task through governed writes.
 */

function success(): CrmWriteOutcome {
  return { kind: 'success', id: 'new-1', correlationId: 'crm-1', auditId: 'a-1', childErrors: [] };
}

function fakeFns(): CrmWriteFns & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = {};
  const make = (name: string) => vi.fn(async (input: unknown) => { calls[name] = (calls[name] ?? []).concat(input); return success(); });
  const bridgeOrgToClient = vi.fn(async (input: unknown) => {
    calls.bridgeOrgToClient = (calls.bridgeOrgToClient ?? []).concat(input);
    return {
      kind: 'created' as const,
      clientRelationshipId: 'client-bridged-1',
      clientName: 'OmniCare 365',
      correlationId: 'crm-b',
      auditId: 'audit-b',
    };
  });
  return {
    addCompany: make('addCompany'),
    addContact: make('addContact'),
    logActivity: make('logActivity'),
    createFollowUpTask: make('createFollowUpTask'),
    addRelationship: make('addRelationship'),
    addAdvisorLink: make('addAdvisorLink'),
    bridgeOrgToClient,
    calls,
  };
}

const IDENTITY = { authorized: true, actorEmail: 'banker@bank.test', actorSystemUserId: 'sys-1', disabledReason: undefined };

describe('CrmWriteActions', () => {
  it('disables every action and explains why when no identity is resolved', () => {
    const { container } = render(
      <CrmWriteActions
        authorized={false}
        actorEmail={undefined}
        actorSystemUserId={undefined}
        disabledReason="No Dataverse systemuser is provisioned for the current identity."
        companyOptions={[]}
        personOptions={[]}
      />,
    );
    expect((container.querySelector('[data-crm-action="company"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[data-crm-actions-disabled]')?.textContent).toMatch(/provisioned/i);
  });

  it('adds a company through the governed write and reports success', async () => {
    const fns = fakeFns();
    const onWritten = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <CrmWriteActions {...IDENTITY} companyOptions={[]} personOptions={[]} writeFns={fns} onWritten={onWritten} />,
    );

    await user.click(container.querySelector('[data-crm-action="company"]') as HTMLElement);
    await user.type(container.querySelector('[data-crm-field="name"]') as HTMLInputElement, 'Acme Holdings');
    await user.type(container.querySelector('[data-crm-field="industry"]') as HTMLInputElement, 'Manufacturing');
    await user.click(container.querySelector('[data-crm-action-submit]') as HTMLElement);

    await waitFor(() => expect(container.querySelector('[data-crm-action-success]')).not.toBeNull());
    expect(fns.addCompany).toHaveBeenCalledTimes(1);
    expect(fns.calls.addCompany[0]).toMatchObject({ name: 'Acme Holdings', industry: 'Manufacturing', actorSystemUserId: 'sys-1', authorized: true });
    expect(onWritten).toHaveBeenCalledTimes(1);
  });

  it('Add Company Borrower mirrors into a deal-linkable client (governed bridge)', async () => {
    const fns = fakeFns();
    const user = userEvent.setup();
    const { container } = render(
      <CrmWriteActions {...IDENTITY} companyOptions={[]} personOptions={[]} writeFns={fns} />,
    );
    await user.click(container.querySelector('[data-crm-action="company"]') as HTMLElement);
    await user.type(container.querySelector('[data-crm-field="name"]') as HTMLInputElement, 'OmniCare 365');
    await user.selectOptions(
      container.querySelector('[data-crm-field="organizationType"]') as HTMLSelectElement,
      'Borrower',
    );
    await user.click(container.querySelector('[data-crm-action-submit]') as HTMLElement);

    await waitFor(() => expect(container.querySelector('[data-crm-action-success]')).not.toBeNull());
    // The company was created, then bridged to a canonical client relationship.
    expect(fns.addCompany).toHaveBeenCalledTimes(1);
    expect(fns.bridgeOrgToClient).toHaveBeenCalledTimes(1);
    expect(fns.calls.bridgeOrgToClient[0]).toMatchObject({
      organizationId: 'new-1',
      organizationName: 'OmniCare 365',
      organizationType: 'Borrower',
    });
    // The success surface tells the banker the company is now deal-linkable.
    expect(container.querySelector('[data-crm-company-bridge="linked"]')).not.toBeNull();
  });

  it('Add Company Vendor does NOT create a client mirror (not a borrower/client)', async () => {
    const fns = fakeFns();
    const user = userEvent.setup();
    const { container } = render(
      <CrmWriteActions {...IDENTITY} companyOptions={[]} personOptions={[]} writeFns={fns} />,
    );
    await user.click(container.querySelector('[data-crm-action="company"]') as HTMLElement);
    await user.type(container.querySelector('[data-crm-field="name"]') as HTMLInputElement, 'Acme Supplies');
    await user.selectOptions(
      container.querySelector('[data-crm-field="organizationType"]') as HTMLSelectElement,
      'Vendor',
    );
    await user.click(container.querySelector('[data-crm-action-submit]') as HTMLElement);
    await waitFor(() => expect(container.querySelector('[data-crm-action-success]')).not.toBeNull());
    expect(fns.bridgeOrgToClient).not.toHaveBeenCalled();
    expect(container.querySelector('[data-crm-company-bridge]')).toBeNull();
  });

  it('adds a contact with email and links the selected company', async () => {
    const fns = fakeFns();
    const user = userEvent.setup();
    const { container } = render(
      <CrmWriteActions {...IDENTITY} companyOptions={[{ id: 'org-1', label: 'Acme Holdings' }]} personOptions={[]} writeFns={fns} />,
    );
    await user.click(container.querySelector('[data-crm-action="contact"]') as HTMLElement);
    await user.type(container.querySelector('[data-crm-field="firstName"]') as HTMLInputElement, 'Dana');
    await user.type(container.querySelector('[data-crm-field="lastName"]') as HTMLInputElement, 'Lee');
    await user.type(container.querySelector('[data-crm-field="email"]') as HTMLInputElement, 'dana@acme.test');
    await user.selectOptions(container.querySelector('[data-crm-field="employerOrganizationId"]') as HTMLSelectElement, 'org-1');
    await user.click(container.querySelector('[data-crm-action-submit]') as HTMLElement);

    await waitFor(() => expect(fns.addContact).toHaveBeenCalledTimes(1));
    expect(fns.calls.addContact[0]).toMatchObject({ firstName: 'Dana', lastName: 'Lee', email: 'dana@acme.test', employerOrganizationId: 'org-1' });
  });

  it('logs an activity and creates a follow-up task', async () => {
    const fns = fakeFns();
    const user = userEvent.setup();
    const { container } = render(
      <CrmWriteActions {...IDENTITY} companyOptions={[]} personOptions={[]} writeFns={fns} />,
    );
    // Log activity (now in the overflow menu — open it first)
    await user.click(container.querySelector('[data-crm-actions-more]') as HTMLElement);
    await user.click(await screen.findByText('Log Activity'));
    await user.type(container.querySelector('[data-crm-field="summary"]') as HTMLInputElement, 'Called borrower about renewal');
    await user.click(container.querySelector('[data-crm-action-submit]') as HTMLElement);
    await waitFor(() => expect(fns.logActivity).toHaveBeenCalledTimes(1));
    expect(fns.calls.logActivity[0]).toMatchObject({ activityType: 'call', summary: 'Called borrower about renewal' });
    await user.click(container.querySelector('[data-crm-action-done]') as HTMLElement);

    // Follow-up task (also in the overflow)
    await user.click(container.querySelector('[data-crm-actions-more]') as HTMLElement);
    await user.click(await screen.findByText('New Follow-up'));
    await user.type(container.querySelector('[data-crm-field="title"]') as HTMLInputElement, 'Send term sheet');
    await user.click(container.querySelector('[data-crm-action-submit]') as HTMLElement);
    await waitFor(() => expect(fns.createFollowUpTask).toHaveBeenCalledTimes(1));
    expect(fns.calls.createFollowUpTask[0]).toMatchObject({ title: 'Send term sheet' });
  });

  it('surfaces an invalid-input failure without claiming success', async () => {
    const fns = fakeFns();
    (fns.addCompany as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: 'invalid-input', reason: 'Company name is required.' });
    const user = userEvent.setup();
    const { container } = render(
      <CrmWriteActions {...IDENTITY} companyOptions={[]} personOptions={[]} writeFns={fns} />,
    );
    await user.click(container.querySelector('[data-crm-action="company"]') as HTMLElement);
    await user.click(container.querySelector('[data-crm-action-submit]') as HTMLElement);
    await waitFor(() => expect(container.querySelector('[data-crm-action-error]')).not.toBeNull());
    expect(container.querySelector('[data-crm-action-error]')?.textContent).toMatch(/name is required/i);
    expect(container.querySelector('[data-crm-action-success]')).toBeNull();
  });
});
