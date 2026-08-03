import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
const naics=read('scripts/seed-naics.mjs');
const catalog=read('scripts/dataverse/seed-production-reference-catalog.ps1');
const governance=read('scripts/dataverse/provision-approved-option-a-governance.ps1');

describe('Production Dataverse remediation contract',()=>{
  it('uses GUID-addressed NAICS writes with duplicate detection and exact counts',()=>{
    expect(naics).toContain('Duplicate NAICS natural keys block seeding');
    expect(naics).toContain('cr664_naicscodes(${action.id})');
    expect(naics).not.toContain('cr664_naicscodes(cr664_code=');
    expect(naics).toContain('PLAN create=${counts.create} update=${counts.update} no-op=${counts.noop}');
  });
  it('locks catalog writes to Commercial LOS Production and stays dry-run by default',()=>{
    expect(catalog).toContain('https://org8c12c949.crm.dynamics.com');
    expect(catalog).toContain('afec9c13-e5c5-eea6-b1f7-3f51abb7571d');
    expect(catalog).not.toMatch(/Method Delete/i);
    expect(catalog).toContain('PASS risk rating');
  });
  it('contains the approved missing role and workspace catalog only',()=>{
    for(const name of ['Credit Approver','Funding Approver','Boarding Servicing Operator','Team Workspace','Portfolio Management']){
      expect(catalog).toContain(name);
    }
    expect(catalog).not.toContain('PHASE121_STAGE');
  });
  it('keeps Option A hash gates and reports exact results',()=>{
    expect(governance).toContain('Policy artifact hash mismatch.');
    expect(governance).toContain('Authority artifact hash mismatch.');
    expect(governance).toContain('RESULT governance create=');
  });
});
