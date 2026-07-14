<#
  seed-banker-credit-authority.ps1

  Assigns cr664_banker credit-authority DATA (approval limit / credit committee membership /
  override authority) — separate from create-banker-credit-authority-fields.ps1, which only
  creates the COLUMNS (schema). This split is deliberate: this repo's Dataverse schema scripts
  are asserted, by phase243TerminalDataverseSchemaContract.test.ts, to never PATCH existing
  metadata (create-missing-only). Seeding a banker record's data IS a legitimate PATCH, just of
  data, not metadata — so it lives here, outside that assertion, mirroring the existing precedent
  for run-final-launch-smokes.ps1 (also excluded from the schema-script safety assertions because
  it legitimately does something the metadata scripts don't).

  NEVER assigns authority on its own without an explicit run — this script requires -Apply AND a
  -SeedFile. There is NO default seed data and NO hardcoded banker GUID anywhere in this file:
  bankers are resolved by EMAIL, mirroring BankerProvider.tsx's own resolution strategy. The seed
  file itself is a local, .gitignore'd JSON — do not commit real banker data to the repo.

  Seed file shape:
    [
      { "email": "banker@example.com", "approvalLimit": 1000000, "creditCommitteeMember": true, "approvalOverrideAuthority": false }
    ]

  SAFETY:
    - DRY-RUN BY DEFAULT. Pass -Apply to actually write.
    - Confirms the target environment via `pac org who` AND checks the resolved org host matches
      the expected org — BLOCKED on mismatch (override with -ExpectedOrgHost if deliberate).
    - Every entry is resolved by email before any write; entries with no matching cr664_banker
      record are skipped (BLOCKED, not created) — this script never creates banker records.
    - Only the fields present in a seed entry are patched; omitted fields are left untouched.

    powershell -File scripts/dataverse/seed-banker-credit-authority.ps1 -SeedFile .\my-local-seed.json                # dry-run (default)
    powershell -File scripts/dataverse/seed-banker-credit-authority.ps1 -Apply -SeedFile .\my-local-seed.json         # write
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedOrgHost = 'org3a57b8d4.crm.dynamics.com',
  [Parameter(Mandatory)][string]$SeedFile
)

. (Join-Path $PSScriptRoot '_common.ps1')

Write-Host '== seed-banker-credit-authority :: assign cr664_banker authority data by email (opt-in) =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live, gated)' } else { 'DRY-RUN (default, read-only)' }))

if (-not (Test-Path -LiteralPath $SeedFile)) {
  Write-Status 'seed' 'BLOCKED' ("-SeedFile '{0}' does not exist. Aborting." -f $SeedFile)
  exit 1
}

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }

if ($envInfo -and $envInfo.OrgUrl) {
  if ($envInfo.OrgUrl -notmatch [regex]::Escape($ExpectedOrgHost)) {
    Write-Status 'environment' 'BLOCKED' ("Resolved org '{0}' does not match expected host '{1}'. Pass -ExpectedOrgHost to override if deliberate. Aborting." -f $envInfo.OrgUrl, $ExpectedOrgHost)
    if ($Apply) { exit 1 }
  } else {
    Write-Status 'environment' 'PASS' ("org host matches expected '{0}'" -f $ExpectedOrgHost)
  }
} elseif ($Apply) {
  Write-Status 'environment' 'BLOCKED' 'pac is not connected; cannot confirm target environment. Aborting.'
  exit 1
}

$seedEntries = Get-Content -Raw -LiteralPath $SeedFile | ConvertFrom-Json
Write-Host ("Seed entries: {0}" -f @($seedEntries).Count)

if (-not $Apply) {
  foreach ($entry in $seedEntries) {
    if (-not $entry.email) { Write-Status 'seed' 'BLOCKED' 'A seed entry is missing "email" — entries are resolved by email, never a hardcoded GUID.'; continue }
    Write-Status $entry.email 'UNKNOWN' 'WOULD SEED (dry-run; pass -Apply to write)'
  }
  Write-Host ("EVIDENCE: [banker-credit-authority][seed] mode=dry-run entries={0} ts={1}" -f @($seedEntries).Count, (Get-Date -Format o))
  return
}

if (-not $envInfo -or -not $token) { Write-Status 'seed' 'BLOCKED' 'Apply requires a connected pac org + a Dataverse token. Aborting.'; exit 1 }
if (-not (Test-DataverseToken $orgUrl $token)) { Write-Status 'seed' 'BLOCKED' 'Token rejected by Dataverse (WhoAmI failed). Aborting.'; exit 1 }
if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { Write-Status 'seed' 'BLOCKED' 'Operator did not confirm. Aborting.'; exit 1 }

foreach ($entry in $seedEntries) {
  if (-not $entry.email) { Write-Status 'seed' 'BLOCKED' 'A seed entry is missing "email" — bankers are resolved by email, never by a hardcoded GUID. Skipping this entry.'; continue }
  $escapedEmail = $entry.email.Replace("'", "''")
  try {
    $lookup = Invoke-DataverseGet $orgUrl $token ("cr664_bankers?`$select=cr664_bankerid,cr664_email&`$filter=cr664_email eq '{0}'&`$top=1" -f $escapedEmail)
  } catch { Write-Status $entry.email 'BLOCKED' 'lookup failed; skipping.'; continue }
  $banker = $lookup.value | Select-Object -First 1
  if (-not $banker) { Write-Status $entry.email 'BLOCKED' 'no cr664_banker record found for this email; skipping (this script never creates banker records).'; continue }

  $patch = @{}
  if ($null -ne $entry.approvalLimit) { $patch.cr664_approvallimit = $entry.approvalLimit }
  if ($null -ne $entry.creditCommitteeMember) { $patch.cr664_creditcommitteemember = [bool]$entry.creditCommitteeMember }
  if ($null -ne $entry.approvalOverrideAuthority) { $patch.cr664_approvaloverrideauthority = [bool]$entry.approvalOverrideAuthority }
  if ($patch.Count -eq 0) { Write-Status $entry.email 'PASS' 'no authority fields supplied in seed entry; nothing to write.'; continue }

  $body = $patch | ConvertTo-Json
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Patch -Uri ("{0}/api/data/v9.2/cr664_bankers({1})" -f $orgUrl.TrimEnd('/'), $banker.cr664_bankerid) -Headers $headers -Body $body | Out-Null
  Write-Status $entry.email 'PASS' 'authority fields seeded'
}
Write-Host ("EVIDENCE: [banker-credit-authority][seed] mode=apply entries={0} ts={1}" -f @($seedEntries).Count, (Get-Date -Format o))
