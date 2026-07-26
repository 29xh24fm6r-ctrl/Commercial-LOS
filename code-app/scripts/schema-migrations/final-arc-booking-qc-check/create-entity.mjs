#!/usr/bin/env node
// Creates the cr664_bookingqccheck table (if absent) and its columns
// (idempotently). Two-phase: create the entity first (if missing), then
// create each attribute (skipping any that already exist).
//
// Usage: DATAVERSE_URL=... DATAVERSE_ACCESS_TOKEN=... node create-entity.mjs
//
// Requires an OAuth access token for an account with System Customizer or
// System Administrator security role. This script does not authenticate
// itself.

import {
  ENTITY_LOGICAL_NAME,
  ENTITY_DISPLAY_NAME,
  ENTITY_PLURAL_DISPLAY_NAME,
  PRIMARY_ATTRIBUTE_LOGICAL_NAME,
  COLUMNS,
  requireEnv,
  apiBase,
  authHeaders,
} from './entity.mjs';

function label(text) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.Label',
    LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
  };
}

async function entityExists(base, headers) {
  const res = await fetch(`${base}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')?$select=LogicalName`, { headers });
  return res.status === 200;
}

async function createEntity(base, headers) {
  const payload = {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: ENTITY_LOGICAL_NAME,
    DisplayName: label(ENTITY_DISPLAY_NAME),
    DisplayCollectionName: label(ENTITY_PLURAL_DISPLAY_NAME),
    OwnershipType: 'UserOwned',
    HasActivities: false,
    HasNotes: false,
    PrimaryNameAttribute: PRIMARY_ATTRIBUTE_LOGICAL_NAME,
    Attributes: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: PRIMARY_ATTRIBUTE_LOGICAL_NAME,
        DisplayName: label('Check Id'),
        RequiredLevel: { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
        MaxLength: 100,
        IsPrimaryName: true,
      },
    ],
  };
  const res = await fetch(`${base}/EntityDefinitions`, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) {
    console.error(`FAILED to create entity ${ENTITY_LOGICAL_NAME}: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }
  console.log(`CREATED entity: ${ENTITY_LOGICAL_NAME}`);
}

function buildAttributePayload(col) {
  const base = {
    SchemaName: col.logicalName,
    DisplayName: label(col.displayName),
    RequiredLevel: { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' },
  };
  switch (col.attributeType) {
    case 'String':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', ...base, MaxLength: col.maxLength, FormatName: { Value: 'Text' } };
    case 'Memo':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', ...base, MaxLength: col.maxLength };
    case 'Decimal':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata', ...base, Precision: 2, MinValue: -100000000000, MaxValue: 100000000000 };
    case 'Boolean':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
        ...base,
        OptionSet: {
          '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
          TrueOption: { Value: 1, Label: label('Yes') },
          FalseOption: { Value: 0, Label: label('No') },
        },
      };
    case 'DateTime':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', ...base, Format: 'DateAndTime' };
    default:
      throw new Error(`Unsupported attributeType in entity.mjs: ${col.attributeType}`);
  }
}

async function columnExists(base, headers, logicalName) {
  const res = await fetch(
    `${base}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`,
    { headers },
  );
  return res.status === 200;
}

async function main() {
  const dataverseUrl = requireEnv('DATAVERSE_URL');
  const accessToken = requireEnv('DATAVERSE_ACCESS_TOKEN');
  const base = apiBase(dataverseUrl);
  const headers = authHeaders(accessToken);

  if (await entityExists(base, headers)) {
    console.log(`SKIP (entity already exists): ${ENTITY_LOGICAL_NAME}`);
  } else {
    await createEntity(base, headers);
  }

  for (const col of COLUMNS) {
    if (await columnExists(base, headers, col.logicalName)) {
      console.log(`SKIP (already exists): ${col.logicalName}`);
      continue;
    }
    const res = await fetch(`${base}/EntityDefinitions(LogicalName='${ENTITY_LOGICAL_NAME}')/Attributes`, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildAttributePayload(col)),
    });
    if (!res.ok) {
      console.error(`FAILED to create ${col.logicalName}: ${res.status} ${res.statusText}`);
      console.error(await res.text());
      process.exit(1);
    }
    console.log(`CREATED: ${col.logicalName}`);
  }

  console.log('\nEntity + columns processed. Add a Lookup column to cr664_loandeal manually in the');
  console.log('Maker Portal (relationship creation via the Web API is a separate, more involved call);');
  console.log('publish customizations, then regenerate the SDK, then run verify-entity.mjs.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
