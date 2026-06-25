<#
  Phase 253P - create-full-portfolio-runtime-schema.ps1

  Brings the LIVE portfolio boarding environment up from the minimal boarding spine
  (13 tables / ~15 columns / 0 required relationships) to the FULL runtime contract
  required by src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts and
  EXPECTED_BOARDING_SCHEMA: 13 tables, 219 columns, 12 required child->root
  relationships (+ 6 optional lookups).

  Reads the GENERATED contract scripts/dataverse/schema/portfolio-boarding.full.schema.json
  (emitted from the TS plan via src/portfolioBoarding/portfolioFullSchemaArtifact.ts).

  SAFETY (enforced):
    - DRY-RUN BY DEFAULT. Mutation happens only when you pass -Apply; -Force skips the prompt.
    - CREATE-MISSING-ONLY / ADDITIVE. Every table, column and relationship is existence-
      checked first and skipped if present. Nothing is ever overwritten, renamed or deleted.
    - IDEMPOTENT + RESUME-SAFE. Safe to rerun after a partial success; it only creates what
      is still missing. No state is kept between runs - existence is re-probed each time.
    - Preserves the existing live tables/fields. No feature-flag flip, no email, no
      `pac code push`, no route change.

  Choice/option-set plan columns are materialized as TEXT columns (the plan's optionSetKey
  token is stored as text), exactly as the deployed spine already models cr664_loanstatus /
  cr664_boardingstatus and as portfolioLoanBoardingDataverseMapper.ts writes them. No global
  option sets are created. Lookup columns are materialized via relationship creation, never
  as standalone attributes.

    powershell -File scripts/dataverse/create-full-portfolio-runtime-schema.ps1            # dry-run (default)
    powershell -File scripts/dataverse/create-full-portfolio-runtime-schema.ps1 -Apply     # live (confirmed)
#>
[CmdletBinding()]
param([switch]$Apply, [switch]$Force)

. (Join-Path $PSScriptRoot '_common.ps1')
$schemaPath = Join-Path $PSScriptRoot 'schema\portfolio-boarding.full.schema.json'
$schema = Get-Content -Raw -LiteralPath $schemaPath | ConvertFrom-Json

$expCols = $schema.expectedCounts.columns
$expReq = $schema.expectedCounts.requiredRelationships
$expOpt = $schema.expectedCounts.optionalRelationships

Write-Host '== Phase 253P :: Build FULL portfolio runtime schema (create-missing-only, additive, resume-safe) =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live, gated)' } else { 'DRY-RUN (default, read-only)' }))
Write-Host ("Contract: tables={0} columns={1} requiredRels={2} optionalRels={3}" -f $schema.tables.Count, $expCols, $expReq, $expOpt)
Write-Host ("Source of truth: {0}" -f $schema.generatedFromSourceOfTruth)

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }

if ($Apply) {
  if (-not $envInfo -or -not $token) { Write-Status 'portfolio-full' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse token. Aborting (no mutation).'; exit 1 }
  if (-not (Test-DataverseToken $orgUrl $token)) { Write-Status 'portfolio-full' 'BLOCKED' 'Token rejected by Dataverse (WhoAmI failed). Aborting (no mutation).'; exit 1 }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'portfolio-full' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
}

# --- Extended (full-type) attribute creator. Additive, existence-checked, never overwrites. ---
function Get-FullAttributeBody($ColumnDef) {
  $schemaName = $ColumnDef.schemaName
  if (-not $schemaName) { $schemaName = $ColumnDef.logicalName.Substring(0,1).ToUpper() + $ColumnDef.logicalName.Substring(1) }
  $req = if ($ColumnDef.requiredLevel) { $ColumnDef.requiredLevel } else { 'None' }
  $base = [ordered]@{
    SchemaName    = $schemaName
    LogicalName   = $ColumnDef.logicalName
    RequiredLevel = @{ Value = $req }
    DisplayName   = @{ LocalizedLabels = @(@{ Label = $ColumnDef.displayName; LanguageCode = 1033 }) }
  }
  switch ($ColumnDef.type) {
    'Memo' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.MemoAttributeMetadata'
      $base.MaxLength = $(if ($ColumnDef.maxLength) { $ColumnDef.maxLength } else { 2000 })
      $base.Format = 'Text'
    }
    'Integer' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata'
      $base.Format = 'None'; $base.MinValue = -2147483648; $base.MaxValue = 2147483647
    }
    'Decimal' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata'
      $base.Precision = $(if ($ColumnDef.precision) { $ColumnDef.precision } else { 2 })
      $base.MinValue = -100000000000; $base.MaxValue = 100000000000
    }
    'Money' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata'
      $base.Precision = $(if ($ColumnDef.precision) { $ColumnDef.precision } else { 2 })
      $base.PrecisionSource = 2; $base.MinValue = 0.0; $base.MaxValue = 922337203685477.0
    }
    'Boolean' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata'
      $base.OptionSet = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata'
        TrueOption  = @{ Value = 1; Label = @{ LocalizedLabels = @(@{ Label = 'Yes'; LanguageCode = 1033 }) } }
        FalseOption = @{ Value = 0; Label = @{ LocalizedLabels = @(@{ Label = 'No'; LanguageCode = 1033 }) } }
      }
    }
    'DateTime' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata'
      $base.Format = 'DateAndTime'; $base.DateTimeBehavior = @{ Value = 'UserLocal' }
    }
    default {
      # String, Picklist (materialized as text token), and any unknown type -> String.
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'
      $base.MaxLength = $(if ($ColumnDef.maxLength) { $ColumnDef.maxLength } elseif ($ColumnDef.type -eq 'Picklist') { 100 } else { 200 })
      $base.FormatName = @{ Value = 'Text' }
    }
  }
  return $base
}

function New-PortfolioColumnIfMissing {
  param([Parameter(Mandatory)]$ColumnDef, [string]$TableLogical, [string]$OrgUrl, [string]$Token, [bool]$Apply)
  $label = "{0}.{1}" -f $TableLogical, $ColumnDef.logicalName
  if ($ColumnDef.type -eq 'Lookup') { return 'lookup-deferred' }          # created by relationship pass
  if ($ColumnDef.logicalName -eq 'cr664_name') { return 'present' }       # primary name created with the table
  $exists = $null
  if ($Token -and $OrgUrl) {
    try {
      Invoke-DataverseGet $OrgUrl $Token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=LogicalName" -f $TableLogical, $ColumnDef.logicalName) | Out-Null
      $exists = $true
    } catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { $exists = $false } }
  }
  if ($exists -eq $true) { Write-Status $label 'PASS' 'column exists (skip - never overwritten)'; return 'present' }
  if (-not $Apply) { Write-Status $label 'UNKNOWN' ("WOULD CREATE {0} column (dry-run)" -f $ColumnDef.type); return 'planned' }

  $body = (Get-FullAttributeBody $ColumnDef) | ConvertTo-Json -Depth 12
  $headers = @{ Authorization = "Bearer $Token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/EntityDefinitions(LogicalName='{1}')/Attributes" -f $OrgUrl.TrimEnd('/'), $TableLogical) -Headers $headers -Body $body | Out-Null
  Write-Status $label 'PASS' ("{0} column created (was missing)" -f $ColumnDef.type)
  return 'created'
}

# --- Faithful relationship creator (required level + cascade from the plan). Existence-checked. ---
function New-PortfolioRelationshipIfMissing {
  param([Parameter(Mandatory)]$RelDef, [string]$OrgUrl, [string]$Token, [bool]$Apply)
  if (-not $RelDef.schemaName) { return 'skipped' }
  $exists = $null
  if ($Token -and $OrgUrl) {
    try { Invoke-DataverseGet $OrgUrl $Token ("RelationshipDefinitions(SchemaName='{0}')?`$select=SchemaName" -f $RelDef.schemaName) | Out-Null; $exists = $true }
    catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { $exists = $false } }
  }
  if ($exists -eq $true) { Write-Status $RelDef.schemaName 'PASS' 'relationship exists (skip - never overwritten)'; return 'present' }
  if (-not $Apply) { Write-Status $RelDef.schemaName 'UNKNOWN' ("WOULD CREATE {0} relationship (dry-run)" -f $(if ($RelDef.required) { 'required' } else { 'optional' })); return 'planned' }

  $cascade = if ($RelDef.cascadeBehavior -eq 'Parental') {
    @{ Assign = 'Cascade'; Delete = 'Cascade'; Merge = 'Cascade'; Reparent = 'Cascade'; Share = 'Cascade'; Unshare = 'Cascade' }
  } else {
    @{ Assign = 'NoCascade'; Delete = 'RemoveLink'; Merge = 'NoCascade'; Reparent = 'NoCascade'; Share = 'NoCascade'; Unshare = 'NoCascade' }
  }
  $lookupReq = if ($RelDef.required) { 'ApplicationRequired' } else { 'None' }
  $body = @{
    '@odata.type'        = 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'
    SchemaName           = $RelDef.schemaName
    ReferencedEntity     = $RelDef.toTable
    ReferencingEntity    = $RelDef.fromTable
    CascadeConfiguration = $cascade
    Lookup               = @{
      '@odata.type' = 'Microsoft.Dynamics.CRM.LookupAttributeMetadata'
      SchemaName    = $RelDef.fromColumn
      LogicalName   = $RelDef.fromColumn.ToLower()
      RequiredLevel = @{ Value = $lookupReq }
      DisplayName   = @{ LocalizedLabels = @(@{ Label = $RelDef.fromColumn; LanguageCode = 1033 }) }
    }
  } | ConvertTo-Json -Depth 12
  $headers = @{ Authorization = "Bearer $Token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/RelationshipDefinitions" -f $OrgUrl.TrimEnd('/')) -Headers $headers -Body $body | Out-Null
  Write-Status $RelDef.schemaName 'PASS' 'relationship created (was missing)'
  return 'created'
}

$tStates = @(); $cStates = @(); $rStates = @()

# 1) Tables (root first so child->root lookups can bind). Already-present tables are preserved.
$ordered = @($schema.tables | Where-Object { $_.isRoot }) + @($schema.tables | Where-Object { -not $_.isRoot })
foreach ($t in $ordered) {
  $tStates += (New-DataverseTableIfMissing -TableDef $t -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
}

# 2) Non-lookup columns for every table (additive). Lookups are deferred to the relationship pass.
foreach ($t in $ordered) {
  foreach ($c in $t.fullColumns) {
    $cStates += (New-PortfolioColumnIfMissing -ColumnDef $c -TableLogical $t.logicalName -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
  }
}

# 3) Relationships (these materialize the lookup columns). Required child->root first, then optional.
foreach ($r in @($schema.relationships | Where-Object { $_.required })) {
  $rStates += (New-PortfolioRelationshipIfMissing -RelDef $r -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
}
foreach ($r in @($schema.relationships | Where-Object { -not $_.required })) {
  $rStates += (New-PortfolioRelationshipIfMissing -RelDef $r -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
}

$created = (@($tStates + $cStates + $rStates) | Where-Object { $_ -eq 'created' }).Count
$present = (@($tStates + $cStates + $rStates) | Where-Object { $_ -eq 'present' }).Count
$planned = (@($tStates + $cStates + $rStates) | Where-Object { $_ -eq 'planned' }).Count
$colCreated = (@($cStates) | Where-Object { $_ -eq 'created' }).Count
$relCreated = (@($rStates) | Where-Object { $_ -eq 'created' }).Count

Write-Host '----'
Write-Host ("SUMMARY: tables={0}  columns(present/planned/created)={1}/{2}/{3}  relationships(created={4})" -f $schema.tables.Count, ($cStates | Where-Object { $_ -eq 'present' }).Count, ($cStates | Where-Object { $_ -eq 'planned' }).Count, $colCreated, $relCreated)
Write-Host 'NEXT (operator): after -Apply, run publish-customizations.ps1, then regenerate-powerapps-sdk.ps1, then verify-full-portfolio-runtime-schema.ps1 to measure 219/219 + 12/12 and emit fresh runtime evidence.'
Write-Host ("EVIDENCE: [253P][portfolio-full] mode={0} tables={1} expCols={2} expReqRel={3} created={4} present={5} planned={6} colCreated={7} relCreated={8} ts={9}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $schema.tables.Count, $expCols, $expReq, $created, $present, $planned, $colCreated, $relCreated, (Get-Date -Format o))

# Fail-closed in APPLY mode if anything remained planned (i.e. could not be created).
if ($Apply -and $planned -gt 0) { Write-Status 'portfolio-full' 'BLOCKED' ("{0} item(s) still planned after apply - rerun to resume." -f $planned); exit 1 }
exit 0
