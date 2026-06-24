<#
  Phase 242B — collect-activation-evidence.ps1

  READ-ONLY. Runs the five read-only verifiers, aggregates their EVIDENCE lines
  with the current repo commit, and prints a single copy/paste evidence block for
  the final (separately-governed, NOT performed here) gate-flip commit.

  It performs NO live write, NO Dataverse create/update/delete, NO email, NO
  feature-flag flip, NO Power Platform deploy, and NO route/permission change.
  It writes no files; redirect stdout yourself if you want to save the block
  (e.g. `... > activation-evidence.txt`).
#>

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $here '..\..')).Path

$verifiers = @(
  'verify-crm-schema.ps1',
  'verify-checklist-rules.ps1',
  'verify-outlook-connector.ps1',
  'verify-stage-advancement-sinks.ps1',
  'verify-portfolio-boarding-schema.ps1'
)

$commit = 'unknown'
$branch = 'unknown'
try { $commit = (& git -C $repo rev-parse --short HEAD).Trim() } catch { }
try { $branch = (& git -C $repo rev-parse --abbrev-ref HEAD).Trim() } catch { }

$evidence = @()
foreach ($v in $verifiers) {
  $path = Join-Path $here $v
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Host ("WARN: missing verifier {0}" -f $v)
    continue
  }
  $out = & $path
  $out | ForEach-Object { Write-Host $_ }
  $evidence += ($out | Where-Object { $_ -match '^EVIDENCE: ' })
}

Write-Host ''
Write-Host '================ Phase 242B activation evidence (copy/paste) ================'
Write-Host ("repo-commit: {0}" -f $commit)
Write-Host ("branch: {0}" -f $branch)
Write-Host ("collected: {0}" -f (Get-Date -Format o))
foreach ($e in $evidence) { Write-Host $e }
Write-Host 'note: this pack is read-only and flips NO live gate. The gate-flip commit'
Write-Host '      is a separate, governed operator action performed only after every'
Write-Host '      relevant line above reads STATUS=PASS and the manual signoffs are recorded.'
Write-Host '============================================================================'
