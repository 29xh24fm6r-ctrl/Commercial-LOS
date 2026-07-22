<#
  Phase 4A - create-deal-reference-category.ps1

  Adds the CHOICE discriminator column `cr664_category` (Product Type / Loan
  Structure / Pricing Type) to the PRE-EXISTING reference table
  `cr664_producttypereference`. This is the schema gap that blocks Part A: the
  deal's three reference dropdowns all target this one table via three separate
  lookups, and without a category column their rows are indistinguishable.

  Reads scripts/dataverse/schema/deal-reference-category.schema.json. Keep the
  option values in sync with src/shared/governance/dealReferenceCategories.ts.

  SAFETY (same discipline as create-full-crm-runtime-schema.ps1):
    - DRY-RUN BY DEFAULT (read-only). Pass -Apply to mutate; -Force skips prompt.
    - CREATE-MISSING-ONLY + additive: the column is checked first and skipped if
      present. The table is NEVER created, renamed, deleted, or otherwise altered.
      There is NO delete/mutate-data path.
    - IDEMPOTENT + RESUME-SAFE.
    - No feature-flag flip, no seed, no `pac code` push, no route/permission change.

    powershell -File scripts/dataverse/create-deal-reference-category.ps1          # dry-run
    powershell -File scripts/dataverse/create-deal-reference-category.ps1 -Apply   # live (confirmed)

  NEXT (operator), after -Apply:
    1. scripts/dataverse/publish-customizations.ps1
    2. scripts/dataverse/regenerate-powerapps-sdk.ps1   (so cr664_category lands
       on the generated model - the app reads it via a local interface until then)
    3. node scripts/seed-deal-reference-values.mjs --verify   (then --commit)
#>
[CmdletBinding()]
param([switch]$Apply, [switch]$Force)

. (Join-Path $PSScriptRoot '_common.ps1')
$schema = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'schema\deal-reference-category.schema.json') | ConvertFrom-Json
$table = $schema.table.logicalName
$col = $schema.column

Write-Host '== Phase 4A :: Add cr664_category CHOICE discriminator (create-missing-only) =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live, gated)' } else { 'DRY-RUN (default, read-only)' }))
Write-Host ("Target: {0}.{1} (Picklist, {2} options)" -f $table, $col.logicalName, $schema.expected.options)

$envInfo = Resolve-DataverseEnv
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }
$token = if ($orgUrl) { Get-DataverseToken $orgUrl } else { $null }
$tokenOk = if ($orgUrl) { Test-DataverseToken $orgUrl $token } else { $false }

if ($Apply) {
  if (-not $orgUrl -or -not $tokenOk) {
    Write-Status 'deal-reference-category' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse-authorized token (WhoAmI 200). Aborting (no mutation).'
    exit 1
  }
  # Guard: the target table MUST already exist. We never create it here.
  $tablePresent = Test-DataverseTable $orgUrl $token $table
  if ($tablePresent -ne $true) {
    Write-Status $table 'BLOCKED' 'target reference table not found in this environment. Aborting (this script only ADDS a column to an existing table).'
    exit 1
  }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'deal-reference-category' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
} elseif (-not $tokenOk) {
  Write-Host 'Note: no Dataverse-authorized token; dry-run plans the column as WOULD CREATE (no live existence check).'
  $token = $null
}

function Test-ColumnExists([string]$tableLogical, [string]$colLogical) {
  if (-not $token -or -not $orgUrl) { return $null }
  try {
    Invoke-DataverseGet $orgUrl $token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=LogicalName" -f $tableLogical, $colLogical) | Out-Null
    return $true
  } catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false } return $null }
}

$exists = Test-ColumnExists $table $col.logicalName
if ($exists -eq $true) {
  Write-Status ("{0}.{1}" -f $table, $col.logicalName) 'PASS' 'column already exists (skip - never overwritten)'
  Write-Host ("EVIDENCE: [4A][deal-reference-category] mode={0} column=present ts={1}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), (Get-Date -Format o))
  exit 0
}

if (-not $Apply) {
  Write-Status ("{0}.{1}" -f $table, $col.logicalName) 'PLAN' ("WOULD CREATE Picklist column with {0} options (dry-run; pass -Apply)" -f $schema.expected.options)
  Write-Host ("EVIDENCE: [4A][deal-reference-category] mode=dry-run column=planned ts={0}" -f (Get-Date -Format o))
  exit 0
}

# -Apply: create the missing Picklist column with the three real options.
$options = @()
foreach ($o in $col.optionSet.options) {
  $options += @{ Value = $o.value; Label = @{ LocalizedLabels = @(@{ Label = $o.label; LanguageCode = 1033 }) } }
}
$attr = @{
  '@odata.type' = 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata'
  SchemaName    = $col.schemaName
  LogicalName   = $col.logicalName
  RequiredLevel = @{ Value = $(if ($col.requiredLevel) { $col.requiredLevel } else { 'None' }) }
  DisplayName   = @{ LocalizedLabels = @(@{ Label = $col.displayName; LanguageCode = 1033 }) }
  OptionSet     = @{
    '@odata.type' = 'Microsoft.Dynamics.CRM.OptionSetMetadata'
    IsGlobal      = [bool]$col.optionSet.isGlobal
    OptionSetType = 'Picklist'
    Options       = $options
  }
}
$body = $attr | ConvertTo-Json -Depth 12
$headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/EntityDefinitions(LogicalName='{1}')/Attributes" -f $orgUrl.TrimEnd('/'), $table) -Headers $headers -Body $body | Out-Null
Write-Status ("{0}.{1}" -f $table, $col.logicalName) 'PASS' ("Picklist column created with {0} options (was missing)" -f $schema.expected.options)

Write-Host '----'
Write-Host 'NEXT (operator): publish-customizations.ps1 -> regenerate-powerapps-sdk.ps1 -> node scripts/seed-deal-reference-values.mjs --verify (then --commit).'
Write-Host ("EVIDENCE: [4A][deal-reference-category] mode=apply column=created options={0} ts={1}" -f $schema.expected.options, (Get-Date -Format o))
