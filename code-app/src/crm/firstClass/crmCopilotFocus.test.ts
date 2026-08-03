import { describe, expect, it } from 'vitest';
import { buildCrmCopilotContext } from './crmCopilotContext';
import type { CrmWorkspaceData } from '../workspace/crmWorkspaceData';

const empty = { status: 'ready', records: [] } as const;
const data = {
  organizations: empty, people: empty, contactPoints: empty, relationships: empty,
  roleAssignments: empty, communicationPreferences: empty, contactAuthorizations: empty,
  vendorProfiles: empty, timelineEvents: empty, auditEntries: empty,
} as unknown as CrmWorkspaceData;

describe('focused CRM Copilot context', () => {
  it('identifies the authorized company or person record without inferring facts', () => {
    const context = buildCrmCopilotContext(data, 'crm', 'Banker', { kind: 'Company', id: 'company-1', title: 'Example Co' });
    expect(context.sources[0]).toMatchObject({ type: 'CRM record', label: 'Focused Company: Example Co' });
    expect(context.workspace.kpiSummaries[0]).toContain('Example Co');
  });
});
