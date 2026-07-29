<#
.SYNOPSIS
  Produces an ID-level Production GO data-remediation manifest.

.DESCRIPTION
  Read-only by default. The inventory covers controlled-record conflicts,
  duplicate deals/CRM organizations/entitlements, and incomplete or duplicate
  boarded loans. It never deletes, merges, or fabricates source facts.

  -Apply accepts only an already-reviewed manifest. The operator must provide
  its exact SHA-256 via -ApprovedManifestHash. Only explicit PATCH actions in
  that immutable manifest are applied; review-only findings are never mutated.
  Every PATCH uses If-Match with the captured ETag, so drift stops the run.

  Access tokens are read from memory and are never printed or written.

.EXAMPLE
  powershell -File scripts/dataverse/prepare-production-go-remediation.ps1 `
    -OutputPath .tmp-production-go-remediation.json

.EXAMPLE
  powershell -File scripts/dataverse/prepare-production-go-remediation.ps1 `
    -Apply -ManifestPath .tmp-production-go-remediation.json `
    -ApprovedManifestHash <sha256-confirmed-by-Matthew>
#>

[CmdletBinding(DefaultParameterSetName = 'Inventory')]
param(
  [Parameter(ParameterSetName = 'Inventory')]
  [string]$OutputPath = '.tmp-production-go-remediation.json',

  [Parameter(Mandatory, ParameterSetName = 'Apply')]
  [switch]$Apply,

  [Parameter(Mandatory, ParameterSetName = 'Apply')]
  [string]$ManifestPath,

  [Parameter(Mandatory, ParameterSetName = 'Apply')]
  [ValidatePattern('^[A-Fa-f0-9]{64}$')]
  [string]$ApprovedManifestHash,

  [Parameter(ParameterSetName = 'Apply')]
  [string]$ApplyEvidencePath = '.tmp-production-go-remediation-apply-evidence.json'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

function Normalize-BusinessName([object]$Value) {
  if ($null -eq $Value) { return '' }
  return ([string]$Value).ToLowerInvariant() `
    -replace '\b(incorporated|corporation|company|limited|inc|corp|co|llc|ltd)\b', '' `
    -replace '[^a-z0-9]', ''
}

function Test-ControlledName([object]$Value) {
  $name = ([string]$Value).Trim()
  if (-not $name) { return $false }
  return $name -match '(?i)^(?:system\s+test|test(?:\s*[—-]|\s+)|smoke(?:\s+test)?|stage\s+advancement\s+smoke|ogb\s+full\s+workflow\s+test|.*\bfull\s+e2e\b)'
}

function Normalize-DocumentName([object]$Value) {
  $normalized = (([string]$Value).Trim().ToLowerInvariant() -replace '[-_/]+', ' ' -replace '\s+', ' ')
  if ($normalized -in @('tax returns', 'business tax return')) { return 'business tax returns' }
  return $normalized
}

function Get-AllDataverseRows([string]$OrgUrl, [string]$Token, [string]$Path) {
  $rows = @()
  $next = "{0}/api/data/v9.2/{1}" -f $OrgUrl.TrimEnd('/'), $Path
  $headers = @{
    Authorization = "Bearer $Token"
    Accept = 'application/json'
    'OData-MaxVersion' = '4.0'
    'OData-Version' = '4.0'
    Prefer = 'odata.include-annotations="*"'
  }
  while ($next) {
    $response = Invoke-RestMethod -Method Get -Uri $next -Headers $headers
    $rows += @($response.value)
    $next = $response.'@odata.nextLink'
  }
  return $rows
}

function Add-DuplicateFindings(
  [System.Collections.Generic.List[object]]$Findings,
  [object[]]$Rows,
  [string]$IdField,
  [string]$NameField,
  [string]$Category,
  [string]$EntitySet
) {
  $groups = $Rows |
    Group-Object { Normalize-BusinessName $_.$NameField } |
    Where-Object { $_.Name -and $_.Count -gt 1 }
  foreach ($group in $groups) {
    $Findings.Add([ordered]@{
      category = $Category
      entitySet = $EntitySet
      recordIds = @($group.Group | ForEach-Object { $_.$IdField })
      records = @($group.Group | ForEach-Object {
        [ordered]@{
          recordId = $_.$IdField
          name = $_.$NameField
          amount = $_.cr664_amount
          clientId = $_._cr664_client_value
          legalName = $_.cr664_legalname
          website = $_.cr664_website
          createdOn = $_.createdon
          modifiedOn = $_.modifiedon
          etag = $_.'@odata.etag'
        }
      })
      evidence = "normalized-name:$($group.Name)"
      disposition = 'review-retain-merge-or-deactivate'
      operation = 'review'
    })
  }
}

function Get-ManifestHash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$envInfo = Resolve-DataverseEnv
if (-not $envInfo -or -not $envInfo.OrgUrl) {
  throw 'Target Dataverse environment could not be resolved.'
}
$token = Get-DataverseToken $envInfo.OrgUrl
if (-not $token -or -not (Test-DataverseToken $envInfo.OrgUrl $token)) {
  throw 'A valid in-memory Dataverse token for the connected organization is required.'
}

if ($Apply) {
  $resolvedManifest = (Resolve-Path -LiteralPath $ManifestPath).Path
  $actualHash = Get-ManifestHash $resolvedManifest
  if ($actualHash -ne $ApprovedManifestHash.ToLowerInvariant()) {
    throw "Manifest hash mismatch. Expected $ApprovedManifestHash; actual $actualHash. No records changed."
  }
  $manifest = Get-Content -Raw -LiteralPath $resolvedManifest | ConvertFrom-Json
  if ($manifest.orgUrl.TrimEnd('/') -ne $envInfo.OrgUrl.TrimEnd('/')) {
    throw 'Manifest organization does not match the connected organization. No records changed.'
  }
  $patches = @($manifest.findings | Where-Object { $_.operation -eq 'patch' })
  if ($patches.Count -eq 0) {
    Write-Host 'No approved PATCH actions exist in this manifest. No records changed.'
    exit 0
  }

  $headers = @{
    Authorization = "Bearer $token"
    Accept = 'application/json'
    'Content-Type' = 'application/json; charset=utf-8'
    'OData-MaxVersion' = '4.0'
    'OData-Version' = '4.0'
  }
  $applyEvidence = [ordered]@{
    schemaVersion = 1
    appliedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    orgUrl = $envInfo.OrgUrl.TrimEnd('/')
    operator = $envInfo.User
    approvedManifestPath = $resolvedManifest
    approvedManifestSha256 = $actualHash
    results = [System.Collections.Generic.List[object]]::new()
  }
  foreach ($patch in $patches) {
    if (-not $patch.etag) { throw "PATCH for $($patch.recordId) has no captured ETag. Stopping before mutation." }
    $headers['If-Match'] = $patch.etag
    $uri = "{0}/api/data/v9.2/{1}({2})" -f $envInfo.OrgUrl.TrimEnd('/'), $patch.entitySet, $patch.recordId
    Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body ($patch.changes | ConvertTo-Json -Depth 10) | Out-Null
    $headers.Remove('If-Match')
    $select = (@($patch.changes.psobject.Properties.Name) -join ',')
    $readback = Invoke-RestMethod -Method Get -Uri ("{0}?`$select={1}" -f $uri, $select) -Headers $headers
    $values = [ordered]@{}
    foreach ($field in $patch.changes.psobject.Properties.Name) {
      $values[$field] = $readback.$field
    }
    $applyEvidence.results.Add([ordered]@{
      entitySet = $patch.entitySet
      recordId = $patch.recordId
      etagBefore = $patch.etag
      etagAfter = $readback.'@odata.etag'
      requestedChanges = $patch.changes
      readback = $values
      verified = $true
    })
    $applyEvidence | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ApplyEvidencePath -Encoding UTF8
    Write-Host ("[APPLIED] {0}({1})" -f $patch.entitySet, $patch.recordId)
  }
  Write-Host ("Applied and read back {0} ETag-guarded PATCH action(s). Evidence: {1}. No delete or merge operation exists in this script." -f $patches.Count, (Resolve-Path -LiteralPath $ApplyEvidencePath).Path)
  exit 0
}

$deals = @(Get-AllDataverseRows $envInfo.OrgUrl $token (
  # cr664_clientname is a generated SDK lookup-display shadow, not a selectable
  # Dataverse Web API property. Duplicate detection uses the persisted deal
  # name; client linkage is available separately as _cr664_client_value.
  'cr664_loandeals?$select=cr664_loandealid,cr664_dealname,_cr664_client_value,_cr664_stagereference_value,_cr664_statusreference_value,cr664_amount,cr664_istestrecord,createdon,modifiedon,statecode&$filter=statecode eq 0'
))
$organizations = @(Get-AllDataverseRows $envInfo.OrgUrl $token (
  'cr664_crmorganizations?$select=cr664_crmorganizationid,cr664_name,cr664_legalname,cr664_website,cr664_sourcesystem,cr664_sourcerecordid,createdon,modifiedon,statecode&$filter=statecode eq 0'
))
$entitlements = @(Get-AllDataverseRows $envInfo.OrgUrl $token (
  'cr664_workspaceentitlementses?$select=cr664_workspaceentitlementsid,cr664_entitlementname,cr664_accesslevel,cr664_isdefault,_cr664_losuserprofile_value,_cr664_workspace_value,createdon,modifiedon,statecode&$filter=statecode eq 0'
))
$boarded = @(Get-AllDataverseRows $envInfo.OrgUrl $token (
  'cr664_portfolioboardedloans?$select=cr664_portfolioboardedloanid,cr664_name,_cr664_originatedloandeal_value,_cr664_assignedservicingowner_value,cr664_boardingsource,cr664_loannumber,cr664_borrowerlegalname,cr664_loanstatus,cr664_currentoutstandingprincipal,cr664_currentriskrating,cr664_maturitydate,cr664_originalcommitmentamount,cr664_bookingdate,createdon,modifiedon,statecode&$filter=statecode eq 0'
))
$tasks = @(Get-AllDataverseRows $envInfo.OrgUrl $token (
  'cr664_dealtask1s?$select=cr664_dealtask1id,cr664_taskname,cr664_completed,_cr664_deal_value,statecode&$filter=statecode eq 0 and cr664_completed ne true'
))
$documents = @(Get-AllDataverseRows $envInfo.OrgUrl $token (
  'cr664_documentchecklists?$select=cr664_documentchecklistid,cr664_documentname,_cr664_deal_value,cr664_uploadstatus,cr664_originalfilename,cr664_mimetype,cr664_filesizebytes,cr664_documentfile_name,statecode&$filter=statecode eq 0'
))
$memos = @(Get-AllDataverseRows $envInfo.OrgUrl $token (
  'cr664_creditmemo1s?$select=cr664_creditmemo1id,cr664_memoname,_cr664_deal_value,cr664_status,cr664_memotext,cr664_version,statecode&$filter=statecode eq 0'
))

$findings = [System.Collections.Generic.List[object]]::new()

foreach ($deal in $deals) {
  if ($deal.cr664_istestrecord -eq $false -and (Test-ControlledName $deal.cr664_dealname)) {
    $findings.Add([ordered]@{
      category = 'controlled-classification-conflict'
      entitySet = 'cr664_loandeals'
      recordId = $deal.cr664_loandealid
      recordName = $deal.cr664_dealname
      etag = $deal.'@odata.etag'
      before = @{ cr664_istestrecord = $false }
      changes = @{ cr664_istestrecord = $true }
      disposition = 'mark-controlled-retain-record'
      operation = 'patch'
    })
  }
}

$controlledDealIds = [System.Collections.Generic.HashSet[string]]::new()
foreach ($deal in $deals) {
  if ($deal.cr664_istestrecord -eq $true -or (Test-ControlledName $deal.cr664_dealname)) {
    [void]$controlledDealIds.Add([string]$deal.cr664_loandealid)
  }
}

$operationalDeals = @($deals | Where-Object { -not $controlledDealIds.Contains([string]$_.cr664_loandealid) })
Add-DuplicateFindings $findings $operationalDeals 'cr664_loandealid' 'cr664_dealname' 'duplicate-deal' 'cr664_loandeals'
Add-DuplicateFindings $findings $organizations 'cr664_crmorganizationid' 'cr664_name' 'duplicate-crm-organization' 'cr664_crmorganizations'

$controlledTasks = @($tasks | Where-Object { $_._cr664_deal_value -and $controlledDealIds.Contains([string]$_._cr664_deal_value) })
if ($controlledTasks.Count -gt 0) {
  $findings.Add([ordered]@{
    category = 'controlled-parent-open-tasks'
    entitySet = 'cr664_dealtask1s'
    recordIds = @($controlledTasks | ForEach-Object { $_.cr664_dealtask1id })
    parentDealIds = @($controlledTasks | ForEach-Object { $_._cr664_deal_value } | Sort-Object -Unique)
    disposition = 'exclude-by-parent-classification-review-before-closing'
    operation = 'review'
  })
}

foreach ($organization in $organizations) {
  if (Test-ControlledName $organization.cr664_name) {
    $findings.Add([ordered]@{
      category = 'controlled-crm-organization'
      entitySet = 'cr664_crmorganizations'
      recordId = $organization.cr664_crmorganizationid
      recordName = $organization.cr664_name
      sourceSystem = $organization.cr664_sourcesystem
      sourceRecordId = $organization.cr664_sourcerecordid
      createdOn = $organization.createdon
      etag = $organization.'@odata.etag'
      disposition = 'retain-and-classify-through-approved-governance-field-or-ledger'
      operation = 'review'
    })
  }
}

$entitlementGroups = $entitlements |
  Group-Object { "$($_.cr664_entitlementname.ToLowerInvariant())|$($_.cr664_accesslevel)" } |
  Where-Object { $_.Count -gt 1 }
foreach ($group in $entitlementGroups) {
  $findings.Add([ordered]@{
    category = 'duplicate-entitlement'
    entitySet = 'cr664_workspaceentitlementses'
    recordIds = @($group.Group | ForEach-Object { $_.cr664_workspaceentitlementsid })
    records = @($group.Group | ForEach-Object {
      [ordered]@{
        recordId = $_.cr664_workspaceentitlementsid
        name = $_.cr664_entitlementname
        accessLevel = $_.cr664_accesslevel
        isDefault = $_.cr664_isdefault
        profileId = $_._cr664_losuserprofile_value
        workspaceId = $_._cr664_workspace_value
        createdOn = $_.createdon
        modifiedOn = $_.modifiedon
        etag = $_.'@odata.etag'
      }
    })
    evidence = $group.Name
    disposition = 'review-access-impact-then-deactivate-redundant-row'
    operation = 'review'
  })
}

$boardingGroups = $boarded |
  Where-Object { $_._cr664_originatedloandeal_value } |
  Group-Object _cr664_originatedloandeal_value |
  Where-Object { $_.Count -gt 1 }
foreach ($group in $boardingGroups) {
  $findings.Add([ordered]@{
    category = 'duplicate-boarding-link'
    entitySet = 'cr664_portfolioboardedloans'
    recordIds = @($group.Group | ForEach-Object { $_.cr664_portfolioboardedloanid })
    evidence = "originated-deal:$($group.Name)"
    disposition = 'review-source-and-deactivate-only-after-approval'
    operation = 'review'
  })
}

$requiredBoarded = [ordered]@{
  _cr664_originatedloandeal_value = 'originated deal'
  _cr664_assignedservicingowner_value = 'servicing owner'
  cr664_loannumber = 'loan number'
  cr664_borrowerlegalname = 'borrower legal name'
  cr664_loanstatus = 'loan status'
  cr664_currentoutstandingprincipal = 'outstanding principal'
  cr664_currentriskrating = 'risk rating'
  cr664_maturitydate = 'maturity date'
  cr664_originalcommitmentamount = 'original commitment'
  cr664_bookingdate = 'booking date'
}
foreach ($loan in $boarded) {
  $missing = @()
  foreach ($field in $requiredBoarded.Keys) {
    if ($field -eq '_cr664_originatedloandeal_value' -and
        ([string]$loan.cr664_boardingsource) -match '(?i)manual\s+existing\s+loan') {
      continue
    }
    if ($null -eq $loan.$field -or ($loan.$field -is [string] -and -not $loan.$field.Trim())) {
      $missing += $requiredBoarded[$field]
    }
  }
  if ($missing.Count -gt 0) {
    $findings.Add([ordered]@{
      category = 'incomplete-boarded-loan'
      entitySet = 'cr664_portfolioboardedloans'
      recordId = $loan.cr664_portfolioboardedloanid
      missingFields = $missing
      currentFacts = [ordered]@{
        name = $loan.cr664_name
        boardingSource = $loan.cr664_boardingsource
        loanNumber = $loan.cr664_loannumber
        borrowerLegalName = $loan.cr664_borrowerlegalname
        outstandingPrincipal = $loan.cr664_currentoutstandingprincipal
        originalCommitment = $loan.cr664_originalcommitmentamount
        maturityDate = $loan.cr664_maturitydate
        bookingDate = $loan.cr664_bookingdate
        createdOn = $loan.createdon
        modifiedOn = $loan.modifiedon
        etag = $loan.'@odata.etag'
      }
      disposition = 'repair-only-from-authoritative-source'
      operation = 'review'
    })
  }
}

$documentGroups = $documents |
  Group-Object { "$($_._cr664_deal_value)|$(Normalize-DocumentName $_.cr664_documentname)" } |
  Where-Object { $_.Name -and $_.Count -gt 1 }
foreach ($group in $documentGroups) {
  $findings.Add([ordered]@{
    category = 'duplicate-document-taxonomy'
    entitySet = 'cr664_documentchecklists'
    recordIds = @($group.Group | ForEach-Object { $_.cr664_documentchecklistid })
    labels = @($group.Group | ForEach-Object { $_.cr664_documentname } | Sort-Object -Unique)
    evidence = $group.Name
    disposition = 'normalize-category-preserve-original-label-and-history'
    operation = 'review'
  })
}

foreach ($document in $documents) {
  $metadataComplete =
    [bool]$document.cr664_originalfilename -and
    [bool]$document.cr664_mimetype -and
    $null -ne $document.cr664_filesizebytes -and
    [int64]$document.cr664_filesizebytes -gt 0 -and
    [bool]$document.cr664_documentfile_name
  $metadataPresent =
    [bool]$document.cr664_originalfilename -or
    [bool]$document.cr664_mimetype -or
    $null -ne $document.cr664_filesizebytes -or
    [bool]$document.cr664_documentfile_name
  if (($document.cr664_uploadstatus -eq $true -and -not $metadataComplete) -or
      ($document.cr664_uploadstatus -ne $true -and $metadataPresent)) {
    $findings.Add([ordered]@{
      category = 'document-metadata-file-inconsistency'
      entitySet = 'cr664_documentchecklists'
      recordId = $document.cr664_documentchecklistid
      dealId = $document._cr664_deal_value
      uploadStatus = $document.cr664_uploadstatus
      originalFileName = $document.cr664_originalfilename
      fileColumnName = $document.cr664_documentfile_name
      fileSizeBytes = $document.cr664_filesizebytes
      disposition = 'verify-file-bytes-before-repairing-status-or-metadata'
      operation = 'review'
    })
  }
}

foreach ($memo in $memos) {
  if ([int]$memo.cr664_status -ne 788190001) { continue }
  $text = [string]$memo.cr664_memotext
  if (-not $text.Trim() -or $text -match '(?i)DRAFT\s+PREVIEW|not saved,\s*not final|Not finalized') {
    $findings.Add([ordered]@{
      category = 'final-memo-content-inconsistency'
      entitySet = 'cr664_creditmemo1s'
      recordId = $memo.cr664_creditmemo1id
      dealId = $memo._cr664_deal_value
      memoName = $memo.cr664_memoname
      version = $memo.cr664_version
      disposition = 'do-not-rewrite-final-create-governed-new-version-after-review'
      operation = 'review'
    })
  }
}

$manifest = [ordered]@{
  schemaVersion = 1
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  orgUrl = $envInfo.OrgUrl.TrimEnd('/')
  operator = $envInfo.User
  mode = 'dry-run'
  destructiveOperationsPermitted = $false
  inventory = [ordered]@{
    activeDeals = $deals.Count
    operationalDeals = $operationalDeals.Count
    activeCrmOrganizations = $organizations.Count
    activeEntitlements = $entitlements.Count
    activeBoardedLoans = $boarded.Count
    openTasks = $tasks.Count
    activeDocumentChecklistRows = $documents.Count
    activeCreditMemos = $memos.Count
  }
  findings = @($findings)
}

$manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
$hash = Get-ManifestHash $OutputPath
Write-Host ("[DRY-RUN] Wrote {0} findings to {1}" -f $findings.Count, (Resolve-Path -LiteralPath $OutputPath).Path)
Write-Host ("SHA-256: {0}" -f $hash)
Write-Host 'No production records were changed. Review every record-level disposition before requesting -Apply approval.'
