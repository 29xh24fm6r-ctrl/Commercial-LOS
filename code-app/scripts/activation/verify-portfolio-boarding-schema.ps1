<#
  Phase 242B — verify-portfolio-boarding-schema.ps1

  READ-ONLY operator verification. Inspects repository artifacts only.
  NO live write, NO Dataverse create/update/delete, NO email, NO feature-flag
  flip, NO Power Platform deploy, NO route/permission change.

  What it checks:
    - the generated typed service for the portfolio boarded-loan table exists
    - the boarded-loan table is registered as an app data source

  Portfolio boarding also depends on child groups (borrower, collateral,
  guarantor, covenant, tickler, insurance, document-reference, exception/review);
  this script reports the parent-table readiness and defers the child-group
  schema audit to the operator portal review.
#>

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$services = Join-Path $repo 'src\generated\services'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'
$dsiText = if (Test-Path -LiteralPath $dsiPath) { Get-Content -Raw -LiteralPath $dsiPath } else { '' }

$candidateServices = @(
  'Cr664_portfolioboardedloansService.ts',
  'Cr664_portfolioboardedloanService.ts'
)
$serviceExists = $false
foreach ($c in $candidateServices) {
  if (Test-Path -LiteralPath (Join-Path $services $c)) { $serviceExists = $true }
}
$dsRegistered = [bool]($dsiText -match 'cr664_portfolioboardedloan')

if ($serviceExists -and $dsRegistered) { $status = 'PASS' }
elseif ((-not $serviceExists) -and (-not $dsRegistered)) { $status = 'BLOCKED' }
else { $status = 'UNKNOWN' }

Write-Host '== Phase 242B :: Portfolio boarding schema verification (read-only) =='
Write-Host 'Checks: portfolio boarded-loan generated service + data-source registration.'
Write-Host ("Generated service present: {0}" -f $serviceExists)
Write-Host ("Data source registered: {0}" -f $dsRegistered)
Write-Host ("STATUS: {0}" -f $status)

if ($status -ne 'PASS') {
  Write-Host 'NEXT (operator, manual):'
  Write-Host '  1) In the portal verify the portfolio boarded-loan table + child group tables exist with required columns/relationships.'
  Write-Host '  2) Register the boarded-loan table as a data source and regenerate the SDK.'
  Write-Host '  3) Re-run this script. Exact steps: scripts/activation/README.md (Portfolio boarding).'
}

Write-Host ("EVIDENCE: [242B][portfolio-boarding] STATUS={0} service={1} datasource={2} child-groups=portal-review ts={3}" -f $status, $serviceExists, $dsRegistered, (Get-Date -Format o))
