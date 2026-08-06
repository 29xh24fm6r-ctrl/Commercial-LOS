import { describe, expect, it } from 'vitest';
import { sha256Hex, type PowerAutomateTransportRequest } from '../power-automate/activationContract.js';
import {
  TestOnlyInMemoryDryRunLedger,
  executeGovernedDryRun,
  type DurableDryRunLedger,
} from '../power-automate/dryRunEngine.js';

const dealId = '11111111-1111-4111-8111-111111111111';
const authorization = {
  actorUpn: 'banker@oldglorybank.com',
  activePlatformUserCount: 1,
  activeBankerIds: ['banker-1'],
  dealExists: true,
  assignedBankerId: 'banker-1',
};
const now = () => '2026-08-06T12:00:00.000Z';
const folderRequest = (): PowerAutomateTransportRequest => ({
  operation: 'ensureFolder', dealId, correlationId: 'corr-folder',
  idempotencyKey: 'dry-run:folder:' + dealId,
  annualFolderName: '2026 Loans', folderName: 'Borrower LLC',
});
async function uploadRequest(bytes = new Uint8Array([1, 2, 3])): Promise<PowerAutomateTransportRequest> {
  const binary = String.fromCharCode(...bytes);
  return {
    operation: 'upload', dealId, correlationId: 'corr-upload',
    idempotencyKey: 'dry-run:upload:' + dealId + ':document-1',
    annualFolderName: '2026 Loans', folderName: 'Borrower LLC', fileName: 'financials.pdf',
    mimeType: 'application/pdf', fileContent: { name: 'financials.pdf', contentBytes: btoa(binary) },
    contentSha256: await sha256Hex(bytes), expectedSize: bytes.byteLength,
  };
}

describe('governed DRY_RUN engine', () => {
  it('completes validation durably without producing any SharePoint identity', async () => {
    const ledger = new TestOnlyInMemoryDryRunLedger();
    const result = await executeGovernedDryRun({ request: await uploadRequest(), authorization }, { ledger, now });
    expect(result).toMatchObject({
      success: false, validationOnly: true, status: 'DRY_RUN_COMPLETED',
      created: false, sharePointItemId: '', webUrl: '', fileMayExist: false,
    });
    const row = await ledger.read(result.idempotencyKey);
    expect(row?.transitions.map((item) => item.status)).toEqual(['STARTED', 'DRY_RUN_COMPLETED']);
    expect(row?.actorUpn).toBe(authorization.actorUpn);
  });

  it('returns byte-for-byte stable evidence for duplicate completed requests', async () => {
    const ledger = new TestOnlyInMemoryDryRunLedger();
    const request = await uploadRequest();
    const first = await executeGovernedDryRun({ request, authorization }, { ledger, now });
    const second = await executeGovernedDryRun({ request, authorization }, { ledger, now: () => '2030-01-01T00:00:00Z' });
    expect(second).toEqual(first);
  });

  it('atomically reserves one concurrent request and never produces two rows', async () => {
    const ledger = new TestOnlyInMemoryDryRunLedger();
    const request = folderRequest();
    const results = await Promise.all([
      executeGovernedDryRun({ request, authorization }, { ledger, now }),
      executeGovernedDryRun({ request, authorization }, { ledger, now }),
    ]);
    expect(results).toHaveLength(2);
    expect(results[1]).toEqual(results[0]);
    const row = await ledger.read(request.idempotencyKey);
    expect(row?.transitions.map((item) => item.status)).toEqual(['STARTED', 'DRY_RUN_COMPLETED']);
  });

  it('rejects an idempotency collision for different same-size content', async () => {
    const ledger = new TestOnlyInMemoryDryRunLedger();
    const first = await uploadRequest(new Uint8Array([1, 2, 3]));
    const second = { ...(await uploadRequest(new Uint8Array([3, 2, 1]))), idempotencyKey: first.idempotencyKey };
    await executeGovernedDryRun({ request: first, authorization }, { ledger, now });
    const collision = await executeGovernedDryRun({ request: second, authorization }, { ledger, now });
    expect(collision.errorCode).toBe('IDEMPOTENCY_COLLISION');
    expect(second.contentSha256).not.toBe(first.contentSha256);
  });

  it.each([
    [{ ...authorization, actorUpn: undefined }, 'ACTOR_IDENTITY_CONTEXT_UNAVAILABLE'],
    [{ ...authorization, activePlatformUserCount: 2 }, 'ACTOR_IDENTITY_AMBIGUOUS'],
    [{ ...authorization, assignedBankerId: 'another-banker' }, 'DEAL_ACCESS_DENIED'],
  ])('fails closed for actor/deal authorization', async (facts, code) => {
    const result = await executeGovernedDryRun({ request: folderRequest(), authorization: facts }, { ledger: new TestOnlyInMemoryDryRunLedger(), now });
    expect(result.errorCode).toBe(code);
  });

  it('rejects invalid governed paths before reserving the ledger', async () => {
    const ledger = new TestOnlyInMemoryDryRunLedger();
    const request = { ...folderRequest(), folderName: '../escape' };
    const result = await executeGovernedDryRun({ request, authorization }, { ledger, now });
    expect(result.errorCode).toBe('INVALID_REQUEST');
    expect(await ledger.read(request.idempotencyKey)).toBeUndefined();
  });

  it('fails closed when durable reservation is unavailable and has no production memory fallback', async () => {
    const ledger: DurableDryRunLedger = {
      storeId: 'cr664_sharepointtransportledger',
      async healthCheck() { return false; },
      async reserve() { throw new Error('not called'); },
      async complete() { throw new Error('not called'); },
      async fail() { throw new Error('not called'); },
      async read() { return undefined; },
    };
    const result = await executeGovernedDryRun({ request: folderRequest(), authorization }, { ledger, now });
    expect(result.errorCode).toBe('LEDGER_UNAVAILABLE');
  });
});
