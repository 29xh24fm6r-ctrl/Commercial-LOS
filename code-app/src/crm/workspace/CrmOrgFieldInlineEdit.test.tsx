// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
// The NAICS picker transitively imports the generated Dataverse service (which pulls the
// @microsoft/power-apps SDK). Unblock module loading without the real SDK — the picker is driven
// through injected loader/findByCode, never a real query. (Idiom: CrmHubWorkspace.test.tsx.)
vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }));
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrmOrgFieldInlineEdit } from './CrmOrgFieldInlineEdit';
import type { CrmUpdateDeps } from '../write/crmUpdateAdapter';
import { CRM_TEAM_READINESS_LEDGER } from '../readiness/unifiedCrmReadiness';
import { CRM_PARTY_TYPES, CRM_PARTY_TYPE_OPTIONS } from '../crmPartyTypes';
import type { NaicsLoader, NaicsCodeLookup } from '../naics/naicsSearch';
import { sectorForCode } from '../naics/naicsSectorMap';

const AUTHORIZED = { authorized: true, actorEmail: 'banker@bank.com', actorSystemUserId: 'sysuser-1' };

function makeDeps(overrides: Partial<CrmUpdateDeps> = {}): CrmUpdateDeps {
  return {
    updateOrganization: vi.fn(async () => ({ success: true })),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-1' })),
    ...overrides,
  };
}

describe('CRM-G — governed inline edit for a CRM company field', () => {
  it('edits a field and persists it through the governed update + audit (create/edit/update/readback)', async () => {
    const user = userEvent.setup();
    const deps = makeDeps();
    render(
      <CrmOrgFieldInlineEdit organizationId="org-1" field="cr664_website" label="Website" value="old.example.com" actor={AUTHORIZED} deps={deps} />,
    );

    await user.click(screen.getByRole('button', { name: /Website: old.example.com/ }));
    const input = screen.getByLabelText('Edit Website');
    await user.clear(input);
    await user.type(input, 'new.example.com');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(deps.updateOrganization).toHaveBeenCalledWith('org-1', { cr664_website: 'new.example.com' }));
    // Governed audit with actor binding is written on the successful update.
    expect(deps.emitAudit).toHaveBeenCalled();
    const auditPayload = (deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(auditPayload.cr664_actor).toBe('banker@bank.com');
    expect(auditPayload.cr664_entityid).toBe('org-1');
    // Readback: the committed value reflects the saved value + a success status.
    await waitFor(() => expect(screen.getByText('new.example.com')).toBeInTheDocument());
    expect(screen.getByText('Website saved')).toBeInTheDocument();
  });

  it('rolls back to the prior value and shows the reason when the governed update fails', async () => {
    const user = userEvent.setup();
    const deps = makeDeps({ updateOrganization: vi.fn(async () => ({ success: false, error: 'Dataverse rejected the write' })) });
    render(
      <CrmOrgFieldInlineEdit organizationId="org-1" field="cr664_notes" label="Notes" value="keep me" actor={AUTHORIZED} deps={deps} />,
    );

    await user.click(screen.getByRole('button', { name: /Notes: keep me/ }));
    const input = screen.getByLabelText('Edit Notes');
    await user.clear(input);
    await user.type(input, 'broken change');
    await user.keyboard('{Enter}');

    // Rolled back to the prior value; audit never runs after a failed write.
    await waitFor(() => expect(screen.getByText('keep me')).toBeInTheDocument());
    expect(deps.emitAudit).not.toHaveBeenCalled();
    expect(screen.getByText(/The update failed\./)).toBeInTheDocument();
  });

  it('is disabled (no edit) for an unauthorized actor', async () => {
    const deps = makeDeps();
    render(
      <CrmOrgFieldInlineEdit
        organizationId="org-1"
        field="cr664_website"
        label="Website"
        value="site.example.com"
        actor={{ authorized: false }}
        deps={deps}
        disabledReason="Sign-in identity is still resolving; CRM editing will enable shortly."
      />,
    );
    const trigger = screen.getByRole('button', { name: /Website: site.example.com/ });
    expect(trigger).toBeDisabled();
    expect(deps.updateOrganization).not.toHaveBeenCalled();
  });

  // ── Controlled inputs: parity with the create flow (no arbitrary free text on bounded domains) ──

  it('Type / party role edits through a controlled <select> over the party-type enum (no free text)', async () => {
    const user = userEvent.setup();
    const deps = makeDeps();
    render(
      <CrmOrgFieldInlineEdit
        organizationId="org-1"
        field="cr664_organizationtype"
        label="Type (party role)"
        value="Borrower"
        control="select"
        options={CRM_PARTY_TYPE_OPTIONS}
        actor={AUTHORIZED}
        deps={deps}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Type \(party role\): Borrower/ }));
    const control = screen.getByLabelText('Edit Type (party role)');
    // The editor is a SELECT (not a free-text box) — arbitrary typed values are structurally impossible.
    expect(control.tagName).toBe('SELECT');
    expect(screen.queryByRole('textbox')).toBeNull();
    // Its options are exactly the governed party-type list; the existing value is selected.
    const optionValues = Array.from(control.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    expect(optionValues).toEqual([...CRM_PARTY_TYPES]);
    expect((control as HTMLSelectElement).value).toBe('Borrower');

    // Picking a different valid option routes through the governed adapter with the enum value.
    await user.selectOptions(control, 'Guarantor');
    await waitFor(() => expect(deps.updateOrganization).toHaveBeenCalledWith('org-1', { cr664_organizationtype: 'Guarantor' }));
    expect(deps.emitAudit).toHaveBeenCalled();
  });

  it('an unknown legacy Type is shown honestly, but the only alternative choices are valid party types', async () => {
    const user = userEvent.setup();
    const deps = makeDeps();
    render(
      <CrmOrgFieldInlineEdit
        organizationId="org-1"
        field="cr664_organizationtype"
        label="Type (party role)"
        value="CRE" /* legacy free-text value not on the enum */
        control="select"
        options={CRM_PARTY_TYPE_OPTIONS}
        actor={AUTHORIZED}
        deps={deps}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Type \(party role\): CRE/ }));
    const control = screen.getByLabelText('Edit Type (party role)') as HTMLSelectElement;
    // The legacy value is displayed honestly as the current selection...
    expect(control.value).toBe('CRE');
    expect(screen.getByText(/CRE — current \(non-standard\)/)).toBeInTheDocument();
    // ...but every OTHER option is an on-list party type — a change can only land on a valid value.
    const changeable = Array.from(control.querySelectorAll('option'))
      .map((o) => (o as HTMLOptionElement).value)
      .filter((v) => v !== 'CRE');
    expect(changeable).toEqual([...CRM_PARTY_TYPES]);
  });

  it('NAICS edits through the shared picker: a confirmed 6-digit code shows the derived sector and saves', async () => {
    const user = userEvent.setup();
    const deps = makeDeps();
    const loader: NaicsLoader = async () => ({
      status: 'ready',
      rows: [{ cr664_code: '561110', cr664_title: 'Office Administrative Services' }],
    });
    const findByCode: NaicsCodeLookup = async () => null;
    render(
      <CrmOrgFieldInlineEdit
        organizationId="org-1"
        field="cr664_naicscode"
        label="NAICS code"
        value=""
        control="naics"
        naicsLoader={loader}
        naicsFindByCode={findByCode}
        actor={AUTHORIZED}
        deps={deps}
      />,
    );

    await user.click(screen.getByRole('button', { name: /NAICS code: empty/ }));
    const combo = screen.getByRole('combobox', { name: /Industry \(NAICS\)|NAICS code/ });
    await user.type(combo, 'office');
    // Pick the confirmed reference hit.
    const option = await screen.findByRole('option', { name: /561110/ });
    await user.click(option);

    // Derived sector is previewed before save — from sectorForCode, never fabricated.
    const expectedSector = sectorForCode('561110');
    const preview = await screen.findByText(/Derived Industry:/);
    expect(preview).toHaveAttribute('data-crm-naics-sector-preview');
    expect(preview.textContent).toContain(expectedSector!.sectorTitle);

    // Save routes the confirmed 6-digit code through the governed adapter.
    await user.click(screen.getByText('Save NAICS'));
    await waitFor(() => expect(deps.updateOrganization).toHaveBeenCalledWith('org-1', { cr664_naicscode: '561110' }));
  });

  it('NAICS rejects a non-six-digit entry: Save stays disabled and the write adapter is never called', async () => {
    const user = userEvent.setup();
    const deps = makeDeps();
    const loader: NaicsLoader = async () => ({ status: 'ready', rows: [{ cr664_code: '561110', cr664_title: 'Office Administrative Services' }] });
    const findByCode: NaicsCodeLookup = async () => null;
    render(
      <CrmOrgFieldInlineEdit
        organizationId="org-1"
        field="cr664_naicscode"
        label="NAICS code"
        value=""
        control="naics"
        naicsLoader={loader}
        naicsFindByCode={findByCode}
        actor={AUTHORIZED}
        deps={deps}
      />,
    );

    await user.click(screen.getByRole('button', { name: /NAICS code: empty/ }));
    const combo = screen.getByRole('combobox', { name: /Industry \(NAICS\)|NAICS code/ });
    await user.type(combo, '72'); // not six digits, never a confirmed selection
    // The picker shows an honest bad-format message and Save is disabled.
    expect(await screen.findByText(/valid six-digit NAICS code/i)).toBeInTheDocument();
    const save = screen.getByText('Save NAICS');
    expect(save).toBeDisabled();
    await user.click(save);
    expect(deps.updateOrganization).not.toHaveBeenCalled();
  });

  it('the delivery ledger records inline edit as wired', () => {
    expect(CRM_TEAM_READINESS_LEDGER.inlineEditWired).toBe(true);
    expect(CRM_TEAM_READINESS_LEDGER.liveCreateWired).toBe(true);
  });
});
