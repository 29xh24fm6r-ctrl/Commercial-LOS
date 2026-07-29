<#
  Read-only M365 Calendar + Teams production certification harness.

  This script does not deploy, upload a Teams app, create Outlook events,
  send Outlook email, post to Teams, call Graph directly, change tenant policy,
  change Power Platform connections, or enable production write gates.
#>
[CmdletBinding()]
param(
  [string]$RepoRoot,
  [string]$EvidenceRoot
)

$ErrorActionPreference = 'Stop'
$repo = if ($RepoRoot) { (Resolve-Path -LiteralPath $RepoRoot).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$evidenceBase = if ($EvidenceRoot) { (Resolve-Path -LiteralPath $EvidenceRoot).Path } else { $repo }

function Invoke-ReadOnlyVerifier($Name, $RelativePath, [string[]]$Arguments = @()) {
  $scriptPath = Join-Path $repo $RelativePath
  if (-not (Test-Path -LiteralPath $scriptPath)) {
    Write-Host ("[BLOCKED] {0} - missing {1}" -f $Name, $RelativePath)
    return 'BLOCKED'
  }
  Write-Host ("== {0} ==" -f $Name)
  & powershell -File $scriptPath -RepoRoot $repo @Arguments
  if ($LASTEXITCODE -ne 0) { return 'BLOCKED' }
  return 'PASS'
}

function Get-EvidenceVerdict($RelativePath) {
  $path = Join-Path $evidenceBase $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { return 'UNKNOWN' }
  $text = Get-Content -Raw -LiteralPath $path
  $match = [regex]::Match($text, '(?mi)^\s*-\s*Verdict[^\r\n:]*:\s*(PASS|BLOCKED|UNKNOWN|NOT_APPLICABLE)\s*$')
  if ($match.Success) { return $match.Groups[1].Value }
  return 'UNKNOWN'
}

function Get-EvidenceFullPath($RelativePath) {
  return (Join-Path $evidenceBase $RelativePath)
}

function Test-OutlookEmailCertificationEvidence($RelativePath) {
  $path = Get-EvidenceFullPath $RelativePath
  if (-not (Test-Path -LiteralPath $path)) { return 'UNKNOWN' }
  $text = Get-Content -Raw -LiteralPath $path
  if ([string]::IsNullOrWhiteSpace($text)) { return 'UNKNOWN' }

  $required = @(
    'Outlook LIVE send certification evidence',
    '2026-07-28',
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

  foreach ($needle in $required) {
    if ($text -notlike "*$needle*") { return 'UNKNOWN' }
  }

  if ($text -notmatch '(?is)Final verdict.*CERTIFIED PASS') { return 'UNKNOWN' }

  return 'PASS'
}

function Resolve-Lane($PrerequisiteStatus, $EvidencePath) {
  if ($PrerequisiteStatus -eq 'BLOCKED') { return 'BLOCKED' }
  $evidence = Get-EvidenceVerdict $EvidencePath
  if ($evidence -eq 'PASS') { return 'PASS' }
  if ($evidence -eq 'BLOCKED') { return 'BLOCKED' }
  return 'UNKNOWN'
}

function Resolve-OutlookEmailLane($PrerequisiteStatus, $EvidencePath) {
  if ($PrerequisiteStatus -eq 'BLOCKED') { return 'BLOCKED' }
  return (Test-OutlookEmailCertificationEvidence $EvidencePath)
}

$outlook = Invoke-ReadOnlyVerifier 'Outlook connector verifier' 'scripts\activation\verify-outlook-connector.ps1'
$calendar = Invoke-ReadOnlyVerifier 'Outlook calendar connector verifier' 'scripts\activation\verify-outlook-calendar-connector.ps1'
$m365 = Invoke-ReadOnlyVerifier 'Microsoft 365 integration verifier' 'scripts\activation\verify-microsoft365-integration.ps1' @('-RequireOutlookRuntimeBinding', '-RequireCalendarRuntimeBinding', '-RequireTeamsPackage')
$teamsBoundary = Invoke-ReadOnlyVerifier 'Teams channel posting boundary verifier' 'scripts\activation\verify-teams-channel-posting-boundary.ps1'
$teamsTransport = Invoke-ReadOnlyVerifier 'Teams channel posting transport verifier' 'scripts\activation\verify-teams-channel-posting-transport.ps1'
$teamsPackage = Invoke-ReadOnlyVerifier 'Teams package validation' 'scripts\microsoft365\build-teams-package.ps1' @('-ValidateOnly')
$fullArc = Invoke-ReadOnlyVerifier 'M365 full arc verifier' 'scripts\activation\verify-m365-calendar-teams-full-arc.ps1'

$outlookPrereq = if ($outlook -eq 'BLOCKED' -or $m365 -eq 'BLOCKED') { 'BLOCKED' } else { 'PASS' }
$calendarPrereq = if ($calendar -eq 'BLOCKED' -or $m365 -eq 'BLOCKED') { 'BLOCKED' } else { 'PASS' }
$teamsAppPrereq = if ($teamsPackage -eq 'BLOCKED' -or $m365 -eq 'BLOCKED') { 'BLOCKED' } else { 'PASS' }
$teamsPostPrereq = if ($teamsBoundary -eq 'BLOCKED' -or $teamsTransport -eq 'BLOCKED' -or $fullArc -eq 'BLOCKED') { 'BLOCKED' } else { 'PASS' }
$teamsMeetingPrereq = if ($m365 -eq 'BLOCKED' -or $fullArc -eq 'BLOCKED') { 'BLOCKED' } else { 'PASS' }

$lanes = [ordered]@{
  OUTLOOK_EMAIL = Resolve-OutlookEmailLane $outlookPrereq 'docs\operator-evidence\OUTLOOK_LIVE_SEND_CERTIFICATION_2026-07-28.md'
  OUTLOOK_CALENDAR_READ = Resolve-Lane $calendarPrereq 'docs\operator-evidence\m365-calendar-teams\calendar-runtime.md'
  OUTLOOK_AVAILABILITY = Resolve-Lane $calendarPrereq 'docs\operator-evidence\m365-calendar-teams\availability.md'
  OUTLOOK_CALENDAR_WRITE = Resolve-Lane $calendarPrereq 'docs\operator-evidence\m365-calendar-teams\outlook-event-creation.md'
  TEAMS_MEETING = Resolve-Lane $teamsMeetingPrereq 'docs\operator-evidence\m365-calendar-teams\teams-meeting.md'
  TEAMS_APP = Resolve-Lane $teamsAppPrereq 'docs\operator-evidence\m365-calendar-teams\teams-app.md'
  TEAMS_CHANNEL_POST = Resolve-Lane $teamsPostPrereq 'docs\operator-evidence\m365-calendar-teams\teams-channel-post.md'
}

$evidenceSources = [ordered]@{
  OUTLOOK_EMAIL = Get-EvidenceFullPath 'docs\operator-evidence\OUTLOOK_LIVE_SEND_CERTIFICATION_2026-07-28.md'
  OUTLOOK_CALENDAR_READ = Get-EvidenceFullPath 'docs\operator-evidence\m365-calendar-teams\calendar-runtime.md'
  OUTLOOK_AVAILABILITY = Get-EvidenceFullPath 'docs\operator-evidence\m365-calendar-teams\availability.md'
  OUTLOOK_CALENDAR_WRITE = Get-EvidenceFullPath 'docs\operator-evidence\m365-calendar-teams\outlook-event-creation.md'
  TEAMS_MEETING = Get-EvidenceFullPath 'docs\operator-evidence\m365-calendar-teams\teams-meeting.md'
  TEAMS_APP = Get-EvidenceFullPath 'docs\operator-evidence\m365-calendar-teams\teams-app.md'
  TEAMS_CHANNEL_POST = Get-EvidenceFullPath 'docs\operator-evidence\m365-calendar-teams\teams-channel-post.md'
}

$overall = 'UNKNOWN'
if (@($lanes.Values | Where-Object { $_ -eq 'BLOCKED' }).Count -gt 0) {
  $overall = 'NO_GO'
} elseif (@($lanes.Values | Where-Object { $_ -ne 'PASS' }).Count -eq 0) {
  $overall = 'GO'
}

foreach ($entry in $lanes.GetEnumerator()) {
  Write-Host ("{0}={1}" -f $entry.Key, $entry.Value)
  Write-Host ("{0}_EVIDENCE={1}" -f $entry.Key, $evidenceSources[$entry.Key])
}
Write-Host ("OVERALL={0}" -f $overall)

if ($overall -eq 'NO_GO') {
  Write-Host 'STATUS=BLOCKED'
  exit 1
}

Write-Host ("STATUS={0}" -f $overall)
Write-Host ("EVIDENCE: [m365-calendar-teams-production-certification] OVERALL={0} ts={1}" -f $overall, (Get-Date -Format o))
