<#
  Phase 243 - regenerate-powerapps-sdk.ps1

  Registers the new tables as app data sources and regenerates the typed Power
  Apps SDK so the Cr664_*Service files + dataSourcesInfo manifest pick up the new
  internal OGB CRM + portfolio tables.

  Uses `pac code add-data-source` (registration/regen) + the repo's
  scripts/sync-datasourcesinfo.mjs. It does NOT run `pac code push` (no deploy),
  performs no Dataverse data mutation, flips no flag, and sends no email.

  DRY-RUN BY DEFAULT. Pass -Apply to register + regenerate.

    powershell -File scripts/dataverse/regenerate-powerapps-sdk.ps1            # dry-run (prints commands)
    powershell -File scripts/dataverse/regenerate-powerapps-sdk.ps1 -Apply
#>
[CmdletBinding()]
param([switch]$Apply, [switch]$Force)

. (Join-Path $PSScriptRoot '_common.ps1')
$schemaDir = Join-Path $PSScriptRoot 'schema'
# Dataverse `pac code add-data-source -t` expects the SINGULAR logical table name
# (e.g. cr664_crmorganization), NOT the plural entity-set name (cr664_crmorganizations).
# Registering with the plural entity-set name produces an invalid/duplicate data source.
# Phase 253B: register the FULL CRM contract (crm-full.schema.json = 10 tables), not the
# old 5-table spine - otherwise only 5/10 CRM services/data sources are generated and the
# runtime evidence reports services=5/10 datasources=5/10 (BLOCKED). Portfolio still uses
# its spine (full portfolio buildout is a later phase).
$logicalNames = @()
foreach ($f in @('crm-full.schema.json', 'portfolio-boarding.schema.json')) {
  $s = Get-Content -Raw -LiteralPath (Join-Path $schemaDir $f) | ConvertFrom-Json
  $logicalNames += ($s.tables | ForEach-Object { $_.logicalName })
}

Write-Host '== Phase 243 :: Register data sources + regenerate Power Apps SDK =='
Write-Host ("Mode: {0}  Data sources: {1}" -f $(if ($Apply) { 'APPLY' } else { 'DRY-RUN (default)' }), $logicalNames.Count)

foreach ($t in $logicalNames) {
  $cmd = "pac code add-data-source -a dataverse -t $t"
  if (-not $Apply) { Write-Host ("WOULD RUN: {0}" -f $cmd); continue }
  Write-Host ("RUN: {0}" -f $cmd)
  & pac code add-data-source -a dataverse -t $t
}

if ($Apply) {
  $repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
  $sync = Join-Path $repo 'scripts\sync-datasourcesinfo.mjs'
  if (Test-Path -LiteralPath $sync) { Write-Host 'RUN: node scripts/sync-datasourcesinfo.mjs'; & node $sync } else { Write-Host 'note: scripts/sync-datasourcesinfo.mjs not found; skip manifest sync.' }
  Write-Host 'RUN: npm run build  (operator should rebuild to confirm the regenerated SDK compiles)'
}

Write-Host ("EVIDENCE: [243][sdk-regen] mode={0} datasources={1} ts={2}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $logicalNames.Count, (Get-Date -Format o))
