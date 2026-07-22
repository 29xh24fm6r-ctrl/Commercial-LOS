<#
  attempt-governance-bypass-smoke.ps1

  Platform-Enforced Credit Workflow Governance (2026-07-21) - OPERATOR-RUN, fail-closed.

  Automates Part A of docs/governance/LIVE_OPERATOR_CERTIFICATION_SCRIPT.md: direct Dataverse Web
  API writes to a caller-supplied TEST deal, attempting exactly the bypasses
  LoanDealGovernedTransitionPlugin exists to reject. This script's own success is REJECTION - if a
  scenario's write actually succeeds, that is a CRITICAL finding (the plugin is not armed, not
  registered correctly, or has a real bug), not a script error. The script prints a clear
  PASS/FAIL/CRITICAL verdict per scenario rather than treating either outcome as "the script
  worked."

  This script does NOT create or delete the test deal - the operator supplies an existing
  disposable TEST-prefixed deal id (see the certification script's "Test deal setup"). This script
  only ever touches that one caller-supplied record's stage/status/amount fields, and restores its
  original stage/status via a final direct write (best-effort) so repeat runs start clean - it
  performs no create, no delete, and no write to any other record.

  SAFETY MODEL (same as every other script in this directory - see _common.ps1):
    - DRY-RUN BY DEFAULT. No live write is attempted without -Apply.
    - Confirms the target environment via `pac org who` AND checks the resolved org host matches
      the expected org - BLOCKED on any mismatch. Override with -ExpectedOrgHost if deliberate.
    - REFUSES to run against a deal whose name does not start with "TEST -" (mirrors this repo's
      own test-deal convention, src/shared/deals/testDealClassification.ts) - a safety rail against
      accidentally pointing this at a real production deal.
    - Restores the deal's original stage/status reference (read once at the start) after every
      scenario, best-effort, and reports if a restore write itself was rejected (which would itself
      be a notable finding, not silently swallowed).

  USAGE:
    # Dry-run (default): validate env + the target deal, print the plan, attempt nothing.
    powershell -File scripts/dataverse/attempt-governance-bypass-smoke.ps1 -TestDealId <guid>

    # Live bypass-attempt smoke (typed confirmation required):
    powershell -File scripts/dataverse/attempt-governance-bypass-smoke.ps1 -Apply -TestDealId <guid>
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$TestDealId,
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedOrgHost = 'org3a57b8d4.crm.dynamics.com'
)

. (Join-Path $PSScriptRoot '_common.ps1')

$DealEntitySet = 'cr664_loandeals'
$StageReferenceEntitySet = 'cr664_dealstagereferences'
$StatusReferenceEntitySet = 'cr664_dealstatusreferences'

Write-Host '== attempt-governance-bypass-smoke :: adversarial direct-write bypass attempts =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live writes attempted, gated)' } else { 'DRY-RUN (default, read-only)' }))
Write-Host 'Success for THIS script means every bypass attempt is REJECTED. A write that succeeds is a CRITICAL finding.'

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }

if ($envInfo -and $envInfo.OrgUrl) {
  $orgHostMatches = $envInfo.OrgUrl -match [regex]::Escape($ExpectedOrgHost)
  if (-not $orgHostMatches) {
    Write-Status 'environment' 'BLOCKED' ("Resolved org '{0}' does not match expected host '{1}'. Pass -ExpectedOrgHost to override if deliberate. Aborting." -f $envInfo.OrgUrl, $ExpectedOrgHost)
    exit 1
  }
  Write-Status 'environment' 'PASS' ("org host matches expected '{0}'" -f $ExpectedOrgHost)
} else {
  Write-Status 'environment' 'BLOCKED' 'pac is not connected; cannot confirm target environment. Aborting.'
  exit 1
}
if (-not $token) { Write-Status 'environment' 'BLOCKED' 'Could not acquire a Dataverse token. Aborting.'; exit 1 }
if (-not (Test-DataverseToken $orgUrl $token)) { Write-Status 'environment' 'BLOCKED' 'Token rejected by Dataverse (WhoAmI failed). Aborting.'; exit 1 }

# --- Load + validate the target deal. ---
function Get-Deal([string]$OrgUrl, [string]$Token, [string]$DealId) {
  $r = Invoke-DataverseGet $OrgUrl $Token ("{0}({1})?`$select=cr664_dealname,_cr664_stagereference_value,_cr664_statusreference_value,cr664_amount" -f $DealEntitySet, $DealId)
  return $r
}
$deal = $null
try { $deal = Get-Deal $orgUrl $token $TestDealId } catch {
  Write-Status 'target-deal' 'BLOCKED' ("Could not read deal {0}: {1}. Aborting." -f $TestDealId, $_.Exception.Message)
  exit 1
}
if (-not $deal.cr664_dealname -or $deal.cr664_dealname -notmatch '^TEST -') {
  Write-Status 'target-deal' 'BLOCKED' ("Deal name '{0}' does not start with 'TEST -'. Refusing to run against a non-test deal. Aborting." -f $deal.cr664_dealname)
  exit 1
}
Write-Status 'target-deal' 'PASS' ("'{0}' ({1}) confirmed as a test deal" -f $deal.cr664_dealname, $TestDealId)
$originalStageRef = $deal.'_cr664_stagereference_value'
$originalStatusRef = $deal.'_cr664_statusreference_value'

if ($Apply -and -not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) {
  Write-Status 'attempt' 'BLOCKED' 'Operator did not confirm. Aborting (no live writes attempted).'
  exit 1
}

function Resolve-StageRef([string]$OrgUrl, [string]$Token, [string]$Code) {
  $r = Invoke-DataverseGet $OrgUrl $Token ("{0}?`$select=cr664_dealstagereferenceid&`$filter=cr664_code eq '{1}' and cr664_activeflag eq true" -f $StageReferenceEntitySet, $Code)
  if ($r.value.Count -ne 1) { return $null }
  return $r.value[0].cr664_dealstagereferenceid
}
function Resolve-StatusRef([string]$OrgUrl, [string]$Token, [string]$Code) {
  $r = Invoke-DataverseGet $OrgUrl $Token ("{0}?`$select=cr664_dealstatusreferenceid&`$filter=cr664_code eq '{1}' and cr664_activeflag eq true" -f $StatusReferenceEntitySet, $Code)
  if ($r.value.Count -ne 1) { return $null }
  return $r.value[0].cr664_dealstatusreferenceid
}

# --- The one primitive every scenario below uses: attempt a direct PATCH, report whether it was
#     accepted or rejected, and record the verdict against what SHOULD have happened. ---
function Test-DataverseAttempt {
  param(
    [string]$Name,
    [hashtable]$Patch,
    [bool]$ExpectRejected
  )
  if (-not $Apply) {
    Write-Status $Name 'UNKNOWN' 'dry-run - would attempt this direct write live under -Apply'
    return
  }
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json'; 'If-None-Match' = $null }
  $body = $Patch | ConvertTo-Json -Depth 8
  try {
    Invoke-RestMethod -Method Patch -Uri ("{0}/api/data/v9.2/{1}({2})" -f $orgUrl.TrimEnd('/'), $DealEntitySet, $TestDealId) -Headers $headers -Body $body | Out-Null
    if ($ExpectRejected) {
      Write-Status $Name 'CRITICAL' 'the write SUCCEEDED - this bypass was NOT rejected. The plugin is not enforcing this rule (unregistered, misconfigured, or a real bug). Investigate before relying on server-side enforcement.'
    } else {
      Write-Status $Name 'PASS' 'the write succeeded, as expected for a legal transition'
    }
  } catch {
    $msg = $_.Exception.Message
    if ($ExpectRejected) {
      Write-Status $Name 'PASS' ("rejected, as expected: {0}" -f $msg)
    } else {
      Write-Status $Name 'FAIL' ("expected this legal transition to succeed but it was rejected: {0}" -f $msg)
    }
  }
}

Write-Host '== A1: stage-skip (expect REJECTED) =='
$creditApprovalId = Resolve-StageRef $orgUrl $token 'CREDIT_APPROVAL'
if ($creditApprovalId) {
  Test-DataverseAttempt -Name 'A1-stage-skip' -ExpectRejected $true -Patch @{
    'cr664_StageReference@odata.bind' = "/${StageReferenceEntitySet}($creditApprovalId)"
  }
} else {
  Write-Status 'A1-stage-skip' 'UNKNOWN' 'could not resolve CREDIT_APPROVAL stage reference id'
}

Write-Host '== A2: terminal-status lock (expect REJECTED after a legal decline) =='
$declinedId = Resolve-StatusRef $orgUrl $token 'DECLINED'
if ($declinedId) {
  Test-DataverseAttempt -Name 'A2a-legal-decline' -ExpectRejected $false -Patch @{
    'cr664_StatusReference@odata.bind' = "/${StatusReferenceEntitySet}($declinedId)"
  }
  $underwritingId = Resolve-StageRef $orgUrl $token 'UNDERWRITING'
  if ($underwritingId) {
    Test-DataverseAttempt -Name 'A2b-stage-write-on-declined-deal' -ExpectRejected $true -Patch @{
      'cr664_StageReference@odata.bind' = "/${StageReferenceEntitySet}($underwritingId)"
    }
  }
} else {
  Write-Status 'A2-terminal-lock' 'UNKNOWN' 'could not resolve DECLINED status reference id'
}

Write-Host '== A4: amount-only write (expect this plugin to be COMPLETELY UNAFFECTED) =='
Test-DataverseAttempt -Name 'A4-amount-only' -ExpectRejected $false -Patch @{ cr664_amount = 123456 }

# --- Best-effort restore of the deal's original stage/status. ---
if ($Apply -and ($originalStageRef -or $originalStatusRef)) {
  Write-Host '== Restoring original stage/status (best-effort) =='
  $restorePatch = @{}
  if ($originalStageRef) { $restorePatch['cr664_StageReference@odata.bind'] = "/${StageReferenceEntitySet}($originalStageRef)" }
  if ($originalStatusRef) { $restorePatch['cr664_StatusReference@odata.bind'] = "/${StatusReferenceEntitySet}($originalStatusRef)" }
  try {
    $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
    Invoke-RestMethod -Method Patch -Uri ("{0}/api/data/v9.2/{1}({2})" -f $orgUrl.TrimEnd('/'), $DealEntitySet, $TestDealId) -Headers $headers -Body ($restorePatch | ConvertTo-Json -Depth 8) | Out-Null
    Write-Status 'restore' 'PASS' 'test deal restored to its original stage/status'
  } catch {
    Write-Status 'restore' 'FAIL' ("could not restore the test deal's original stage/status: {0}. Restore it manually before reusing this deal id." -f $_.Exception.Message)
  }
}

Write-Host ("EVIDENCE: [governance-bypass-smoke][attempt] mode={0} dealId={1} ts={2}" -f $(if ($Apply) { 'apply' } else { 'dry-run' }), $TestDealId, (Get-Date -Format o))
Write-Host 'Any CRITICAL verdict above means server-side enforcement is not working as designed for that rule - do not certify the plugin as live until every scenario is PASS.'
