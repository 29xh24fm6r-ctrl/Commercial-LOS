<#
  M365-6 full arc verifier.

  Read-only certification framework check. It runs only local/read-only verifiers
  and reports final lane verdicts without executing live smokes.
#>
[CmdletBinding()]
param([string]$RepoRoot)

$ErrorActionPreference = 'Stop'
$repo = if ($RepoRoot) { (Resolve-Path -LiteralPath $RepoRoot).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$m365Verifier = Join-Path $repo 'scripts\activation\verify-microsoft365-integration.ps1'
$teamsPostVerifier = Join-Path $repo 'scripts\activation\verify-teams-channel-posting-boundary.ps1'
$outlookEmailEvidence = Join-Path $repo 'docs\operator-evidence\OUTLOOK_LIVE_SEND_CERTIFICATION_2026-07-28.md'

$blocked = $false

Write-Host '== M365 Calendar + Teams full arc verifier (read-only) =='

if (Test-Path -LiteralPath $m365Verifier) {
  & powershell -File $m365Verifier -RepoRoot $repo -RequireOutlookRuntimeBinding -RequireCalendarRuntimeBinding -RequireTeamsPackage
  if ($LASTEXITCODE -ne 0) { $blocked = $true }
} else {
  Write-Host '[BLOCKED] Microsoft 365 verifier missing'
  $blocked = $true
}

if (Test-Path -LiteralPath $teamsPostVerifier) {
  & powershell -File $teamsPostVerifier -RepoRoot $repo
  if ($LASTEXITCODE -ne 0) { $blocked = $true }
} else {
  Write-Host '[BLOCKED] Teams channel posting verifier missing'
  $blocked = $true
}

$laneDefault = if ($blocked) { 'BLOCKED' } else { 'UNKNOWN' }
$outlookEmail = $laneDefault

if (-not $blocked -and (Test-Path -LiteralPath $outlookEmailEvidence)) {
  $evidence = Get-Content -Raw -LiteralPath $outlookEmailEvidence
  $requiredOutlookFacts = @(
    'internal diagnostic LIVE send path',
    'Runtime binding observed',
    '"dataSourceType"',
    '"Connector"',
    'Connector accepted the smoke message',
    'Actual inbox receipt: confirmed',
    'Connector acceptance was treated as transport acceptance only',
    'Actual inbox receipt was separately confirmed',
    'does **not** claim borrower delivery',
    'read receipt'
  )
  $outlookEmail = 'PASS'
  foreach ($fact in $requiredOutlookFacts) {
    if ($evidence -notlike "*$fact*") { $outlookEmail = 'UNKNOWN' }
  }
  if ($evidence -notmatch '(?is)Final verdict.*CERTIFIED PASS') { $outlookEmail = 'UNKNOWN' }
}

Write-Host ("OUTLOOK_EMAIL={0}" -f $outlookEmail)
Write-Host ("OUTLOOK_EMAIL_EVIDENCE={0}" -f $outlookEmailEvidence)
Write-Host ("OUTLOOK_CALENDAR_READ={0}" -f $laneDefault)
Write-Host ("OUTLOOK_AVAILABILITY={0}" -f $laneDefault)
Write-Host ("OUTLOOK_CALENDAR_WRITE={0}" -f $laneDefault)
Write-Host ("TEAMS_MEETING={0}" -f $laneDefault)
Write-Host ("TEAMS_APP={0}" -f $laneDefault)
Write-Host ("TEAMS_CHANNEL_POST={0}" -f $laneDefault)
Write-Host ("OVERALL={0}" -f $laneDefault)

if ($blocked) {
  Write-Host 'STATUS=BLOCKED'
  exit 1
}

Write-Host 'STATUS=UNKNOWN'
Write-Host ("EVIDENCE: [m365-calendar-teams-full-arc] STATUS=UNKNOWN reason=live-certification-evidence-not-run ts={0}" -f (Get-Date -Format o))
