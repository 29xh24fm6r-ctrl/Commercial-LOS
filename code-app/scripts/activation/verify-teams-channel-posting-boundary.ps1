<#
  Verifies the Teams channel posting fail-closed boundary.
  Read-only: no Graph, no Teams post, no webhook, no Dataverse write.
#>
[CmdletBinding()]
param([string]$RepoRoot)

$ErrorActionPreference = 'Stop'
$repo = if ($RepoRoot) { (Resolve-Path -LiteralPath $RepoRoot).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$contractPath = Join-Path $repo 'microsoft365\teams\channel-post-contract.json'
$srcDir = Join-Path $repo 'src\teamsChannelPosting'

function Check($Name, $Ok, $Detail) {
  $status = if ($Ok) { 'PASS' } else { 'BLOCKED' }
  Write-Host ("[{0}] {1} - {2}" -f $status, $Name, $Detail)
  return [bool]$Ok
}

$ok = $true
if (-not (Test-Path -LiteralPath $contractPath)) {
  $ok = (Check 'contract' $false 'missing microsoft365/teams/channel-post-contract.json') -and $ok
} else {
  $contract = Get-Content -Raw -LiteralPath $contractPath | ConvertFrom-Json
  $ok = (Check 'runtime state' ($contract.runtimeState -eq 'NOT_CONFIGURED') "runtimeState=$($contract.runtimeState)") -and $ok
  $ok = (Check 'feature gate' ($contract.featureGate -eq 'VITE_TEAMS_CHANNEL_POST_ENABLED=false') "featureGate=$($contract.featureGate)") -and $ok
  $ok = (Check 'browser Graph disabled' ($contract.approvedBoundary.browserDirectGraphAllowed -eq $false) "browserDirectGraphAllowed=$($contract.approvedBoundary.browserDirectGraphAllowed)") -and $ok
  $ok = (Check 'approved alias exists' (@($contract.approvedTargets).Count -gt 0 -and [string]$contract.approvedTargets[0].alias) ($contract.approvedTargets[0].alias)) -and $ok
}

$forbidden = 'fetch\s*\(|XMLHttpRequest|graph\.microsoft|webhook|Invoke-RestMethod|Invoke-WebRequest'
if (Test-Path -LiteralPath $srcDir) {
  $hits = @()
  Get-ChildItem -LiteralPath $srcDir -Recurse -Include *.ts,*.tsx | ForEach-Object {
    $text = Get-Content -Raw -LiteralPath $_.FullName
    if ($text -match $forbidden) { $hits += $_.FullName.Substring($repo.Length + 1) }
  }
  $ok = (Check 'no browser/server-direct transport in source' ($hits.Count -eq 0) ($(if ($hits.Count) { $hits -join ', ' } else { 'no hits' }))) -and $ok
} else {
  $ok = (Check 'source directory' $false 'src/teamsChannelPosting missing') -and $ok
}

if (-not $ok) {
  Write-Host 'STATUS=BLOCKED'
  exit 1
}
Write-Host 'STATUS=PASS'
Write-Host ("EVIDENCE: [teams-channel-posting-boundary] STATUS=PASS ts={0}" -f (Get-Date -Format o))
