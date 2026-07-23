<#
  create-deal-purpose-term-ownership-fields.ps1

  final-seven-workstreams Workstream 5A (schema PREPARATION ONLY -- NOT executed by this pass).
  Provisions the three additive columns proposed to close the "loan purpose / term / ownership
  status capture" gap the capability disposition table names as blocked-by-schema
  (BankerNewDealCreate.tsx explicitly documents these as not yet captured):

    cr664_loanpurpose       Picklist      9 options (see LOAN PURPOSE OPTION VALUES below).
    cr664_loanterm          Whole Number  Months. Min 1. Max is a POLICY DECISION, not a technical
                                          one -- this script defaults MaxValue to 480 (40 years) as
                                          a generous technical ceiling; confirm the real business
                                          maximum with credit policy before -Apply and adjust
                                          $LoanTermMaxMonths below if different.
    cr664_ownershipstatus   Picklist      5 options (see OWNERSHIP STATUS OPTION VALUES below).

  LOAN PURPOSE OPTION VALUES:
    788190000 Acquisition          788190001 Refinance         788190002 Working Capital
    788190003 Expansion            788190004 Equipment         788190005 Real Estate Purchase
    788190006 Construction         788190007 Debt Consolidation 788190008 Other

  OWNERSHIP STATUS OPTION VALUES:
    788190000 Owner-Occupied  788190001 Investment  788190002 Mixed Use
    788190003 Not Applicable  788190004 Other

  All three are OPTIONAL (RequiredLevel=None) at the schema level -- whether the app later treats
  them as INTAKE stage-exit-required criteria is a separate, business-approved change to
  src/workflow/loanWorkflowStages.ts's requiredFields, not something this script decides. Existing
  deal rows are untouched (new nullable columns; no backfill, no inference of historical values --
  see the module doc comment in src/deals/dealPurposeTermOwnershipSchema.ts, prepared alongside
  this script, for the client-side shape these columns are meant to back once provisioned).

  DOES NOT:
    - Seed any row data.
    - Touch any existing column.
    - Regenerate the SDK (run `pac code add-data-source -a dataverse -t cr664_loandeal` yourself
      after a real -Apply run, then wire the three fields into BankerNewDealCreate.tsx / the deal
      profile / underwriting summary surfaces and, if the business wants them as INTAKE exit
      criteria, loanWorkflowStages.ts's requiredFields -- all separate, later, reviewed changes).
    - Flip any application feature flag.

  SAFETY MODEL (same as every other script in this directory -- see _common.ps1):
    - DRY-RUN BY DEFAULT. Mutation happens only when you pass -Apply.
    - Confirms the target environment via `pac org who` AND checks the resolved org host matches
      the expected org -- BLOCKED on any mismatch. Override with -ExpectedOrgHost if deliberate.
    - Confirms the CommercialLendingLOS solution exists in the target org before any mutation.
    - CREATE-MISSING-ONLY. Each column is existence-checked first and skipped if present. Nothing
      is ever overwritten, renamed, or deleted. There is NO delete path.
    - Publishes customizations (PublishAllXml) ONLY if this run actually created a column.
    - Re-verifies metadata (AttributeType) after create/skip.

    powershell -File scripts/dataverse/create-deal-purpose-term-ownership-fields.ps1            # dry-run (default)
    powershell -File scripts/dataverse/create-deal-purpose-term-ownership-fields.ps1 -Apply     # create the columns + publish

  THIS SCRIPT HAS NOT BEEN RUN. Per the repository's schema-change guardrail, no live mutation
  happens without Matthew's explicit authorization -- see docs/final-seven-workstreams/
  05_DEAL_SCHEMA_EXPANSION.md for the exact authorization + rollback sequence.
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedOrgHost = 'org3a57b8d4.crm.dynamics.com',
  [int]$LoanTermMaxMonths = 480
)

. (Join-Path $PSScriptRoot '_common.ps1')

$TableLogical = 'cr664_loandeal'
$SolutionUniqueName = 'CommercialLendingLOS'

$LoanPurposeOptions = @(
  @{ Value = 788190000; Label = 'Acquisition' }
  @{ Value = 788190001; Label = 'Refinance' }
  @{ Value = 788190002; Label = 'Working Capital' }
  @{ Value = 788190003; Label = 'Expansion' }
  @{ Value = 788190004; Label = 'Equipment' }
  @{ Value = 788190005; Label = 'Real Estate Purchase' }
  @{ Value = 788190006; Label = 'Construction' }
  @{ Value = 788190007; Label = 'Debt Consolidation' }
  @{ Value = 788190008; Label = 'Other' }
)

$OwnershipStatusOptions = @(
  @{ Value = 788190000; Label = 'Owner-Occupied' }
  @{ Value = 788190001; Label = 'Investment' }
  @{ Value = 788190002; Label = 'Mixed Use' }
  @{ Value = 788190003; Label = 'Not Applicable' }
  @{ Value = 788190004; Label = 'Other' }
)

$Columns = @(
  @{ logicalName = 'cr664_loanpurpose'; schemaName = 'cr664_LoanPurpose'; displayName = 'Loan purpose'; type = 'Picklist'; options = $LoanPurposeOptions }
  @{ logicalName = 'cr664_loanterm'; schemaName = 'cr664_LoanTerm'; displayName = 'Loan term (months)'; type = 'WholeNumber' }
  @{ logicalName = 'cr664_ownershipstatus'; schemaName = 'cr664_OwnershipStatus'; displayName = 'Ownership status'; type = 'Picklist'; options = $OwnershipStatusOptions }
)

Write-Host '== create-deal-purpose-term-ownership-fields :: provision cr664_loandeal purpose/term/ownership columns =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live, gated)' } else { 'DRY-RUN (default, read-only)' }))

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }

# --- Environment identity check (BLOCKED on mismatch, always). ---
if ($envInfo -and $envInfo.OrgUrl) {
  $orgHostMatches = $envInfo.OrgUrl -match [regex]::Escape($ExpectedOrgHost)
  if (-not $orgHostMatches) {
    Write-Status 'environment' 'BLOCKED' ("Resolved org '{0}' does not match expected host '{1}'. Pass -ExpectedOrgHost to override if this is deliberate. Aborting (no mutation)." -f $envInfo.OrgUrl, $ExpectedOrgHost)
    if ($Apply) { exit 1 }
  } else {
    Write-Status 'environment' 'PASS' ("org host matches expected '{0}'" -f $ExpectedOrgHost)
  }
} else {
  Write-Status 'environment' 'UNKNOWN' 'pac is not connected; cannot confirm target environment.'
  if ($Apply) { Write-Status 'environment' 'BLOCKED' 'Apply requires a confirmed, matching environment. Aborting.'; exit 1 }
}

# --- Solution existence check. ---
function Test-DataverseSolutionExists([string]$OrgUrl, [string]$Token, [string]$UniqueName) {
  if (-not $Token -or -not $OrgUrl) { return $null }
  try {
    $result = Invoke-DataverseGet $OrgUrl $Token ("solutions?`$select=uniquename&`$filter=uniquename eq '{0}'" -f $UniqueName)
    return ($result.value.Count -gt 0)
  } catch { return $null }
}
$solutionExists = Test-DataverseSolutionExists $orgUrl $token $SolutionUniqueName
if ($solutionExists -eq $true) {
  Write-Status $SolutionUniqueName 'PASS' 'solution exists in target org'
} elseif ($solutionExists -eq $false) {
  Write-Status $SolutionUniqueName 'BLOCKED' 'solution not found in target org. Aborting (no mutation).'
  if ($Apply) { exit 1 }
} else {
  Write-Status $SolutionUniqueName 'UNKNOWN' 'could not verify solution (no token / transient error).'
  if ($Apply) { Write-Status $SolutionUniqueName 'BLOCKED' 'Apply requires a verified solution. Aborting.'; exit 1 }
}

if ($Apply) {
  if (-not $envInfo -or -not $token) { Write-Status 'deal-purpose-term-ownership' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse token. Aborting (no mutation).'; exit 1 }
  if (-not (Test-DataverseToken $orgUrl $token)) { Write-Status 'deal-purpose-term-ownership' 'BLOCKED' 'Token rejected by Dataverse (WhoAmI failed). Aborting (no mutation).'; exit 1 }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'deal-purpose-term-ownership' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
}

# --- Attribute body builder (Picklist / WholeNumber; mirrors
#     create-document-requirement-lifecycle-fields.ps1's Get-RequirementLifecycleAttributeBody). ---
function Get-PurposeTermOwnershipAttributeBody($ColumnDef) {
  $base = [ordered]@{
    SchemaName    = $ColumnDef.schemaName
    LogicalName   = $ColumnDef.logicalName
    RequiredLevel = @{ Value = 'None' } # Optional at the schema level -- INTAKE stage-exit
                                          # requirement, if any, is a separate business-approved
                                          # change to loanWorkflowStages.ts, not decided here.
    DisplayName   = @{ LocalizedLabels = @(@{ Label = $ColumnDef.displayName; LanguageCode = 1033 }) }
  }
  switch ($ColumnDef.type) {
    'Picklist' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata'
      $options = $ColumnDef.options | ForEach-Object {
        @{ Value = $_.Value; Label = @{ LocalizedLabels = @(@{ Label = $_.Label; LanguageCode = 1033 }) } }
      }
      $base.OptionSet = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.OptionSetMetadata'
        IsGlobal      = $false
        OptionSetType = 'Picklist'
        Options       = $options
      }
    }
    'WholeNumber' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata'
      $base.MinValue = 1
      $base.MaxValue = $LoanTermMaxMonths
      $base.Format = 'None'
    }
  }
  return $base
}

function Get-DataverseAttributeType([string]$OrgUrl, [string]$Token, [string]$TableLogical, [string]$ColumnLogical) {
  if (-not $Token -or -not $OrgUrl) { return $null }
  try {
    $r = Invoke-DataverseGet $OrgUrl $Token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=AttributeType" -f $TableLogical, $ColumnLogical)
    return $r.AttributeType
  } catch { return $null }
}

$created = 0
$results = @()
foreach ($col in $Columns) {
  $label = "{0}.{1}" -f $TableLogical, $col.logicalName
  $exists = $null
  if ($token -and $orgUrl) {
    try {
      Invoke-DataverseGet $orgUrl $token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=LogicalName" -f $TableLogical, $col.logicalName) | Out-Null
      $exists = $true
    } catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { $exists = $false } }
  }

  if ($exists -eq $true) {
    Write-Status $label 'PASS' 'column exists (skip - never overwritten)'
    $results += @{ column = $col.logicalName; status = 'present' }
    continue
  }
  if (-not $Apply) {
    Write-Status $label 'UNKNOWN' ("WOULD CREATE {0} column (dry-run)" -f $col.type)
    $results += @{ column = $col.logicalName; status = 'planned' }
    continue
  }

  $body = (Get-PurposeTermOwnershipAttributeBody $col) | ConvertTo-Json -Depth 12
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/EntityDefinitions(LogicalName='{1}')/Attributes" -f $orgUrl.TrimEnd('/'), $TableLogical) -Headers $headers -Body $body | Out-Null
  Write-Status $label 'PASS' ("{0} column created (was missing)" -f $col.type)
  $results += @{ column = $col.logicalName; status = 'created' }
  $created++
}

# --- Publish - only if something was actually created this run. ---
if ($Apply -and $created -gt 0) {
  Write-Host '== Publishing customizations (column was created) =='
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/PublishAllXml" -f $orgUrl.TrimEnd('/')) -Headers $headers -Body '{}' | Out-Null
  Write-Status 'publish' 'PASS' 'customizations published'
} elseif ($Apply) {
  Write-Status 'publish' 'PASS' 'nothing created this run - publish skipped (idempotent no-op)'
}

# --- Post-create metadata verification. ---
if ($Apply -or $token) {
  Write-Host '== Metadata verification =='
  foreach ($col in $Columns) {
    $expectedType = if ($col.type -eq 'Picklist') { 'Picklist' } else { 'Integer' }
    $actualType = Get-DataverseAttributeType $orgUrl $token $TableLogical $col.logicalName
    if ($actualType -eq $expectedType) {
      Write-Status ("{0}.{1}" -f $TableLogical, $col.logicalName) 'PASS' ("AttributeType={0} (expected {1})" -f $actualType, $expectedType)
    } elseif ($null -eq $actualType) {
      Write-Status ("{0}.{1}" -f $TableLogical, $col.logicalName) 'UNKNOWN' 'could not read AttributeType (no token / not yet created in dry-run)'
    } else {
      Write-Status ("{0}.{1}" -f $TableLogical, $col.logicalName) 'BLOCKED' ("AttributeType={0} but expected {1} - investigate before relying on this column" -f $actualType, $expectedType)
    }
  }
}

Write-Host ("EVIDENCE: [deal-purpose-term-ownership][provision] mode={0} created={1} ts={2}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $created, (Get-Date -Format o))
Write-Host 'Next: regenerate the SDK (pac code add-data-source -a dataverse -t cr664_loandeal), add the three fields to BankerNewDealCreate.tsx / Deal Profile / underwriting summary, decide with the business whether they become INTAKE requiredFields, and add corresponding tests -- all separate, reviewed changes (Phase 5B), not performed by this script.'
