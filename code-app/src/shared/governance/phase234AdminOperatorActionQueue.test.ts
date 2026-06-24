import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveAdminOperatorActionQueueModel } from '../../admin/adminOperatorActionQueueModel';

const SRC = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

const FILES = [
  '../../admin/adminOperatorActionQueueModel.ts',
  '../../admin/AdminOperatorActionQueue.tsx',
];

describe('Phase 234 — admin operator action queue go-live blocker clearing contract', () => {
  it('is mounted in the admin workspace', () => {
    const ws = SRC('../../workspaces/AdminWorkspace.tsx');
    expect(ws).toMatch(/import \{ AdminOperatorActionQueue \}/);
    expect(ws).toMatch(/<AdminOperatorActionQueue \/>/);
  });

  it('ties together every go-live blocker category', () => {
    const vm = deriveAdminOperatorActionQueueModel();
    expect(vm.groups.map((g) => g.id)).toEqual(
      expect.arrayContaining([
        'crm-los-activation',
        'new-deal-create',
        'document-checklist',
        'borrower-communication',
        'crm-writeback',
        'portfolio-boarding',
        'launch-readiness',
      ]),
    );
  });

  it('is read-only first: no write primitives, fetches, SDK calls, external sync, or borrower sends', () => {
    for (const file of FILES) {
      const src = SRC(file);
      expect(src, file).not.toMatch(/\bfetch\s*\(/);
      expect(src, file).not.toMatch(/XMLHttpRequest/);
      expect(src, file).not.toMatch(/graph\.microsoft\.com/i);
      expect(src, file).not.toMatch(/\bcreateRecord\b|\bupdateRecord\b|\bdeleteRecord\b/i);
      expect(src, file).not.toMatch(/\bsendMail\b|\bsendBorrower/i);
      expect(src, file).not.toMatch(/@microsoft\/power-apps/);
      expect(src, file).not.toMatch(/from ['"][^'"]*\/generated\//);
    }
  });

  it('does not widen routes/permissions and flips no gate (projection only)', () => {
    const modelSrc = SRC('../../admin/adminOperatorActionQueueModel.ts');
    // It reads the existing readiness derivations; it does not re-assign feature flags.
    expect(modelSrc).toMatch(/deriveEliteCrmLosActivationReadiness/);
    expect(modelSrc).toMatch(/deriveFullSystemLaunchReadiness/);
    expect(modelSrc).not.toMatch(/_ENABLED\s*=/);
    for (const file of FILES) {
      expect(SRC(file), file).not.toMatch(/grantEntitlement|grantRole|addRole|securityRole/i);
    }
  });

  it('implies no external Salesforce / nCino vendor dependency (asserts the negation, not the term)', () => {
    const vm = deriveAdminOperatorActionQueueModel();
    // The approved pattern: certify the negation explicitly. Vendor terms must not
    // appear anywhere EXCEPT that "No external Salesforce or nCino …" certification.
    expect(vm.certifications.join(' ')).toMatch(/No external Salesforce or nCino/i);
    const withoutCerts = JSON.stringify({ ...vm, certifications: [] });
    expect(withoutCerts).not.toMatch(/salesforce|ncino/i);
  });
});
