<#
  Phase 243 - create-crm-spine.ps1

  Creates the MISSING internal OGB CRM spine tables/columns/relationships from
  scripts/dataverse/schema/crm-spine.schema.json. Internal OGB CRM only - never a
  vendor (nCino/Salesforce) table.

  DRY-RUN BY DEFAULT (read-only). Pass -Apply to mutate; pass -Force to skip the
  interactive confirmation. Create-missing-only: existing tables/columns are never
  overwritten, renamed, or deleted. No feature-flag flip, no email, no pac code push.

    powershell -File scripts/dataverse/create-crm-spine.ps1            # dry-run
    powershell -File scripts/dataverse/create-crm-spine.ps1 -Apply     # live (confirmed)
#>
[CmdletBinding()]
param([switch]$Apply, [switch]$Force)

. (Join-Path $PSScriptRoot '_common.ps1')
$schema = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'schema\crm-spine.schema.json') | ConvertFrom-Json

Write-Host '== Phase 243 :: Create internal OGB CRM spine (create-missing-only) =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live, gated)' } else { 'DRY-RUN (default, read-only)' }))
Write-Host ("Solution: {0}  Tables: {1}" -f $schema.solutionUniqueName, $schema.tables.Count)

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }

if ($Apply) {
  if (-not $envInfo -or -not $token) { Write-Status 'crm-spine' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse token. Aborting (no mutation).'; exit 1 }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'crm-spine' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
}

$tStates = @(); $cStates = @(); $rStates = @()
foreach ($t in $schema.tables) {
  $tStates += (New-DataverseTableIfMissing -TableDef $t -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
  foreach ($c in $t.requiredColumns) { $cStates += (New-DataverseColumnIfMissing -ColumnDef $c -TableLogical $t.logicalName -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent) }
}
foreach ($r in $schema.relationships) { if ($r.schemaName) { $rStates += (New-DataverseRelationshipIfMissing -RelDef $r -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent) } }

$created = (@($tStates + $cStates + $rStates) | Where-Object { $_ -eq 'created' }).Count
$present = (@($tStates + $cStates + $rStates) | Where-Object { $_ -eq 'present' }).Count
$planned = (@($tStates + $cStates + $rStates) | Where-Object { $_ -eq 'planned' }).Count

Write-Host '----'
Write-Host 'NEXT (operator): after -Apply, run publish-customizations.ps1 then regenerate-powerapps-sdk.ps1, then verify-full-schema.ps1.'
Write-Host ("EVIDENCE: [243][crm-spine] mode={0} tables={1} created={2} present={3} planned={4} ts={5}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $schema.tables.Count, $created, $present, $planned, (Get-Date -Format o))
