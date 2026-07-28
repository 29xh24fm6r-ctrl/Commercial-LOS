<#
  Phase 242B/250 hardening — verify-outlook-connector.ps1

  READ-ONLY operator verification. Inspects repository artifacts only.
  NO live write, NO Dataverse create/update/delete, NO email send, NO feature-flag
  flip, NO Power Platform deploy, NO route/permission change.

  It distinguishes three states:
    CONFIGURED      — generated Outlook service exists and power.config.json
                      declares shared_office365 with the office365 data source.
    RUNTIME_BOUND   — if .power/schemas/appschemas/dataSourcesInfo.ts exists,
                      it must contain an office365 entry with dataSourceType:
                      Connector. power.config.json alone is never runtime proof.
    LIVE_CERTIFIED  — manual evidence only. Connector acceptance is not delivery;
                      actual inbox receipt must be recorded separately.
#>
[CmdletBinding()]
param(
  [string]$RepoRoot,
  [switch]$ManualConnectorAccepted,
  [switch]$ManualInboxReceiptConfirmed
)

$ErrorActionPreference = 'Stop'
$repo = if ($RepoRoot) { (Resolve-Path -LiteralPath $RepoRoot).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$servicePath = Join-Path $repo 'src\generated\services\Office365OutlookService.ts'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'
$powerConfigPath = Join-Path $repo 'power.config.json'

function Read-OptionalText($Path) {
  if (Test-Path -LiteralPath $Path) { return Get-Content -Raw -LiteralPath $Path }
  return ''
}

function Convert-OptionalJson($Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
  try { return $Text | ConvertFrom-Json } catch { return $null }
}

function Get-OutlookPowerConfigState($PowerConfigText) {
  $json = Convert-OptionalJson $PowerConfigText
  if ($null -eq $json) {
    return @{
      HasSharedOffice365 = $false
      HasOffice365DataSource = $false
      Detail = 'power.config.json missing or invalid'
    }
  }

  $refs = $json.connectionReferences
  if ($null -eq $refs) {
    return @{
      HasSharedOffice365 = $false
      HasOffice365DataSource = $false
      Detail = 'connectionReferences missing'
    }
  }

  $hasShared = $false
  $hasDataSource = $false
  foreach ($prop in $refs.PSObject.Properties) {
    $value = $prop.Value
    $id = [string]$value.id
    $dataSources = @($value.dataSources | ForEach-Object { [string]$_ })
    if ($id -match '/providers/Microsoft\.PowerApps/apis/shared_office365$' -or $id -eq 'shared_office365') {
      $hasShared = $true
    }
    if ($dataSources -contains 'office365') {
      $hasDataSource = $true
    }
  }

  return @{
    HasSharedOffice365 = $hasShared
    HasOffice365DataSource = $hasDataSource
    Detail = "shared_office365=$hasShared office365DataSource=$hasDataSource"
  }
}

function Get-OutlookRuntimeBindingState($DataSourcesInfoPath, $DataSourcesInfoText) {
  if (-not (Test-Path -LiteralPath $DataSourcesInfoPath)) {
    return @{
      Status = 'UNKNOWN'
      HasManifest = $false
      Detail = 'runtime manifest absent; follow the Microsoft 365 integration runbook to generate/sync and verify before deployment'
    }
  }

  $hasOffice365 = [bool]($DataSourcesInfoText -match '(?m)["'']office365["'']\s*:')
  $hasConnectorType = [bool]($DataSourcesInfoText -match '(?s)["'']office365["'']\s*:\s*\{.*?["'']dataSourceType["'']\s*:\s*["'']Connector["'']')
  if ($hasOffice365 -and $hasConnectorType) {
    return @{
      Status = 'PASS'
      HasManifest = $true
      Detail = 'office365 runtime data source is bound as dataSourceType Connector'
    }
  }

  return @{
    Status = 'BLOCKED'
    HasManifest = $true
    Detail = 'runtime manifest exists but office365 Connector entry is absent; power.config.json alone is not runtime binding proof'
  }
}

$serviceExists = Test-Path -LiteralPath $servicePath
$dsiText = Read-OptionalText $dsiPath
$powerConfigText = Read-OptionalText $powerConfigPath

$configState = Get-OutlookPowerConfigState $powerConfigText
$configuredPass = $serviceExists -and $configState.HasSharedOffice365 -and $configState.HasOffice365DataSource
$configuredStatus = if ($configuredPass) { 'PASS' } else { 'BLOCKED' }

$runtimeState = Get-OutlookRuntimeBindingState $dsiPath $dsiText
$runtimeStatus = $runtimeState.Status

$liveCertifiedStatus = if ($ManualConnectorAccepted -and $ManualInboxReceiptConfirmed) { 'PASS' } else { 'UNKNOWN' }

$status = if ($configuredStatus -eq 'BLOCKED' -or $runtimeStatus -eq 'BLOCKED') {
  'BLOCKED'
} elseif ($configuredStatus -eq 'PASS' -and $runtimeStatus -eq 'PASS') {
  'PASS'
} else {
  'UNKNOWN'
}

Write-Host '== Outlook connector configuration/runtime/live-certification verification (read-only) =='
Write-Host 'CONFIGURED means generated service + power.config.json shared_office365/office365 are present.'
Write-Host 'RUNTIME_BOUND means dataSourcesInfo.ts, when present, contains office365 with dataSourceType Connector.'
Write-Host 'LIVE_CERTIFIED is manual evidence only: connector acceptance is not delivery; actual inbox receipt must be recorded separately.'
Write-Host ("Generated service present: {0}" -f $serviceExists)
Write-Host ("power.config.json Outlook registration: {0}" -f $configState.Detail)
Write-Host ("runtime manifest: {0}" -f $runtimeState.Detail)
Write-Host ("manual connector accepted evidence supplied: {0}" -f $ManualConnectorAccepted.IsPresent)
Write-Host ("manual inbox receipt evidence supplied: {0}" -f $ManualInboxReceiptConfirmed.IsPresent)
Write-Host ("CONFIGURED={0}" -f $configuredStatus)
Write-Host ("RUNTIME_BOUND={0}" -f $runtimeStatus)
Write-Host ("LIVE_CERTIFIED={0}" -f $liveCertifiedStatus)
Write-Host ("STATUS={0}" -f $status)

if ($configuredStatus -ne 'PASS') {
  Write-Host 'NEXT (operator, manual): add/authorize Office 365 Outlook, confirm power.config.json has shared_office365 with dataSources ["office365"], and regenerate the typed service.'
}
if ($runtimeStatus -eq 'BLOCKED') {
  Write-Host 'NEXT (operator, manual): follow the Microsoft 365 integration runbook runtime-binding recovery sequence; verify dataSourcesInfo.ts has office365 dataSourceType Connector; rebuild before deployment.'
}
if ($runtimeStatus -eq 'UNKNOWN') {
  Write-Host 'NEXT (operator, manual): generate/sync .power/schemas/appschemas/dataSourcesInfo.ts and verify office365 runtime binding before deployment.'
}
if ($ManualConnectorAccepted -and -not $ManualInboxReceiptConfirmed) {
  Write-Host 'NOTE: Connector accepted the smoke message, but delivery is NOT certified until actual inbox receipt is confirmed.'
}

Write-Host ("EVIDENCE: [outlook-connector-runtime-binding] CONFIGURED={0} RUNTIME_BOUND={1} LIVE_CERTIFIED={2} STATUS={3} service={4} manifestExists={5} ts={6}" -f $configuredStatus, $runtimeStatus, $liveCertifiedStatus, $status, $serviceExists, $runtimeState.HasManifest, (Get-Date -Format o))

if ($status -eq 'BLOCKED') { exit 1 }
exit 0
