<#
  create-governed-transition-reason-field.ps1

  Platform-Enforced Credit Workflow Governance (2026-07-21). Provisions the one column
  LoanDealGovernedTransitionPlugin needs to enforce "a reason is required" for RETURN/DECLINE/
  WITHDRAW server-side:

    cr664_governedactionreason   String (2000)   Free-text reason recorded on the SAME write the
                                                   enforcement plugin inspects, not only in the
                                                   audit event's notes (a separate entity the
                                                   plugin cannot see).

  See src/deals/governedTransitionReasonSchema.ts for the full rationale and
  docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md for where this fits in the rollout sequence.
  Until this column exists AND the client's GOVERNANCE_REASON_FIELD_ENABLED flag AND the plugin's
  RequireReasonFieldToEnforce constant are both flipped true, reason enforcement stays
  client-advisory only (unchanged from today).

  DOES NOT seed any data. DOES NOT touch any other column.

  SAFETY MODEL (same as every other script in this directory - see _common.ps1):
    - DRY-RUN BY DEFAULT. Mutation happens only when you pass -Apply.
    - Confirms the target environment via `pac org who` AND checks the resolved org host matches
      the expected org - BLOCKED on any mismatch. Override with -ExpectedOrgHost if deliberate.
    - Confirms the CommercialLendingLOS solution exists in the target org before any mutation.
    - CREATE-MISSING-ONLY. The column is existence-checked first and skipped if present. Nothing
      is ever overwritten, renamed, or deleted. There is NO delete path.
    - Publishes customizations (PublishAllXml) ONLY if this run actually created the column.
    - Re-verifies metadata (AttributeType) after create/skip.

    powershell -File scripts/dataverse/create-governed-transition-reason-field.ps1            # dry-run (default)
    powershell -File scripts/dataverse/create-governed-transition-reason-field.ps1 -Apply     # create the column + publish
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedOrgHost = 'org3a57b8d4.crm.dynamics.com'
)

. (Join-Path $PSScriptRoot '_common.ps1')

$TableLogical = 'cr664_loandeal'
$SolutionUniqueName = 'CommercialLendingLOS'

$Columns = @(
  @{ logicalName = 'cr664_governedactionreason'; schemaName = 'cr664_GovernedActionReason'; displayName = 'Governed action reason'; type = 'String'; maxLength = 2000 }
)

Write-Host '== create-governed-transition-reason-field :: provision cr664_loandeal governed-action reason column =='
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
  if (-not $envInfo -or -not $token) { Write-Status 'governed-transition-reason' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse token. Aborting (no mutation).'; exit 1 }
  if (-not (Test-DataverseToken $orgUrl $token)) { Write-Status 'governed-transition-reason' 'BLOCKED' 'Token rejected by Dataverse (WhoAmI failed). Aborting (no mutation).'; exit 1 }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'governed-transition-reason' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
}

# --- Attribute body builder (String; local to this script, same pattern as
#     create-dealstagereference-sequence-column.ps1's Get-StageReferenceAttributeBody). ---
function Get-ReasonAttributeBody($ColumnDef) {
  $base = [ordered]@{
    SchemaName    = $ColumnDef.schemaName
    LogicalName   = $ColumnDef.logicalName
    RequiredLevel = @{ Value = 'None' } # Application-enforced (RequireReasonFieldToEnforce), not a
                                          # Dataverse-required column - ADVANCE never sets this field
                                          # at all, so a table-required column would break it.
    DisplayName   = @{ LocalizedLabels = @(@{ Label = $ColumnDef.displayName; LanguageCode = 1033 }) }
    '@odata.type' = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'
    MaxLength     = $ColumnDef.maxLength
    FormatName    = @{ Value = 'TextArea' }
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
    Write-Status $label 'UNKNOWN' ("WOULD CREATE {0} column, max length {1} (dry-run)" -f $col.type, $col.maxLength)
    $results += @{ column = $col.logicalName; status = 'planned' }
    continue
  }

  $body = (Get-ReasonAttributeBody $col) | ConvertTo-Json -Depth 12
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
    $actualType = Get-DataverseAttributeType $orgUrl $token $TableLogical $col.logicalName
    if ($actualType -eq 'String') {
      Write-Status ("{0}.{1}" -f $TableLogical, $col.logicalName) 'PASS' ("AttributeType={0} (expected String)" -f $actualType)
    } elseif ($null -eq $actualType) {
      Write-Status ("{0}.{1}" -f $TableLogical, $col.logicalName) 'UNKNOWN' 'could not read AttributeType (no token / not yet created in dry-run)'
    } else {
      Write-Status ("{0}.{1}" -f $TableLogical, $col.logicalName) 'BLOCKED' ("AttributeType={0} but expected String - investigate before relying on this column" -f $actualType)
    }
  }
}

Write-Host ("EVIDENCE: [governed-transition-reason][provision] mode={0} created={1} ts={2}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $created, (Get-Date -Format o))
Write-Host 'Next: regenerate the SDK (pac code add-data-source -a dataverse -t cr664_loandeal), then flip GOVERNANCE_REASON_FIELD_ENABLED (client) and RequireReasonFieldToEnforce (plugin), rebuild + redeploy the plugin, then re-run docs/governance/LIVE_OPERATOR_CERTIFICATION_SCRIPT.md.'
