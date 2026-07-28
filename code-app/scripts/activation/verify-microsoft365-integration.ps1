<#
  Verifies the Microsoft 365 integration readiness artifacts for this Code App.

  Read-only:
    - verifies Office 365 Outlook configuration/runtime binding with verify-outlook-connector.ps1;
    - verifies the Teams app manifest template points at the deployed Commercial LOS Power Apps URL;
    - optionally verifies Teams package icons are present.

  This script performs no Outlook send, no Teams upload, no Graph call, no Dataverse write,
  no connector registration, and no Power Apps code deployment.
#>
[CmdletBinding()]
param(
  [switch]$RequireTeamsIcons,
  [switch]$RequireOutlookRuntimeBinding,
  [switch]$RequireCalendarRuntimeBinding,
  [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$repo = if ($RepoRoot) { (Resolve-Path -LiteralPath $RepoRoot).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$teamsDir = Join-Path $repo 'microsoft365\teams'
$manifestPath = Join-Path $teamsDir 'manifest.template.json'
$outlookVerifier = Join-Path $PSScriptRoot 'verify-outlook-connector.ps1'
$calendarVerifier = Join-Path $PSScriptRoot 'verify-outlook-calendar-connector.ps1'
$expectedEnvironmentId = '5f2d77a5-de50-edeb-9d74-5b2400a2320d'
$expectedAppId = '63858e09-3d0b-47c9-b1d2-65cef742fda4'
$expectedTenantId = 'e5d2be43-2e2c-4968-b5f3-c73dd825ee80'

function Write-Check($Name, $Ok, $Detail) {
  $status = if ($Ok) { 'PASS' } else { 'BLOCKED' }
  Write-Host ("[{0}] {1} - {2}" -f $status, $Name, $Detail)
  return [bool]$Ok
}

function Read-StateValue($Text, $Name) {
  $match = [regex]::Match($Text, "(?m)^$Name=(PASS|BLOCKED|UNKNOWN)\s*$")
  if ($match.Success) { return $match.Groups[1].Value }
  return 'UNKNOWN'
}

Write-Host '== Microsoft 365 integration readiness verification =='

$ok = $true
$unknown = $false
$outlookConfigured = 'UNKNOWN'
$outlookRuntime = 'UNKNOWN'
$outlookLive = 'UNKNOWN'
$outlookStatus = 'UNKNOWN'
$calendarConfigured = 'UNKNOWN'
$calendarRuntime = 'UNKNOWN'
$calendarRead = 'UNKNOWN'
$calendarWrite = 'UNKNOWN'
$calendarStatus = 'UNKNOWN'

if (Test-Path -LiteralPath $outlookVerifier) {
  $outlookOutput = & powershell -File $outlookVerifier -RepoRoot $repo 2>&1
  $outlookExit = $LASTEXITCODE
  $outlookOutput | ForEach-Object { Write-Host $_ }
  $outlookText = ($outlookOutput | Out-String)
  $outlookConfigured = Read-StateValue $outlookText 'CONFIGURED'
  $outlookRuntime = Read-StateValue $outlookText 'RUNTIME_BOUND'
  $outlookLive = Read-StateValue $outlookText 'LIVE_CERTIFIED'
  $outlookStatus = Read-StateValue $outlookText 'STATUS'
  if ($outlookExit -ne 0 -or $outlookStatus -eq 'BLOCKED') { $ok = $false }
  if ($outlookStatus -eq 'UNKNOWN') { $unknown = $true }
  if ($RequireOutlookRuntimeBinding -and $outlookRuntime -ne 'PASS') {
    if ($outlookRuntime -eq 'BLOCKED') {
      $ok = (Write-Check 'Outlook runtime binding required' $false 'dataSourcesInfo.ts exists but lacks office365 Connector binding') -and $ok
    } else {
      Write-Host '[UNKNOWN] Outlook runtime binding required - runtime manifest absent; generate/sync dataSourcesInfo.ts and verify before deployment.'
      $unknown = $true
    }
  }
} else {
  $ok = (Write-Check 'Outlook verifier' $false 'scripts/activation/verify-outlook-connector.ps1 is missing') -and $ok
}

if ($RequireCalendarRuntimeBinding) {
  if (Test-Path -LiteralPath $calendarVerifier) {
    $calendarOutput = & powershell -File $calendarVerifier -RepoRoot $repo 2>&1
    $calendarExit = $LASTEXITCODE
    $calendarOutput | ForEach-Object { Write-Host $_ }
    $calendarText = ($calendarOutput | Out-String)
    $calendarConfigured = Read-StateValue $calendarText 'CALENDAR_CONFIGURED'
    $calendarRuntime = Read-StateValue $calendarText 'CALENDAR_RUNTIME_BOUND'
    $calendarRead = Read-StateValue $calendarText 'CALENDAR_READ_OPERATIONS'
    $calendarWrite = Read-StateValue $calendarText 'CALENDAR_WRITE_OPERATIONS'
    $calendarStatus = Read-StateValue $calendarText 'STATUS'
    if ($calendarExit -ne 0 -or $calendarStatus -eq 'BLOCKED') { $ok = $false }
    if ($calendarStatus -eq 'UNKNOWN') { $unknown = $true }
    if ($calendarRuntime -ne 'PASS') {
      if ($calendarRuntime -eq 'BLOCKED') {
        $ok = (Write-Check 'Calendar runtime binding required' $false 'dataSourcesInfo.ts exists but lacks office365 Connector binding') -and $ok
      } else {
        Write-Host '[UNKNOWN] Calendar runtime binding required - runtime manifest absent; generate/sync dataSourcesInfo.ts and verify before deployment.'
        $unknown = $true
      }
    }
  } else {
    $ok = (Write-Check 'Calendar verifier' $false 'scripts/activation/verify-outlook-calendar-connector.ps1 is missing') -and $ok
  }
}

if (-not (Test-Path -LiteralPath $manifestPath)) {
  $ok = (Write-Check 'Teams manifest' $false "missing: $manifestPath") -and $ok
} else {
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  $tab = @($manifest.staticTabs)[0]
  $contentUrl = [string]$tab.contentUrl
  $websiteUrl = [string]$tab.websiteUrl
  $domains = @($manifest.validDomains | ForEach-Object { [string]$_ })

  $ok = (Write-Check 'Teams manifest id' ($manifest.id -eq $expectedAppId) "id=$($manifest.id)") -and $ok
  $ok = (Write-Check 'Teams tab content URL environment' ($contentUrl -like "*$expectedEnvironmentId*") $contentUrl) -and $ok
  $ok = (Write-Check 'Teams tab content URL app' ($contentUrl -like "*$expectedAppId*") $contentUrl) -and $ok
  $ok = (Write-Check 'Teams tab tenant' ($contentUrl -like "*tenantId=$expectedTenantId*") $contentUrl) -and $ok
  $ok = (Write-Check 'Teams website URL parity' ($websiteUrl -eq $contentUrl) 'websiteUrl matches contentUrl') -and $ok
  $ok = (Write-Check 'Teams valid domain' ($domains -contains 'apps.powerapps.com') ($domains -join ', ')) -and $ok
  $ok = (Write-Check 'Teams Graph permissions' (@($manifest.authorization.permissions.resourceSpecific).Count -eq 0) 'resourceSpecific permission list is empty') -and $ok
  $ok = (Write-Check 'Teams webApplicationInfo resource' ($manifest.webApplicationInfo.resource -eq 'https://apps.powerapps.com') "resource=$($manifest.webApplicationInfo.resource)") -and $ok
}

if ($RequireTeamsIcons) {
  $outline = Join-Path $teamsDir 'outline.png'
  $color = Join-Path $teamsDir 'color.png'
  $ok = (Write-Check 'Teams outline icon' (Test-Path -LiteralPath $outline) $outline) -and $ok
  $ok = (Write-Check 'Teams color icon' (Test-Path -LiteralPath $color) $color) -and $ok
} else {
  Write-Host '[INFO] Teams icon presence not required in this run. Pass -RequireTeamsIcons before packaging/upload.'
}

if (-not $ok) {
  Write-Host 'STATUS=BLOCKED'
  exit 1
}

if ($unknown) {
  Write-Host 'STATUS=UNKNOWN'
  Write-Host ("EVIDENCE: [microsoft365-integration] STATUS=UNKNOWN outlookConfigured={0} outlookRuntime={1} outlookLive={2} calendarConfigured={3} calendarRuntime={4} calendarRead={5} calendarWrite={6} teamsManifest={7} requireIcons={8} requireOutlookRuntimeBinding={9} requireCalendarRuntimeBinding={10} ts={11}" -f $outlookConfigured, $outlookRuntime, $outlookLive, $calendarConfigured, $calendarRuntime, $calendarRead, $calendarWrite, $manifestPath, $RequireTeamsIcons.IsPresent, $RequireOutlookRuntimeBinding.IsPresent, $RequireCalendarRuntimeBinding.IsPresent, (Get-Date -Format o))
  exit 0
}

Write-Host 'STATUS=PASS'
Write-Host ("EVIDENCE: [microsoft365-integration] STATUS=PASS outlookConfigured={0} outlookRuntime={1} outlookLive={2} calendarConfigured={3} calendarRuntime={4} calendarRead={5} calendarWrite={6} teamsManifest={7} requireIcons={8} requireOutlookRuntimeBinding={9} requireCalendarRuntimeBinding={10} ts={11}" -f $outlookConfigured, $outlookRuntime, $outlookLive, $calendarConfigured, $calendarRuntime, $calendarRead, $calendarWrite, $manifestPath, $RequireTeamsIcons.IsPresent, $RequireOutlookRuntimeBinding.IsPresent, $RequireCalendarRuntimeBinding.IsPresent, (Get-Date -Format o))
