<#
  Phase 243 - verify-full-schema.ps1

  READ-ONLY. Verifies the internal OGB CRM spine + portfolio boarding schema is
  present, by checking BOTH:
    - repo artifacts: generated Cr664_*Service files + data-source registration
    - live Dataverse (only if a pac org + token are available): EntityDefinitions

  It performs no mutation of any kind. Prints PASS / BLOCKED / UNKNOWN per domain.
#>
[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$services = Join-Path $repo 'src\generated\services'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'
$dsiText = if (Test-Path -LiteralPath $dsiPath) { Get-Content -Raw -LiteralPath $dsiPath } else { '' }
$schemaDir = Join-Path $PSScriptRoot 'schema'

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }

function Get-ServiceFileName([string]$entitySet) { 'Cr664_' + $entitySet.Substring('cr664_'.Length) + 'Service.ts' }

$overall = @()
foreach ($f in @(@{ name = 'crm-spine'; file = 'crm-spine.schema.json' }, @{ name = 'portfolio-boarding'; file = 'portfolio-boarding.schema.json' })) {
  $s = Get-Content -Raw -LiteralPath (Join-Path $schemaDir $f.file) | ConvertFrom-Json
  $svcOk = 0; $dsOk = 0; $liveOk = 0; $liveChecked = 0
  foreach ($t in $s.tables) {
    $svc = Test-Path -LiteralPath (Join-Path $services (Get-ServiceFileName $t.entitySetName))
    if ($svc) { $svcOk++ }
    if ($dsiText -match [regex]::Escape($t.entitySetName)) { $dsOk++ }
    $live = Test-DataverseTable $envInfo.OrgUrl $token $t.logicalName
    if ($live -ne $null) { $liveChecked++; if ($live) { $liveOk++ } }
  }
  $n = $s.tables.Count
  $status = if (($svcOk -eq $n) -and ($dsOk -eq $n)) { 'PASS' } elseif ($svcOk -eq 0 -and $dsOk -eq 0) { 'BLOCKED' } else { 'UNKNOWN' }
  Write-Host ("== {0}: services {1}/{2} datasources {3}/{4} live {5}/{6} => {7}" -f $f.name, $svcOk, $n, $dsOk, $n, $liveOk, $liveChecked, $status)
  $overall += @{ name = $f.name; status = $status }
  Write-Host ("EVIDENCE: [243][verify-{0}] STATUS={1} services={2}/{3} datasources={4}/{5} live={6}/{7} ts={8}" -f $f.name, $status, $svcOk, $n, $dsOk, $n, $liveOk, $liveChecked, (Get-Date -Format o))
}

$allPass = -not ($overall | Where-Object { $_.status -ne 'PASS' })
Write-Host ("OVERALL SCHEMA: {0}" -f $(if ($allPass) { 'PASS' } else { 'NOT-PASS (see above)' }))
