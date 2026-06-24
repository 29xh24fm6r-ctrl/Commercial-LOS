<#
  Phase 243 - run-full-activation-verification.ps1

  READ-ONLY orchestrator. Runs the Phase 243 schema verification AND the Phase
  242B activation verifiers, then prints one combined copy/paste evidence block
  and the overall gate-cutover readiness.

  It performs no mutation, no flag flip, no deploy. fullLaunchAchieved stays FALSE
  until every line reads STATUS=PASS and the operator performs the separate,
  governed gate cutover.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $here '..\..')).Path

$steps = @(
  (Join-Path $here 'verify-full-schema.ps1')
)
$activationDir = Join-Path $repo 'scripts\activation'
foreach ($v in @('verify-crm-schema.ps1', 'verify-checklist-rules.ps1', 'verify-outlook-connector.ps1', 'verify-stage-advancement-sinks.ps1', 'verify-portfolio-boarding-schema.ps1')) {
  $p = Join-Path $activationDir $v
  if (Test-Path -LiteralPath $p) { $steps += $p }
}

$evidence = @()
foreach ($s in $steps) {
  Write-Host ("---- running {0} ----" -f (Split-Path $s -Leaf))
  # The child verifiers emit via Write-Host (Information stream). Without *>&1 their
  # EVIDENCE lines are NOT captured into $out, leaving $evidence empty and ALL-PASS
  # vacuously true. Merge all streams so BLOCKED/UNKNOWN evidence is actually seen.
  $out = & $s *>&1
  $out | ForEach-Object { Write-Host $_ }
  $evidence += ($out | ForEach-Object { "$_" } | Where-Object { $_ -match '^EVIDENCE: ' })
}

$commit = 'unknown'
try { $commit = (& git -C $repo rev-parse --short HEAD).Trim() } catch { }
# ALL-PASS requires at least one evidence line AND zero non-PASS (BLOCKED/UNKNOWN) lines.
# An empty evidence set is NOT a pass.
$nonPass = @($evidence | Where-Object { $_ -notmatch 'STATUS=PASS' })
$allPass = ($evidence.Count -gt 0) -and ($nonPass.Count -eq 0)

Write-Host ''
Write-Host '============ Phase 243 full activation verification (copy/paste) ============'
Write-Host ("repo-commit: {0}" -f $commit)
Write-Host ("collected: {0}" -f (Get-Date -Format o))
foreach ($e in $evidence) { Write-Host $e }
Write-Host ("ALL-PASS: {0}" -f $allPass)
Write-Host ("fullLaunchAchieved: false  (remains false until ALL-PASS=True AND the separate governed gate cutover is performed)")
Write-Host '============================================================================'
