<#
  Phase 243 - create-portfolio-boarding.ps1

  Creates the MISSING portfolio boarding tables/columns/relationships from
  scripts/dataverse/schema/portfolio-boarding.schema.json (the root boarded-loan
  table + its child group tables + child->root lookups), exactly per
  src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan.ts. Internal OGB
  names only - never a vendor (nCino/Salesforce) table.

  DRY-RUN BY DEFAULT. Pass -Apply to mutate; -Force skips confirmation.
  Create-missing-only; nothing is overwritten/renamed/deleted. No flag flip, no
  email, no pac code push.

    powershell -File scripts/dataverse/create-portfolio-boarding.ps1            # dry-run
    powershell -File scripts/dataverse/create-portfolio-boarding.ps1 -Apply     # live (confirmed)
#>
[CmdletBinding()]
param([switch]$Apply, [switch]$Force)

. (Join-Path $PSScriptRoot '_common.ps1')
$schema = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'schema\portfolio-boarding.schema.json') | ConvertFrom-Json

Write-Host '== Phase 243 :: Create portfolio boarding schema (create-missing-only) =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live, gated)' } else { 'DRY-RUN (default, read-only)' }))
Write-Host ("Solution: {0}  Root: {1}  Tables: {2}" -f $schema.solutionUniqueName, $schema.rootTable, $schema.tables.Count)

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }

if ($Apply) {
  if (-not $envInfo -or -not $token) { Write-Status 'portfolio-boarding' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse token. Aborting (no mutation).'; exit 1 }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'portfolio-boarding' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
}

$tStates = @(); $cStates = @(); $rStates = @()
# Root table first so child->root lookups can bind.
$ordered = @($schema.tables | Where-Object { $_.isRoot }) + @($schema.tables | Where-Object { -not $_.isRoot })
foreach ($t in $ordered) {
  $tStates += (New-DataverseTableIfMissing -TableDef $t -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
  foreach ($c in $t.requiredColumns) { $cStates += (New-DataverseColumnIfMissing -ColumnDef $c -TableLogical $t.logicalName -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent) }
}
# Child -> root lookups, then the explicit root lookups in the schema.
foreach ($t in $schema.tables) {
  if ($t.rootLookup) {
    $childRel = [pscustomobject]@{ schemaName = ("{0}_root" -f $t.logicalName); fromTable = $t.logicalName; fromColumn = $t.rootLookup; toTable = $schema.rootTable }
    $rStates += (New-DataverseRelationshipIfMissing -RelDef $childRel -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
  }
}
foreach ($r in $schema.relationships) { if ($r.schemaName) { $rStates += (New-DataverseRelationshipIfMissing -RelDef $r -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent) } }

$created = (@($tStates + $cStates + $rStates) | Where-Object { $_ -eq 'created' }).Count
$present = (@($tStates + $cStates + $rStates) | Where-Object { $_ -eq 'present' }).Count
$planned = (@($tStates + $cStates + $rStates) | Where-Object { $_ -eq 'planned' }).Count

Write-Host '----'
Write-Host 'NEXT (operator): after -Apply, run publish-customizations.ps1 then regenerate-powerapps-sdk.ps1, then verify-full-schema.ps1.'
Write-Host ("EVIDENCE: [243][portfolio-boarding] mode={0} tables={1} created={2} present={3} planned={4} ts={5}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $schema.tables.Count, $created, $present, $planned, (Get-Date -Format o))
