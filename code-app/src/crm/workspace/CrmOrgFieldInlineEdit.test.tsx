// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrmOrgFieldInlineEdit } from './CrmOrgFieldInlineEdit';
import type { CrmUpdateDeps } from '../write/crmUpdateAdapter';
import { CRM_TEAM_READINESS_LEDGER } from '../readiness/unifiedCrmReadiness';

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

  it('the delivery ledger records inline edit as wired', () => {
    expect(CRM_TEAM_READINESS_LEDGER.inlineEditWired).toBe(true);
    expect(CRM_TEAM_READINESS_LEDGER.liveCreateWired).toBe(true);
  });
});
