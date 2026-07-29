import { describe,expect,it,vi } from 'vitest';
import { executeCrmGrowthWrite, type CrmGrowthWriteCommand, type CrmGrowthWriteTransport } from './crmGrowthWriteAdapter';
const command:CrmGrowthWriteCommand={entity:'opportunity',operation:'create',actorSystemUserId:'u1',correlationId:'crm-20260729-001',payload:{name:'Working capital'}};
const transport=():CrmGrowthWriteTransport=>({findByCorrelation:vi.fn().mockResolvedValue(undefined),execute:vi.fn().mockResolvedValue({accepted:true,recordId:'o1'}),readBack:vi.fn().mockResolvedValue(true),audit:vi.fn().mockResolvedValue('a1'),timeline:vi.fn().mockResolvedValue('t1')});
describe('CRM-8 governed growth writes',()=>{
  it('fails closed before schema and authorization',async()=>{expect((await executeCrmGrowthWrite(command,{schemaVerified:false,authorized:true})).kind).toBe('blocked');expect((await executeCrmGrowthWrite(command,{schemaVerified:true,authorized:false})).kind).toBe('blocked')});
  it('deduplicates by correlation ID before write',async()=>{const t=transport();vi.mocked(t.findByCorrelation).mockResolvedValue('existing');expect((await executeCrmGrowthWrite(command,{schemaVerified:true,authorized:true,transport:t})).kind).toBe('duplicate');expect(t.execute).not.toHaveBeenCalled()});
  it('distinguishes accepted from confirmed and requires audit plus timeline',async()=>{const t=transport();expect(await executeCrmGrowthWrite(command,{schemaVerified:true,authorized:true,transport:t})).toMatchObject({kind:'confirmed',auditId:'a1',timelineEventId:'t1'});vi.mocked(t.readBack).mockResolvedValue(false);expect((await executeCrmGrowthWrite({...command,correlationId:'crm-20260729-002'},{schemaVerified:true,authorized:true,transport:t})).kind).toBe('accepted-unconfirmed')});
});
