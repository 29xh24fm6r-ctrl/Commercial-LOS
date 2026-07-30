<#
  Provisions the exact Bank Credit Governance schema plan.

  Safety:
  - dry-run by default;
  - -Apply requires the exact approved schema SHA-256;
  - create-missing-only for tables, columns, relationships, and alternate keys;
  - existing metadata is read back and must match the plan or execution stops;
  - no table, column, relationship, key, or business row is updated or deleted;
  - access tokens remain in memory and are never printed or persisted.
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedSchemaSha256,
  [string]$SchemaPath = 'deployment\bank-credit-governance\dataverse-schema-plan.json'
)

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$schemaFullPath = (Resolve-Path (Join-Path $repo $SchemaPath)).Path
$schemaHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $schemaFullPath).Hash.ToLowerInvariant()
$schema = Get-Content -Raw -LiteralPath $schemaFullPath | ConvertFrom-Json

if ($schema.mutationSemantics -ne 'CREATE_MISSING_ONLY' -or @($schema.destructiveOperations).Count -ne 0) {
  throw 'Schema plan is not create-missing-only.'
}
if ($Apply) {
  if ([string]::IsNullOrWhiteSpace($ExpectedSchemaSha256)) {
    throw '-Apply requires -ExpectedSchemaSha256.'
  }
  if ($schemaHash -ne $ExpectedSchemaSha256.Trim().ToLowerInvariant()) {
    throw "Schema hash mismatch. Expected $ExpectedSchemaSha256; actual $schemaHash."
  }
}

Write-Host '== Bank Credit Governance schema provisioning =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY' } else { 'DRY-RUN' }))
Write-Host ("Schema SHA-256: {0}" -f $schemaHash)
Write-Host ("Contract: {0} tables / {1} columns / {2} relationships / {3} alternate keys" -f
  $schema.expected.tables, $schema.expected.columns, $schema.expected.relationships, $schema.expected.alternateKeys)

$envInfo = Resolve-DataverseEnv
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }
$token = if ($orgUrl) { Get-DataverseToken $orgUrl } else { $null }
$tokenOk = if ($orgUrl) { Test-DataverseToken $orgUrl $token } else { $false }

if ($Apply) {
  if (-not $orgUrl -or -not $tokenOk) {
    throw 'Apply requires a connected production organization and a Dataverse-authorized in-memory token.'
  }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) {
    throw 'Operator did not confirm schema mutation.'
  }
} elseif (-not $tokenOk) {
  Write-Host 'No Dataverse API token is available; dry-run will validate and display the complete plan without live existence checks.'
  $token = $null
}

$api = if ($orgUrl) { "$($orgUrl.TrimEnd('/'))/api/data/v9.2" } else { $null }
$headers = if ($token) {
  @{
    Authorization = "Bearer $token"
    'OData-MaxVersion' = '4.0'
    'OData-Version' = '4.0'
    Accept = 'application/json'
    'Content-Type' = 'application/json'
  }
} else { $null }

function Invoke-MetadataGet([string]$relative) {
  Invoke-RestMethod -Method Get -Uri "$api/$relative" -Headers $headers
}

function Invoke-MetadataPost([string]$relative, $body) {
  Invoke-RestMethod -Method Post -Uri "$api/$relative" -Headers $headers `
    -Body ($body | ConvertTo-Json -Depth 20) | Out-Null
}

function Get-TableMetadata([string]$logicalName) {
  if (-not $headers) { return $null }
  try {
    return Invoke-MetadataGet (
      "EntityDefinitions(LogicalName='{0}')?`$select=LogicalName,SchemaName,OwnershipType,PrimaryNameAttribute" -f
        $logicalName
    )
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false }
    throw
  }
}

function Assert-TableMatch($actual, $planned) {
  if ([string]$actual.LogicalName -ne [string]$planned.logicalName) {
    throw "Table logical-name mismatch for $($planned.logicalName)."
  }
  if ([string]$actual.OwnershipType -ne [string]$planned.ownership) {
    throw "Table ownership mismatch for $($planned.logicalName): expected $($planned.ownership), actual $($actual.OwnershipType)."
  }
  if ([string]$actual.PrimaryNameAttribute -ne [string]$planned.primaryNameColumn) {
    throw "Primary-name mismatch for $($planned.logicalName): expected $($planned.primaryNameColumn), actual $($actual.PrimaryNameAttribute)."
  }
}

function New-Table($planned) {
  $primaryColumn = @($schema.columns | Where-Object {
    $_.table -eq $planned.logicalName -and $_.logicalName -eq $planned.primaryNameColumn
  })
  if ($primaryColumn.Count -ne 1) { throw "Expected one primary-name column for $($planned.logicalName)." }
  $body = @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.EntityMetadata'
    SchemaName = [string]$planned.schemaName
    DisplayName = @{ LocalizedLabels = @(@{ Label = [string]$planned.displayName; LanguageCode = 1033 }) }
    DisplayCollectionName = @{ LocalizedLabels = @(@{ Label = "$($planned.displayName)s"; LanguageCode = 1033 }) }
    OwnershipType = [string]$planned.ownership
    IsAuditEnabled = @{ Value = $true }
    HasActivities = $false
    HasNotes = $false
    Attributes = @(@{
      '@odata.type' = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'
      SchemaName = [string]$primaryColumn[0].schemaName
      LogicalName = [string]$primaryColumn[0].logicalName
      MaxLength = [int]$primaryColumn[0].maxLength
      FormatName = @{ Value = 'Text' }
      IsPrimaryName = $true
      RequiredLevel = @{ Value = 'ApplicationRequired' }
      DisplayName = @{ LocalizedLabels = @(@{ Label = [string]$primaryColumn[0].displayName; LanguageCode = 1033 }) }
      IsAuditEnabled = @{ Value = $true }
    })
  }
  Invoke-MetadataPost 'EntityDefinitions' $body
}

function Get-ColumnMetadata([string]$table, [string]$column, [string]$plannedType) {
  if (-not $headers) { return $null }
  $cast = switch ($plannedType) {
    'String' { '/Microsoft.Dynamics.CRM.StringAttributeMetadata' }
    'Memo' { '/Microsoft.Dynamics.CRM.MemoAttributeMetadata' }
    default { '' }
  }
  $select = 'LogicalName,SchemaName,AttributeType,RequiredLevel'
  if ($plannedType -in @('String', 'Memo')) { $select += ',MaxLength' }
  try {
    return Invoke-MetadataGet (
      "EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}'){2}?`$select={3}" -f
        $table, $column, $cast, $select
    )
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false }
    throw
  }
}

function Expected-AttributeType([string]$type) {
  switch ($type) {
    'String' { 'String' }
    'Memo' { 'Memo' }
    'Integer' { 'Integer' }
    'Money' { 'Money' }
    'Boolean' { 'Boolean' }
    'DateTime' { 'DateTime' }
    'Lookup' { 'Lookup' }
    default { throw "Unsupported Dataverse type $type." }
  }
}

function Assert-ColumnMatch($actual, $planned) {
  $expectedType = Expected-AttributeType ([string]$planned.type)
  if ([string]$actual.AttributeType -ne $expectedType) {
    throw "Column type mismatch for $($planned.table).$($planned.logicalName): expected $expectedType, actual $($actual.AttributeType)."
  }
  $expectedRequired = if ($planned.required) { 'ApplicationRequired' } else { 'None' }
  if ([string]$actual.RequiredLevel.Value -ne $expectedRequired) {
    throw "Column required-level mismatch for $($planned.table).$($planned.logicalName): expected $expectedRequired, actual $($actual.RequiredLevel.Value)."
  }
  if ($planned.maxLength -and [int64]$actual.MaxLength -ne [int64]$planned.maxLength) {
    throw "Column length mismatch for $($planned.table).$($planned.logicalName): expected $($planned.maxLength), actual $($actual.MaxLength)."
  }
}

function New-Column($planned) {
  $requiredLevel = if ($planned.required) { 'ApplicationRequired' } else { 'None' }
  $common = @{
    SchemaName = [string]$planned.schemaName
    LogicalName = [string]$planned.logicalName
    RequiredLevel = @{ Value = $requiredLevel }
    DisplayName = @{ LocalizedLabels = @(@{ Label = [string]$planned.displayName; LanguageCode = 1033 }) }
    IsAuditEnabled = @{ Value = $true }
  }
  switch ([string]$planned.type) {
    'String' {
      $body = $common + @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'
        MaxLength = [int]$planned.maxLength
        FormatName = @{ Value = 'Text' }
      }
    }
    'Memo' {
      $body = $common + @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.MemoAttributeMetadata'
        MaxLength = [int]$planned.maxLength
        Format = 'Text'
      }
    }
    'Integer' {
      $body = $common + @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata'
        Format = 'None'
        MinValue = -2147483648
        MaxValue = 2147483647
      }
    }
    'Money' {
      $body = $common + @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata'
        PrecisionSource = 2
        MinValue = -922337203685477.0
        MaxValue = 922337203685477.0
      }
    }
    'Boolean' {
      $body = $common + @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata'
        DefaultValue = $false
        OptionSet = @{
          '@odata.type' = 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata'
          TrueOption = @{ Value = 1; Label = @{ LocalizedLabels = @(@{ Label = 'Yes'; LanguageCode = 1033 }) } }
          FalseOption = @{ Value = 0; Label = @{ LocalizedLabels = @(@{ Label = 'No'; LanguageCode = 1033 }) } }
        }
      }
    }
    'DateTime' {
      $body = $common + @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata'
        Format = 'DateAndTime'
        DateTimeBehavior = @{ Value = 'UserLocal' }
      }
    }
    default { throw "New-Column cannot create type $($planned.type)." }
  }
  Invoke-MetadataPost ("EntityDefinitions(LogicalName='{0}')/Attributes" -f $planned.table) $body
}

function Get-RelationshipMetadata([string]$schemaName) {
  if (-not $headers) { return $null }
  try {
    return Invoke-MetadataGet (
      "RelationshipDefinitions(SchemaName='{0}')/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?`$select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute,CascadeConfiguration" -f
        $schemaName
    )
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false }
    throw
  }
}

function Assert-RelationshipMatch($actual, $planned) {
  if ([string]$actual.ReferencedEntity -ne [string]$planned.toTable -or
      [string]$actual.ReferencingEntity -ne [string]$planned.fromTable -or
      [string]$actual.ReferencingAttribute -ne [string]$planned.fromColumn) {
    throw "Relationship endpoint mismatch for $($planned.schemaName)."
  }
  if ([string]$actual.CascadeConfiguration.Delete -ne 'Restrict') {
    throw "Relationship delete behavior mismatch for $($planned.schemaName): expected Restrict."
  }
}

function New-Relationship($planned) {
  $column = @($schema.columns | Where-Object {
    $_.table -eq $planned.fromTable -and $_.logicalName -eq $planned.fromColumn
  })
  if ($column.Count -ne 1) { throw "Lookup column plan missing for $($planned.schemaName)." }
  $requiredLevel = if ($planned.required) { 'ApplicationRequired' } else { 'None' }
  $body = @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'
    SchemaName = [string]$planned.schemaName
    ReferencedEntity = [string]$planned.toTable
    ReferencingEntity = [string]$planned.fromTable
    CascadeConfiguration = @{
      Assign = 'NoCascade'
      Delete = 'Restrict'
      Merge = 'NoCascade'
      Reparent = 'NoCascade'
      Share = 'NoCascade'
      Unshare = 'NoCascade'
      RollupView = 'NoCascade'
    }
    Lookup = @{
      '@odata.type' = 'Microsoft.Dynamics.CRM.LookupAttributeMetadata'
      SchemaName = [string]$column[0].schemaName
      LogicalName = [string]$column[0].logicalName
      RequiredLevel = @{ Value = $requiredLevel }
      DisplayName = @{ LocalizedLabels = @(@{ Label = [string]$column[0].displayName; LanguageCode = 1033 }) }
      IsAuditEnabled = @{ Value = $true }
    }
  }
  Invoke-MetadataPost 'RelationshipDefinitions' $body
}

function Get-KeyMetadata([string]$table, [string]$schemaName) {
  if (-not $headers) { return $null }
  try {
    $result = Invoke-MetadataGet (
      "EntityDefinitions(LogicalName='{0}')/Keys?`$select=SchemaName,KeyAttributes,EntityKeyIndexStatus&`$filter=SchemaName eq '{1}'" -f
        $table, $schemaName
    )
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -in @(400, 404)) { return $false }
    throw
  }
  $rows = @($result.value)
  if ($rows.Count -eq 0) { return $false }
  if ($rows.Count -ne 1) { throw "Expected one alternate key named $schemaName; found $($rows.Count)." }
  return $rows[0]
}

function Assert-KeyMatch($actual, $planned) {
  $expected = @($planned.columns | ForEach-Object { [string]$_ } | Sort-Object)
  $found = @($actual.KeyAttributes | ForEach-Object { [string]$_ } | Sort-Object)
  if (($expected -join '|') -ne ($found -join '|')) {
    throw "Alternate-key column mismatch for $($planned.schemaName)."
  }
  if ([string]$actual.EntityKeyIndexStatus -eq 'Failed') {
    throw "Alternate-key index failed for $($planned.schemaName)."
  }
}

function New-Key($planned) {
  Invoke-MetadataPost ("EntityDefinitions(LogicalName='{0}')/Keys" -f $planned.table) @{
    SchemaName = [string]$planned.schemaName
    KeyAttributes = @($planned.columns | ForEach-Object { [string]$_ })
  }
}

$created = 0
$present = 0
$plannedCount = 0
try {
  foreach ($table in @($schema.tables)) {
    $actual = Get-TableMetadata ([string]$table.logicalName)
    if ($actual -eq $false) {
      if ($Apply) {
        New-Table $table
        $created++
        Write-Status $table.logicalName 'PASS' 'table created'
      } else {
        $plannedCount++
        Write-Status $table.logicalName 'PLAN' 'would create table'
      }
    } elseif ($null -eq $actual) {
      $plannedCount++
      Write-Status $table.logicalName 'PLAN' 'would verify or create table'
    } else {
      Assert-TableMatch $actual $table
      $present++
      Write-Status $table.logicalName 'PASS' 'table exists and matches'
    }
  }

  foreach ($column in @($schema.columns | Where-Object { $_.type -ne 'Lookup' })) {
    $table = @($schema.tables | Where-Object { $_.logicalName -eq $column.table })[0]
    if ($column.logicalName -eq $table.primaryNameColumn) {
      $actual = Get-ColumnMetadata ([string]$column.table) ([string]$column.logicalName) ([string]$column.type)
      if ($actual -and $actual -ne $false) { Assert-ColumnMatch $actual $column }
      continue
    }
    $actual = Get-ColumnMetadata ([string]$column.table) ([string]$column.logicalName) ([string]$column.type)
    if ($actual -eq $false) {
      if ($Apply) {
        New-Column $column
        $created++
        Write-Status "$($column.table).$($column.logicalName)" 'PASS' 'column created'
      } else {
        $plannedCount++
        Write-Status "$($column.table).$($column.logicalName)" 'PLAN' 'would create column'
      }
    } elseif ($null -eq $actual) {
      $plannedCount++
      Write-Status "$($column.table).$($column.logicalName)" 'PLAN' 'would verify or create column'
    } else {
      Assert-ColumnMatch $actual $column
      $present++
      Write-Status "$($column.table).$($column.logicalName)" 'PASS' 'column exists and matches'
    }
  }

  foreach ($relationship in @($schema.relationships)) {
    $actual = Get-RelationshipMetadata ([string]$relationship.schemaName)
    if ($actual -eq $false) {
      if ($Apply) {
        New-Relationship $relationship
        $created++
        Write-Status $relationship.schemaName 'PASS' 'restrict-delete relationship created'
      } else {
        $plannedCount++
        Write-Status $relationship.schemaName 'PLAN' 'would create restrict-delete relationship'
      }
    } elseif ($null -eq $actual) {
      $plannedCount++
      Write-Status $relationship.schemaName 'PLAN' 'would verify or create relationship'
    } else {
      Assert-RelationshipMatch $actual $relationship
      $present++
      Write-Status $relationship.schemaName 'PASS' 'relationship exists and matches'
    }
  }

  foreach ($key in @($schema.alternateKeys)) {
    $actual = Get-KeyMetadata ([string]$key.table) ([string]$key.schemaName)
    if ($actual -eq $false) {
      if ($Apply) {
        New-Key $key
        $created++
        Write-Status $key.schemaName 'PASS' 'alternate key submitted'
      } else {
        $plannedCount++
        Write-Status $key.schemaName 'PLAN' 'would create alternate key'
      }
    } elseif ($null -eq $actual) {
      $plannedCount++
      Write-Status $key.schemaName 'PLAN' 'would verify or create alternate key'
    } else {
      Assert-KeyMatch $actual $key
      $present++
      Write-Status $key.schemaName 'PASS' 'alternate key exists and matches'
    }
  }

  if ($Apply) {
    Invoke-MetadataPost 'PublishAllXml' @{}
    Write-Status 'PublishAllXml' 'PASS' 'customizations published'
  }

  Write-Host ("EVIDENCE: [bank-credit-governance][schema] mode={0} sha256={1} created={2} present={3} planned={4} ts={5}" -f
    $(if ($Apply) { 'apply' } else { 'dry-run' }), $schemaHash, $created, $present, $plannedCount, (Get-Date -Format o))
} finally {
  $token = $null
  $headers = $null
}
