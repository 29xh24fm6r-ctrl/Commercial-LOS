import{describe,expect,it}from'vitest';import{readFileSync}from'node:fs';import{resolve}from'node:path';
const read=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8');
describe('CRM-10 certification locks',()=>{
 it('mounts CRM as a first-class route and retains all required navigation sections',()=>{expect(read('src/App.tsx')).toMatch(/WORKSPACE_ROUTES\.crm/);for(const section of ['home','companies','people','relationships','opportunities','activities','referrals','calendar','tasks','insights','reports'])expect(read('src/crm/firstClass/crmWorkspaceModel.ts')).toContain(`'${section}'`)});
 it('keeps growth writes fail closed and Copilot non-autonomous',()=>{expect(read('src/crm/firstClass/crmGrowthModel.ts')).toMatch(/verified:\s*false/);expect(read('src/crm/firstClass/CrmCopilotSurface.tsx')).toContain('cannot modify CRM records')});
 it('contains no seeded demo fixture or fake metric in runtime CRM files',()=>{const runtime=read('src/crm/firstClass/CrmExperience.tsx')+read('src/crm/firstClass/crmWorkspaceSelectors.ts');expect(runtime).not.toMatch(/mockData|fakeData|demoRecords|relationshipScore/)});
});
