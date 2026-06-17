import { describe, it, expect } from 'vitest';
import {
  buildCrmRelationshipInput,
  CRM_NAME_REF_PREFIX,
  type CrmRelationshipInputSource,
} from './buildCrmRelationshipInput';
import { deriveCrmRelationshipViewModel } from './crmRelationshipViewModel';

/**
 * Phase 189C — pure input-builder behavior. The builder maps an authorized
 * deal/workspace context into the view-model input without inventing edges.
 */

const base: CrmRelationshipInputSource = {
  deal: { id: 'deal-1', name: 'Acme Term Loan' },
  clientName: 'Acme Holdings LLC',
  assignedBanker: { id: 'banker-1', name: 'Dana Banker', email: 'dana@bank.example' },
};

describe('deal anchor', () => {
  it('maps the deal id and name', () => {
    const input = buildCrmRelationshipInput(base);
    expect(input.deal).toEqual({ id: 'deal-1', name: 'Acme Term Loan' });
  });

  it('passes a null deal straight through (no anchor)', () => {
    const input = buildCrmRelationshipInput({ ...base, deal: null });
    expect(input.deal).toBeNull();
  });
});

describe('canonical client', () => {
  it('uses a name-prefixed surrogate id when only a name is known', () => {
    const input = buildCrmRelationshipInput(base);
    expect(input.client?.id).toBe(`${CRM_NAME_REF_PREFIX}Acme Holdings LLC`);
    expect(input.client?.name).toBe('Acme Holdings LLC');
    // Never claims a verified lookup it did not probe.
    expect(input.client?.lookupClassification).toBe('unknown');
  });

  it('prefers a real client id over the name surrogate', () => {
    const input = buildCrmRelationshipInput({ ...base, clientId: 'client-guid-1' });
    expect(input.client?.id).toBe('client-guid-1');
    expect(input.client?.id.startsWith(CRM_NAME_REF_PREFIX)).toBe(false);
  });

  it('emits no client when neither id nor name is known', () => {
    const input = buildCrmRelationshipInput({ deal: base.deal, assignedBanker: base.assignedBanker });
    expect(input.client).toBeNull();
  });
});

describe('assigned banker / team / platform user', () => {
  it('maps the assigned banker with its real id', () => {
    const input = buildCrmRelationshipInput(base);
    expect(input.assignedBanker?.id).toBe('banker-1');
    expect(input.assignedBanker?.email).toBe('dana@bank.example');
  });

  it('omits team and platform-user edges the caller did not supply', () => {
    const input = buildCrmRelationshipInput(base);
    expect(input.team).toBeNull();
    expect(input.platformUser).toBeNull();
  });

  it('maps team and platform-user when supplied', () => {
    const input = buildCrmRelationshipInput({
      ...base,
      team: { id: 'team-1', name: 'Commercial East' },
      platformUser: { id: 'pu-1', primaryWorkspaceId: 'ws-1' },
    });
    expect(input.team?.id).toBe('team-1');
    expect(input.platformUser?.primaryWorkspaceId).toBe('ws-1');
  });
});

describe('end-to-end with the view-model', () => {
  it('a deal + client(name) + banker but no team derives a partial status with a team edge to wire', () => {
    const vm = deriveCrmRelationshipViewModel(buildCrmRelationshipInput(base));
    expect(vm.relationshipStatus).toBe('partial');
    expect(vm.canonicalClient?.kind).toBe('borrower_client_stub');
    expect(vm.missingRelationshipEdges.some((m) => m.edge === 'Deal → Team')).toBe(true);
    // Render-before-seed is preserved through the builder path.
    expect(vm.recommendedNextActions[0].kind).toBe('render_existing_graph');
  });

  it('a fully-supplied real-lookup graph derives ready', () => {
    const vm = deriveCrmRelationshipViewModel(
      buildCrmRelationshipInput({
        deal: { id: 'd', name: 'Deal' },
        clientId: 'c',
        clientName: 'Client',
        clientLookupClassification: 'real-lookup',
        team: { id: 't', name: 'Team', lookupClassification: 'real-lookup' },
        assignedBanker: { id: 'b', name: 'Banker', teamId: 't', lookupClassification: 'real-lookup' },
      }),
    );
    expect(vm.relationshipStatus).toBe('ready');
  });

  it('no deal anchor derives blocked', () => {
    const vm = deriveCrmRelationshipViewModel(buildCrmRelationshipInput({ ...base, deal: null }));
    expect(vm.relationshipStatus).toBe('blocked');
  });
});
