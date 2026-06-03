import { describe, it, expect } from 'vitest';
import { buildWorkspaceCopilotContext } from './workspaceCopilotContext';

describe('Phase 129A — workspaceCopilotContext', () => {
  it('maps workspace input to context', () => {
    const ctx = buildWorkspaceCopilotContext({
      workspaceRole: 'manager',
      userName: 'M. Paller',
      teamName: 'East Team',
      deals: [
        { id: 'd1', name: 'Acme WC', stage: 'Underwriting' },
        { id: 'd2', name: 'Beta Refi', stage: 'Closing' },
      ],
      urgentItems: [{ label: 'Overdue task' }],
      kpiSummaries: ['Pipeline: $10M'],
    });

    expect(ctx.workspaceRole).toBe('manager');
    expect(ctx.userName).toBe('M. Paller');
    expect(ctx.teamName).toBe('East Team');
    expect(ctx.dealCount).toBe(2);
    expect(ctx.urgentItemCount).toBe(1);
    expect(ctx.kpiSummaries).toEqual(['Pipeline: $10M']);
  });

  it('context contains no raw GUIDs from deals', () => {
    const ctx = buildWorkspaceCopilotContext({
      workspaceRole: 'banker',
      userName: undefined,
      teamName: undefined,
      deals: [{ id: 'guid-abc-123', name: 'Test', stage: undefined }],
      urgentItems: [],
      kpiSummaries: [],
    });

    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain('guid-abc-123');
  });

  it('handles empty inputs', () => {
    const ctx = buildWorkspaceCopilotContext({
      workspaceRole: 'team',
      userName: undefined,
      teamName: undefined,
      deals: [],
      urgentItems: [],
      kpiSummaries: [],
    });

    expect(ctx.dealCount).toBe(0);
    expect(ctx.urgentItemCount).toBe(0);
    expect(ctx.kpiSummaries).toEqual([]);
  });
});
