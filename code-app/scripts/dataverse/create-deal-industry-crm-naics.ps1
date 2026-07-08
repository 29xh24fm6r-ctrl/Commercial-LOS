<#
  Phase 4B - create-deal-industry-crm-naics.ps1

  Two additive schema changes that let a deal derive Industry from its linked CRM
  organization's NAICS classification:
    1. A reverse lookup cr664_Organization on cr664_clientrelationship ->
       cr664_crmorganization (so deal -> cr664_Client -> client relationship ->
       organization -> cr664_naicscode is reachable).
    2. An admin-managed mapping table cr664_naicsindustrymap (NAICS sector code ->
       deal industry label), seeded by scripts/seed-naics-industry-map.mjs.

  Reads scripts/dataverse/schema/deal-industry-crm-naics.schema.json and reuses the
  shared create-missing-only helpers in _common.ps1.

  SAFETY (same discipline as create-full-crm-runtime-schema.ps1):
    - DRY-RUN BY DEFAULT (read-only). Pass -Apply to mutate; -Force skips prompt.
    - CREATE-MISSING-ONLY + additive: table / columns / relationship are checked
      first and skipped if present. Nothing is overwritten, renamed, or deleted.
    - IDEMPOTENT + RESUME-SAFE. No feature-flag flip, no seed, no `pac code` push.

    powershell -File scripts/dataverse/create-deal-industry-crm-naics.ps1          # dry-run
    powershell -File scripts/dataverse/create-deal-industry-crm-naics.ps1 -Apply   # live (confirmed)

  NEXT (operator), after -Apply:
    1. scripts/dataverse/publish-customizations.ps1
    2. scripts/dataverse/regenerate-powerapps-sdk.ps1
    3. node scripts/seed-naics-industry-map.mjs --verify   (then --commit)
    4. Arm the org-link write (BRIDGE_ORG_LINK_ENABLED) only via the certified step
       so bridged clients start carrying cr664_Organization.
#>
[CmdletBinding()]
param([switch]$Apply, [switch]$Force)

. (Join-Path $PSScriptRoot '_common.ps1')
$schema = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'schema\deal-industry-crm-naics.schema.json') | ConvertFrom-Json

Write-Host '== Phase 4B :: Deal Industry from CRM NAICS - org link + mapping table (create-missing-only) =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live, gated)' } else { 'DRY-RUN (default, read-only)' }))
Write-Host ("Target: {0} table / {1} columns / {2} relationship" -f $schema.expected.tables, $schema.expected.columns, $schema.expected.relationships)

$envInfo = Resolve-DataverseEnv
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }
$token = if ($orgUrl) { Get-DataverseToken $orgUrl } else { $null }
$tokenOk = if ($orgUrl) { Test-DataverseToken $orgUrl $token } else { $false }

if ($Apply) {
  if (-not $orgUrl -or -not $tokenOk) {
    Write-Status 'deal-industry-crm-naics' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse-authorized token (WhoAmI 200). Aborting (no mutation).'
    exit 1
  }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'deal-industry-crm-naics' 'BLOCKED' 'Operator did not confirm. Aborting (no mutation).'; exit 1 }
} elseif (-not $tokenOk) {
  Write-Host 'Note: no Dataverse-authorized token; dry-run plans all schema as WOULD CREATE (no live existence checks).'
  $token = $null
}

# --- 1. Mapping table (with primary name) ----------------------------------
$tStates = @()
foreach ($t in ($schema.tables | Sort-Object seedOrder)) {
  $def = [pscustomobject]@{ logicalName = $t.logicalName; schemaName = $t.schemaName; displayName = $t.displayName; displayCollectionName = $t.displayCollectionName; primaryNameColumn = $t.primaryNameColumn; ownershipType = $t.ownershipType; auditEnabled = $false }
  $tStates += (New-DataverseTableIfMissing -TableDef $def -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
}

# --- 2. Mapping table columns ----------------------------------------------
$cStates = @()
foreach ($t in ($schema.tables | Sort-Object seedOrder)) {
  foreach ($c in $t.requiredColumns) { $cStates += (New-DataverseColumnIfMissing -ColumnDef $c -TableLogical $t.logicalName -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent) }
}

# --- 3. Reverse lookup relationship (client relationship -> organization) ---
$rStates = @()
foreach ($r in $schema.relationships) {
  # Both endpoints are pre-existing CRM tables; if either is absent we fail closed
  # rather than guessing (the relationship needs both to exist).
  $fromPresent = Test-DataverseTable $orgUrl $token $r.fromTable
  $toPresent = Test-DataverseTable $orgUrl $token $r.toTable
  if ($Apply -and ($fromPresent -ne $true -or $toPresent -ne $true)) {
    Write-Status $r.schemaName 'BLOCKED' ("endpoint table missing (from={0} present={1}; to={2} present={3})" -f $r.fromTable, $fromPresent, $r.toTable, $toPresent)
    $rStates += 'blocked-missing-endpoint'
    continue
  }
  $rStates += (New-DataverseRelationshipIfMissing -RelDef $r -OrgUrl $orgUrl -Token $token -Apply:$Apply.IsPresent)
}

$all = @($tStates + $cStates + $rStates)
$created = (@($all | Where-Object { $_ -eq 'created' })).Count
$present = (@($all | Where-Object { $_ -eq 'present' })).Count
$planned = (@($all | Where-Object { $_ -eq 'planned' })).Count

Write-Host '----'
Write-Host 'NEXT (operator): after -Apply, run publish-customizations.ps1, then regenerate-powerapps-sdk.ps1,'
Write-Host '                 then node scripts/seed-naics-industry-map.mjs --verify (then --commit).'
Write-Host ("EVIDENCE: [4B][deal-industry-crm-naics] mode={0} tables={1} columns={2} relationships={3} created={4} present={5} planned={6} ts={7}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $schema.expected.tables, $schema.expected.columns, $schema.expected.relationships, $created, $present, $planned, (Get-Date -Format o))
