<#
  Phase 242B — verify-checklist-rules.ps1

  READ-ONLY operator verification. Inspects repository artifacts only.
  NO live write, NO Dataverse create/update/delete, NO email, NO feature-flag
  flip, NO Power Platform deploy, NO route/permission change.

  What it checks:
    - the deterministic document-checklist generator modules exist
    - the cr664_documentchecklists table is a registered app data source

  The rule-set "signoff" itself is a MANUAL operator approval. This script
  confirms the technical prerequisites and the committed lending-owner signoff
  artifact.
#>

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$deals = Join-Path $repo 'src\deals'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'
$signoffPath = Join-Path $repo 'docs\operator-evidence\DOCUMENT_CHECKLIST_LENDING_OWNER_SIGNOFF_2026-06-25.md'

$expectedModules = @(
  'newDealChecklistGenerationAdapter.ts',
  'documentChecklistPilotConfig.ts',
  'documentChecklistUiEnableReadiness.ts'
)
$present = @()
$missing = @()
foreach ($m in $expectedModules) {
  if (Test-Path -LiteralPath (Join-Path $deals $m)) { $present += $m } else { $missing += $m }
}

$dsiText = if (Test-Path -LiteralPath $dsiPath) { Get-Content -Raw -LiteralPath $dsiPath } else { '' }
$dsRegistered = [bool]($dsiText -match 'cr664_documentchecklists')
$signoffRecorded = Test-Path -LiteralPath $signoffPath

if (($missing.Count -eq 0) -and $dsRegistered -and $signoffRecorded) { $status = 'PASS' } else { $status = 'BLOCKED' }

Write-Host '== Phase 242B :: Document checklist rule-set verification (read-only) =='
Write-Host 'Checks: deterministic checklist generator modules + documentchecklists data source.'
Write-Host ("Present modules: {0}" -f ($(if ($present.Count) { $present -join ', ' } else { '(none)' })))
Write-Host ("Missing modules: {0}" -f ($(if ($missing.Count) { $missing -join ', ' } else { '(none)' })))
Write-Host ("Data source cr664_documentchecklists registered: {0}" -f $dsRegistered)
Write-Host ("Checklist lending-owner signoff recorded: {0}" -f $signoffRecorded)
Write-Host ("STATUS: {0}" -f $status)

if ($status -eq 'BLOCKED') {
  Write-Host 'NEXT (operator, manual): restore the checklist generator modules, register the cr664_documentchecklists data source, and record the lending-owner signoff artifact.'
} else {
  Write-Host 'Checklist rule-set prerequisites and committed lending-owner signoff are present.'
}

Write-Host ("EVIDENCE: [251][checklist-rules] STATUS={0} modules={1}/{2} datasource={3} signoff={4} ts={5}" -f $status, $present.Count, $expectedModules.Count, $dsRegistered, $(if ($signoffRecorded) { 'RECORDED' } else { 'MISSING' }), (Get-Date -Format o))
