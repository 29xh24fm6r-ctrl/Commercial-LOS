<#
  Phase 253P - verify-full-portfolio-runtime-schema.ps1

  READ-ONLY, token-backed verification of the FULL portfolio runtime contract against the
  live environment. Measures the live schema and emits a deterministic evidence artifact in
  the exact shape consumed by src/admin/runtimeVerifiedSchemaBridge.ts
  (BoardingSchemaVerificationEvidence), so a fresh post-buildout export can hydrate runtime
  verified state.

  It performs NO mutation, NO flag flip, NO deploy, NO email, NO `pac code push`. Only GET
  requests (WhoAmI, EntityDefinitions + Attributes, RelationshipDefinitions).

  FAIL-CLOSED:
    - Reports PASS only when EVERY required table (13/13), column (219/219) and required
      relationship (12/12) is measured live, with a validated token.
    - If the token is missing/rejected it emits live=0/0 with no measured schema (cannot
      hydrate) and exits non-zero. It NEVER fabricates a live count.
    - Exit code: 0 only when the full contract is satisfied; 1 otherwise.

  Output: scripts/dataverse/evidence/runtime-schema-evidence.portfolio.json

    powershell -File scripts/dataverse/verify-full-portfolio-runtime-schema.ps1
#>
[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$services = Join-Path $repo 'src\generated\services'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'
$dsiText = if (Test-Path -LiteralPath $dsiPath) { Get-Content -Raw -LiteralPath $dsiPath } else { '' }
$schema = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'schema\portfolio-boarding.full.schema.json') | ConvertFrom-Json
$outDir = Join-Path $PSScriptRoot 'evidence'
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function Get-ServiceFileName([string]$entitySet) { 'Cr664_' + $entitySet.Substring('cr664_'.Length) + 'Service.ts' }

$expCols = $schema.expectedCounts.columns
$expReq = $schema.expectedCounts.requiredRelationships
$expOpt = $schema.expectedCounts.optionalRelationships
$n = $schema.tables.Count

$envInfo = Resolve-DataverseEnv
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }
$token = if ($orgUrl) { Get-DataverseToken $orgUrl } else { $null }
$tokenOk = Test-DataverseToken $orgUrl $token
if ($token -and -not $tokenOk) { Write-Host 'TOKEN: issued but REJECTED by Dataverse (WhoAmI failed). Emitting fail-closed evidence.' }
elseif (-not $token) { Write-Host 'TOKEN: none available (set $env:DATAVERSE_ACCESS_TOKEN, or `az login`, or Connect-AzAccount). Emitting fail-closed evidence.' }
else { Write-Host 'TOKEN: validated against this org (WhoAmI OK). Performing full live measurement.' }

$ts = (Get-Date -Format o)

# Repo-level (token-independent): generated services + data-source registration.
$svcFound = 0; $dsFound = 0
foreach ($t in $schema.tables) {
  if (Test-Path -LiteralPath (Join-Path $services (Get-ServiceFileName $t.entitySetName))) { $svcFound++ }
  if ($dsiText -match [regex]::Escape($t.entitySetName)) { $dsFound++ }
}

# Live, token-backed measurement of the FULL contract.
$liveChecked = 0; $liveFound = 0
$colsExpected = 0; $colsFound = 0
$reqRel = 0; $reqRelFound = 0; $optRel = 0; $optRelFound = 0
$conflicts = 0; $measured = $null
$missingColumns = @(); $missingRels = @()

if ($tokenOk) {
  foreach ($t in $schema.tables) {
    $liveChecked++
    $exists = Test-DataverseTable $orgUrl $token $t.logicalName
    if ($exists -eq $true) {
      $liveFound++
      try {
        $ed = Invoke-DataverseGet $orgUrl $token ("EntityDefinitions(LogicalName='{0}')?`$expand=Attributes(`$select=LogicalName)" -f $t.logicalName)
        $live = @($ed.Attributes | ForEach-Object { $_.LogicalName })
        foreach ($c in @($t.fullColumns)) {
          $colsExpected++
          if ($live -contains $c.logicalName) { $colsFound++ } else { $missingColumns += ("{0}.{1}" -f $t.logicalName, $c.logicalName) }
        }
      } catch { $conflicts++ }
    } else {
      # Table missing -> every one of its columns is missing too.
      $colsExpected += @($t.fullColumns).Count
      foreach ($c in @($t.fullColumns)) { $missingColumns += ("{0}.{1}" -f $t.logicalName, $c.logicalName) }
    }
  }
  foreach ($r in @($schema.relationships)) {
    if (-not $r.schemaName) { continue }
    $isReq = [bool]$r.required
    if ($isReq) { $reqRel++ } else { $optRel++ }
    try {
      Invoke-DataverseGet $orgUrl $token ("RelationshipDefinitions(SchemaName='{0}')?`$select=SchemaName" -f $r.schemaName) | Out-Null
      if ($isReq) { $reqRelFound++ } else { $optRelFound++ }
    } catch { if ($isReq) { $missingRels += $r.schemaName } else { $missingRels += $r.schemaName } }
  }
  # A complete measurement is recorded only when every table is live (matches the bridge's expectation).
  if ($liveChecked -gt 0 -and $liveFound -eq $liveChecked) {
    $measured = [ordered]@{
      tablesFound = $liveFound
      columnsFound = $colsFound
      requiredRelationshipsFound = $reqRelFound
      optionalRelationshipsFound = $optRelFound
      conflicts = $conflicts
    }
  }
}

$contractMet = ($svcFound -eq $n) -and ($dsFound -eq $n) -and ($tokenOk) -and ($liveChecked -gt 0) -and ($liveFound -eq $liveChecked) -and ($colsFound -eq $expCols) -and ($reqRelFound -eq $expReq) -and ($conflicts -eq 0)
$status = if ($contractMet) { 'PASS' } elseif (-not $tokenOk) { 'UNKNOWN' } else { 'BLOCKED' }

$artifact = [ordered]@{
  domain         = 'portfolio'
  status         = $status
  services       = [ordered]@{ found = $svcFound; expected = $n }
  dataSources    = [ordered]@{ found = $dsFound; expected = $n }
  liveTables     = [ordered]@{ found = $liveFound; checked = $liveChecked }
  measured       = $measured
  expectedCounts = [ordered]@{ tables = $n; columns = $expCols; requiredRelationships = $expReq; optionalRelationships = $expOpt }
  verifiedAtIso  = $ts
  tokenValidated = [bool]$tokenOk
  notes          = if ($tokenOk) { 'token-backed FULL portfolio live measurement (Phase 253P)' } else { 'live measurement NOT performed (no usable Dataverse token); fail-closed live=0/0' }
}

$outFile = Join-Path $outDir 'runtime-schema-evidence.portfolio.json'
[System.IO.File]::WriteAllText($outFile, ($artifact | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))

Write-Host '----'
Write-Host ("== portfolio FULL: services {0}/{1} datasources {2}/{3} live {4}/{5} columns {6}/{7} requiredRels {8}/{9} optionalRels {10}/{11} conflicts {12} => {13}" -f $svcFound, $n, $dsFound, $n, $liveFound, $liveChecked, $colsFound, $expCols, $reqRelFound, $expReq, $optRelFound, $expOpt, $conflicts, $status)
if ($missingColumns.Count -gt 0) { Write-Host ("MISSING COLUMNS ({0}): {1}{2}" -f $missingColumns.Count, (($missingColumns | Select-Object -First 12) -join ', '), $(if ($missingColumns.Count -gt 12) { ' ...' } else { '' })) }
if ($missingRels.Count -gt 0) { Write-Host ("MISSING RELATIONSHIPS ({0}): {1}" -f $missingRels.Count, ($missingRels -join ', ')) }
Write-Host ("EVIDENCE: [253P][verify-portfolio-full] STATUS={0} services={1}/{2} datasources={3}/{4} live={5}/{6} columns={7}/{8} requiredRels={9}/{10} tokenOk={11} ts={12}" -f $status, $svcFound, $n, $dsFound, $n, $liveFound, $liveChecked, $colsFound, $expCols, $reqRelFound, $expReq, [bool]$tokenOk, $ts)
Write-Host ("WROTE: {0}" -f $outFile)

if ($contractMet) { exit 0 } else { exit 1 }
