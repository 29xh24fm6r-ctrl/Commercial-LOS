<#
  Phase 242B — verify-checklist-rules.ps1

  READ-ONLY operator verification. Inspects repository artifacts only.
  NO live write, NO Dataverse create/update/delete, NO email, NO feature-flag
  flip, NO Power Platform deploy, NO route/permission change.

  What it checks:
    - the deterministic document-checklist generator modules exist
    - the cr664_documentchecklists table is a registered app data source

  The rule-set "signoff" itself is a MANUAL operator approval (see README); this
  script confirms the technical prerequisites and reports signoff as UNKNOWN
  until the operator records it.
#>

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$deals = Join-Path $repo 'src\deals'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'

$expectedModules = @(
  'newDealChecklistGenerationAdapter.ts',
  'documentChecklistPilotViewModel.ts',
  'documentChecklistUiEnableReadiness.ts'
)
$present = @()
$missing = @()
foreach ($m in $expectedModules) {
  if (Test-Path -LiteralPath (Join-Path $deals $m)) { $present += $m } else { $missing += $m }
}

$dsiText = if (Test-Path -LiteralPath $dsiPath) { Get-Content -Raw -LiteralPath $dsiPath } else { '' }
$dsRegistered = [bool]($dsiText -match 'cr664_documentchecklists')

if (($missing.Count -eq 0) -and $dsRegistered) { $status = 'UNKNOWN' } else { $status = 'BLOCKED' }

Write-Host '== Phase 242B :: Document checklist rule-set verification (read-only) =='
Write-Host 'Checks: deterministic checklist generator modules + documentchecklists data source.'
Write-Host ("Present modules: {0}" -f ($(if ($present.Count) { $present -join ', ' } else { '(none)' })))
Write-Host ("Missing modules: {0}" -f ($(if ($missing.Count) { $missing -join ', ' } else { '(none)' })))
Write-Host ("Data source cr664_documentchecklists registered: {0}" -f $dsRegistered)
Write-Host ("STATUS: {0}" -f $status)

if ($status -eq 'BLOCKED') {
  Write-Host 'NEXT (operator, manual): restore the checklist generator modules and register the cr664_documentchecklists data source, then regenerate the SDK. See README (Checklist rule-set).'
} else {
  Write-Host 'NEXT (operator, manual): a Super-Admin/lending owner must review and SIGN OFF the active checklist rule-set (product/stage rules) and record the signoff. The technical prerequisites are present. See README (Checklist rule-set).'
}

Write-Host ("EVIDENCE: [242B][checklist-rules] STATUS={0} modules={1}/{2} datasource={3} signoff=pending-operator ts={4}" -f $status, $present.Count, $expectedModules.Count, $dsRegistered, (Get-Date -Format o))
