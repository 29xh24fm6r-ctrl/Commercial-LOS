import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  evaluateLifecycleBeforeWrite,
  LIFECYCLE_RUNTIME_BOUNDARIES,
  validateLifecycleRuntimeBoundaries,
} from './lifecycleGovernanceIntegration';

describe('lifecycle runtime integration contract', () => {
  it('covers all thirteen client/server mutation boundaries without weakening legacy controls', () => {
    expect(LIFECYCLE_RUNTIME_BOUNDARIES).toHaveLength(13);
    expect(validateLifecycleRuntimeBoundaries()).toEqual([]);
    expect(LIFECYCLE_RUNTIME_BOUNDARIES.every((item) => item.legacyControlRetained)).toBe(true);
  });

  it('defaults to legacy-only when no runtime governance dependency is injected', async () => {
    await expect(evaluateLifecycleBeforeWrite('renewal', undefined, {
      allowed: true,
      evidenceIds: ['legacy-review-control'],
    })).resolves.toMatchObject({
      allowed: true,
      authoritativeBasis: 'LEGACY',
      trace: { mode: 'LEGACY_ONLY', configurableAvailable: false },
    });
  });

  it('pins the TypeScript lifecycle vocabulary and v2 contract to the C# server', () => {
    const engineSource = readFileSync(
      'dataverse-plugins/CommercialLendingLOS.Plugins/BankCreditGovernanceEngine.cs',
      'utf8',
    );
    const serverSource = readFileSync(
      'dataverse-plugins/CommercialLendingLOS.Plugins/BankCreditGovernanceServer.cs',
      'utf8',
    );
    for (const action of [
      'Originate', 'Underwrite', 'Recommend', 'Approve', 'ApproveException',
      'Commit', 'Close', 'AuthorizeFunding', 'ConfirmDisbursement', 'Board',
      'Service', 'Modify', 'Renew',
    ]) {
      expect(engineSource).toContain(action);
    }
    expect(serverSource).toContain('bank-credit-governance/v2');
    expect(serverSource).not.toContain('bank-credit-governance/v1');
  });
});
