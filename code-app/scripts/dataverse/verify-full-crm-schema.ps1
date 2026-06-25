<#
  Phase 253 - verify-full-crm-schema.ps1

  READ-ONLY token-backed verification that the LIVE internal OGB CRM schema satisfies the
  FULL runtime contract in scripts/dataverse/schema/crm-full.schema.json
  (EXPECTED_CRM_SCHEMA = 10 tables / 147 columns / 28 relationships).

  It performs NO mutation, NO flag flip, NO deploy, NO email. GET requests only
  (WhoAmI / EntityDefinitions / Attributes / RelationshipDefinitions).

  FAIL-CLOSED: STATUS=PASS only when tables 10/10 AND columns 147/147 AND relationships
  28/28 are all live. Any missing table, column, or relationship => FAIL. No token /
  rejected token => UNKNOWN (cannot confirm). It does NOT mark hydration true.
#>
[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$outDir = Join-Path $PSScriptRoot 'evidence'
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$schema = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'schema\crm-full.schema.json') | ConvertFrom-Json

$envInfo = Resolve-DataverseEnv
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }
$token = if ($orgUrl) { Get-DataverseToken $orgUrl } else { $null }
$tokenOk = Test-DataverseToken $orgUrl $token

$expTables = $schema.expected.tables
$expColumns = $schema.expected.columns
$expRels = $schema.expected.relationships
$tablesFound = 0; $columnsFound = 0; $relsFound = 0; $missing = @()

function Test-ColExists([string]$t, [string]$c) {
  try { Invoke-DataverseGet $orgUrl $token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=LogicalName" -f $t, $c) | Out-Null; return $true }
  catch { return $false }
}
function Test-RelExists([string]$s) {
  try { Invoke-DataverseGet $orgUrl $token ("RelationshipDefinitions(SchemaName='{0}')?`$select=SchemaName" -f $s) | Out-Null; return $true }
  catch { return $false }
}

if ($tokenOk) {
  foreach ($t in $schema.tables) {
    $tlive = Test-DataverseTable $orgUrl $token $t.logicalName
    if ($tlive -eq $true) { $tablesFound++ } else { $missing += ("table:{0}" -f $t.logicalName); continue }
    foreach ($c in $t.requiredColumns) {
      if (Test-ColExists $t.logicalName $c.logicalName) { $columnsFound++ } else { $missing += ("column:{0}.{1}" -f $t.logicalName, $c.logicalName) }
    }
  }
  foreach ($r in $schema.relationships) {
    if (Test-RelExists $r.schemaName) { $relsFound++ } else { $missing += ("relationship:{0}" -f $r.schemaName) }
  }
}

$complete = ($tablesFound -eq $expTables) -and ($columnsFound -eq $expColumns) -and ($relsFound -eq $expRels)
$status = if (-not $tokenOk) { 'UNKNOWN' } elseif ($complete) { 'PASS' } else { 'FAIL' }

Write-Host '== Phase 253 :: Full CRM runtime schema verification (read-only, token-backed) =='
Write-Host ("Token validated (WhoAmI): {0}" -f [bool]$tokenOk)
Write-Host ("Tables       : {0}/{1}" -f $tablesFound, $expTables)
Write-Host ("Columns      : {0}/{1}" -f $columnsFound, $expColumns)
Write-Host ("Relationships: {0}/{1}" -f $relsFound, $expRels)
Write-Host ("STATUS: {0}" -f $status)
if ($status -ne 'PASS' -and $missing.Count -gt 0) {
  Write-Host ("MISSING (first 15): {0}" -f (($missing | Select-Object -First 15) -join ', '))
  Write-Host 'NEXT (operator): run create-full-crm-runtime-schema.ps1 -Apply, then publish-customizations.ps1 + regenerate-powerapps-sdk.ps1, then re-run.'
}

$measured = $null
if ($tokenOk) {
  # measured block is consumable by runtimeVerifiedSchemaBridge (CRM): relationshipsFound is a warning input only.
  $measured = [ordered]@{ tablesFound = $tablesFound; columnsFound = $columnsFound; relationshipsFound = $relsFound; conflicts = 0 }
}
$artifact = [ordered]@{
  domain = 'crm-full'
  status = $status
  tokenValidated = [bool]$tokenOk
  tables = [ordered]@{ found = $tablesFound; expected = $expTables }
  columns = [ordered]@{ found = $columnsFound; expected = $expColumns }
  relationships = [ordered]@{ found = $relsFound; expected = $expRels }
  measured = $measured
  verifiedAtIso = (Get-Date -Format o)
  notes = if ($complete) { 'full CRM runtime contract satisfied' } else { 'CRM schema incomplete vs runtime plan (fail-closed)' }
}
$outFile = Join-Path $outDir 'full-crm-schema-evidence.json'
[System.IO.File]::WriteAllText($outFile, ($artifact | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("EVIDENCE: [253][verify-full-crm] STATUS={0} tables={1}/{2} columns={3}/{4} relationships={5}/{6} tokenOk={7} ts={8}" -f $status, $tablesFound, $expTables, $columnsFound, $expColumns, $relsFound, $expRels, [bool]$tokenOk, (Get-Date -Format o))
