<#
  Verifies the Microsoft 365 integration readiness artifacts for this Code App.

  Read-only:
    - verifies the Office 365 Outlook connector + generated service using the existing script;
    - verifies the Teams app manifest template points at the deployed Commercial LOS Power Apps URL;
    - optionally verifies Teams package icons are present.

  This script performs no Outlook send, no Teams upload, no Graph call, no Dataverse write, and no
  pac code push.
#>
[CmdletBinding()]
param([switch]$RequireTeamsIcons)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$teamsDir = Join-Path $repo 'microsoft365\teams'
$manifestPath = Join-Path $teamsDir 'manifest.template.json'
$outlookVerifier = Join-Path $PSScriptRoot 'verify-outlook-connector.ps1'
$expectedEnvironmentId = '5f2d77a5-de50-edeb-9d74-5b2400a2320d'
$expectedAppId = '63858e09-3d0b-47c9-b1d2-65cef742fda4'
$expectedTenantId = 'e5d2be43-2e2c-4968-b5f3-c73dd825ee80'

function Write-Check($Name, $Ok, $Detail) {
  $status = if ($Ok) { 'PASS' } else { 'BLOCKED' }
  Write-Host ("[{0}] {1} - {2}" -f $status, $Name, $Detail)
  return [bool]$Ok
}

Write-Host '== Microsoft 365 integration readiness verification =='

$ok = $true

if (Test-Path -LiteralPath $outlookVerifier) {
  & powershell -File $outlookVerifier
  if ($LASTEXITCODE -ne 0) { $ok = $false }
} else {
  $ok = (Write-Check 'Outlook verifier' $false 'scripts/activation/verify-outlook-connector.ps1 is missing') -and $ok
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
  Write-Host 'STATUS: BLOCKED'
  exit 1
}

Write-Host 'STATUS: PASS'
Write-Host ("EVIDENCE: [microsoft365-integration] STATUS=PASS teamsManifest={0} requireIcons={1} ts={2}" -f $manifestPath, $RequireTeamsIcons.IsPresent, (Get-Date -Format o))
