<#
  Phase 242B — verify-outlook-connector.ps1

  READ-ONLY operator verification. Inspects repository artifacts only.
  NO live write, NO Dataverse create/update/delete, NO email send, NO feature-flag
  flip, NO Power Platform deploy, NO route/permission change.

  What it checks:
    - the generated Office 365 Outlook connector service exists
    - the connector is registered in the app data-source manifest

  It does NOT send mail and does NOT exercise the connector. It only confirms the
  connector + regenerated SDK are present so a separately-governed send path could
  later be certified.
#>

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$servicePath = Join-Path $repo 'src\generated\services\Office365OutlookService.ts'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'

$serviceExists = Test-Path -LiteralPath $servicePath
$dsiText = if (Test-Path -LiteralPath $dsiPath) { Get-Content -Raw -LiteralPath $dsiPath } else { '' }
$connectorRegistered = [bool]($dsiText -match 'Office365Outlook|office365outlook|shared_office365')

if ($serviceExists -and $connectorRegistered) { $status = 'PASS' }
elseif (-not $serviceExists) { $status = 'BLOCKED' }
else { $status = 'UNKNOWN' }

Write-Host '== Phase 242B :: Outlook connector + SDK verification (read-only) =='
Write-Host 'Checks: generated Office365Outlook service + connector data-source registration.'
Write-Host ("Generated service present: {0}" -f $serviceExists)
Write-Host ("Connector registered in manifest: {0}" -f $connectorRegistered)
Write-Host ("STATUS: {0}" -f $status)

if ($status -ne 'PASS') {
  Write-Host 'NEXT (operator, manual):'
  Write-Host '  1) In the maker portal add/authorize the Office 365 Outlook connector for the app.'
  Write-Host '  2) Register it as a data source and regenerate the typed SDK; confirm Office365OutlookService is generated.'
  Write-Host '  3) Re-run this script. Exact steps: scripts/activation/README.md (Outlook connector).'
}

Write-Host ("EVIDENCE: [242B][outlook-connector] STATUS={0} service={1} registered={2} ts={3}" -f $status, $serviceExists, $connectorRegistered, (Get-Date -Format o))
