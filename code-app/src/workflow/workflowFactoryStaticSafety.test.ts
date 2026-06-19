import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

describe('workflow factory static safety', () => {
  it('command center imports no write or borrower transport adapters', () => {
    const source = read('src/workflow/LoanWorkflowCommandCenter.tsx');
    expect(source).not.toMatch(/sendDocumentRequestEmail|sendBorrowerUpdateEmail|Office365Outlook|Twilio|Service\.create|Service\.update/);
  });

  it('borrower package prep renders no send adapter or send button copy', () => {
    const source = read('src/workflow/BorrowerPackagePrepPanel.tsx');
    expect(source).not.toMatch(/sendDocumentRequestEmail|sendBorrowerUpdateEmail|Office365Outlook|Twilio/);
    expect(source).not.toMatch(/Send package|Send email|Send SMS/);
  });
});
