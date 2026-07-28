<#
  create-document-checklist-file-columns.ps1

  Provisions the columns needed for true binary document upload on cr664_documentchecklist,
  closing the exact schema blocker recorded in docs/PHASE_51_DOCUMENT_UPLOAD_SCOPE.md section 3 and
  NOT_WIRED.document-upload in src/shared/governance/platformInventory.ts:

    cr664_documentfile       File      The binary content itself. MaxSizeInKB capped (default
                                        25600 = 25MB; override with -MaxFileSizeKB).
    cr664_originalfilename   String    The filename as uploaded (the schema has no place for
                                        this today - see PHASE_51 section 6 "Known limitations").
    cr664_mimetype           String    Browser-reported content type, recorded honestly (never
                                        inferred/guessed server-side).
    cr664_filesizebytes      Whole Number  Byte count at upload time, for audit/quota purposes.
    cr664_uploadedon         DateTime  When the file was uploaded (distinct from
                                        cr664_receiveddate, which Phase 51 already stamps for the
                                        metadata-only "Mark received" flow).
    cr664_uploadedby         Lookup -> cr664_user (NOT systemuser). See rationale below.

  LOOKUP TARGET RATIONALE (cr664_uploadedby -> cr664_user, not systemuser):
    This mirrors src/deals/newDealAuditActorResolver.ts's cr664_ChangedBy pattern exactly, for two
    independent reasons: (1) binding a REQUIRED actor-identity lookup to /systemusers(...) was
    REJECTED live in a real production incident on this exact table family ("Entity 'cr664_User'
    With Id = <actor systemuser id> Does Not Exist" - see that resolver's header comment); (2) the
    underlying Dataverse solution already has an unwired cr664_LoanDocument.cr664_UploadedBy ->
    cr664_User relationship (src/Entities/cr664_LoanDocument/Entity.xml) - this script's choice is
    consistent with that existing (if unwired) precedent, not a new guess.

  SAFETY MODEL (same as every other script in this directory - see _common.ps1):
    - DRY-RUN BY DEFAULT. Mutation happens only when you pass -Apply.
    - Confirms the target environment via `pac org who` AND checks the resolved org host matches
      the expected org - BLOCKED on any mismatch. Override with -ExpectedOrgHost if deliberate.
    - Confirms the CommercialLendingLOS solution exists in the target org before any mutation.
    - CREATE-MISSING-ONLY. Every column/relationship is existence-checked first and skipped if
      present. Nothing is ever overwritten, renamed, or deleted. There is NO delete path.
    - Publishes customizations (PublishAllXml) ONLY if this run actually created something.
    - Re-verifies metadata (AttributeType) for every scalar column after create/skip.
    - Does NOT flip DOCUMENT_FILE_UPLOAD_ENABLED or any other application flag - that is a
      separate, deliberate, evidence-backed operator act, same discipline as every other flag in
      this codebase (see src/deals/dealOriginationFeatureFlags.ts).

    powershell -File scripts/dataverse/create-document-checklist-file-columns.ps1            # dry-run (default)
    powershell -File scripts/dataverse/create-document-checklist-file-columns.ps1 -Apply     # create missing columns + publish
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedOrgHost = 'org3a57b8d4.crm.dynamics.com',
  [int]$MaxFileSizeKB = 25600
)

. (Join-Path $PSScriptRoot '_common.ps1')

$TableLogical = 'cr664_documentchecklist'
$SolutionUniqueName = 'CommercialLendingLOS'

$ScalarColumns = @(
  @{ logicalName = 'cr664_documentfile'; schemaName = 'cr664_DocumentFile'; displayName = 'Document file'; type = 'File' },
  @{ logicalName = 'cr664_originalfilename'; schemaName = 'cr664_OriginalFileName'; displayName = 'Original file name'; type = 'String'; maxLength = 260 },
  @{ logicalName = 'cr664_mimetype'; schemaName = 'cr664_MimeType'; displayName = 'MIME type'; type = 'String'; maxLength = 200 },
  @{ logicalName = 'cr664_filesizebytes'; schemaName = 'cr664_FileSizeBytes'; displayName = 'File size (bytes)'; type = 'WholeNumber' },
  @{ logicalName = 'cr664_uploadedon'; schemaName = 'cr664_UploadedOn'; displayName = 'Uploaded on'; type = 'DateTime' }
)
$LookupRelationship = @{
  schemaName = 'cr664_documentchecklist_uploadedby_cr664_user'
  fromTable  = $TableLogical
  fromColumn = 'cr664_UploadedBy'
  toTable    = 'cr664_user'
}

Write-Host '== create-document-checklist-file-columns :: provision cr664_documentchecklist upload columns =='
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
  Write-Status $LookupRelationship.toTable 'BLOCKED' 'lookup target table cr664_user does not exist in this org - cr664_uploadedby cannot be created. Investigate before proceeding.'
} else {
  Write-Status $LookupRelationship.toTable 'UNKNOWN' 'could not verify lookup target table (no token / transient error).'
}

if ($Apply) {
  if (-not $envInfo -or -not $token) { Write-Status 'document-checklist-upload' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse token. Aborting (no mutation).'; exit 1 }
  if (-not (Test-DataverseToken $orgUrl $token)) { Write-Status 'document-checklist-upload' 'BLOCKED' 'Token rejected by Dataverse (WhoAmI failed). Aborting (no mutation).'; exit 1 }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'document-checklist-upload' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
}

# --- Attribute body builder (File / String / WholeNumber / DateTime; local to this script,
#     mirroring create-banker-credit-authority-fields.ps1's Get-AuthorityAttributeBody pattern
#     rather than touching the shared _common.ps1's narrower helper, which other scripts already
#     depend on). ---
function Get-DocumentChecklistAttributeBody($ColumnDef) {
  $base = [ordered]@{
    SchemaName    = $ColumnDef.schemaName
    LogicalName   = $ColumnDef.logicalName
    RequiredLevel = @{ Value = 'None' }
    DisplayName   = @{ LocalizedLabels = @(@{ Label = $ColumnDef.displayName; LanguageCode = 1033 }) }
  }
  switch ($ColumnDef.type) {
    'File' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.FileAttributeMetadata'
      $base.MaxSizeInKB = $MaxFileSizeKB
    }
    'String' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'
      $base.MaxLength = $(if ($ColumnDef.maxLength) { $ColumnDef.maxLength } else { 200 })
      $base.FormatName = @{ Value = 'Text' }
    }
    'WholeNumber' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata'
      $base.MinValue = 0
      $base.MaxValue = 2147483647
      $base.Format = 'None'
    }
    'DateTime' {
      $base['@odata.type'] = 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata'
      $base.Format = 'DateAndTime'
    }
  }
  return $base
}

function Get-DataverseAttributeType([string]$OrgUrl, [string]$Token, [string]$TableLogical, [string]$ColumnLogical) {
  if (-not $Token -or -not $OrgUrl) { return $null }
  try {
    $r = Invoke-DataverseGet $OrgUrl $Token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=AttributeType,AttributeTypeName" -f $TableLogical, $ColumnLogical)
    # Dataverse File columns are derived attributes: the base AttributeType is
    # reported as Virtual while AttributeTypeName.Value carries FileType.
    # Normalize that pair so the verifier does not falsely block a real File column.
    if ($r.AttributeType -eq 'Virtual' -and $r.AttributeTypeName.Value -eq 'FileType') {
      return 'File'
    }
    return [string]$r.AttributeType
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

  $body = (Get-DocumentChecklistAttributeBody $col) | ConvertTo-Json -Depth 12
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/EntityDefinitions(LogicalName='{1}')/Attributes" -f $orgUrl.TrimEnd('/'), $TableLogical) -Headers $headers -Body $body | Out-Null
  Write-Status $label 'PASS' ("{0} column created (was missing)" -f $col.type)
  $results += @{ column = $col.logicalName; status = 'created' }
  $created++
}

# --- Lookup relationship (cr664_uploadedby -> cr664_user), via the shared helper. ---
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
    cr664_documentfile     = 'File'
    cr664_originalfilename = 'String'
    cr664_mimetype         = 'String'
    cr664_filesizebytes    = 'Integer'
    cr664_uploadedon       = 'DateTime'
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

Write-Host ("EVIDENCE: [document-checklist-upload][provision] mode={0} created={1} maxFileSizeKB={2} ts={3}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $created, $MaxFileSizeKB, (Get-Date -Format o))
Write-Host 'Next: regenerate the SDK (pac code add-data-source -a dataverse -t cr664_documentchecklists), diff generated changes against src/shared/governance/multiSelectPicklistFieldShapeContract.test.ts, then wire src/deals/documentUploadLiveDeps.ts and flip DOCUMENT_FILE_UPLOAD_ENABLED only after a recorded smoke.'
