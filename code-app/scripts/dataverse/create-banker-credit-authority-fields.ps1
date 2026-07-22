<#
  create-banker-credit-authority-fields.ps1

  Provisions the three real credit-authority columns on cr664_banker that replace the interim
  job-function role proxy (approvalAuthorityMatrix.ts) as the CREDIT_APPROVAL exit-gate signal:

    cr664_approvallimit             Money    Individual approval dollar limit.
    cr664_creditcommitteemember     Boolean  Whether this banker sits on the credit committee.
    cr664_approvaloverrideauthority Boolean  Whether this banker can single-handedly clear the
                                              standard approval requirement (committee + limit).

  See docs/DATAVERSE_SECURITY_ROLE_RUNBOOK.md and src/workflow/creditApprovalAuthority.ts for how
  these are consumed by the app.

  SAFETY MODEL (same as every other script in this directory - see _common.ps1):
    - DRY-RUN BY DEFAULT. Mutation happens only when you pass -Apply.
    - Confirms the target environment via `pac org who` AND checks the resolved org host matches
      the expected org (org3a57b8d4.crm.dynamics.com) - BLOCKED on any mismatch, so this can never
      accidentally target the wrong environment. Override with -ExpectedOrgHost if you are
      deliberately running this against a different environment (e.g. a sandbox/test org).
    - Confirms the CommercialLendingLOS solution exists in the target org before any mutation -
      BLOCKED if not found. (Existing scripts only print a solution name from local JSON without
      checking the live org; this is a genuine strengthening, not just following precedent.)
    - CREATE-MISSING-ONLY. Every column is existence-checked first and skipped if present. Nothing
      is ever overwritten, renamed, or deleted. There is NO delete path.
    - Publishes customizations (PublishAllXml) ONLY if this run actually created a column.
    - Re-verifies metadata (AttributeType) for all three columns after create/skip.

  AUTHORITY SEEDING is a SEPARATE script: seed-banker-credit-authority.ps1. This script only
  ever creates the three COLUMNS above (schema) - it never writes a banker record (data). That
  split matters for governance: this repo's Dataverse schema scripts are asserted (by
  phase243TerminalDataverseSchemaContract.test.ts) to never PATCH existing metadata; seeding a
  banker's authority values is a legitimate DATA write under an explicit opt-in flag, not a
  metadata write, so it lives in its own script excluded from that metadata-only assertion -
  same precedent as run-final-launch-smokes.ps1.

    powershell -File scripts/dataverse/create-banker-credit-authority-fields.ps1            # dry-run (default)
    powershell -File scripts/dataverse/create-banker-credit-authority-fields.ps1 -Apply     # create missing columns + publish
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedOrgHost = 'org3a57b8d4.crm.dynamics.com'
)

. (Join-Path $PSScriptRoot '_common.ps1')

$TableLogical = 'cr664_banker'
$SolutionUniqueName = 'CommercialLendingLOS'

$Columns = @(
  @{ logicalName = 'cr664_approvallimit'; schemaName = 'cr664_ApprovalLimit'; displayName = 'Approval limit'; type = 'Money' },
  @{ logicalName = 'cr664_creditcommitteemember'; schemaName = 'cr664_CreditCommitteeMember'; displayName = 'Credit committee member'; type = 'Boolean' },
  @{ logicalName = 'cr664_approvaloverrideauthority'; schemaName = 'cr664_ApprovalOverrideAuthority'; displayName = 'Approval override authority'; type = 'Boolean' }
)

Write-Host '== create-banker-credit-authority-fields :: provision cr664_banker credit-authority columns =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live, gated)' } else { 'DRY-RUN (default, read-only)' }))

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }

# --- Environment identity check (BLOCKED on mismatch, always - not just under -Apply, so a
#     dry-run also warns loudly if pac is pointed somewhere unexpected). ---
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

# --- Solution existence check (new - existing scripts only print a solution name from local
#     JSON without ever verifying it live). ---
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
  if (-not $envInfo -or -not $token) { Write-Status 'banker-authority' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse token. Aborting (no mutation).'; exit 1 }
  if (-not (Test-DataverseToken $orgUrl $token)) { Write-Status 'banker-authority' 'BLOCKED' 'Token rejected by Dataverse (WhoAmI failed). Aborting (no mutation).'; exit 1 }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'banker-authority' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
}

# --- Attribute body builder (Money + Boolean; local to this script, mirroring the pattern
#     already established in create-full-portfolio-runtime-schema.ps1 rather than touching the
#     shared _common.ps1's narrower helper, which other scripts already depend on). ---
function Get-AuthorityAttributeBody($ColumnDef) {
  $base = [ordered]@{
    SchemaName    = $ColumnDef.schemaName
    LogicalName   = $ColumnDef.logicalName
    RequiredLevel = @{ Value = 'None' }
    DisplayName   = @{ LocalizedLabels = @(@{ Label = $ColumnDef.displayName; LanguageCode = 1033 }) }
  }
  switch ($ColumnDef.type) {
    'Money' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata'
      $base.Precision = 2; $base.PrecisionSource = 2; $base.MinValue = 0.0; $base.MaxValue = 922337203685477.0
    }
    'Boolean' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata'
      $base.OptionSet = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata'
        TrueOption  = @{ Value = 1; Label = @{ LocalizedLabels = @(@{ Label = 'Yes'; LanguageCode = 1033 }) } }
        FalseOption = @{ Value = 0; Label = @{ LocalizedLabels = @(@{ Label = 'No'; LanguageCode = 1033 }) } }
      }
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

  $body = (Get-AuthorityAttributeBody $col) | ConvertTo-Json -Depth 12
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/EntityDefinitions(LogicalName='{1}')/Attributes" -f $orgUrl.TrimEnd('/'), $TableLogical) -Headers $headers -Body $body | Out-Null
  Write-Status $label 'PASS' ("{0} column created (was missing)" -f $col.type)
  $results += @{ column = $col.logicalName; status = 'created' }
  $created++
}

# --- Publish - only if something was actually created this run. ---
if ($Apply -and $created -gt 0) {
  Write-Host '== Publishing customizations (columns were created) =='
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/PublishAllXml" -f $orgUrl.TrimEnd('/')) -Headers $headers -Body '{}' | Out-Null
  Write-Status 'publish' 'PASS' 'customizations published'
} elseif ($Apply) {
  Write-Status 'publish' 'PASS' 'nothing created this run - publish skipped (idempotent no-op)'
}

# --- Post-create metadata verification: re-GET each attribute, confirm the type matches. ---
if ($Apply -or $token) {
  Write-Host '== Metadata verification =='
  $expectedType = @{ cr664_approvallimit = 'Money'; cr664_creditcommitteemember = 'Boolean'; cr664_approvaloverrideauthority = 'Boolean' }
  foreach ($col in $Columns) {
    $actualType = Get-DataverseAttributeType $orgUrl $token $TableLogical $col.logicalName
    $expected = $expectedType[$col.logicalName]
    if ($actualType -eq $expected) {
      Write-Status ("{0}.{1}" -f $TableLogical, $col.logicalName) 'PASS' ("AttributeType={0} (expected {1})" -f $actualType, $expected)
    } elseif ($null -eq $actualType) {
      Write-Status ("{0}.{1}" -f $TableLogical, $col.logicalName) 'UNKNOWN' 'could not read AttributeType (no token / not yet created in dry-run)'
    } else {
      Write-Status ("{0}.{1}" -f $TableLogical, $col.logicalName) 'BLOCKED' ("AttributeType={0} but expected {1} - investigate before relying on this column" -f $actualType, $expected)
    }
  }
}

Write-Host ("EVIDENCE: [banker-credit-authority][provision] mode={0} created={1} ts={2}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $created, (Get-Date -Format o))
Write-Host 'To assign authority values to a specific banker (by email, opt-in), run seed-banker-credit-authority.ps1 separately.'
