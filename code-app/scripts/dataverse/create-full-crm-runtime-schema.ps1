<#
  Phase 253 - create-full-crm-runtime-schema.ps1

  Brings the live internal OGB CRM schema up to the FULL runtime contract required by
  src/crm/crmDataverseSchemaPlan.ts (EXPECTED_CRM_SCHEMA = 10 tables / 147 columns /
  28 relationships). Reads scripts/dataverse/schema/crm-full.schema.json (generated
  from the plan). Internal OGB CRM only - never a vendor (nCino/Salesforce) table.

  SAFETY:
    - DRY-RUN BY DEFAULT (read-only). Pass -Apply to mutate; -Force skips the prompt.
    - CREATE-MISSING-ONLY: every table/column/relationship is checked for existence
      first and skipped if present. Nothing is ever overwritten, renamed, or deleted.
      There is NO delete/rename/mutate-data path. Additive only.
    - IDEMPOTENT + RESUME-SAFE: safe to rerun after partial success.
    - No feature-flag flip, no email, no `pac code` push, no route/permission change.

    powershell -File scripts/dataverse/create-full-crm-runtime-schema.ps1          # dry-run
    powershell -File scripts/dataverse/create-full-crm-runtime-schema.ps1 -Apply   # live (confirmed)
#>
[CmdletBinding()]
param([switch]$Apply, [switch]$Force)

. (Join-Path $PSScriptRoot '_common.ps1')
$schema = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'schema\crm-full.schema.json') | ConvertFrom-Json

# External (non-CRM) lookup targets whose absence must NOT block the CRM buildout - the
# optional relationship pointing at them is skipped instead (mirrors CRM_OPTIONAL_EXTERNAL_TARGETS).
$OPTIONAL_EXTERNAL_TARGETS = @('cr664_portfolioboardedloan', 'cr664_loandeal', 'cr664_team', 'cr664_platformuser', 'systemuser')
$crmTableNames = @($schema.tables | ForEach-Object { $_.logicalName })

Write-Host '== Phase 253 :: Build FULL internal OGB CRM runtime schema (create-missing-only) =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live, gated)' } else { 'DRY-RUN (default, read-only)' }))
Write-Host ("Target contract: {0} tables / {1} columns / {2} relationships" -f $schema.expected.tables, $schema.expected.columns, $schema.expected.relationships)

$envInfo = Resolve-DataverseEnv
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }
$token = if ($orgUrl) { Get-DataverseToken $orgUrl } else { $null }
$tokenOk = if ($orgUrl) { Test-DataverseToken $orgUrl $token } else { $false }

if ($Apply) {
  if (-not $orgUrl -or -not $tokenOk) {
    Write-Status 'crm-full' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse-authorized token (WhoAmI 200). Aborting (no mutation).'
    exit 1
  }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'crm-full' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
} elseif (-not $tokenOk) {
  # Dry-run without a usable token: do not make failing metadata calls — plan everything.
  Write-Host 'Note: no Dataverse-authorized token; dry-run plans all schema as WOULD CREATE (no live existence checks).'
  $token = $null
}

function Test-CrmColumnExists([string]$tableLogical, [string]$colLogical) {
  if (-not $token -or -not $orgUrl) { return $null }
  try {
    Invoke-DataverseGet $orgUrl $token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=LogicalName" -f $tableLogical, $colLogical) | Out-Null
    return $true
  } catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } return $null }
}

function New-CrmColumnIfMissing($colDef, [string]$tableLogical) {
  $logical = $colDef.logicalName
  $exists = Test-CrmColumnExists $tableLogical $logical
  if ($exists -eq $true) { Write-Status ("{0}.{1}" -f $tableLogical, $logical) 'PASS' 'column exists (skip)'; return 'present' }
  if (-not $Apply) { Write-Status ("{0}.{1}" -f $tableLogical, $logical) 'PLAN' ("WOULD CREATE {0} column (dry-run)" -f $colDef.type); return 'planned' }

  $level = if ($colDef.requiredLevel) { $colDef.requiredLevel } else { 'None' }
  $schemaName = $colDef.schemaName
  $display = @{ LocalizedLabels = @(@{ Label = $colDef.displayName; LanguageCode = 1033 }) }
  $attr = $null
  switch ($colDef.type) {
    'String'   { $attr = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'; MaxLength = $(if ($colDef.maxLength) { $colDef.maxLength } else { 200 }); FormatName = @{ Value = 'Text' } } }
    'Memo'     { $attr = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.MemoAttributeMetadata'; MaxLength = $(if ($colDef.maxLength) { $colDef.maxLength } else { 2000 }); Format = 'Text' } }
    'Integer'  { $attr = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata'; Format = 'None' } }
    'DateTime' { $attr = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata'; Format = 'DateAndTime'; DateTimeBehavior = @{ Value = 'UserLocal' } } }
    'Boolean'  { $attr = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata'; OptionSet = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata'; TrueOption = @{ Value = 1; Label = @{ LocalizedLabels = @(@{ Label = 'Yes'; LanguageCode = 1033 }) } }; FalseOption = @{ Value = 0; Label = @{ LocalizedLabels = @(@{ Label = 'No'; LanguageCode = 1033 }) } } } } }
    'Picklist' { $attr = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata'; OptionSet = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.OptionSetMetadata'; IsGlobal = $false; OptionSetType = 'Picklist'; Options = @(@{ Value = 1; Label = @{ LocalizedLabels = @(@{ Label = 'Unspecified'; LanguageCode = 1033 }) } }) } } }
    default    { $attr = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'; MaxLength = 200; FormatName = @{ Value = 'Text' } } }
  }
  $attr.SchemaName = $schemaName
  $attr.LogicalName = $logical
  $attr.RequiredLevel = @{ Value = $level }
  $attr.DisplayName = $display
  $body = $attr | ConvertTo-Json -Depth 12
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/EntityDefinitions(LogicalName='{1}')/Attributes" -f $orgUrl.TrimEnd('/'), $tableLogical) -Headers $headers -Body $body | Out-Null
  Write-Status ("{0}.{1}" -f $tableLogical, $logical) 'PASS' ("{0} column created (was missing)" -f $colDef.type)
  return 'created'
}

# --- 1. Tables (with primary name) -----------------------------------------
$tStates = @()
foreach ($t in ($schema.tables | Sort-Object seedOrder)) {
  $def = [pscustomobject]@{ logicalName = $t.logicalName; schemaName = $t.schemaName; displayName = $t.displayName; displayCollectionName = $t.displayCollectionName; primaryNameColumn = $t.primaryNameColumn; ownershipType = $t.ownershipType; auditEnabled = $false }
  $tStates += (New-DataverseTableIfMissing -TableDef $def -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
}

# --- 2. Columns -------------------------------------------------------------
$cStates = @()
foreach ($t in ($schema.tables | Sort-Object seedOrder)) {
  foreach ($c in $t.requiredColumns) { $cStates += (New-CrmColumnIfMissing $c $t.logicalName) }
}

# --- 3. Relationships (lookups) - skip optional external targets that are absent ---
$rStates = @()
foreach ($r in $schema.relationships) {
  if (-not $r.schemaName) { continue }
  $targetPresent = ($crmTableNames -contains $r.toTable)
  if (-not $targetPresent) {
    $live = Test-DataverseTable $orgUrl $token $r.toTable
    $targetPresent = ($live -eq $true)
  }
  if (-not $targetPresent) {
    if ($OPTIONAL_EXTERNAL_TARGETS -contains $r.toTable) {
      Write-Status $r.schemaName 'SKIP' ("optional external target {0} not present - relationship skipped (non-blocking)" -f $r.toTable)
      $rStates += 'skipped-missing-target'
      continue
    }
    Write-Status $r.schemaName 'BLOCKED' ("required target {0} not present" -f $r.toTable)
    $rStates += 'blocked-missing-target'
    continue
  }
  $relDef = [pscustomobject]@{ schemaName = $r.schemaName; fromTable = $r.fromTable; fromColumn = $r.fromColumn; toTable = $r.toTable }
  $rStates += (New-DataverseRelationshipIfMissing -RelDef $relDef -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
}

$all = @($tStates + $cStates + $rStates)
$created = (@($all | Where-Object { $_ -eq 'created' })).Count
$present = (@($all | Where-Object { $_ -eq 'present' })).Count
$planned = (@($all | Where-Object { $_ -eq 'planned' })).Count
$skipped = (@($rStates | Where-Object { $_ -like 'skipped*' -or $_ -like 'blocked*' })).Count

Write-Host '----'
Write-Host 'NEXT (operator): after -Apply, run publish-customizations.ps1, then regenerate-powerapps-sdk.ps1,'
Write-Host '                 then verify-full-crm-schema.ps1 and export-runtime-schema-evidence.ps1.'
Write-Host ("EVIDENCE: [253][crm-full] mode={0} tables={1} columns={2} relationships={3} created={4} present={5} planned={6} skipped={7} ts={8}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $schema.expected.tables, $schema.expected.columns, $schema.expected.relationships, $created, $present, $planned, $skipped, (Get-Date -Format o))
