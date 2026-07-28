<#
  M365-1 — Outlook Calendar connector inventory/runtime verifier.

  Read-only. No deployment, connector registration, Graph call, Outlook calendar write,
  Teams post, Dataverse write, or smoke test.
#>
[CmdletBinding()]
param([string]$RepoRoot)

$ErrorActionPreference = 'Stop'
$repo = if ($RepoRoot) { (Resolve-Path -LiteralPath $RepoRoot).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$servicePath = Join-Path $repo 'src\generated\services\Office365OutlookService.ts'
$modelPath = Join-Path $repo 'src\generated\models\Office365OutlookModel.ts'
$indexPath = Join-Path $repo 'src\generated\index.ts'
$powerConfigPath = Join-Path $repo 'power.config.json'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'

function Read-Optional($Path) {
  if (Test-Path -LiteralPath $Path) { return Get-Content -Raw -LiteralPath $Path }
  return ''
}

function Read-StateValue($Text, $Name) {
  $match = [regex]::Match($Text, "(?m)^$Name=(PASS|BLOCKED|UNKNOWN)\s*$")
  if ($match.Success) { return $match.Groups[1].Value }
  return 'UNKNOWN'
}

function Get-OperationNames($Text) {
  $matches = [regex]::Matches($Text, 'public\s+static\s+async\s+([A-Za-z0-9_]+)\s*\(')
  $names = @()
  foreach ($m in $matches) { $names += $m.Groups[1].Value }
  return @($names | Sort-Object -Unique)
}

function Has-All($Names, [string[]]$Required) {
  foreach ($name in $Required) {
    if ($Names -notcontains $name) { return $false }
  }
  return $true
}

$serviceExists = Test-Path -LiteralPath $servicePath
$modelExists = Test-Path -LiteralPath $modelPath
$indexText = Read-Optional $indexPath
$serviceText = Read-Optional $servicePath
$modelText = Read-Optional $modelPath
$powerConfigText = Read-Optional $powerConfigPath
$dsiText = Read-Optional $dsiPath

$configured = $serviceExists -and $modelExists -and
  $indexText -match 'Office365OutlookService' -and
  $indexText -match 'Office365OutlookModel' -and
  $powerConfigText -match 'shared_office365' -and
  $powerConfigText -match '"office365"'
$calendarConfigured = if ($configured) { 'PASS' } else { 'BLOCKED' }

if (-not (Test-Path -LiteralPath $dsiPath)) {
  $calendarRuntime = 'UNKNOWN'
  $runtimeDetail = 'runtime manifest absent; generate/sync dataSourcesInfo.ts before deployment'
} elseif ($dsiText -match '(?s)["'']office365["'']\s*:\s*\{.*?["'']dataSourceType["'']\s*:\s*["'']Connector["'']') {
  $calendarRuntime = 'PASS'
  $runtimeDetail = 'office365 dataSourceType Connector present'
} else {
  $calendarRuntime = 'BLOCKED'
  $runtimeDetail = 'runtime manifest exists but office365 Connector entry is absent'
}

$ops = Get-OperationNames $serviceText
$requiredRead = @('CalendarGetTables', 'CalendarGetItems', 'CalendarGetItem', 'GetEventsCalendarView', 'FindMeetingTimes')
$requiredWrite = @('CalendarPostItem', 'CalendarPatchItem', 'CalendarDeleteItem')

$readStatus = if (-not $serviceExists) { 'BLOCKED' } elseif (Has-All $ops $requiredRead) { 'PASS' } else { 'BLOCKED' }
$writeStatus = if (-not $serviceExists) { 'BLOCKED' } elseif (Has-All $ops $requiredWrite) { 'PASS' } elseif ($ops.Count -gt 0) { 'UNKNOWN' } else { 'BLOCKED' }

$onlineMeetingFieldsPresent = [bool]($modelText -match '(?i)onlineMeeting|joinUrl|joinWebUrl|teams')

$status = if ($calendarConfigured -eq 'BLOCKED' -or $calendarRuntime -eq 'BLOCKED' -or $readStatus -eq 'BLOCKED') {
  'BLOCKED'
} elseif ($calendarRuntime -eq 'UNKNOWN' -or $writeStatus -eq 'UNKNOWN') {
  'UNKNOWN'
} else {
  'PASS'
}

Write-Host '== Outlook Calendar connector verifier (read-only) =='
Write-Host ("Generated service exists: {0}" -f $serviceExists)
Write-Host ("Generated model exists: {0}" -f $modelExists)
Write-Host ("Runtime manifest: {0}" -f $runtimeDetail)
Write-Host ("Observed calendar operations: {0}" -f (($ops | Where-Object { $_ -match 'Calendar|Event|Meeting|Room' }) -join ', '))
Write-Host ("Online/Teams meeting fields present in generated model: {0}" -f $onlineMeetingFieldsPresent)
Write-Host ("CALENDAR_CONFIGURED={0}" -f $calendarConfigured)
Write-Host ("CALENDAR_RUNTIME_BOUND={0}" -f $calendarRuntime)
Write-Host ("CALENDAR_READ_OPERATIONS={0}" -f $readStatus)
Write-Host ("CALENDAR_WRITE_OPERATIONS={0}" -f $writeStatus)
Write-Host ("STATUS={0}" -f $status)
Write-Host ("EVIDENCE: [m365-1-calendar-connector] CALENDAR_CONFIGURED={0} CALENDAR_RUNTIME_BOUND={1} CALENDAR_READ_OPERATIONS={2} CALENDAR_WRITE_OPERATIONS={3} STATUS={4} onlineMeetingFields={5} ts={6}" -f $calendarConfigured, $calendarRuntime, $readStatus, $writeStatus, $status, $onlineMeetingFieldsPresent, (Get-Date -Format o))

if ($status -eq 'BLOCKED') { exit 1 }
exit 0
