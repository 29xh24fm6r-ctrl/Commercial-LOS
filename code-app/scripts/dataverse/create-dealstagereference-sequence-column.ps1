<#
  create-dealstagereference-sequence-column.ps1

  Scripted alternative to docs/STAGE_SCHEMA_SETUP.md's Step 1 (currently manual-only:
  "In make.powerapps.com -> Tables -> Deal Stage Reference -> Columns -> + New column"). Provisions
  the ordering column the stage-progression engine (src/workflow/stageOrderingContract.ts) requires:

    cr664_sequence   Whole Number   The deterministic ordinal the engine sorts stages by.
    cr664_stagetype  String         Optional metadata (PIPELINE | TERMINAL). Not required by any
                                     code path today; included because STAGE_SCHEMA_SETUP.md lists
                                     it as an optional Step 1 addition.

  DOES NOT create a separate cr664_stagereferences table. That plan was explicitly superseded -
  see docs/STAGE_PROGRESSION_ENABLEMENT_MAP.md's status banner: ordering rides on the
  ALREADY-REGISTERED cr664_dealstagereferences table via this cr664_sequence ordinal instead.

  DOES NOT seed any row. Seeding is scripts/seed-stage-references.mjs (already exists, already
  idempotent/ID-preserving/fail-closed on duplicates - see that script's own header). Run this
  script first (Step 1), then that one (Step 2), per STAGE_SCHEMA_SETUP.md.

  NO DATAVERSE ALTERNATE KEY / UNIQUE INDEX is created on cr664_sequence. A literal DB-level unique
  key would enforce uniqueness across ALL rows including retired ones, blocking a legitimate future
  re-sequencing during a stage-set migration - Dataverse has no native "unique among active rows
  only" constraint. Uniqueness-among-active-rows is enforced at the application level instead: the
  seed script's existing fail-closed duplicate-match handling, plus a governance test pinning
  CANONICAL_STAGES sequence uniqueness in code (src/shared/governance/stageSequenceUniqueness.test.ts).

  SAFETY MODEL (same as every other script in this directory - see _common.ps1):
    - DRY-RUN BY DEFAULT. Mutation happens only when you pass -Apply.
    - Confirms the target environment via `pac org who` AND checks the resolved org host matches
      the expected org - BLOCKED on any mismatch. Override with -ExpectedOrgHost if deliberate.
    - Confirms the CommercialLendingLOS solution exists in the target org before any mutation.
    - CREATE-MISSING-ONLY. Every column is existence-checked first and skipped if present. Nothing
      is ever overwritten, renamed, or deleted. There is NO delete path.
    - Publishes customizations (PublishAllXml) ONLY if this run actually created something.
    - Re-verifies metadata (AttributeType) for both columns after create/skip.

    powershell -File scripts/dataverse/create-dealstagereference-sequence-column.ps1            # dry-run (default)
    powershell -File scripts/dataverse/create-dealstagereference-sequence-column.ps1 -Apply     # create missing columns + publish
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedOrgHost = 'org3a57b8d4.crm.dynamics.com'
)

. (Join-Path $PSScriptRoot '_common.ps1')

$TableLogical = 'cr664_dealstagereference'
$SolutionUniqueName = 'CommercialLendingLOS'

$Columns = @(
  @{ logicalName = 'cr664_sequence'; schemaName = 'cr664_Sequence'; displayName = 'Sequence'; type = 'WholeNumber' },
  @{ logicalName = 'cr664_stagetype'; schemaName = 'cr664_StageType'; displayName = 'Stage type'; type = 'String'; maxLength = 50 }
)

Write-Host '== create-dealstagereference-sequence-column :: provision cr664_dealstagereferences ordering column =='
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
  if (-not $envInfo -or -not $token) { Write-Status 'dealstagereference-sequence' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse token. Aborting (no mutation).'; exit 1 }
  if (-not (Test-DataverseToken $orgUrl $token)) { Write-Status 'dealstagereference-sequence' 'BLOCKED' 'Token rejected by Dataverse (WhoAmI failed). Aborting (no mutation).'; exit 1 }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'dealstagereference-sequence' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
}

# --- Attribute body builder (WholeNumber / String; local to this script, same pattern as
#     create-banker-credit-authority-fields.ps1's Get-AuthorityAttributeBody). ---
function Get-StageReferenceAttributeBody($ColumnDef) {
  $base = [ordered]@{
    SchemaName    = $ColumnDef.schemaName
    LogicalName   = $ColumnDef.logicalName
    RequiredLevel = @{ Value = 'None' } # Business-required only once seeded, per STAGE_SCHEMA_SETUP.md; a
                                          # required-from-creation column would block the create call
                                          # itself for the primary-name column already on this row.
    DisplayName   = @{ LocalizedLabels = @(@{ Label = $ColumnDef.displayName; LanguageCode = 1033 }) }
  }
  switch ($ColumnDef.type) {
    'WholeNumber' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata'
      $base.MinValue = 0
      $base.MaxValue = 2147483647
      $base.Format = 'None'
    }
    'String' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'
      $base.MaxLength = $(if ($ColumnDef.maxLength) { $ColumnDef.maxLength } else { 200 })
      $base.FormatName = @{ Value = 'Text' }
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

  $body = (Get-StageReferenceAttributeBody $col) | ConvertTo-Json -Depth 12
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

# --- Post-create metadata verification. ---
if ($Apply -or $token) {
  Write-Host '== Metadata verification =='
  $expectedType = @{ cr664_sequence = 'Integer'; cr664_stagetype = 'String' }
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

Write-Host ("EVIDENCE: [dealstagereference-sequence][provision] mode={0} created={1} ts={2}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $created, (Get-Date -Format o))
Write-Host 'Next: node scripts/seed-stage-references.mjs --commit (Step 2), then --verify (Step 4).'
