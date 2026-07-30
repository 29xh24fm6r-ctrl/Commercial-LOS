/**
 * PR 2 — additive Dataverse schema contract for bank credit governance.
 *
 * Constants only: importing this module performs no IO and creates no metadata.
 * Production provisioning is a separately approved operator action.
 */

export const BANK_CREDIT_GOVERNANCE_SCHEMA_VERSION = 'credit-governance/2.0.2';
export const BANK_CREDIT_GOVERNANCE_ACTIVATION_STATE = 'NO_GO' as const;

export type GovernanceDataverseType =
  | 'String'
  | 'Memo'
  | 'Integer'
  | 'Money'
  | 'Boolean'
  | 'DateTime'
  | 'Lookup';

export interface GovernanceTablePlan {
  readonly logicalName: string;
  readonly schemaName: string;
  readonly displayName: string;
  readonly ownership: 'OrganizationOwned';
  readonly primaryNameColumn: 'cr664_name';
  readonly immutability: 'MUTABLE_ADMIN' | 'IMMUTABLE_AFTER_PUBLISH' | 'APPEND_ONLY';
  readonly serverWriteOnly: boolean;
}

export interface GovernanceColumnPlan {
  readonly table: string;
  readonly logicalName: string;
  readonly schemaName: string;
  readonly displayName: string;
  readonly type: GovernanceDataverseType;
  readonly required: boolean;
  readonly maxLength?: number;
  readonly targets?: readonly string[];
  readonly sensitive?: boolean;
}

export interface GovernanceRelationshipPlan {
  readonly schemaName: string;
  readonly fromTable: string;
  readonly fromColumn: string;
  readonly toTable: string;
  readonly required: boolean;
  readonly deleteBehavior: 'Restrict';
}

export interface GovernanceAlternateKeyPlan {
  readonly schemaName: string;
  readonly table: string;
  readonly columns: readonly string[];
}

export const GOVERNANCE_TABLE = Object.freeze({
  profile: 'cr664_creditgovernanceprofile',
  policyVersion: 'cr664_creditpolicyversion',
  // Production already has a legacy, user-owned cr664_creditpolicyrule table.
  // The configurable engine uses a distinct organization-owned table so the
  // additive package never mutates or repurposes that legacy contract.
  policyRule: 'cr664_governancepolicyrule',
  roleAssignment: 'cr664_governanceroleassignment',
  authorityGrant: 'cr664_authoritygrant',
  committee: 'cr664_governancecommittee',
  committeeMembership: 'cr664_governancecommitteemember',
  actionEvidence: 'cr664_governedactionevidence',
  approvalVote: 'cr664_governanceapprovalvote',
  evaluation: 'cr664_governanceevaluation',
});

export const GOVERNANCE_EXISTING_TABLES = Object.freeze([
  'cr664_loandeal',
]);

function table(
  logicalName: string,
  displayName: string,
  immutability: GovernanceTablePlan['immutability'],
  serverWriteOnly: boolean,
): GovernanceTablePlan {
  const short = logicalName.replace('cr664_', '');
  return {
    logicalName,
    schemaName: `cr664_${short[0]!.toUpperCase()}${short.slice(1)}`,
    displayName,
    ownership: 'OrganizationOwned',
    primaryNameColumn: 'cr664_name',
    immutability,
    serverWriteOnly,
  };
}

export const BANK_CREDIT_GOVERNANCE_TABLES: readonly GovernanceTablePlan[] = Object.freeze([
  table(GOVERNANCE_TABLE.profile, 'Credit Governance Profile', 'MUTABLE_ADMIN', false),
  table(GOVERNANCE_TABLE.policyVersion, 'Credit Policy Version', 'IMMUTABLE_AFTER_PUBLISH', false),
  table(GOVERNANCE_TABLE.policyRule, 'Credit Policy Rule', 'IMMUTABLE_AFTER_PUBLISH', false),
  table(GOVERNANCE_TABLE.roleAssignment, 'Governance Role Assignment', 'APPEND_ONLY', false),
  table(GOVERNANCE_TABLE.authorityGrant, 'Delegated Authority Grant', 'APPEND_ONLY', false),
  table(GOVERNANCE_TABLE.committee, 'Governance Committee', 'MUTABLE_ADMIN', false),
  table(GOVERNANCE_TABLE.committeeMembership, 'Governance Committee Membership', 'APPEND_ONLY', false),
  table(GOVERNANCE_TABLE.actionEvidence, 'Governed Action Evidence', 'APPEND_ONLY', true),
  table(GOVERNANCE_TABLE.approvalVote, 'Governance Approval Vote', 'APPEND_ONLY', true),
  table(GOVERNANCE_TABLE.evaluation, 'Governance Evaluation', 'APPEND_ONLY', true),
]);

function column(
  tableName: string,
  shortName: string,
  displayName: string,
  type: GovernanceDataverseType,
  required = false,
  extra: Partial<GovernanceColumnPlan> = {},
): GovernanceColumnPlan {
  return {
    table: tableName,
    logicalName: `cr664_${shortName}`,
    schemaName: `cr664_${shortName[0]!.toUpperCase()}${shortName.slice(1)}`,
    displayName,
    type,
    required,
    ...extra,
  };
}

function name(tableName: string): GovernanceColumnPlan {
  return column(tableName, 'name', 'Name', 'String', true, { maxLength: 200 });
}

function lookup(
  tableName: string,
  shortName: string,
  displayName: string,
  target: string,
  required = true,
): GovernanceColumnPlan {
  return column(tableName, shortName, displayName, 'Lookup', required, { targets: [target] });
}

const T = GOVERNANCE_TABLE;
export const BANK_CREDIT_GOVERNANCE_COLUMNS: readonly GovernanceColumnPlan[] = Object.freeze([
  name(T.profile),
  column(T.profile, 'bankkey', 'Bank key', 'String', true, { maxLength: 100 }),
  column(T.profile, 'displayname', 'Display name', 'String', true, { maxLength: 200 }),
  column(T.profile, 'profileenabled', 'Profile enabled', 'Boolean', true),
  column(T.profile, 'createdat', 'Created at', 'DateTime', true),

  name(T.policyVersion),
  lookup(T.policyVersion, 'governanceprofile', 'Governance profile', T.profile),
  column(T.policyVersion, 'policyid', 'Policy ID', 'String', true, { maxLength: 100 }),
  column(T.policyVersion, 'versionnumber', 'Version number', 'Integer', true),
  column(T.policyVersion, 'policystatus', 'Policy status', 'String', true, { maxLength: 20 }),
  column(T.policyVersion, 'effectivefrom', 'Effective from', 'DateTime', true),
  column(T.policyVersion, 'effectivethrough', 'Effective through', 'DateTime'),
  column(T.policyVersion, 'contractversion', 'Contract version', 'String', true, { maxLength: 100 }),
  column(T.policyVersion, 'snapshotjson', 'Policy snapshot JSON', 'Memo', true, { maxLength: 1_048_576 }),
  column(T.policyVersion, 'snapshotsha256', 'Policy snapshot SHA-256', 'String', true, { maxLength: 64 }),
  column(T.policyVersion, 'publishedat', 'Published at', 'DateTime'),
  lookup(T.policyVersion, 'publishedby', 'Published by', 'systemuser', false),

  name(T.policyRule),
  lookup(T.policyRule, 'policyversion', 'Policy version', T.policyVersion),
  column(T.policyRule, 'ruleid', 'Rule ID', 'String', true, { maxLength: 100 }),
  column(T.policyRule, 'description', 'Description', 'String', true, { maxLength: 500 }),
  column(T.policyRule, 'actionsjson', 'Actions JSON', 'Memo', true, { maxLength: 20_000 }),
  column(T.policyRule, 'conditionjson', 'Condition JSON', 'Memo', true, { maxLength: 200_000 }),
  column(T.policyRule, 'requirementsjson', 'Requirements JSON', 'Memo', true, { maxLength: 200_000 }),
  column(T.policyRule, 'nonoverrideable', 'Non-overrideable', 'Boolean', true),
  column(T.policyRule, 'ruleordinal', 'Rule ordinal', 'Integer', true),
  column(T.policyRule, 'rulesha256', 'Rule SHA-256', 'String', true, { maxLength: 64 }),

  name(T.roleAssignment),
  lookup(T.roleAssignment, 'governanceprofile', 'Governance profile', T.profile),
  lookup(T.roleAssignment, 'officer', 'Officer', 'systemuser'),
  column(T.roleAssignment, 'assignmentid', 'Assignment ID', 'String', true, { maxLength: 100 }),
  column(T.roleAssignment, 'rolecode', 'Role code', 'String', true, { maxLength: 100 }),
  column(T.roleAssignment, 'effectivefrom', 'Effective from', 'DateTime', true),
  column(T.roleAssignment, 'effectivethrough', 'Effective through', 'DateTime'),
  column(T.roleAssignment, 'assignmentstate', 'Assignment state', 'String', true, { maxLength: 20 }),
  lookup(T.roleAssignment, 'supersedesassignment', 'Supersedes assignment', T.roleAssignment, false),

  name(T.authorityGrant),
  lookup(T.authorityGrant, 'governanceprofile', 'Governance profile', T.profile),
  lookup(T.authorityGrant, 'officer', 'Officer', 'systemuser'),
  column(T.authorityGrant, 'grantid', 'Grant ID', 'String', true, { maxLength: 100 }),
  column(T.authorityGrant, 'actionsjson', 'Actions JSON', 'Memo', true, { maxLength: 20_000 }),
  column(T.authorityGrant, 'maximumamount', 'Maximum amount', 'Money'),
  column(T.authorityGrant, 'maximumrelationshipexposure', 'Maximum relationship exposure', 'Money'),
  column(T.authorityGrant, 'maximumunsecuredamount', 'Maximum unsecured amount', 'Money'),
  column(T.authorityGrant, 'productsjson', 'Products JSON', 'Memo', true, { maxLength: 100_000 }),
  column(T.authorityGrant, 'riskratingsjson', 'Risk ratings JSON', 'Memo', true, { maxLength: 100_000 }),
  column(T.authorityGrant, 'geographiesjson', 'Geographies JSON', 'Memo', true, { maxLength: 100_000 }),
  column(T.authorityGrant, 'industriesjson', 'Industries JSON', 'Memo', true, { maxLength: 100_000 }),
  column(T.authorityGrant, 'exceptiontypesjson', 'Exception types JSON', 'Memo', true, { maxLength: 100_000 }),
  column(T.authorityGrant, 'insiderpermitted', 'Insider lending permitted', 'Boolean', true),
  column(T.authorityGrant, 'criticizedclassifiedstatusesjson', 'Criticized/classified statuses JSON', 'Memo', true, { maxLength: 100_000 }),
  column(T.authorityGrant, 'effectivefrom', 'Effective from', 'DateTime', true),
  column(T.authorityGrant, 'effectivethrough', 'Effective through', 'DateTime'),
  column(T.authorityGrant, 'grantstate', 'Grant state', 'String', true, { maxLength: 20 }),
  lookup(T.authorityGrant, 'supersedesgrant', 'Supersedes grant', T.authorityGrant, false),
  column(T.authorityGrant, 'grantbasis', 'Grant basis', 'Memo', true, { maxLength: 20_000, sensitive: true }),

  name(T.committee),
  lookup(T.committee, 'governanceprofile', 'Governance profile', T.profile),
  column(T.committee, 'committeeid', 'Committee ID', 'String', true, { maxLength: 100 }),
  column(T.committee, 'committeecode', 'Committee code', 'String', true, { maxLength: 100 }),
  column(T.committee, 'displayname', 'Display name', 'String', true, { maxLength: 200 }),
  column(T.committee, 'active', 'Active', 'Boolean', true),

  name(T.committeeMembership),
  lookup(T.committeeMembership, 'committee', 'Committee', T.committee),
  lookup(T.committeeMembership, 'officer', 'Officer', 'systemuser'),
  column(T.committeeMembership, 'membershipid', 'Membership ID', 'String', true, { maxLength: 100 }),
  column(T.committeeMembership, 'votingrole', 'Voting role', 'String', true, { maxLength: 100 }),
  column(T.committeeMembership, 'mayvote', 'May vote', 'Boolean', true),
  column(T.committeeMembership, 'effectivefrom', 'Effective from', 'DateTime', true),
  column(T.committeeMembership, 'effectivethrough', 'Effective through', 'DateTime'),
  column(T.committeeMembership, 'membershipstate', 'Membership state', 'String', true, { maxLength: 20 }),
  lookup(T.committeeMembership, 'supersedesmembership', 'Supersedes membership', T.committeeMembership, false),

  name(T.actionEvidence),
  lookup(T.actionEvidence, 'governanceprofile', 'Governance profile', T.profile),
  lookup(T.actionEvidence, 'loandeal', 'Loan deal', 'cr664_loandeal'),
  lookup(T.actionEvidence, 'actor', 'Actor', 'systemuser'),
  column(T.actionEvidence, 'evidenceid', 'Evidence ID', 'String', true, { maxLength: 100 }),
  column(T.actionEvidence, 'actioncode', 'Action code', 'String', true, { maxLength: 30 }),
  column(T.actionEvidence, 'occurredat', 'Occurred at', 'DateTime', true),
  column(T.actionEvidence, 'sourceentity', 'Source entity', 'String', true, { maxLength: 100 }),
  column(T.actionEvidence, 'sourcerecordid', 'Source record ID', 'String', true, { maxLength: 100 }),
  column(T.actionEvidence, 'correlationid', 'Correlation ID', 'String', true, { maxLength: 100 }),
  column(T.actionEvidence, 'evidencesha256', 'Evidence SHA-256', 'String', true, { maxLength: 64 }),

  name(T.approvalVote),
  lookup(T.approvalVote, 'governanceprofile', 'Governance profile', T.profile),
  lookup(T.approvalVote, 'loandeal', 'Loan deal', 'cr664_loandeal'),
  lookup(T.approvalVote, 'voter', 'Voter', 'systemuser'),
  lookup(T.approvalVote, 'committee', 'Committee', T.committee, false),
  column(T.approvalVote, 'approvalid', 'Approval ID', 'String', true, { maxLength: 100 }),
  column(T.approvalVote, 'groupid', 'Approval group ID', 'String', true, { maxLength: 100 }),
  column(T.approvalVote, 'decisioncode', 'Decision code', 'String', true, { maxLength: 20 }),
  column(T.approvalVote, 'actorrolesjson', 'Actor roles JSON', 'Memo', true, { maxLength: 100_000 }),
  column(T.approvalVote, 'occurredat', 'Occurred at', 'DateTime', true),
  column(T.approvalVote, 'correlationid', 'Correlation ID', 'String', true, { maxLength: 100 }),

  name(T.evaluation),
  lookup(T.evaluation, 'governanceprofile', 'Governance profile', T.profile),
  lookup(T.evaluation, 'policyversion', 'Policy version', T.policyVersion),
  lookup(T.evaluation, 'loandeal', 'Loan deal', 'cr664_loandeal'),
  lookup(T.evaluation, 'actor', 'Actor', 'systemuser'),
  column(T.evaluation, 'evaluationid', 'Evaluation ID', 'String', true, { maxLength: 100 }),
  column(T.evaluation, 'contractversion', 'Contract version', 'String', true, { maxLength: 100 }),
  column(T.evaluation, 'actioncode', 'Action code', 'String', true, { maxLength: 30 }),
  column(T.evaluation, 'decisioncode', 'Decision code', 'String', true, { maxLength: 20 }),
  column(T.evaluation, 'evaluatedat', 'Evaluated at', 'DateTime', true),
  column(T.evaluation, 'requestjson', 'Request JSON', 'Memo', true, { maxLength: 1_048_576, sensitive: true }),
  column(T.evaluation, 'resultjson', 'Result JSON', 'Memo', true, { maxLength: 1_048_576, sensitive: true }),
  column(T.evaluation, 'sourceversiontokensjson', 'Source version tokens JSON', 'Memo', true, { maxLength: 200_000 }),
  column(T.evaluation, 'requestsha256', 'Request SHA-256', 'String', true, { maxLength: 64 }),
  column(T.evaluation, 'resultsha256', 'Result SHA-256', 'String', true, { maxLength: 64 }),
  column(T.evaluation, 'correlationid', 'Correlation ID', 'String', true, { maxLength: 100 }),

  column('cr664_loandeal', 'geography', 'Governance geography', 'String', false, { maxLength: 200 }),
  column('cr664_loandeal', 'haspolicyexception', 'Has policy exception', 'Boolean', false),
  column('cr664_loandeal', 'policyexceptiontypesjson', 'Policy exception types JSON', 'Memo', false, { maxLength: 100_000 }),
  column('cr664_loandeal', 'insiderstatus', 'Insider status', 'Boolean', false),
  column('cr664_loandeal', 'concentrationjson', 'Concentration JSON', 'Memo', false, { maxLength: 100_000 }),
  column('cr664_loandeal', 'governmentguaranteedprogram', 'Government-guaranteed program', 'String', false, { maxLength: 200 }),
  column('cr664_loandeal', 'criticizedclassifiedstatus', 'Criticized/classified status', 'String', false, { maxLength: 100 }),
]);

function relationship(
  fromTable: string,
  fromColumn: string,
  toTable: string,
  required = true,
): GovernanceRelationshipPlan {
  return {
    schemaName: `${fromTable}_${fromColumn}`.replace('cr664_', 'cr664_rel_'),
    fromTable,
    fromColumn: `cr664_${fromColumn}`,
    toTable,
    required,
    deleteBehavior: 'Restrict',
  };
}

export const BANK_CREDIT_GOVERNANCE_RELATIONSHIPS: readonly GovernanceRelationshipPlan[] = Object.freeze(
  BANK_CREDIT_GOVERNANCE_COLUMNS
    .filter((item) => item.type === 'Lookup')
    .map((item) => relationship(
      item.table,
      item.logicalName.replace('cr664_', ''),
      item.targets![0]!,
      item.required,
    )),
);

function key(tableName: string, shortName: string, columns: readonly string[]): GovernanceAlternateKeyPlan {
  return { schemaName: `cr664_key_${shortName}`, table: tableName, columns };
}

export const BANK_CREDIT_GOVERNANCE_ALTERNATE_KEYS: readonly GovernanceAlternateKeyPlan[] = Object.freeze([
  key(T.profile, 'governanceprofile_bank', ['cr664_bankkey']),
  key(T.policyVersion, 'policyversion_id', ['cr664_policyid', 'cr664_versionnumber']),
  key(T.policyRule, 'policyrule_id', ['cr664_policyversion', 'cr664_ruleid']),
  key(T.roleAssignment, 'roleassignment_id', ['cr664_assignmentid']),
  key(T.authorityGrant, 'authoritygrant_id', ['cr664_grantid']),
  key(T.committee, 'committee_id', ['cr664_committeeid']),
  key(T.committeeMembership, 'membership_id', ['cr664_membershipid']),
  key(T.actionEvidence, 'actionevidence_id', ['cr664_evidenceid']),
  key(T.approvalVote, 'approvalvote_id', ['cr664_approvalid']),
  key(T.evaluation, 'evaluation_id', ['cr664_evaluationid']),
]);

export const BANK_CREDIT_GOVERNANCE_APPEND_ONLY_TABLES: readonly string[] = Object.freeze(
  BANK_CREDIT_GOVERNANCE_TABLES
    .filter((item) => item.immutability === 'APPEND_ONLY')
    .map((item) => item.logicalName),
);

export interface GovernanceSchemaValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateBankCreditGovernanceSchemaPlan(): GovernanceSchemaValidation {
  const errors: string[] = [];
  const governedTableNames = BANK_CREDIT_GOVERNANCE_TABLES.map((item) => item.logicalName);
  const tables = new Set([
    ...governedTableNames,
    ...GOVERNANCE_EXISTING_TABLES,
  ]);
  if (new Set(governedTableNames).size !== governedTableNames.length) errors.push('duplicate table logical name');
  const columnKeys = new Set<string>();
  for (const columnPlan of BANK_CREDIT_GOVERNANCE_COLUMNS) {
    if (!tables.has(columnPlan.table)) errors.push(`column references unknown table: ${columnPlan.logicalName}`);
    const keyValue = `${columnPlan.table}.${columnPlan.logicalName}`;
    if (columnKeys.has(keyValue)) errors.push(`duplicate column: ${keyValue}`);
    columnKeys.add(keyValue);
    if (columnPlan.type === 'Lookup' && columnPlan.targets?.length !== 1) {
      errors.push(`lookup must have exactly one target: ${keyValue}`);
    }
  }
  for (const keyPlan of BANK_CREDIT_GOVERNANCE_ALTERNATE_KEYS) {
    if (!tables.has(keyPlan.table)) errors.push(`key references unknown table: ${keyPlan.schemaName}`);
    for (const keyColumn of keyPlan.columns) {
      if (!columnKeys.has(`${keyPlan.table}.${keyColumn}`)) {
        errors.push(`key references unknown column: ${keyPlan.schemaName}.${keyColumn}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
