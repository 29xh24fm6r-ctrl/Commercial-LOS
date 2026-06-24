<#
  Phase 242B — verify-crm-schema.ps1

  READ-ONLY operator verification. Inspects repository artifacts only.
  It performs NO live write, NO Dataverse create/update/delete, NO email,
  NO feature-flag flip, NO Power Platform deploy, and NO route/permission change.

  What it checks:
    - the generated typed services for the cr664_crm* spine tables exist
    - those tables are registered as app data sources (.power manifest)

  Output: PASS / BLOCKED / UNKNOWN, the exact next portal action, and a
  copy/paste EVIDENCE line for the final (separately-governed) gate-flip commit.
#>

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$services = Join-Path $repo 'src\generated\services'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'

$expected = @(
  'Cr664_crmorganizationsService.ts',
  'Cr664_crmpersonsService.ts',
  'Cr664_crmrelationshipsService.ts',
  'Cr664_crmroleassignmentsService.ts',
  'Cr664_crmtimelineeventsService.ts'
)

$present = @()
$missing = @()
foreach ($s in $expected) {
  if (Test-Path -LiteralPath (Join-Path $services $s)) { $present += $s } else { $missing += $s }
}

$dsiText = if (Test-Path -LiteralPath $dsiPath) { Get-Content -Raw -LiteralPath $dsiPath } else { '' }
$dsRegistered = [bool]($dsiText -match 'cr664_crmorganizations')

if (($missing.Count -eq 0) -and $dsRegistered) { $status = 'PASS' }
elseif (($present.Count -eq 0) -and (-not $dsRegistered)) { $status = 'BLOCKED' }
else { $status = 'UNKNOWN' }

Write-Host '== Phase 242B :: CRM schema verification (read-only) =='
Write-Host 'Checks: cr664_crm* generated services + app data-source registration.'
Write-Host ("Present services: {0}" -f ($(if ($present.Count) { $present -join ', ' } else { '(none)' })))
Write-Host ("Missing services: {0}" -f ($(if ($missing.Count) { $missing -join ', ' } else { '(none)' })))
Write-Host ("Data source cr664_crmorganizations registered: {0}" -f $dsRegistered)
Write-Host ("STATUS: {0}" -f $status)

if ($status -ne 'PASS') {
  Write-Host 'NEXT (operator, manual):'
  Write-Host '  1) In the Power Apps maker portal create the cr664_crm* spine tables + columns + relationships.'
  Write-Host '  2) Register each table as an app data source, then regenerate the typed SDK.'
  Write-Host '  3) Re-run this script. Exact portal + PAC commands: scripts/activation/README.md (CRM schema).'
}

Write-Host ("EVIDENCE: [242B][crm-schema] STATUS={0} present={1}/{2} datasource={3} ts={4}" -f $status, $present.Count, $expected.Count, $dsRegistered, (Get-Date -Format o))
