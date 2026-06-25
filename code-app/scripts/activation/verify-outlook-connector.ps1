<#
  Phase 242B — verify-outlook-connector.ps1

  READ-ONLY operator verification. Inspects repository artifacts only.
  NO live write, NO Dataverse create/update/delete, NO email send, NO feature-flag
  flip, NO Power Platform deploy, NO route/permission change.

  What it checks:
    - the generated Office 365 Outlook connector service exists
    - the connector is registered, in EITHER the data-source manifest
      (.power/schemas/appschemas/dataSourcesInfo.ts) OR power.config.json

  Phase 250: PAC writes connector registration to power.config.json (the apis/
  shared_office365 entry), and dataSourcesInfo.ts may NOT contain the connector
  string. So both sources are inspected; either match counts as registered.

  It does NOT send mail and does NOT exercise the connector. It only confirms the
  connector + regenerated SDK are present so a separately-governed send path could
  later be certified.
#>

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$servicePath = Join-Path $repo 'src\generated\services\Office365OutlookService.ts'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'
$powerConfigPath = Join-Path $repo 'power.config.json'

$serviceExists = Test-Path -LiteralPath $servicePath
$dsiText = if (Test-Path -LiteralPath $dsiPath) { Get-Content -Raw -LiteralPath $dsiPath } else { '' }
$powerConfigText = if (Test-Path -LiteralPath $powerConfigPath) { Get-Content -Raw -LiteralPath $powerConfigPath } else { '' }

# Real PAC manifest shapes for the Office 365 Outlook connector.
$registrationPattern = '(?i)shared_office365|office\s*365|new_Office365Outlook'
$registeredInManifest = [bool]($dsiText -match $registrationPattern)
$registeredInPowerConfig = [bool]($powerConfigText -match $registrationPattern)
$connectorRegistered = $registeredInManifest -or $registeredInPowerConfig

if ($serviceExists -and $connectorRegistered) { $status = 'PASS' }
elseif (-not $serviceExists) { $status = 'BLOCKED' }
else { $status = 'UNKNOWN' }

Write-Host '== Phase 242B/250 :: Outlook connector + SDK verification (read-only) =='
Write-Host 'Checks: generated Office365Outlook service + connector registration (dataSourcesInfo.ts OR power.config.json).'
Write-Host ("Generated service present: {0}" -f $serviceExists)
Write-Host ("Connector registered in dataSourcesInfo.ts: {0}" -f $registeredInManifest)
Write-Host ("Connector registered in power.config.json: {0}" -f $registeredInPowerConfig)
Write-Host ("Connector registered (either source): {0}" -f $connectorRegistered)
Write-Host ("STATUS: {0}" -f $status)

if ($status -ne 'PASS') {
  Write-Host 'NEXT (operator, manual):'
  Write-Host '  1) In the maker portal add/authorize the Office 365 Outlook connector for the app.'
  Write-Host '  2) Register it (power.config.json apis/shared_office365) and regenerate the typed SDK; confirm Office365OutlookService is generated.'
  Write-Host '  3) Re-run this script. Exact steps: scripts/activation/README.md (Outlook connector).'
} else {
  Write-Host 'NEXT (operator, manual): connector + SDK present. The borrower-send gate flip + explicit audited live-send certification remain separate governed steps.'
}

Write-Host ("EVIDENCE: [250][outlook-connector] STATUS={0} service={1} registered={2} source={3} ts={4}" -f $status, $serviceExists, $connectorRegistered, $(if ($registeredInPowerConfig) { 'power.config.json' } elseif ($registeredInManifest) { 'dataSourcesInfo.ts' } else { 'none' }), (Get-Date -Format o))
