import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const model = readFileSync(
  resolve(process.cwd(), 'src/generated/models/Cr664_documentchecklistsModel.ts'),
  'utf8',
);

describe('Production GO — document requirement SDK regeneration', () => {
  it('declares every persisted lifecycle field and actor lookup', () => {
    for (const field of [
      'cr664_requirementstatus',
      'cr664_required',
      'cr664_acknowledged',
      'cr664_acknowledgeddate',
      'cr664_revieweddate',
      'cr664_waived',
      'cr664_waiverreason',
      '"cr664_AcknowledgedBy@odata.bind"',
      '"cr664_ReceivedBy@odata.bind"',
      '_cr664_acknowledgedby_value',
      '_cr664_receivedby_value',
    ]) {
      expect(model).toContain(field);
    }
  });

  it('retains the real Dataverse File column upload contract', () => {
    expect(model).toContain("Cr664_documentchecklistsUploadColumnName = 'cr664_documentfile'");
  });
});
