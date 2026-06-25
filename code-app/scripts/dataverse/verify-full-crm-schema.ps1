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
$tablesFound = 0; $columnsFound = 0; $relsFound = 0; $unknown = 0; $missing = @()

# Phase 253B: tri-state metadata probe. 'present' (200), 'missing' (404 = genuinely absent),
# or 'unknown' (any other error = transient/throttle/network). A transient error must NOT be
# counted as missing - that is what caused 10/10 to regress to a false 3/10. This verifier
# uses TOKEN-BACKED metadata (EntityDefinitions / Attributes / RelationshipDefinitions),
# which is distinct from PAC fetch reachability (verify-pac-table-access.ps1).
function Test-Meta([string]$path) {
  try { Invoke-DataverseGet $orgUrl $token $path | Out-Null; return 'present' }
  catch {
    $code = $null; try { $code = $_.Exception.Response.StatusCode.value__ } catch { }
    if ($code -eq 404) { return 'missing' }
    return 'unknown'
  }
}
function Get-TablePresence([string]$t) { return (Test-Meta ("EntityDefinitions(LogicalName='{0}')?`$select=LogicalName" -f $t)) }
function Get-ColPresence([string]$t, [string]$c) { return (Test-Meta ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=LogicalName" -f $t, $c)) }
# A relationship is COVERED by relationship metadata OR a correctly-targeted lookup attribute.
# Target validation is NOT weakened: a lookup that targets a different entity is NOT covered.
function Get-RelPresence($r) {
  $rel = Test-Meta ("RelationshipDefinitions(SchemaName='{0}')?`$select=SchemaName" -f $r.schemaName)
  if ($rel -eq 'present') { return 'present' }
  $lookupLogical = $r.fromColumn.ToLower()
  try {
    $lk = Invoke-DataverseGet $orgUrl $token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')/Microsoft.Dynamics.CRM.LookupAttributeMetadata?`$select=Targets" -f $r.fromTable, $lookupLogical)
    if ($lk.Targets -and (@($lk.Targets) -contains $r.toTable)) { return 'present' }
    return 'missing'  # lookup exists but targets a different entity / nothing - genuine miss
  } catch {
    $code = $null; try { $code = $_.Exception.Response.StatusCode.value__ } catch { }
    if ($code -eq 404) { return $(if ($rel -eq 'missing') { 'missing' } else { 'unknown' }) }
    return 'unknown'
  }
}

if ($tokenOk) {
  foreach ($t in $schema.tables) {
    $tp = Get-TablePresence $t.logicalName
    if ($tp -eq 'present') {
      $tablesFound++
      foreach ($c in $t.requiredColumns) {
        switch (Get-ColPresence $t.logicalName $c.logicalName) {
          'present' { $columnsFound++ }
          'missing' { $missing += ("column:{0}.{1}" -f $t.logicalName, $c.logicalName) }
          default   { $unknown++ }
        }
      }
    } elseif ($tp -eq 'missing') { $missing += ("table:{0}" -f $t.logicalName) }
    else { $unknown++ }  # table check inconclusive - do NOT treat as missing
  }
  foreach ($r in $schema.relationships) {
    switch (Get-RelPresence $r) {
      'present' { $relsFound++ }
      'missing' { $missing += ("relationship:{0}" -f $r.schemaName) }
      default   { $unknown++ }
    }
  }
}

$complete = ($tablesFound -eq $expTables) -and ($columnsFound -eq $expColumns) -and ($relsFound -eq $expRels)
# Stabilization: token absent OR ANY inconclusive metadata check => UNKNOWN (retry), never a
# false missing-schema FAIL. FAIL only on a conclusive, genuine miss.
$status = if (-not $tokenOk) { 'UNKNOWN' }
          elseif ($unknown -gt 0) { 'UNKNOWN' }
          elseif ($complete) { 'PASS' }
          else { 'FAIL' }

Write-Host '== Phase 253 :: Full CRM runtime schema verification (read-only, token-backed) =='
Write-Host ("Token validated (WhoAmI): {0}" -f [bool]$tokenOk)
Write-Host ("Tables       : {0}/{1}" -f $tablesFound, $expTables)
Write-Host ("Columns      : {0}/{1}" -f $columnsFound, $expColumns)
Write-Host ("Relationships: {0}/{1}" -f $relsFound, $expRels)
Write-Host ("Inconclusive : {0} (token-backed metadata checks that errored, not 404)" -f $unknown)
Write-Host ("STATUS: {0}" -f $status)
if ($status -eq 'UNKNOWN' -and $tokenOk -and $unknown -gt 0) {
  Write-Host ("REASON: {0} metadata query(ies) were inconclusive (transient/throttle). This is NOT a missing-schema result - RE-RUN. Counts above may be partial." -f $unknown)
}
if ($status -eq 'FAIL' -and $missing.Count -gt 0) {
  Write-Host ("MISSING (first 15, conclusive 404s): {0}" -f (($missing | Select-Object -First 15) -join ', '))
  Write-Host 'NEXT (operator): run create-full-crm-runtime-schema.ps1 -Apply, then publish-customizations.ps1 + regenerate-powerapps-sdk.ps1, then re-run.'
}

# Only emit a measured block on a CONCLUSIVE run (token ok, no inconclusive checks). An
# unstable run emits measured=null so a partial count is never mistaken for real evidence.
$measured = $null
if ($tokenOk -and $unknown -eq 0) {
  # measured block is consumable by runtimeVerifiedSchemaBridge (CRM): relationshipsFound is a warning input only.
  $measured = [ordered]@{ tablesFound = $tablesFound; columnsFound = $columnsFound; relationshipsFound = $relsFound; conflicts = 0 }
}
$artifact = [ordered]@{
  domain = 'crm-full'
  status = $status
  tokenValidated = [bool]$tokenOk
  inconclusive = $unknown
  tables = [ordered]@{ found = $tablesFound; expected = $expTables }
  columns = [ordered]@{ found = $columnsFound; expected = $expColumns }
  relationships = [ordered]@{ found = $relsFound; expected = $expRels }
  measured = $measured
  verifiedAtIso = (Get-Date -Format o)
  notes = if ($status -eq 'UNKNOWN' -and $unknown -gt 0) { 'inconclusive token metadata (transient) - re-run; not a missing-schema result' } elseif ($complete) { 'full CRM runtime contract satisfied' } else { 'CRM schema incomplete vs runtime plan (fail-closed)' }
}
$outFile = Join-Path $outDir 'full-crm-schema-evidence.json'
[System.IO.File]::WriteAllText($outFile, ($artifact | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("EVIDENCE: [253B][verify-full-crm] STATUS={0} tables={1}/{2} columns={3}/{4} relationships={5}/{6} inconclusive={7} tokenOk={8} ts={9}" -f $status, $tablesFound, $expTables, $columnsFound, $expColumns, $relsFound, $expRels, $unknown, [bool]$tokenOk, (Get-Date -Format o))
