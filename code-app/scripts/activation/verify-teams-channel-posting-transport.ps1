<#
  Read-only verifier for the Teams channel posting deployable transport package.
#>
[CmdletBinding()]
param([string]$RepoRoot)

$ErrorActionPreference = 'Stop'
$repo = if ($RepoRoot) { (Resolve-Path -LiteralPath $RepoRoot).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$contract = Join-Path $repo 'microsoft365\teams\dataverse-custom-api-teams-channel-post.json'
$registry = Join-Path $repo 'microsoft365\teams\channel-post-target-registry.json'
$boundaryVerifier = Join-Path $repo 'scripts\activation\verify-teams-channel-posting-boundary.ps1'
$ok = $true

function Check($Name, $Condition, $Detail) {
  if ($Condition) {
    Write-Host ("[PASS] {0} - {1}" -f $Name, $Detail)
  } else {
    Write-Host ("[BLOCKED] {0} - {1}" -f $Name, $Detail)
    $script:ok = $false
  }
}

Check 'transport contract exists' (Test-Path -LiteralPath $contract) $contract
Check 'target registry exists' (Test-Path -LiteralPath $registry) $registry

if (Test-Path -LiteralPath $contract) {
  $text = Get-Content -Raw -LiteralPath $contract
  Check 'custom api name' ($text -match 'cr664_TeamsChannelPost') 'cr664_TeamsChannelPost'
  Check 'idempotency contract' ($text -match 'idempotencyKey') 'idempotencyKey required'
  Check 'no raw HTTP transport' ($text -notmatch 'graph\.microsoft|Invoke-RestMethod|Invoke-WebRequest') 'read-only contract only'
}

if (Test-Path -LiteralPath $registry) {
  $json = Get-Content -Raw -LiteralPath $registry | ConvertFrom-Json
  $targets = @($json.targets)
  Check 'approved target alias' ($targets.alias -contains 'credit-ops-test-channel') 'credit-ops-test-channel present'
  Check 'targets inactive by default' (-not ($targets | Where-Object { $_.active -eq $true })) 'all targets inactive'
}

if (Test-Path -LiteralPath $boundaryVerifier) {
  & powershell -File $boundaryVerifier -RepoRoot $repo
  if ($LASTEXITCODE -ne 0) { $ok = $false }
}

if ($ok) {
  Write-Host 'STATUS=PASS'
  Write-Host ("EVIDENCE: [teams-channel-posting-transport] STATUS=PASS ts={0}" -f (Get-Date -Format o))
  exit 0
}

Write-Host 'STATUS=BLOCKED'
exit 1
