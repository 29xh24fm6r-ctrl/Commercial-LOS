#!/usr/bin/env node
// Create-missing-only provisioning for the PE-2 portfolio migration-control schema.
// Requires DATAVERSE_URL and DATAVERSE_ACCESS_TOKEN. No business rows are created.

const url = required('DATAVERSE_URL').replace(/\/$/, '');
const token = required('DATAVERSE_ACCESS_TOKEN');
const api = `${url}/api/data/v9.2`;
const solution = 'CommercialLendingLOS';
const table = 'cr664_portfoliomigrationcontrol';

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  'MSCRM.SolutionUniqueName': solution,
};

const columns = [
  stringColumn('cr664_MigrationBatchId', 'Migration batch id', 100),
  stringColumn('cr664_Operator', 'Operator', 200),
  integerColumn('cr664_EnteredLoanCount', 'Entered loan count'),
  moneyColumn('cr664_EnteredAggregateOutstanding', 'Entered aggregate outstanding'),
  memoColumn('cr664_SegmentSubtotalsJson', 'Segment subtotals JSON'),
  memoColumn('cr664_ExpectedLoanNumbersJson', 'Expected loan numbers JSON'),
  memoColumn('cr664_SourceDescription', 'Source description'),
  dateTimeColumn('cr664_EnteredAt', 'Entered at'),
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function label(value) {
  return { LocalizedLabels: [{ Label: value, LanguageCode: 1033 }] };
}

function baseColumn(schemaName, displayName, odataType) {
  return {
    '@odata.type': odataType,
    SchemaName: schemaName,
    DisplayName: label(displayName),
    RequiredLevel: { Value: 'None' },
  };
}

function stringColumn(schemaName, displayName, maxLength) {
  return {
    ...baseColumn(schemaName, displayName, 'Microsoft.Dynamics.CRM.StringAttributeMetadata'),
    MaxLength: maxLength,
    FormatName: { Value: 'Text' },
  };
}

function memoColumn(schemaName, displayName) {
  return {
    ...baseColumn(schemaName, displayName, 'Microsoft.Dynamics.CRM.MemoAttributeMetadata'),
    MaxLength: 1048576,
    Format: 'TextArea',
  };
}

function integerColumn(schemaName, displayName) {
  return {
    ...baseColumn(schemaName, displayName, 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata'),
    MinValue: 0,
    MaxValue: 2147483647,
    Format: 'None',
  };
}

function moneyColumn(schemaName, displayName) {
  return {
    ...baseColumn(schemaName, displayName, 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata'),
    MinValue: 0,
    MaxValue: 100000000000000,
    PrecisionSource: 2,
  };
}

function dateTimeColumn(schemaName, displayName) {
  return {
    ...baseColumn(schemaName, displayName, 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata'),
    Format: 'DateAndTime',
    DateTimeBehavior: { Value: 'UserLocal' },
  };
}

async function exists(path) {
  const response = await fetch(`${api}/${path}`, { headers });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`${path} metadata read failed: ${response.status} ${await response.text()}`);
  return true;
}

async function create(path, payload) {
  const response = await fetch(`${api}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${path} create failed: ${response.status} ${await response.text()}`);
  }
}

async function ensureTable() {
  if (await exists(`EntityDefinitions(LogicalName='${table}')?$select=LogicalName`)) {
    console.log(`SKIP table present: ${table}`);
    return false;
  }
  await create('EntityDefinitions', {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: 'cr664_PortfolioMigrationControl',
    DisplayName: label('Portfolio Migration Control'),
    DisplayCollectionName: label('Portfolio Migration Controls'),
    Description: label('Operator-recorded control totals for portfolio migration reconciliation.'),
    OwnershipType: 'UserOwned',
    IsActivity: false,
    HasActivities: false,
    HasNotes: false,
    PrimaryNameAttribute: 'cr664_name',
    Attributes: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: 'cr664_Name',
        DisplayName: label('Name'),
        RequiredLevel: { Value: 'ApplicationRequired' },
        MaxLength: 200,
        IsPrimaryName: true,
        FormatName: { Value: 'Text' },
      },
    ],
  });
  console.log(`CREATED table: ${table}`);
  return true;
}

async function ensureColumn(tableName, payload) {
  const logicalName = payload.SchemaName.toLowerCase();
  if (
    await exists(
      `EntityDefinitions(LogicalName='${tableName}')/Attributes(LogicalName='${logicalName}')?$select=LogicalName`,
    )
  ) {
    console.log(`SKIP column present: ${tableName}.${logicalName}`);
    return false;
  }
  await create(`EntityDefinitions(LogicalName='${tableName}')/Attributes`, payload);
  console.log(`CREATED column: ${tableName}.${logicalName}`);
  return true;
}

async function main() {
  let changed = await ensureTable();
  for (const column of columns) {
    changed = (await ensureColumn(table, column)) || changed;
  }
  changed =
    (await ensureColumn(
      'cr664_portfolioboardedloan',
      stringColumn('cr664_MigrationBatchId', 'Migration batch id', 100),
    )) || changed;

  if (changed) {
    const response = await fetch(`${api}/PublishAllXml`, {
      method: 'POST',
      headers,
      body: '{}',
    });
    if (!response.ok) {
      throw new Error(`PublishAllXml failed: ${response.status} ${await response.text()}`);
    }
    console.log('PUBLISHED customizations');
  } else {
    console.log('No schema changes required.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
