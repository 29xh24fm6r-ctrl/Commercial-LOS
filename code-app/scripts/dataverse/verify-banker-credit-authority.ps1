<#
  verify-banker-credit-authority.ps1

  READ-ONLY. Companion to create-banker-credit-authority-fields.ps1 - never mutates anything, no
  -Apply flag exists on this script at all (mirrors verify-full-schema.ps1's pure-read pattern).

  Reports:
    - Existence + AttributeType for the three cr664_banker credit-authority columns.
    - Identity of cr664_loandeal.cr664_stagereference / cr664_statusreference (expected: Lookup)
      and cr664_loandeal.cr664_amount / cr664_loanrequestprofile.cr664_requestedamount (expected: Money).
    - Banker authority configuration - aggregate counts by default (how many active bankers have
      each field populated), or one specific banker via -BankerEmail. Deliberately does NOT dump
      every banker's authority data by default: that's sensitive, and this script's stdout may end
      up in a CI log.
    - permissiongroups / rolepermissiongroups row counts (confirming the "currently zero rows"
      baseline reported when this work started, so drift is visible in future runs).
    - Repo-artifact cross-check: whether cr664_banker's generated service file exists and whether
      the new columns are visible in that generated model yet (they won't be until a real SDK
      regeneration runs - see regenerate-powerapps-sdk.ps1 - this is expected today, not a failure).

    powershell -File scripts/dataverse/verify-banker-credit-authority.ps1
    powershell -File scripts/dataverse/verify-banker-credit-authority.ps1 -BankerEmail someone@example.com
#>
[CmdletBinding()]
param([string]$BankerEmail)

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$TableLogical = 'cr664_banker'

Write-Host '== verify-banker-credit-authority :: read-only report =='

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }

function Get-DataverseAttributeType([string]$OrgUrl, [string]$Token, [string]$TableLogical, [string]$ColumnLogical) {
  if (-not $Token -or -not $OrgUrl) { return $null }
  try {
    $r = Invoke-DataverseGet $OrgUrl $Token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=AttributeType" -f $TableLogical, $ColumnLogical)
    return $r.AttributeType
  } catch { return $null }
}

# --- 1. Credit-authority column existence + type ---
Write-Host '-- cr664_banker credit-authority columns --'
$authorityColumns = @(
  @{ logical = 'cr664_approvallimit'; expected = 'Money' },
  @{ logical = 'cr664_creditcommitteemember'; expected = 'Boolean' },
  @{ logical = 'cr664_approvaloverrideauthority'; expected = 'Boolean' }
)
$authorityColumnsOk = 0
foreach ($c in $authorityColumns) {
  $actual = Get-DataverseAttributeType $orgUrl $token $TableLogical $c.logical
  $status = if ($actual -eq $c.expected) { 'PASS' } elseif ($null -eq $actual) { 'UNKNOWN' } else { 'BLOCKED' }
  if ($status -eq 'PASS') { $authorityColumnsOk++ }
  Write-Status ("{0}.{1}" -f $TableLogical, $c.logical) $status ("AttributeType={0} expected={1}" -f $(if ($actual) { $actual } else { '(unreadable)' }), $c.expected)
}
Write-Host ("EVIDENCE: [banker-credit-authority][verify-columns] ok={0}/{1} ts={2}" -f $authorityColumnsOk, $authorityColumns.Count, (Get-Date -Format o))

# --- 2. Stage/status/amount field identities ---
Write-Host '-- cr664_loandeal / cr664_loanrequestprofile field identities --'
$identityChecks = @(
  @{ table = 'cr664_loandeal'; logical = 'cr664_stagereference'; expected = 'Lookup' },
  @{ table = 'cr664_loandeal'; logical = 'cr664_statusreference'; expected = 'Lookup' },
  @{ table = 'cr664_loandeal'; logical = 'cr664_amount'; expected = 'Money' },
  @{ table = 'cr664_loanrequestprofile'; logical = 'cr664_requestedamount'; expected = 'Money' }
)
foreach ($c in $identityChecks) {
  $actual = Get-DataverseAttributeType $orgUrl $token $c.table $c.logical
  $status = if ($actual -eq $c.expected) { 'PASS' } elseif ($null -eq $actual) { 'UNKNOWN' } else { 'BLOCKED' }
  Write-Status ("{0}.{1}" -f $c.table, $c.logical) $status ("AttributeType={0} expected={1}" -f $(if ($actual) { $actual } else { '(unreadable)' }), $c.expected)
}

# --- 3. Banker authority configuration ---
Write-Host '-- Banker authority configuration --'
if ($token -and $orgUrl) {
  if ($BankerEmail) {
    $escaped = $BankerEmail.Replace("'", "''")
    try {
      $r = Invoke-DataverseGet $orgUrl $token ("cr664_bankers?`$select=cr664_email,cr664_approvallimit,cr664_creditcommitteemember,cr664_approvaloverrideauthority&`$filter=cr664_email eq '{0}'&`$top=1" -f $escaped)
      $b = $r.value | Select-Object -First 1
      if ($b) {
        Write-Status $BankerEmail 'PASS' ("approvalLimit={0} creditCommitteeMember={1} approvalOverrideAuthority={2}" -f $b.cr664_approvallimit, $b.cr664_creditcommitteemember, $b.cr664_approvaloverrideauthority)
      } else {
        Write-Status $BankerEmail 'BLOCKED' 'no cr664_banker record found for this email'
      }
    } catch { Write-Status $BankerEmail 'UNKNOWN' 'lookup failed' }
  } else {
    try {
      $all = Invoke-DataverseGet $orgUrl $token 'cr664_bankers?$select=cr664_activeflag,cr664_approvallimit,cr664_creditcommitteemember,cr664_approvaloverrideauthority'
      $active = @($all.value | Where-Object { $_.cr664_activeflag -ne $false })
      $withLimit = @($active | Where-Object { $null -ne $_.cr664_approvallimit }).Count
      $committeeMembers = @($active | Where-Object { $_.cr664_creditcommitteemember -eq $true }).Count
      $overrideAuthority = @($active | Where-Object { $_.cr664_approvaloverrideauthority -eq $true }).Count
      Write-Status 'aggregate' 'PASS' ("{0} active bankers: {1} have an approval limit set, {2} are credit committee members, {3} have override authority" -f $active.Count, $withLimit, $committeeMembers, $overrideAuthority)
    } catch { Write-Status 'aggregate' 'UNKNOWN' 'could not list bankers' }
  }
} else {
  Write-Status 'banker-authority' 'UNKNOWN' 'no token available; cannot query live authority configuration'
}

# --- 4. Permission-group table row counts ---
Write-Host '-- permissiongroups / rolepermissiongroups row counts --'
foreach ($t in @('cr664_permissiongroups', 'cr664_rolepermissiongroups')) {
  if (-not ($token -and $orgUrl)) { Write-Status $t 'UNKNOWN' 'no token'; continue }
  try {
    $r = Invoke-DataverseGet $orgUrl $token ("{0}?`$select=cr664_name&`$top=5000" -f $t)
    Write-Status $t 'PASS' ("{0} rows" -f $r.value.Count)
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) { Write-Status $t 'UNKNOWN' 'table not found (logical name may differ - confirm against the live solution)' }
    else { Write-Status $t 'UNKNOWN' 'query failed' }
  }
}

# --- 5. Repo-artifact cross-check ---
Write-Host '-- Repo artifacts --'
$servicePath = Join-Path $repo 'src\generated\services\Cr664_bankersService.ts'
$modelPath = Join-Path $repo 'src\generated\models\Cr664_bankersModel.ts'
$serviceExists = Test-Path -LiteralPath $servicePath
Write-Status 'Cr664_bankersService.ts' $(if ($serviceExists) { 'PASS' } else { 'BLOCKED' }) $(if ($serviceExists) { 'generated service present' } else { 'generated service missing' })
if (Test-Path -LiteralPath $modelPath) {
  $modelText = Get-Content -Raw -LiteralPath $modelPath
  $inGeneratedModel = $modelText -match 'cr664_approvallimit'
  Write-Status 'Cr664_bankersModel.ts' $(if ($inGeneratedModel) { 'PASS' } else { 'UNKNOWN' }) $(if ($inGeneratedModel) { 'credit-authority fields ARE in the generated model' } else { 'credit-authority fields NOT yet in the generated model - expected until a real `pac code add-data-source -t cr664_banker` regen runs; the app reads them via src/banker/bankerCreditAuthorityFields.ts as a documented stopgap' })
}
Write-Host ("EVIDENCE: [banker-credit-authority][verify-repo] ts={0}" -f (Get-Date -Format o))
