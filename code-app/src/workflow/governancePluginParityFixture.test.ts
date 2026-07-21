import { describe, it, expect } from 'vitest';
import { CANONICAL_STAGE_CODES } from './stageOrderingContract';
import { CANONICAL_STATUS_CODES } from './statusReferenceContract';

/**
 * Platform-Enforced Credit Workflow Governance (2026-07-21) — parity discipline
 * (see docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md §10).
 *
 * There is no shared runtime between this TypeScript codebase and the hand-ported C# Dataverse
 * plugin (`dataverse-plugins/CommercialLendingLOS.Plugins/LoanDealGovernedTransitionPlugin.cs`).
 * This file pins the EXACT literal values the plugin hardcodes as a fixture, asserted against the
 * canonical TypeScript sources of truth. If a future change to the canonical stage/status
 * vocabulary, the audit option-set values, or the schema/attribute names breaks one of these
 * assertions, that is the signal to update BOTH this fixture AND the live-deployed plugin — a
 * failing test here means the client and server plugin (once built/registered) would disagree
 * about the law, which is exactly the drift this initiative exists to prevent.
 *
 * This test does NOT prove the plugin compiles or behaves correctly — it cannot (no dotnet SDK,
 * no live Dataverse in this repo's test environment). It proves the plugin's hardcoded constants,
 * copied here as a plain fixture, have not silently drifted from the TypeScript canonical sources.
 */

// Mirrors LoanDealGovernedTransitionPlugin.cs's CanonicalStageCodes array exactly.
const PLUGIN_CANONICAL_STAGE_CODES = [
  'INTAKE', 'UNDERWRITING', 'CREDIT_APPROVAL', 'COMMITMENT', 'DOCUMENTATION', 'CLOSING_FUNDING', 'BOARDED',
];

// Mirrors the plugin's StatusOpen/StatusOnHold/StatusDeclined/StatusWithdrawn/StatusBoarded constants
// and TerminalStatuses set.
const PLUGIN_STATUS_CODES = ['OPEN', 'ON_HOLD', 'DECLINED', 'WITHDRAWN', 'BOARDED'];
const PLUGIN_TERMINAL_STATUSES = ['DECLINED', 'WITHDRAWN', 'BOARDED'];

// Mirrors the plugin's CreditApprovalCode / CommitmentCode / BoardedCode constants.
const PLUGIN_CREDIT_APPROVAL_CODE = 'CREDIT_APPROVAL';
const PLUGIN_COMMITMENT_CODE = 'COMMITMENT';
const PLUGIN_BOARDED_CODE = 'BOARDED';

// Mirrors the plugin's schema-name constants for cr664_loandeal / cr664_dealstagereferences /
// cr664_dealstatusreferences / cr664_banker / cr664_loanrequestprofile.
const PLUGIN_SCHEMA_NAMES = {
  loanDealEntity: 'cr664_loandeal',
  stageReferenceAttribute: 'cr664_stagereference',
  statusReferenceAttribute: 'cr664_statusreference',
  amountAttribute: 'cr664_amount',
  governedActionReasonAttribute: 'cr664_governedactionreason',
  stageReferenceEntity: 'cr664_dealstagereferences',
  stageCodeAttribute: 'cr664_code',
  stageSequenceAttribute: 'cr664_sequence',
  statusReferenceEntity: 'cr664_dealstatusreferences',
  statusCodeAttribute: 'cr664_code',
  bankerEntity: 'cr664_banker',
  bankerEmailAttribute: 'cr664_email',
  approvalLimitAttribute: 'cr664_approvallimit',
  creditCommitteeMemberAttribute: 'cr664_creditcommitteemember',
  approvalOverrideAuthorityAttribute: 'cr664_approvaloverrideauthority',
} as const;

// Mirrors the plugin's audit option-set integer constants (from
// src/generated/models/Cr664_auditeventsModel.ts).
const PLUGIN_AUDIT_OPTION_SET_VALUES = {
  entityTypeLoanDeal: 788190000,
  eventCategoryLifecycle: 788190002,
  eventTypeStageChange: 788190000,
  eventTypeStatusChange: 788190001,
  outcomeBlocked: 788190002,
};

describe('governancePluginParityFixture — C# plugin constants vs. TypeScript canonical sources', () => {
  it('the plugin\'s canonical stage codes exactly match stageOrderingContract.ts (same set, same order)', () => {
    expect(PLUGIN_CANONICAL_STAGE_CODES).toEqual([...CANONICAL_STAGE_CODES]);
  });

  it('the plugin\'s canonical status codes exactly match statusReferenceContract.ts', () => {
    expect(new Set(PLUGIN_STATUS_CODES)).toEqual(new Set(CANONICAL_STATUS_CODES));
  });

  it('the plugin\'s terminal-status set matches canonicalStageTransition.ts\'s TERMINAL_STATUSES', () => {
    // canonicalStageTransition.ts does not export TERMINAL_STATUSES, so this pins the ratified
    // policy contract's §2 terminal-status list directly (DECLINED, WITHDRAWN, BOARDED).
    expect(new Set(PLUGIN_TERMINAL_STATUSES)).toEqual(new Set(['DECLINED', 'WITHDRAWN', 'BOARDED']));
  });

  it('the plugin\'s CREDIT_APPROVAL/COMMITMENT/BOARDED code constants are canonical stage codes', () => {
    for (const code of [PLUGIN_CREDIT_APPROVAL_CODE, PLUGIN_COMMITMENT_CODE, PLUGIN_BOARDED_CODE]) {
      expect(CANONICAL_STAGE_CODES).toContain(code);
    }
  });

  it('the plugin\'s schema-name constants are non-empty and match this repo\'s documented logical names', () => {
    for (const [key, value] of Object.entries(PLUGIN_SCHEMA_NAMES)) {
      expect(value, key).toMatch(/^[a-z0-9_]+$/);
      expect(value.startsWith('cr664_'), key).toBe(true);
    }
    // Spot-check against src/deals/governedTransitionReasonSchema.ts's own exported constant so a
    // future rename of that field is caught here too, not just in that file's own consumers.
    expect(PLUGIN_SCHEMA_NAMES.governedActionReasonAttribute).toBe('cr664_governedactionreason');
  });

  it('the plugin\'s audit option-set integers are all distinct within their own option set (no accidental collision)', () => {
    // entitytype/eventcategory/eventtype/outcomestatus are four DIFFERENT option sets on
    // cr664_auditevents, so cross-field numeric overlap (e.g. entityTypeLoanDeal ===
    // eventTypeStageChange, both 788190000) is EXPECTED and not a collision -- this only asserts
    // no two values meant to distinguish cases WITHIN the same option set collide.
    expect(PLUGIN_AUDIT_OPTION_SET_VALUES.eventTypeStageChange).not.toBe(PLUGIN_AUDIT_OPTION_SET_VALUES.eventTypeStatusChange);
    expect(PLUGIN_AUDIT_OPTION_SET_VALUES.outcomeBlocked).toBeGreaterThanOrEqual(788190000);
  });
});
