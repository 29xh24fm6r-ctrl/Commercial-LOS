import { describe, expect, it } from 'vitest';
import { deriveCrmHome, searchCrm } from './crmWorkspaceSelectors';
import type { CrmWorkspaceData } from '../workspace/crmWorkspaceData';

const ready = (records: never[] | readonly any[] = []) => ({ status: 'ready' as const, records });
function data(overrides: Partial<CrmWorkspaceData> = {}): CrmWorkspaceData {
  return {
    organizations: ready(), people: ready(), relationships: ready(), roleAssignments: ready(),
    contactPoints: ready(), communicationPreferences: ready(), contactAuthorizations: ready(),
    vendorProfiles: ready(), timelineEvents: ready(), auditEntries: ready(), ...overrides,
  };
}
const record = (id:string,title:string,extra:Record<string,unknown>={}) => ({ id,title,detail:[],...extra });

describe('CRM-2 command center truth', () => {
  it('derives attention only from missing links and dated activity', () => {
    const model = deriveCrmHome(data({ organizations: ready([record('o1','Atlas')]), timelineEvents: ready([]) }), new Date('2026-07-29T12:00:00Z'));
    expect(model.companyCount).toBe(1);
    expect(model.attention.map((i) => i.kind).sort()).toEqual(['missing-contact','no-recent-contact']);
  });
  it('marks a failed domain unknown rather than zero', () => {
    const model = deriveCrmHome(data({ organizations: { status:'failed',records:[],error:'denied' } }));
    expect(model.companyCount).toBeUndefined();
    expect(model.partialDomains).toContain('organizations');
  });
  it('ranks exact title ahead of token matches deterministically', () => {
    const d = data({ organizations: ready([record('1','Atlas'),record('2','Atlas Holdings')]) });
    expect(searchCrm(d,'atlas').map((r) => r.record.id)).toEqual(['1','2']);
  });
});
