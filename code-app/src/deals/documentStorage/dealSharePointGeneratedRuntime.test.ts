import { describe, expect, it, vi } from 'vitest';
vi.mock('../../generated/services/OGBOriginationSharePointTransportService', () => ({
  OGBOriginationSharePointTransportService: { Run: vi.fn() },
}));
import type { PowerAutomateTransportRequest } from '../../../microsoft365/sharepoint-transport/power-automate/activationContract';
import { createGeneratedOgbSharePointTransportRunner, OGB_SHAREPOINT_GENERATED_METHOD, OGB_SHAREPOINT_GENERATED_PARAMETERS, OGB_SHAREPOINT_GENERATED_SERVICE, toGeneratedTransportInput } from './dealSharePointGeneratedRuntime';

const request: PowerAutomateTransportRequest = { operation: 'upload', dealId: '11111111-1111-4111-8111-111111111111', correlationId: 'corr-1', idempotencyKey: 'idem-1', annualFolderName: '2026 Loans', folderName: 'Borrower LLC', fileName: 'request.pdf', mimeType: 'application/pdf', contentSha256: 'a'.repeat(64), expectedSize: 3, fileContent: { name: 'request.pdf', contentBytes: 'AQID' }, requestFingerprint: 'b'.repeat(64) };

describe('platform-generated SharePoint transport runner', () => {
  it('uses the exact inspected service, method, parameters, and trigger mapping', () => {
    expect(OGB_SHAREPOINT_GENERATED_SERVICE).toBe('OGBOriginationSharePointTransportService');
    expect(OGB_SHAREPOINT_GENERATED_METHOD).toBe('Run');
    expect(OGB_SHAREPOINT_GENERATED_PARAMETERS).toEqual(['text','text_1','text_2','text_3','text_4','text_5','text_6','text_7','text_8','text_9','text_10','number','file','text_11']);
    expect(toGeneratedTransportInput(request)).toEqual({ text: 'upload', text_1: request.dealId, text_2: 'corr-1', text_3: 'idem-1', text_4: '2026 Loans', text_5: 'Borrower LLC', text_6: 'request.pdf', text_7: 'application/pdf', text_8: 'a'.repeat(64), text_9: '', text_10: '', number: 3, file: { name: 'request.pdf', contentBytes: 'AQID' }, text_11: 'b'.repeat(64) });
  });
  it('returns only the parsed strict response envelope', async () => {
    const envelope = { status: 'DRY_RUN_COMPLETED' };
    const run = vi.fn(async () => ({ success: true, data: { transportresponse: JSON.stringify(envelope) } } as never));
    await expect(createGeneratedOgbSharePointTransportRunner(run).run(request)).resolves.toEqual(envelope);
    expect(run).toHaveBeenCalledOnce();
  });
  it('fails closed on operation failure, missing output, and malformed JSON', async () => {
    await expect(createGeneratedOgbSharePointTransportRunner(async () => ({ success: false, error: new Error('denied') } as never)).run(request)).rejects.toThrow('RUN_FAILED');
    await expect(createGeneratedOgbSharePointTransportRunner(async () => ({ success: true, data: {} } as never)).run(request)).rejects.toThrow('MALFORMED_PLATFORM_RESPONSE');
    await expect(createGeneratedOgbSharePointTransportRunner(async () => ({ success: true, data: { transportresponse: '{' } } as never)).run(request)).rejects.toThrow('MALFORMED_PLATFORM_RESPONSE');
  });
});
