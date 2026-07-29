import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('product-wide governed Copilot coverage', () => {
  it.each([
    ['banker command center', 'src/banker/BankerShell.tsx', 'BankerCopilotSurface'],
    ['banker deal workspace', 'src/deals/BankerDealWorkspace.tsx', 'DealCopilotAssist'],
    ['CRM workspace', 'src/crm/firstClass/CrmExperience.tsx', 'CrmCopilotSurface'],
    ['team workspace', 'src/team/TeamOpsQueue.tsx', 'CopilotAssistPanel'],
    ['manager workspace', 'src/manager/ManagerBloombergControlPanel.tsx', 'CopilotAssistPanel'],
    ['portfolio workspace', 'src/portfolio/PortfolioCommandCenter.tsx', 'CopilotAssistPanel'],
    ['executive workspace', 'src/executive/ExecutiveCommandCenter.tsx', 'CopilotAssistPanel'],
    ['admin workspace', 'src/workspaces/AdminWorkspace.tsx', 'AdminCopilotSurface'],
  ])('%s has a contextual Copilot mount', (_name, path, marker) => {
    expect(read(path)).toContain(marker);
  });

  it('exposes CRM Copilot beside the shared command bar, not only on Insights', () => {
    const source = read('src/crm/firstClass/CrmExperience.tsx');
    expect(source).toMatch(/<CrmCopilotSurface[\s\S]*section === 'home'/);
    expect(source).not.toMatch(/section === 'insights'[\s\S]{0,120}<CrmCopilotSurface/);
  });

  it('keeps all new surfaces gated on a genuinely live connector', () => {
    for (const path of [
      'src/copilot/BankerCopilotSurface.tsx',
      'src/copilot/AdminCopilotSurface.tsx',
      'src/crm/firstClass/CrmCopilotSurface.tsx',
    ]) {
      expect(read(path)).toMatch(/isCopilotSurfaceLive\(\)/);
    }
  });

  it('models CRM and admin as first-class Copilot workspaces', () => {
    const contract = JSON.parse(read('microsoft365/copilot-studio/agent-contract.json')) as {
      supportedSurfaces: Array<{ workspace: string }>;
    };
    const roles = contract.supportedSurfaces.map((surface) => surface.workspace);
    expect(roles).toContain('crm');
    expect(roles).toContain('admin');
  });
});
