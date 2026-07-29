import { describe, expect, it } from 'vitest';
import { buildCrmCopilotContext } from './crmCopilotContext';
import type { CrmWorkspaceData } from '../workspace/crmWorkspaceData';
const ready = (records: readonly any[] = []) => ({ status:'ready' as const, records });
const data = (): CrmWorkspaceData => ({ organizations:ready(),people:ready(),relationships:ready(),roleAssignments:ready(),contactPoints:ready(),communicationPreferences:ready(),contactAuthorizations:ready(),vendorProfiles:ready(),timelineEvents:ready(),auditEntries:ready() });
describe('CRM-7 governed Copilot context', () => {
  it('uses only already-loaded CRM facts with source and freshness labels', () => {
    const ctx = buildCrmCopilotContext(data(),'banker','Dana');
    expect(ctx.sources.every((s) => Boolean(s.source) && Boolean(s.freshness))).toBe(true);
    expect(ctx.boundary).toBe('read-only-proposal');
  });
  it('does not turn missing opportunity schema into a fake pipeline fact', () => {
    expect(buildCrmCopilotContext(data(),'manager','Morgan').sources.some((s) => /opportun/i.test(s.label))).toBe(false);
  });
});
