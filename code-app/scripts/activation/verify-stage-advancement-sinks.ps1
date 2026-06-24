<#
  Phase 242B — verify-stage-advancement-sinks.ps1

  READ-ONLY operator verification. Inspects repository artifacts only.
  NO live write, NO Dataverse create/update/delete, NO email, NO feature-flag
  flip, NO Power Platform deploy, NO route/permission change.

  What it checks (the three sinks a governed Advance Stage write depends on):
    - stage reference service        (Cr664_dealstagereferencesService)
    - audit sink service             (Cr664_auditeventsService)
    - timeline sink service          (Cr664_dealtimelineeventsService)
  and that each is a registered app data source.
#>

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$services = Join-Path $repo 'src\generated\services'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'
$dsiText = if (Test-Path -LiteralPath $dsiPath) { Get-Content -Raw -LiteralPath $dsiPath } else { '' }

$sinks = @(
  @{ name = 'stage-reference'; service = 'Cr664_dealstagereferencesService.ts'; ds = 'cr664_dealstagereferences' },
  @{ name = 'audit';          service = 'Cr664_auditeventsService.ts';          ds = 'cr664_auditevents' },
  @{ name = 'timeline';       service = 'Cr664_dealtimelineeventsService.ts';   ds = 'cr664_dealtimelineevents' }
)

$ok = 0
foreach ($s in $sinks) {
  $svc = Test-Path -LiteralPath (Join-Path $services $s.service)
  $ds = [bool]($dsiText -match [regex]::Escape($s.ds))
  $sinkOk = $svc -and $ds
  if ($sinkOk) { $ok++ }
  Write-Host ("  sink {0}: service={1} datasource={2} => {3}" -f $s.name, $svc, $ds, $(if ($sinkOk) { 'OK' } else { 'MISSING' }))
}

if ($ok -eq $sinks.Count) { $status = 'PASS' }
elseif ($ok -eq 0) { $status = 'BLOCKED' }
else { $status = 'UNKNOWN' }

Write-Host '== Phase 242B :: Stage advancement transport/audit/timeline sink verification (read-only) =='
Write-Host ("STATUS: {0} ({1}/{2} sinks present)" -f $status, $ok, $sinks.Count)

if ($status -ne 'PASS') {
  Write-Host 'NEXT (operator, manual): register the missing stage-reference / audit / timeline tables as data sources and regenerate the SDK so the typed sink services exist. See README (Stage advancement sinks).'
} else {
  Write-Host 'NEXT (operator, manual): the three sinks are present. A controlled single-record Advance Stage smoke (separately governed) can be scheduled. See README (Stage advancement sinks).'
}

Write-Host ("EVIDENCE: [242B][stage-sinks] STATUS={0} sinks={1}/{2} ts={3}" -f $status, $ok, $sinks.Count, (Get-Date -Format o))
