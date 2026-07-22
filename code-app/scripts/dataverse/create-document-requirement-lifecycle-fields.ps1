<#
  create-document-requirement-lifecycle-fields.ps1

  Provisions the columns needed for the real banker-managed underwriting document requirement
  workflow on cr664_documentchecklist (replaces the 3-item DocumentChecklistPilotPanel), closing
  the schema gap for the canonical lifecycle implemented in
  src/deals/documentRequirementLifecycle.ts:

    Not Assessed -> Outstanding -> Requested -> Under Review -> Reviewed
    (governed alternate states: Waived, Not Applicable; Reopen returns to Outstanding)

    cr664_requirementstatus  Picklist   The persisted lifecycle status (7 custom options - see
                                         "REQUIREMENT STATUS OPTION VALUES" below; the numeric
                                         values MUST match REQUIREMENT_STATUS_CODES in
                                         src/deals/documentRequirementActions.ts exactly).
    cr664_required            Boolean   Whether this document is currently required for the deal.
    cr664_acknowledged        Boolean   Whether a banker has acknowledged the requirement.
    cr664_acknowledgedby       Lookup -> cr664_user (NOT systemuser). See rationale below.
    cr664_acknowledgeddate    DateTime  When the requirement was acknowledged.
    cr664_revieweddate        DateTime  When the document was reviewed (distinct from the existing
                                         cr664_reviewer text column, which records WHO reviewed it;
                                         this records WHEN - "received without reviewed" must be
                                         expressible as receiveddate set + revieweddate unset).
    cr664_waived               Boolean  Whether the requirement was waived.
    cr664_waiverreason           Memo   The required justification for a waiver (never optional -
                                         performDocumentRequirementAction refuses a waive with no
                                         reason before this column is ever written to).

  REQUIREMENT STATUS OPTION VALUES (must match REQUIREMENT_STATUS_CODES exactly):
    788190100 Not Assessed   788190101 Outstanding   788190102 Requested
    788190103 Under Review   788190104 Reviewed
    788190105 Waived         788190106 Not Applicable

  LOOKUP TARGET RATIONALE (cr664_acknowledgedby -> cr664_user, not systemuser):
    Same rationale as cr664_uploadedby in create-document-checklist-file-columns.ps1: binding a
    REQUIRED actor-identity lookup to /systemusers(...) was REJECTED live in a real production
    incident on this exact table family (see src/deals/newDealAuditActorResolver.ts's header). This
    script targets cr664_user for the same reason, consistently.

  DOES NOT:
    - Create a separate stage-reference-style table for requirement status - the status lives on
      the existing cr664_documentchecklist row, per the user's explicit instruction to use "the
      existing authoritative checklist table."
    - Create a Dataverse alternate key / unique index on any of these columns.
    - Seed any row data - reconciliation (documentRequirementReconciliation.ts) is purely a runtime
      read-time merge of derived requirements against whatever rows already exist; nothing here
      pre-populates cr664_documentchecklist.
    - Flip any application feature flag.

  SAFETY MODEL (same as every other script in this directory - see _common.ps1):
    - DRY-RUN BY DEFAULT. Mutation happens only when you pass -Apply.
    - Confirms the target environment via `pac org who` AND checks the resolved org host matches
      the expected org - BLOCKED on any mismatch. Override with -ExpectedOrgHost if deliberate.
    - Confirms the CommercialLendingLOS solution exists in the target org before any mutation.
    - CREATE-MISSING-ONLY. Every column/relationship is existence-checked first and skipped if
      present. Nothing is ever overwritten, renamed, or deleted. There is NO delete path.
    - Publishes customizations (PublishAllXml) ONLY if this run actually created something.
    - Re-verifies metadata (AttributeType) for every scalar column after create/skip.

    powershell -File scripts/dataverse/create-document-requirement-lifecycle-fields.ps1            # dry-run (default)
    powershell -File scripts/dataverse/create-document-requirement-lifecycle-fields.ps1 -Apply     # create missing columns + publish
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedOrgHost = 'org3a57b8d4.crm.dynamics.com'
)

. (Join-Path $PSScriptRoot '_common.ps1')

$TableLogical = 'cr664_documentchecklist'
$SolutionUniqueName = 'CommercialLendingLOS'

# Must match REQUIREMENT_STATUS_CODES in src/deals/documentRequirementActions.ts exactly.
$RequirementStatusOptions = @(
  @{ Value = 788190100; Label = 'Not Assessed' },
  @{ Value = 788190101; Label = 'Outstanding' },
  @{ Value = 788190102; Label = 'Requested' },
  @{ Value = 788190103; Label = 'Under Review' },
  @{ Value = 788190104; Label = 'Reviewed' },
  @{ Value = 788190105; Label = 'Waived' },
  @{ Value = 788190106; Label = 'Not Applicable' }
)

$ScalarColumns = @(
  @{ logicalName = 'cr664_requirementstatus'; schemaName = 'cr664_RequirementStatus'; displayName = 'Requirement status'; type = 'Picklist' },
  @{ logicalName = 'cr664_required'; schemaName = 'cr664_Required'; displayName = 'Required'; type = 'Boolean' },
  @{ logicalName = 'cr664_acknowledged'; schemaName = 'cr664_Acknowledged'; displayName = 'Acknowledged'; type = 'Boolean' },
  @{ logicalName = 'cr664_acknowledgeddate'; schemaName = 'cr664_AcknowledgedDate'; displayName = 'Acknowledged date'; type = 'DateTime' },
  @{ logicalName = 'cr664_revieweddate'; schemaName = 'cr664_ReviewedDate'; displayName = 'Reviewed date'; type = 'DateTime' },
  @{ logicalName = 'cr664_waived'; schemaName = 'cr664_Waived'; displayName = 'Waived'; type = 'Boolean' },
  @{ logicalName = 'cr664_waiverreason'; schemaName = 'cr664_WaiverReason'; displayName = 'Waiver reason'; type = 'Memo'; maxLength = 2000 }
)
$LookupRelationship = @{
  schemaName = 'cr664_documentchecklist_acknowledgedby_cr664_user'
  fromTable  = $TableLogical
  fromColumn = 'cr664_AcknowledgedBy'
  toTable    = 'cr664_user'
}

Write-Host '== create-document-requirement-lifecycle-fields :: provision cr664_documentchecklist requirement-lifecycle columns =='
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

# --- cr664_user target table check. A REQUIRED lookup target that doesn't exist would fail-closed
#     the relationship create below; check and report explicitly rather than a raw API error. ---
$targetTableExists = Test-DataverseTable $orgUrl $token $LookupRelationship.toTable
if ($targetTableExists -eq $true) {
  Write-Status $LookupRelationship.toTable 'PASS' 'lookup target table exists'
} elseif ($targetTableExists -eq $false) {
  Write-Status $LookupRelationship.toTable 'BLOCKED' 'lookup target table cr664_user does not exist in this org - cr664_acknowledgedby cannot be created. Investigate before proceeding.'
} else {
  Write-Status $LookupRelationship.toTable 'UNKNOWN' 'could not verify lookup target table (no token / transient error).'
}

if ($Apply) {
  if (-not $envInfo -or -not $token) { Write-Status 'document-requirement-lifecycle' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse token. Aborting (no mutation).'; exit 1 }
  if (-not (Test-DataverseToken $orgUrl $token)) { Write-Status 'document-requirement-lifecycle' 'BLOCKED' 'Token rejected by Dataverse (WhoAmI failed). Aborting (no mutation).'; exit 1 }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'document-requirement-lifecycle' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
}

# --- Attribute body builder (Picklist / Boolean / DateTime / Memo; local to this script, mirroring
#     create-document-checklist-file-columns.ps1's Get-DocumentChecklistAttributeBody pattern rather
#     than touching the shared _common.ps1's narrower helper, which other scripts already depend on). ---
function Get-RequirementLifecycleAttributeBody($ColumnDef) {
  $base = [ordered]@{
    SchemaName    = $ColumnDef.schemaName
    LogicalName   = $ColumnDef.logicalName
    RequiredLevel = @{ Value = 'None' }
    DisplayName   = @{ LocalizedLabels = @(@{ Label = $ColumnDef.displayName; LanguageCode = 1033 }) }
  }
  switch ($ColumnDef.type) {
    'Picklist' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata'
      $options = $RequirementStatusOptions | ForEach-Object {
        @{ Value = $_.Value; Label = @{ LocalizedLabels = @(@{ Label = $_.Label; LanguageCode = 1033 }) } }
      }
      $base.OptionSet = @{
        '@odata.type'  = 'Microsoft.Dynamics.CRM.OptionSetMetadata'
        IsGlobal       = $false
        OptionSetType  = 'Picklist'
        Options        = $options
      }
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
      $base.Format = 'DateAndTime'
    }
    'Memo' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.MemoAttributeMetadata'
      $base.MaxLength = $(if ($ColumnDef.maxLength) { $ColumnDef.maxLength } else { 2000 })
      $base.Format = 'Text'
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
foreach ($col in $ScalarColumns) {
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

  $body = (Get-RequirementLifecycleAttributeBody $col) | ConvertTo-Json -Depth 12
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/EntityDefinitions(LogicalName='{1}')/Attributes" -f $orgUrl.TrimEnd('/'), $TableLogical) -Headers $headers -Body $body | Out-Null
  Write-Status $label 'PASS' ("{0} column created (was missing)" -f $col.type)
  $results += @{ column = $col.logicalName; status = 'created' }
  $created++
}

# --- Lookup relationship (cr664_acknowledgedby -> cr664_user), via the shared helper. ---
$lookupResult = New-DataverseRelationshipIfMissing -RelDef $LookupRelationship -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent
if ($lookupResult -eq 'created') { $created++ }

# --- Publish - only if something was actually created this run. ---
if ($Apply -and $created -gt 0) {
  Write-Host '== Publishing customizations (columns/relationship were created) =='
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/PublishAllXml" -f $orgUrl.TrimEnd('/')) -Headers $headers -Body '{}' | Out-Null
  Write-Status 'publish' 'PASS' 'customizations published'
} elseif ($Apply) {
  Write-Status 'publish' 'PASS' 'nothing created this run - publish skipped (idempotent no-op)'
}

# --- Post-create metadata verification: re-GET each scalar attribute, confirm the type matches. ---
if ($Apply -or $token) {
  Write-Host '== Metadata verification =='
  $expectedType = @{
    cr664_requirementstatus = 'Picklist'
    cr664_required          = 'Boolean'
    cr664_acknowledged      = 'Boolean'
    cr664_acknowledgeddate  = 'DateTime'
    cr664_revieweddate      = 'DateTime'
    cr664_waived            = 'Boolean'
    cr664_waiverreason      = 'Memo'
  }
  foreach ($col in $ScalarColumns) {
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

Write-Host ("EVIDENCE: [document-requirement-lifecycle][provision] mode={0} created={1} ts={2}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $created, (Get-Date -Format o))
Write-Host 'Next: regenerate the SDK (pac code add-data-source -a dataverse -t cr664_documentchecklists), diff generated changes against src/shared/governance/multiSelectPicklistFieldShapeContract.test.ts, delete src/deals/documentRequirementFields.ts once cr664_requirementstatus/cr664_required/cr664_acknowledged/cr664_acknowledgedby/cr664_acknowledgeddate/cr664_revieweddate/cr664_waived/cr664_waiverreason are part of the generated model, then exercise DocumentRequirementWorkspace against the live schema before any wider rollout.'
