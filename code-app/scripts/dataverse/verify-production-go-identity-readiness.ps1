<#
  Read-only identity readiness verifier for the four independent Production GO identities.

  This script never creates or updates users, roles, profiles, entitlements, or business data.
  The Dataverse token is acquired in memory and is never printed or persisted.
#>
[CmdletBinding()]
param(
  [string]$ManifestPath = 'docs\governance\production-go-identity-provisioning-manifest.json',
  [string]$CreditApproverUpn,
  [string]$FundingApprover1Upn,
  [string]$FundingApprover2Upn,
  [string]$BoardingServicingOperatorUpn,
  [string]$EvidencePath
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifest = Get-Content -Raw -LiteralPath (Join-Path $repo $ManifestPath) | ConvertFrom-Json
$org = [string]$manifest.organizationUrl
$api = "$($org.TrimEnd('/'))/api/data/v9.2"
$token = Get-DataverseToken $org
if (-not (Test-DataverseToken $org $token)) { throw 'Dataverse WhoAmI failed; no valid in-memory token is available.' }
$headers = @{
  Authorization = "Bearer $token"
  Accept = 'application/json'
  'OData-Version' = '4.0'
  'OData-MaxVersion' = '4.0'
  Prefer = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
}

function Escape-OData([string]$value) { return $value.Replace("'", "''") }
function Get-Rows([string]$setName, [string]$filter = '') {
  $uri = "$api/$setName"
  if ($filter) { $uri += "?`$filter=$([uri]::EscapeDataString($filter))" }
  return @((Invoke-RestMethod -Method Get -Uri $uri -Headers $headers).value)
}
function Get-RoleNames([string]$systemUserId) {
  if (-not $systemUserId) { return @() }
  return @((Invoke-RestMethod -Method Get -Uri "$api/systemusers($systemUserId)/systemuserroles_association" -Headers $headers).value |
      ForEach-Object { [string]$_.name } | Sort-Object -Unique)
}
function ExactlyOne([object[]]$rows) { return @($rows).Count -eq 1 }
function ActiveState([object]$row) { return $null -ne $row -and ($null -eq $row.statecode -or [int]$row.statecode -eq 0) }

$upnByKey = @{
  'credit-approver' = $CreditApproverUpn
  'funding-approver-1' = $FundingApprover1Upn
  'funding-approver-2' = $FundingApprover2Upn
  'boarding-servicing-operator' = $BoardingServicingOperatorUpn
}
$results = @()

try {
  foreach ($spec in @($manifest.identities)) {
    $upn = [string]$upnByKey[[string]$spec.key]
    if ([string]::IsNullOrWhiteSpace($upn)) { $upn = [string]$spec.upn }
    $upn = $upn.Trim().ToLowerInvariant()
    if (-not $upn) {
      $results += [pscustomobject]@{
        key = $spec.key
        upn = $null
        verdict = 'BLOCKED'
        blockers = @('A distinct human UPN has not been assigned.')
      }
      continue
    }

    $systemUsers = Get-Rows 'systemusers' ("internalemailaddress eq '{0}'" -f (Escape-OData $upn))
    $platformUsers = Get-Rows 'cr664_platformusers' ("cr664_normalizedemail eq '{0}'" -f (Escape-OData $upn))
    $coreUsers = Get-Rows 'cr664_users' ("cr664_email eq '{0}'" -f (Escape-OData $upn))
    $profiles = Get-Rows 'cr664_losuserprofiles' ("cr664_username eq '{0}'" -f (Escape-OData $upn))
    $bankers = Get-Rows 'cr664_bankers' ("cr664_email eq '{0}'" -f (Escape-OData $upn))

    $systemUser = if (ExactlyOne $systemUsers) { $systemUsers[0] } else { $null }
    $platformUser = if (ExactlyOne $platformUsers) { $platformUsers[0] } else { $null }
    $coreUser = if (ExactlyOne $coreUsers) { $coreUsers[0] } else { $null }
    $profile = if (ExactlyOne $profiles) { $profiles[0] } else { $null }
    $banker = if (ExactlyOne $bankers) { $bankers[0] } else { $null }
    $entitlements = if ($profile) {
      Get-Rows 'cr664_workspaceentitlementses' ("_cr664_losuserprofile_value eq {0}" -f $profile.cr664_losuserprofileid)
    } else { @() }
    $roleNames = Get-RoleNames ([string]$systemUser.systemuserid)
    $blockers = [System.Collections.Generic.List[string]]::new()

    if (-not (ExactlyOne $systemUsers)) { $blockers.Add("Expected one Dataverse system user; found $($systemUsers.Count).") }
    elseif ($systemUser.isdisabled -eq $true) { $blockers.Add('Dataverse system user is disabled.') }
    foreach ($requiredRole in @($spec.requiredDataverseSecurityRoles)) {
      if ($roleNames -notcontains [string]$requiredRole) { $blockers.Add("Missing Dataverse security role: $requiredRole.") }
    }
    if (-not (ExactlyOne $platformUsers)) { $blockers.Add("Expected one platform user; found $($platformUsers.Count).") }
    elseif ($platformUser.cr664_activestatus -ne $true -or -not (ActiveState $platformUser)) { $blockers.Add('Platform user is not active.') }
    if (-not (ExactlyOne $coreUsers)) { $blockers.Add("Expected one core user; found $($coreUsers.Count).") }
    elseif ($coreUser.cr664_activeaccessflag -ne $true -or -not (ActiveState $coreUser)) { $blockers.Add('Core user active-access flag/state is not active.') }
    if ($platformUser -and $coreUser -and [string]$platformUser._cr664_coreuser_value -ne [string]$coreUser.cr664_userid) {
      $blockers.Add('Platform user is not linked to the matching core user.')
    }
    if (-not (ExactlyOne $profiles)) { $blockers.Add("Expected one LOS profile; found $($profiles.Count).") }
    elseif (-not (ActiveState $profile)) { $blockers.Add('LOS profile is not active.') }
    if ($profile -and $coreUser -and [string]$profile._cr664_user_value -ne [string]$coreUser.cr664_userid) {
      $blockers.Add('LOS profile is not linked to the matching core user.')
    }
    $activeEntitlements = @($entitlements | Where-Object { ActiveState $_ })
    if ($activeEntitlements.Count -eq 0) { $blockers.Add('No active workspace entitlement is linked to the LOS profile.') }
    $entitlementGroups = @($activeEntitlements | Group-Object _cr664_workspace_value | Where-Object { $_.Count -gt 1 })
    if ($entitlementGroups.Count -gt 0) { $blockers.Add('Duplicate active workspace entitlements exist for the same workspace.') }
    if ($spec.requiresBankerAuthority -eq $true) {
      if (-not (ExactlyOne $bankers)) { $blockers.Add("Expected one banker authority row; found $($bankers.Count).") }
      elseif ($banker.cr664_activeflag -ne $true -or -not (ActiveState $banker)) { $blockers.Add('Banker authority row is not active.') }
      elseif ($coreUser -and [string]$banker._cr664_userloginmapping_value -ne [string]$coreUser.cr664_userid) {
        $blockers.Add('Banker authority row is not linked to the matching core user.')
      }
      if ($spec.key -eq 'credit-approver' -and $banker) {
        if ($banker.cr664_creditcommitteemember -ne $true) { $blockers.Add('Credit committee membership is not enabled.') }
        if ($null -eq $banker.cr664_approvallimit -or [decimal]$banker.cr664_approvallimit -le 0) {
          $blockers.Add('Credit approval limit is missing or non-positive.')
        }
      }
    }

    $results += [pscustomobject]@{
      key = $spec.key
      upn = $upn
      verdict = $(if ($blockers.Count -eq 0) { 'READY_FOR_HUMAN_LOGIN' } else { 'BLOCKED' })
      systemUserId = $systemUser.systemuserid
      dataverseSecurityRoles = $roleNames
      platformUserId = $platformUser.cr664_platformuserid
      coreUserId = $coreUser.cr664_userid
      losUserProfileId = $profile.cr664_losuserprofileid
      activeWorkspaceEntitlementIds = @($activeEntitlements | ForEach-Object { $_.cr664_workspaceentitlementsid })
      bankerId = $banker.cr664_bankerid
      blockers = @($blockers)
    }
  }

  $assigned = @($results | Where-Object { $_.upn } | ForEach-Object { $_.upn })
  $duplicateUpns = @($assigned | Group-Object | Where-Object { $_.Count -gt 1 } | ForEach-Object { $_.Name })
  $requesterCollision = @($assigned | Where-Object { $_ -eq ([string]$manifest.requestedByUpn).ToLowerInvariant() })
  $report = [ordered]@{
    schemaVersion = 1
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    environmentId = $manifest.environmentId
    organizationUrl = $manifest.organizationUrl
    readOnly = $true
    overallVerdict = $(if (@($results | Where-Object { $_.verdict -ne 'READY_FOR_HUMAN_LOGIN' }).Count -eq 0 -and
        $duplicateUpns.Count -eq 0 -and $requesterCollision.Count -eq 0) { 'READY_FOR_DISTINCT_HUMAN_LOGIN' } else { 'BLOCKED' })
    separationBlockers = @(
      @($duplicateUpns | ForEach-Object { "UPN is assigned to more than one certification role: $_." })
      @($requesterCollision | ForEach-Object { "Certification identity duplicates the requester: $_." })
    )
    identities = $results
  }
  $json = $report | ConvertTo-Json -Depth 12
  if ($EvidencePath) {
    $fullEvidencePath = if ([System.IO.Path]::IsPathRooted($EvidencePath)) { $EvidencePath } else { Join-Path $repo $EvidencePath }
    $parent = Split-Path -Parent $fullEvidencePath
    if ($parent -and -not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    [System.IO.File]::WriteAllText($fullEvidencePath, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Host ("Identity readiness evidence written: {0}" -f $fullEvidencePath)
  }
  Write-Output $json
} finally {
  $token = $null
}
