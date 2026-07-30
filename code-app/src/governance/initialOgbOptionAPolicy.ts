import type { BankCreditGovernancePolicy, GovernedCreditAction } from './bankCreditGovernanceEngine';

const OPTION_A_ACTIONS: readonly GovernedCreditAction[] = [
  'ORIGINATE',
  'UNDERWRITE',
  'RECOMMEND',
  'APPROVE',
  'COMMIT',
  'CLOSE',
  'AUTHORIZE_FUNDING',
  'CONFIRM_DISBURSEMENT',
  'BOARD',
  'SERVICE',
];

const EXCLUDED_ACTIONS: readonly GovernedCreditAction[] = [
  'APPROVE_EXCEPTION',
  'MODIFY',
  'RENEW',
];

export const INITIAL_OGB_OPTION_A_POLICY: BankCreditGovernancePolicy = Object.freeze({
  policyId: 'ogb-option-a-initial',
  version: 1,
  status: 'ACTIVE',
  effectiveFrom: '2026-07-30T00:00:00.000Z',
  rules: [
    {
      ruleId: 'option-a-authorized-officer',
      description: 'An explicitly granted authorized officer may perform the approved combined roles within delegated authority.',
      actions: OPTION_A_ACTIONS,
      requirements: {
        actorRoles: ['OGB_AUTHORIZED_OFFICER'],
        delegatedAuthorityRequired: true,
      },
      nonOverrideable: true,
    },
    {
      ruleId: 'option-a-policy-exception-prohibited',
      description: 'The initial Option A profile has no policy-exception authority.',
      actions: OPTION_A_ACTIONS,
      when: { hasPolicyException: true },
      requirements: { prohibited: 'Policy exceptions require separately approved authority.' },
      nonOverrideable: true,
    },
    {
      ruleId: 'option-a-insider-prohibited',
      description: 'The initial Option A profile excludes insider lending.',
      actions: OPTION_A_ACTIONS,
      when: { insiderStatus: true },
      requirements: { prohibited: 'Insider lending is outside the initial authority profile.' },
      nonOverrideable: true,
    },
    {
      ruleId: 'option-a-excluded-actions',
      description: 'Exception approval, modification, and renewal remain outside the initial production authority.',
      actions: EXCLUDED_ACTIONS,
      requirements: { prohibited: 'This action is outside the initial Option A authority profile.' },
      nonOverrideable: true,
    },
  ],
});
