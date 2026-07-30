import { describe, expect, it } from 'vitest';
import {
  BANK_CREDIT_GOVERNANCE_ACTIVATION_STATE,
  BANK_CREDIT_GOVERNANCE_ALTERNATE_KEYS,
  BANK_CREDIT_GOVERNANCE_APPEND_ONLY_TABLES,
  BANK_CREDIT_GOVERNANCE_COLUMNS,
  BANK_CREDIT_GOVERNANCE_RELATIONSHIPS,
  BANK_CREDIT_GOVERNANCE_TABLES,
  GOVERNANCE_EXISTING_TABLES,
  GOVERNANCE_TABLE,
  validateBankCreditGovernanceSchemaPlan,
} from './bankCreditGovernanceDataverseSchemaPlan';

describe('PR 2 Dataverse governance schema plan', () => {
  it('is internally valid, additive, and remains NO-GO', () => {
    expect(validateBankCreditGovernanceSchemaPlan()).toEqual({ valid: true, errors: [] });
    expect(BANK_CREDIT_GOVERNANCE_ACTIVATION_STATE).toBe('NO_GO');
    expect(BANK_CREDIT_GOVERNANCE_TABLES).toHaveLength(10);
    expect(BANK_CREDIT_GOVERNANCE_TABLES.every((table) => table.ownership === 'OrganizationOwned')).toBe(true);
    expect(BANK_CREDIT_GOVERNANCE_ALTERNATE_KEYS).toHaveLength(10);
  });

  it('does not reuse the incompatible legacy credit-policy-rule table', () => {
    expect(GOVERNANCE_TABLE.policyRule).toBe('cr664_governancepolicyrule');
    expect(BANK_CREDIT_GOVERNANCE_TABLES.map((table) => table.logicalName))
      .not.toContain('cr664_creditpolicyrule');
  });

  it('adds only the missing fail-closed fact fields to the existing loan-deal table', () => {
    expect(GOVERNANCE_EXISTING_TABLES).toEqual(['cr664_loandeal']);
    expect(BANK_CREDIT_GOVERNANCE_COLUMNS
      .filter((column) => column.table === 'cr664_loandeal')
      .map((column) => column.logicalName)).toEqual([
        'cr664_geography',
        'cr664_haspolicyexception',
        'cr664_policyexceptiontypesjson',
        'cr664_insiderstatus',
        'cr664_concentrationjson',
        'cr664_governmentguaranteedprogram',
        'cr664_criticizedclassifiedstatus',
      ]);
  });

  it('contains no institution seed, active policy, authority assignment, or dollar value', () => {
    const serialized = JSON.stringify({
      tables: BANK_CREDIT_GOVERNANCE_TABLES,
      columns: BANK_CREDIT_GOVERNANCE_COLUMNS,
    });
    expect(serialized).not.toMatch(/old glory|ogb|org3a57|1_000_000|1000000/i);
    expect(serialized).not.toContain('"defaultValue":"ACTIVE"');
    expect(serialized).not.toContain('"seedRows"');
  });

  it('makes every evidence and policy child relationship restrict-delete', () => {
    expect(BANK_CREDIT_GOVERNANCE_RELATIONSHIPS.length).toBeGreaterThan(0);
    expect(BANK_CREDIT_GOVERNANCE_RELATIONSHIPS.every((relationship) =>
      relationship.deleteBehavior === 'Restrict')).toBe(true);
  });

  it('marks published policy components, assignments, grants, memberships, actions, votes, and evaluations append-only', () => {
    expect(BANK_CREDIT_GOVERNANCE_TABLES.find((table) =>
      table.logicalName === GOVERNANCE_TABLE.policyVersion)?.immutability).toBe('IMMUTABLE_AFTER_PUBLISH');
    expect(BANK_CREDIT_GOVERNANCE_TABLES.find((table) =>
      table.logicalName === GOVERNANCE_TABLE.policyRule)?.immutability).toBe('IMMUTABLE_AFTER_PUBLISH');
    expect(BANK_CREDIT_GOVERNANCE_APPEND_ONLY_TABLES).toEqual(expect.arrayContaining([
      GOVERNANCE_TABLE.roleAssignment,
      GOVERNANCE_TABLE.authorityGrant,
      GOVERNANCE_TABLE.committeeMembership,
      GOVERNANCE_TABLE.actionEvidence,
      GOVERNANCE_TABLE.approvalVote,
      GOVERNANCE_TABLE.evaluation,
    ]));
  });

  it('models assignment, grant, and membership revocation as superseding append-only events', () => {
    for (const [table, state, supersedes] of [
      [GOVERNANCE_TABLE.roleAssignment, 'cr664_assignmentstate', 'cr664_supersedesassignment'],
      [GOVERNANCE_TABLE.authorityGrant, 'cr664_grantstate', 'cr664_supersedesgrant'],
      [GOVERNANCE_TABLE.committeeMembership, 'cr664_membershipstate', 'cr664_supersedesmembership'],
    ]) {
      const fields = BANK_CREDIT_GOVERNANCE_COLUMNS.filter((column) => column.table === table);
      expect(fields.find((field) => field.logicalName === state)?.required).toBe(true);
      expect(fields.find((field) => field.logicalName === supersedes)?.targets).toEqual([table]);
    }
  });

  it('persists every delegated-authority scope certified by the engine', () => {
    const fields = BANK_CREDIT_GOVERNANCE_COLUMNS
      .filter((column) => column.table === GOVERNANCE_TABLE.authorityGrant)
      .map((column) => column.logicalName);
    expect(fields).toEqual(expect.arrayContaining([
      'cr664_maximumamount',
      'cr664_maximumrelationshipexposure',
      'cr664_maximumunsecuredamount',
      'cr664_insiderpermitted',
      'cr664_criticizedclassifiedstatusesjson',
      'cr664_productsjson',
      'cr664_riskratingsjson',
      'cr664_geographiesjson',
      'cr664_industriesjson',
      'cr664_exceptiontypesjson',
      'cr664_effectivefrom',
      'cr664_effectivethrough',
    ]));
  });

  it('requires complete evaluation proof and protects its payload as sensitive', () => {
    const fields = BANK_CREDIT_GOVERNANCE_COLUMNS.filter((column) =>
      column.table === GOVERNANCE_TABLE.evaluation);
    for (const required of [
      'cr664_governanceprofile',
      'cr664_policyversion',
      'cr664_loandeal',
      'cr664_actor',
      'cr664_evaluationid',
      'cr664_contractversion',
      'cr664_actioncode',
      'cr664_decisioncode',
      'cr664_evaluatedat',
      'cr664_requestjson',
      'cr664_resultjson',
      'cr664_sourceversiontokensjson',
      'cr664_requestsha256',
      'cr664_resultsha256',
      'cr664_correlationid',
    ]) expect(fields.find((field) => field.logicalName === required)?.required).toBe(true);
    expect(fields.find((field) => field.logicalName === 'cr664_requestjson')?.sensitive).toBe(true);
    expect(fields.find((field) => field.logicalName === 'cr664_resultjson')?.sensitive).toBe(true);
  });

  it('uses alternate keys for idempotency across every governance record type', () => {
    expect(new Set(BANK_CREDIT_GOVERNANCE_ALTERNATE_KEYS.map((key) => key.table))).toEqual(
      new Set(BANK_CREDIT_GOVERNANCE_TABLES.map((table) => table.logicalName)),
    );
  });

  it('keeps publisher names unique and within Dataverse metadata limits', () => {
    const tableNames = BANK_CREDIT_GOVERNANCE_TABLES.map((table) => table.logicalName);
    const relationshipNames = BANK_CREDIT_GOVERNANCE_RELATIONSHIPS.map((relationship) => relationship.schemaName);
    const keyNames = BANK_CREDIT_GOVERNANCE_ALTERNATE_KEYS.map((key) => key.schemaName);
    expect(new Set(tableNames).size).toBe(tableNames.length);
    expect(new Set(relationshipNames).size).toBe(relationshipNames.length);
    expect(new Set(keyNames).size).toBe(keyNames.length);
    for (const metadataName of [...tableNames, ...relationshipNames, ...keyNames]) {
      expect(metadataName).toMatch(/^cr664_/);
      expect(metadataName.length).toBeLessThanOrEqual(100);
    }
    for (const table of BANK_CREDIT_GOVERNANCE_TABLES) {
      expect(BANK_CREDIT_GOVERNANCE_COLUMNS.some((column) =>
        column.table === table.logicalName && column.logicalName === table.primaryNameColumn)).toBe(true);
    }
  });

  it('has one restrictive relationship for every lookup and makes all server-write tables append-only', () => {
    expect(BANK_CREDIT_GOVERNANCE_RELATIONSHIPS).toHaveLength(
      BANK_CREDIT_GOVERNANCE_COLUMNS.filter((column) => column.type === 'Lookup').length,
    );
    expect(BANK_CREDIT_GOVERNANCE_TABLES
      .filter((table) => table.serverWriteOnly)
      .every((table) => table.immutability === 'APPEND_ONLY')).toBe(true);
  });
});
