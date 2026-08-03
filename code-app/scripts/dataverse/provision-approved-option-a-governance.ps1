[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [Parameter(Mandatory)]
  [string]$ExpectedPolicySha256,
  [Parameter(Mandatory)]
  [string]$ExpectedAuthoritySha256,
  [string]$PolicyPath = 'deployment\bank-credit-governance\initial-ogb-policy-v1.proposed-active.json',
  [string]$AuthorityPath = 'deployment\bank-credit-governance\authority-profile-provisioning-plan.json'
)

$ErrorActionPreference = 'Stop'
$commonPath=Join-Path $PSScriptRoot '_common.ps1'
if(Test-Path $commonPath){. $commonPath}
else{. (Join-Path $PSScriptRoot 'production-remediation-common.ps1')}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$policyFullPath = (Resolve-Path (Join-Path $repo $PolicyPath)).Path
$authorityFullPath = (Resolve-Path (Join-Path $repo $AuthorityPath)).Path
$policyHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $policyFullPath).Hash.ToLowerInvariant()
$authorityHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $authorityFullPath).Hash.ToLowerInvariant()
if ($policyHash -ne $ExpectedPolicySha256.Trim().ToLowerInvariant()) { throw 'Policy artifact hash mismatch.' }
if ($authorityHash -ne $ExpectedAuthoritySha256.Trim().ToLowerInvariant()) { throw 'Authority artifact hash mismatch.' }
$policyJson = [IO.File]::ReadAllText($policyFullPath, [Text.UTF8Encoding]::new($false))
$policy = $policyJson | ConvertFrom-Json
$authority = Get-Content -Raw -LiteralPath $authorityFullPath | ConvertFrom-Json
if ($policy.status -ne 'ACTIVE' -or $authority.activationState -ne 'APPROVED_FOR_CUTOVER') {
  throw 'The approved Option A artifacts are not activation-ready.'
}
if (@($authority.assignments).Count -ne 1 -or $authority.assignments[0].upn -ne 'mpaller@oldglorybank.com') {
  throw 'The authority artifact does not contain exactly Matthew Paller’s approved assignment.'
}
if (-not $Apply) {
  Write-Host "DRY-RUN policySha256=$policyHash authoritySha256=$authorityHash"
  exit 0
}

$envInfo = Resolve-DataverseEnv
$orgUrl = $envInfo.OrgUrl.TrimEnd('/')
$token = Get-DataverseToken $orgUrl
if (-not (Test-DataverseToken $orgUrl $token)) { throw 'Dataverse WhoAmI failed.' }
if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { throw 'Operator did not confirm Option A provisioning.' }
$api = "$orgUrl/api/data/v9.2"
$headers = @{
  Authorization = "Bearer $token"
  Accept = 'application/json'
  'Content-Type' = 'application/json'
  Prefer = 'return=representation'
}
function Escape-OData([string]$value) { $value.Replace("'", "''") }
function Get-Rows([string]$relative) {
  try {
    return (Invoke-RestMethod -Method Get -Uri "$api/$relative" -Headers $headers).value
  } catch {
    throw "Dataverse GET failed for $relative. $($_.Exception.Message)"
  }
}
function Get-One($rows, [string]$label) {
  $items = @($rows)
  if ($items.Count -ne 1) { throw "Expected one $label; found $($items.Count)." }
  return $items[0]
}
function Post-Row([string]$set, [hashtable]$body) {
  return Invoke-RestMethod -Method Post -Uri "$api/$set" -Headers $headers -Body ($body | ConvertTo-Json -Depth 100)
}
function Patch-Row([string]$set, [string]$id, [hashtable]$body) {
  $patchHeaders = @{} + $headers
  $patchHeaders['If-Match'] = '*'
  Invoke-RestMethod -Method Patch -Uri "$api/$set($id)" -Headers $patchHeaders -Body ($body | ConvertTo-Json -Depth 100) | Out-Null
}
function Hash-Text([string]$value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value)))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}
function ConvertTo-JsonArray($values) {
  return ConvertTo-Json -InputObject @($values) -Compress
}
function Assert-Or-Create([string]$set, [string]$query, [hashtable]$body, [string]$label) {
  $existing = @(Get-Rows "${set}?$query")
  if ($existing.Count -gt 1) { throw "Duplicate $label records already exist." }
  if ($existing.Count -eq 0) {
    $script:seedCounts.create++
    Write-Host ('CREATE {0} {1}' -f $set,$label)
    Post-Row $set $body | Out-Null
  } else {
    $script:seedCounts.noop++
    Write-Host ('NO-OP {0} {1}' -f $set,$label)
  }
  return Get-One (Get-Rows "${set}?$query") $label
}

try {
  $script:seedCounts=[ordered]@{create=0;update=0;noop=0}
  $user = Get-One (Get-Rows "systemusers?`$select=systemuserid,azureactivedirectoryobjectid,isdisabled,domainname&`$filter=domainname eq 'mpaller@oldglorybank.com'") 'Matthew systemuser'
  if ($user.isdisabled -or [string]::IsNullOrWhiteSpace([string]$user.azureactivedirectoryobjectid)) {
    throw 'Matthew’s enabled systemuser-to-Entra identity chain is incomplete.'
  }

  $profile = Assert-Or-Create 'cr664_creditgovernanceprofiles' `
    "`$select=cr664_creditgovernanceprofileid,cr664_bankkey,cr664_profileenabled&`$filter=cr664_bankkey eq 'OGB'" `
    @{
      cr664_name = 'Old Glory Bank Production Credit Governance'
      cr664_bankkey = 'OGB'
      cr664_displayname = 'Old Glory Bank Commercial Lending Governance'
      cr664_profileenabled = $true
      cr664_createdat = [DateTime]::UtcNow.ToString('o')
  } 'OGB governance profile'
  $profileId = [string]$profile.cr664_creditgovernanceprofileid
  if (-not $profile.cr664_profileenabled) {
    $script:seedCounts.update++
    Patch-Row 'cr664_creditgovernanceprofiles' $profileId @{
      cr664_profileenabled = $true
      cr664_displayname = 'Old Glory Bank Commercial Lending Governance'
    }
    $profile = Get-One (Get-Rows "cr664_creditgovernanceprofiles?`$select=cr664_creditgovernanceprofileid,cr664_bankkey,cr664_profileenabled&`$filter=cr664_bankkey eq 'OGB'") 'enabled OGB governance profile'
  }
  if (-not $profile.cr664_profileenabled) { throw 'The OGB governance profile is not enabled.' }

  $policyQuery = "`$select=cr664_creditpolicyversionid,cr664_policyid,cr664_versionnumber,cr664_policystatus,cr664_snapshotsha256&`$filter=cr664_policyid eq '$(Escape-OData $policy.policyId)' and cr664_versionnumber eq $($policy.version)"
  $policyRow = Assert-Or-Create 'cr664_creditpolicyversions' $policyQuery @{
    cr664_name = "$($policy.policyId)-v$($policy.version)"
    'cr664_Governanceprofile@odata.bind' = "/cr664_creditgovernanceprofiles($profileId)"
    cr664_policyid = [string]$policy.policyId
    cr664_versionnumber = [int]$policy.version
    cr664_policystatus = 'ACTIVE'
    cr664_effectivefrom = [string]$policy.effectiveFrom
    cr664_contractversion = [string]$authority.contractVersion
    cr664_snapshotjson = $policyJson
    cr664_snapshotsha256 = $policyHash
    cr664_publishedat = [DateTime]::UtcNow.ToString('o')
    'cr664_Publishedby@odata.bind' = "/systemusers($($user.systemuserid))"
  } 'approved OGB policy version'
  if ($policyRow.cr664_policystatus -ne 'ACTIVE' -or $policyRow.cr664_snapshotsha256 -ne $policyHash) {
    throw 'The active policy readback does not match the approved artifact.'
  }
  $policyId = [string]$policyRow.cr664_creditpolicyversionid

  $ordinal = 0
  foreach ($rule in @($policy.rules)) {
    $ordinal += 1
    $ruleJson = $rule | ConvertTo-Json -Depth 100 -Compress
    $conditionJson = if ($null -eq $rule.when) { '{}' } else { $rule.when | ConvertTo-Json -Depth 100 -Compress }
    $requirementsJson = $rule.requirements | ConvertTo-Json -Depth 100 -Compress
    $actionsJson = ConvertTo-JsonArray $rule.actions
    Assert-Or-Create 'cr664_governancepolicyrules' `
      ("`$select=cr664_governancepolicyruleid,cr664_ruleid,cr664_rulesha256&`$filter=_cr664_policyversion_value eq {0} and cr664_ruleid eq '{1}'" -f $policyId, (Escape-OData $rule.ruleId)) `
      @{
        cr664_name = [string]$rule.ruleId
        'cr664_Policyversion@odata.bind' = "/cr664_creditpolicyversions($policyId)"
        cr664_ruleid = [string]$rule.ruleId
        cr664_description = [string]$rule.description
        cr664_actionsjson = $actionsJson
        cr664_conditionjson = $conditionJson
        cr664_requirementsjson = $requirementsJson
        cr664_nonoverrideable = [bool]$rule.nonOverrideable
        cr664_ruleordinal = $ordinal
        cr664_rulesha256 = Hash-Text $ruleJson
      } "policy rule $($rule.ruleId)" | Out-Null
  }

  $assignment = $authority.assignments[0]
  $roleRows = @()
  foreach ($role in @($assignment.roles)) {
    $roleRows += Assert-Or-Create 'cr664_governanceroleassignments' `
      "`$select=cr664_governanceroleassignmentid,cr664_assignmentid,cr664_assignmentstate&`$filter=cr664_assignmentid eq '$(Escape-OData $assignment.assignmentId)'" `
      @{
        cr664_name = [string]$assignment.assignmentId
        'cr664_Governanceprofile@odata.bind' = "/cr664_creditgovernanceprofiles($profileId)"
        'cr664_Officer@odata.bind' = "/systemusers($($user.systemuserid))"
        cr664_assignmentid = [string]$assignment.assignmentId
        cr664_rolecode = [string]$role
        cr664_effectivefrom = [string]$assignment.effectiveFrom
        cr664_assignmentstate = 'ACTIVE'
      } "role assignment $role"
  }

  $grant = Assert-Or-Create 'cr664_authoritygrants' `
    "`$select=cr664_authoritygrantid,cr664_grantid,cr664_grantstate,cr664_maximumamount,cr664_maximumrelationshipexposure,cr664_maximumunsecuredamount&`$filter=cr664_grantid eq '$(Escape-OData $assignment.grantId)'" `
    @{
      cr664_name = [string]$assignment.grantId
      'cr664_Governanceprofile@odata.bind' = "/cr664_creditgovernanceprofiles($profileId)"
      'cr664_Officer@odata.bind' = "/systemusers($($user.systemuserid))"
      cr664_grantid = [string]$assignment.grantId
      cr664_actionsjson = ConvertTo-JsonArray $assignment.actions
      cr664_maximumamount = [decimal]$assignment.maximumAmount
      cr664_maximumrelationshipexposure = [decimal]$assignment.maximumRelationshipExposure
      cr664_maximumunsecuredamount = [decimal]$assignment.maximumUnsecuredAmount
      cr664_productsjson = ConvertTo-JsonArray $assignment.products
      cr664_riskratingsjson = ConvertTo-JsonArray $assignment.riskRatings
      cr664_geographiesjson = '[]'
      cr664_industriesjson = '[]'
      cr664_exceptiontypesjson = ConvertTo-JsonArray $assignment.exceptionTypes
      cr664_insiderpermitted = [bool]$assignment.insiderPermitted
      cr664_criticizedclassifiedstatusesjson = ConvertTo-JsonArray $assignment.criticizedClassifiedStatuses
      cr664_effectivefrom = [string]$assignment.effectiveFrom
      cr664_grantstate = 'ACTIVE'
      cr664_grantbasis = 'Matthew Paller Option A authority approved 2026-07-30; combined roles disclosed; no independent approval claimed.'
    } 'Matthew Option A authority grant'
  if (
    $grant.cr664_grantstate -ne 'ACTIVE' -or
    [decimal]$grant.cr664_maximumamount -ne 1000000 -or
    [decimal]$grant.cr664_maximumrelationshipexposure -ne 1000000 -or
    [decimal]$grant.cr664_maximumunsecuredamount -ne 0
  ) {
    throw 'The active authority readback does not match the approved limits.'
  }
  Write-Host "PASS profile=$profileId policy=$policyId rules=$ordinal actor=$($user.systemuserid) authority=$($grant.cr664_authoritygrantid)"
  Write-Host ('RESULT governance create={0} update={1} no-op={2}' -f $script:seedCounts.create,$script:seedCounts.update,$script:seedCounts.noop)
} finally {
  $token = $null
}
