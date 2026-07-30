import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BANK_CREDIT_GOVERNANCE_ACTIVATION_STATE,
  BANK_CREDIT_GOVERNANCE_ALTERNATE_KEYS,
  BANK_CREDIT_GOVERNANCE_COLUMNS,
  BANK_CREDIT_GOVERNANCE_RELATIONSHIPS,
  BANK_CREDIT_GOVERNANCE_SCHEMA_VERSION,
  BANK_CREDIT_GOVERNANCE_TABLES,
} from '../../src/governance/bankCreditGovernanceDataverseSchemaPlan';
import { INITIAL_OGB_SHADOW_POLICY } from '../../src/governance/ogbGovernanceMigration';

const outputDirectory = resolve('deployment/bank-credit-governance');
mkdirSync(outputDirectory, { recursive: true });

const schemaPlan = {
  schemaVersion: BANK_CREDIT_GOVERNANCE_SCHEMA_VERSION,
  activationState: BANK_CREDIT_GOVERNANCE_ACTIVATION_STATE,
  mutationSemantics: 'CREATE_MISSING_ONLY',
  destructiveOperations: [],
  expected: {
    tables: BANK_CREDIT_GOVERNANCE_TABLES.length,
    columns: BANK_CREDIT_GOVERNANCE_COLUMNS.length,
    relationships: BANK_CREDIT_GOVERNANCE_RELATIONSHIPS.length,
    alternateKeys: BANK_CREDIT_GOVERNANCE_ALTERNATE_KEYS.length,
  },
  tables: BANK_CREDIT_GOVERNANCE_TABLES,
  columns: BANK_CREDIT_GOVERNANCE_COLUMNS,
  relationships: BANK_CREDIT_GOVERNANCE_RELATIONSHIPS,
  alternateKeys: BANK_CREDIT_GOVERNANCE_ALTERNATE_KEYS,
};

const proposedActivePolicy = {
  ...INITIAL_OGB_SHADOW_POLICY,
  status: 'ACTIVE',
};

writeFileSync(
  resolve(outputDirectory, 'dataverse-schema-plan.json'),
  `${JSON.stringify(schemaPlan, null, 2)}\n`,
  'utf8',
);
writeFileSync(
  resolve(outputDirectory, 'initial-ogb-policy-v1.proposed-active.json'),
  `${JSON.stringify(proposedActivePolicy, null, 2)}\n`,
  'utf8',
);
