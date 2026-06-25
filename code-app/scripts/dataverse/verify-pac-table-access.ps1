<#
  Phase 248 - verify-pac-table-access.ps1

  READ-ONLY. Proves LIVE TABLE REACHABILITY for the CRM spine + portfolio boarding
  tables using `pac org fetch` (FetchXML, count=1). A successful fetch — including the
  "No results returned" zero-row case — proves the table exists and is queryable.

  It performs NO mutation, NO flag flip, NO deploy, NO email. It only runs read-only
  FetchXML queries.

  Classification (fail-closed):
    - exit 0 + no "Error:" line                       -> reachable (PASS)
    - "...was not found in the MetadataCache"          -> missing_entity (FAIL)
    - 401 / unauthorized / not connected               -> auth_error (FAIL)
    - any other non-zero exit / "Error:" / parse issue -> failed (FAIL)

  This proves table REACHABILITY only. It does NOT measure Web API column/relationship
  metadata (that channel remains 401/UNKNOWN), so it does NOT by itself hydrate runtime
  verified state. Output: scripts/dataverse/evidence/pac-table-access.<domain>.json
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$schemaDir = Join-Path $PSScriptRoot 'schema'
$outDir = Join-Path $PSScriptRoot 'evidence'
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function Test-PacTableReachable([string]$logical) {
  $xml = "<fetch count='1'><entity name='$logical'><attribute name='$($logical)id'/></entity></fetch>"
  $out = & pac org fetch --xml $xml 2>&1
  $ec = $LASTEXITCODE
  $text = ($out | Out-String)
  if ($text -match 'was not found in the MetadataCache') { return 'missing_entity' }
  if ($text -match '(?i)\b401\b|unauthorized|not connected|authentication failed') { return 'auth_error' }
  if ($ec -ne 0) { return 'failed' }
  if ($text -match '(?im)^\s*Error:') { return 'failed' }
  return 'reachable'
}

$ts = (Get-Date -Format o)
foreach ($f in @(@{ domain = 'crm'; file = 'crm-spine.schema.json' }, @{ domain = 'portfolio'; file = 'portfolio-boarding.schema.json' })) {
  $s = Get-Content -Raw -LiteralPath (Join-Path $schemaDir $f.file) | ConvertFrom-Json
  $n = $s.tables.Count
  $reachable = 0
  $results = @()
  foreach ($t in $s.tables) {
    $o = Test-PacTableReachable $t.logicalName
    if ($o -eq 'reachable') { $reachable++ }
    $results += [ordered]@{ table = $t.logicalName; outcome = $o }
    Write-Host ("  {0}: {1}" -f $t.logicalName, $o)
  }
  $status = if ($reachable -eq $n) { 'PASS' } else { 'FAIL' }
  $artifact = [ordered]@{
    domain        = $f.domain
    method        = 'pac org fetch (FetchXML count=1)'
    status        = $status
    reachable     = $reachable
    checked       = $n
    expected      = $n
    tables        = $results
    webApiMetadataMeasured = $false
    verifiedAtIso = $ts
    notes         = 'table reachability only; Web API column/relationship metadata not measured (separate channel)'
  }
  $outFile = Join-Path $outDir ("pac-table-access.{0}.json" -f $f.domain)
  [System.IO.File]::WriteAllText($outFile, ($artifact | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("== {0}: PAC table access {1}/{2} -> {3} ({4})" -f $f.domain, $reachable, $n, $status, (Split-Path $outFile -Leaf))
  Write-Host ("EVIDENCE: [248][pac-table-access-{0}] STATUS={1} reachable={2}/{3} webApiMetadata=UNKNOWN ts={4}" -f $f.domain, $status, $reachable, $n, $ts)
}
