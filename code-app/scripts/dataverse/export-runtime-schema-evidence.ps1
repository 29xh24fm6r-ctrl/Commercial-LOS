<#
  Phase 247 - export-runtime-schema-evidence.ps1

  READ-ONLY. Performs token-backed live Dataverse MEASUREMENT for the CRM spine +
  portfolio boarding schema and emits a deterministic evidence artifact (JSON) in the
  exact shape consumed by src/admin/runtimeVerifiedSchemaBridge.ts.

  It performs NO mutation, NO flag flip, NO deploy, NO email. It only issues GET
  requests (WhoAmI, EntityDefinitions, RelationshipDefinitions).

  Fail-closed: if no token is available OR the token is rejected by Dataverse (e.g. the
  calling app is not a provisioned application user -> 401), it emits liveTables
  {found:0,checked:0} with no measured schema, so the bridge does NOT hydrate. It NEVER
  fabricates a live=N/N count.

  Output: scripts/dataverse/evidence/runtime-schema-evidence.<domain>.json + a summary.
#>
[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$services = Join-Path $repo 'src\generated\services'
$dsiPath = Join-Path $repo '.power\schemas\appschemas\dataSourcesInfo.ts'
$dsiText = if (Test-Path -LiteralPath $dsiPath) { Get-Content -Raw -LiteralPath $dsiPath } else { '' }
$schemaDir = Join-Path $PSScriptRoot 'schema'
$outDir = Join-Path $PSScriptRoot 'evidence'
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function Get-ServiceFileName([string]$entitySet) { 'Cr664_' + $entitySet.Substring('cr664_'.Length) + 'Service.ts' }

$envInfo = Resolve-DataverseEnv
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }
$token = if ($orgUrl) { Get-DataverseToken $orgUrl } else { $null }
$tokenOk = Test-DataverseToken $orgUrl $token
if ($token -and -not $tokenOk) {
  Write-Host 'TOKEN: issued but REJECTED by Dataverse (WhoAmI failed, e.g. 401). Live measurement cannot complete; emitting fail-closed evidence.'
} elseif (-not $token) {
  Write-Host 'TOKEN: none available (set $env:DATAVERSE_ACCESS_TOKEN, or `az login`, or Connect-AzAccount for an authorized identity). Emitting fail-closed evidence.'
} else {
  Write-Host 'TOKEN: validated against this org (WhoAmI OK). Performing live measurement.'
}

$ts = (Get-Date -Format o)

foreach ($f in @(@{ domain = 'crm'; file = 'crm-spine.schema.json' }, @{ domain = 'portfolio'; file = 'portfolio-boarding.schema.json' })) {
  $s = Get-Content -Raw -LiteralPath (Join-Path $schemaDir $f.file) | ConvertFrom-Json
  $n = $s.tables.Count

  # Repo-level: generated services + data-source registration (token-independent).
  $svcFound = 0; $dsFound = 0
  foreach ($t in $s.tables) {
    if (Test-Path -LiteralPath (Join-Path $services (Get-ServiceFileName $t.entitySetName))) { $svcFound++ }
    if ($dsiText -match [regex]::Escape($t.entitySetName)) { $dsFound++ }
  }

  # Live measurement (token-backed). Fail-closed when the token is unusable.
  $liveChecked = 0; $liveFound = 0
  $colsExpected = 0; $colsFound = 0
  $reqRel = 0; $reqRelFound = 0; $optRel = 0; $optRelFound = 0
  $conflicts = 0
  $measured = $null
  if ($tokenOk) {
    foreach ($t in $s.tables) {
      $liveChecked++
      $exists = Test-DataverseTable $orgUrl $token $t.logicalName
      if ($exists -eq $true) {
        $liveFound++
        try {
          $ed = Invoke-DataverseGet $orgUrl $token ("EntityDefinitions(LogicalName='{0}')?`$expand=Attributes(`$select=LogicalName)" -f $t.logicalName)
          $live = @($ed.Attributes | ForEach-Object { $_.LogicalName })
          foreach ($c in @($t.requiredColumns)) {
            $colsExpected++
            if ($live -contains $c.logicalName) { $colsFound++ }
          }
        } catch { $conflicts++ }
      }
    }
    foreach ($r in @($s.relationships)) {
      if (-not $r.schemaName) { continue }
      $isReq = [bool]$r.required
      if ($isReq) { $reqRel++ } else { $optRel++ }
      try {
        Invoke-DataverseGet $orgUrl $token ("RelationshipDefinitions(SchemaName='{0}')?`$select=SchemaName" -f $r.schemaName) | Out-Null
        if ($isReq) { $reqRelFound++ } else { $optRelFound++ }
      } catch { }
    }
    # A complete measurement is recorded only when every table is live.
    if ($liveChecked -gt 0 -and $liveFound -eq $liveChecked) {
      if ($f.domain -eq 'crm') {
        $measured = [ordered]@{ tablesFound = $liveFound; columnsFound = $colsFound; relationshipsFound = $reqRelFound + $optRelFound; conflicts = $conflicts }
      } else {
        $measured = [ordered]@{ tablesFound = $liveFound; columnsFound = $colsFound; requiredRelationshipsFound = $reqRelFound; optionalRelationshipsFound = $optRelFound; conflicts = $conflicts }
      }
    }
  }

  $status = if (($svcFound -eq $n) -and ($dsFound -eq $n) -and ($liveChecked -gt 0) -and ($liveFound -eq $liveChecked)) { 'PASS' }
            elseif (-not $tokenOk) { 'UNKNOWN' }
            else { 'BLOCKED' }

  $artifact = [ordered]@{
    domain        = $f.domain
    status        = $status
    services      = [ordered]@{ found = $svcFound; expected = $n }
    dataSources   = [ordered]@{ found = $dsFound; expected = $n }
    liveTables    = [ordered]@{ found = $liveFound; checked = $liveChecked }
    measured      = $measured
    verifiedAtIso = $ts
    tokenValidated = [bool]$tokenOk
    notes         = if ($tokenOk) { 'token-backed live measurement performed' } else { 'live measurement NOT performed (no usable Dataverse token); fail-closed live=0/0' }
  }

  $outFile = Join-Path $outDir ("runtime-schema-evidence.{0}.json" -f $f.domain)
  # Write UTF-8 WITHOUT a BOM so JSON.parse consumers do not choke on a leading U+FEFF.
  [System.IO.File]::WriteAllText($outFile, ($artifact | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("== {0}: STATUS={1} services={2}/{3} datasources={4}/{5} live={6}/{7} measured={8} -> {9}" -f $f.domain, $status, $svcFound, $n, $dsFound, $n, $liveFound, $liveChecked, $(if ($measured) { 'yes' } else { 'no' }), (Split-Path $outFile -Leaf))
  Write-Host ("EVIDENCE: [247][runtime-evidence-{0}] STATUS={1} services={2}/{3} datasources={4}/{5} live={6}/{7} tokenOk={8} ts={9}" -f $f.domain, $status, $svcFound, $n, $dsFound, $n, $liveFound, $liveChecked, [bool]$tokenOk, $ts)
}
