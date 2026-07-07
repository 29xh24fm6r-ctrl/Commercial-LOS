<#
  Phase 256A - run-final-launch-smokes.ps1   (OPERATOR-RUN, fail-closed)

  Produces the controlled-smoke evidence artifacts the final launch gates require, one JSON
  per capability under docs/operator-evidence/final-launch/, in the exact shape parsed by
  src/access/finalLaunchSmokeEvidence.ts. A gate is flipped (separate phase) ONLY after its
  artifact validates with outcome=passed and the required verifications.

  SAFETY MODEL:
    - DRY-RUN BY DEFAULT. No mutation, no artifact written without -Apply (live) or
      -RecordManualEvidence (operator-supplied evidence).
    - Confirms the target environment via `pac org who` and validates the Dataverse token
      with WhoAmI before any live operation. Live ops fail closed if WhoAmI fails.
    - LIVE ops only ever CREATE/READBACK/UPDATE/DELETE a record THIS script created, named
      with the launch-test marker. It NEVER touches, updates, or deletes existing business
      data, and it cleans up only the ids it created. Any readback/cleanup failure => the
      smoke is recorded outcome=failed (fail closed); it never fabricates a pass.
    - NO feature-flag flip, NO email auto-send beyond the explicit approved test recipient,
      NO PAC code-push deployment, NO schema mutation.

  CAPABILITIES:
    - crmLivePersistence, portfolioBoarding : AUTOMATED direct-Dataverse CRUD smoke here.
    - documentChecklist, stageAdvancement   : app-layer governed writes (checklist write
      dependency / advanceWorkflowStage audit+timeline sinks) cannot be driven safely from a
      raw Dataverse script -> require -RecordManualEvidence (the operator performs the
      controlled in-app smoke and supplies the validated evidence JSON).
    - borrowerSend : requires VITE_EMAIL_MODE=LIVE + an approved -TestRecipient; the audited
      send is an explicit banker action, so it is recorded via -RecordManualEvidence with
      delivery/audit verification (no rollback for an email).

  USAGE:
    # Dry-run preview (default): validate env + print the plan, write nothing.
    powershell -File scripts/dataverse/run-final-launch-smokes.ps1

    # Live automated CRM + portfolio smokes (typed confirmation required):
    powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -Apply -Capability crmLivePersistence
    powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -Apply -Capability portfolioBoarding

    # Record a manually-run controlled smoke (validated, never invented):
    powershell -File scripts/dataverse/run-final-launch-smokes.ps1 -RecordManualEvidence path\to\stageAdvancement.json
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [string]$RecordManualEvidence,
  [ValidateSet('all', 'crmLivePersistence', 'portfolioBoarding', 'documentChecklist', 'borrowerSend', 'stageAdvancement')]
  [string]$Capability = 'all',
  [string]$TestRecipient,
  [switch]$Force,
  [string]$CrmEntitySet = 'cr664_crmorganizations',
  [string]$CrmNameColumn = 'cr664_legalname',
  [string]$CrmIdColumn = 'cr664_crmorganizationid',
  [string]$PortfolioEntitySet = 'cr664_portfolioboardedloans',
  [string]$PortfolioNameColumn = 'cr664_name',
  [string]$PortfolioIdColumn = 'cr664_portfolioboardedloanid'
)

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$outDir = Join-Path $repo 'docs\operator-evidence\final-launch'
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$AUTOMATED = @('crmLivePersistence', 'portfolioBoarding')
$MANUAL_ONLY = @('documentChecklist', 'borrowerSend', 'stageAdvancement')
$ALL_CAPS = $AUTOMATED + $MANUAL_ONLY
$MARKER = 'ZZ-LAUNCH-SMOKE'

function Write-Artifact($capability, $obj) {
  $file = Join-Path $outDir ("{0}.json" -f $capability)
  [System.IO.File]::WriteAllText($file, ($obj | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("WROTE: {0}" -f $file)
  return $file
}

# ---- fail-closed manual-evidence validation (mirrors finalLaunchSmokeEvidence.ts) --------
function Test-ManualEvidence($e) {
  $errs = @()
  if ($ALL_CAPS -notcontains $e.capability) { $errs += "capability must be one of: $($ALL_CAPS -join ', ')" }
  if (@('passed', 'failed') -notcontains $e.outcome) { $errs += 'outcome must be passed or failed' }
  foreach ($f in @('operatorUpn', 'environmentUrl', 'environmentId', 'correlationId', 'startedAtIso', 'completedAtIso', 'evidenceNote')) {
    if ([string]::IsNullOrWhiteSpace([string]$e.$f)) { $errs += "missing $f" }
  }
  foreach ($f in @('liveOperationPerformed', 'readbackVerified', 'rollbackVerified')) {
    if ($e.$f -isnot [bool]) { $errs += "$f must be a boolean" }
  }
  if ($e.capability -eq 'borrowerSend') {
    if ($e.deliveryVerified -isnot [bool] -and $e.auditVerified -isnot [bool]) { $errs += 'borrowerSend requires deliveryVerified or auditVerified boolean' }
  }
  return $errs
}

# ---- live Dataverse record CRUD (only ever on records THIS script creates) ---------------
function Invoke-DvPost($orgUrl, $token, $set, $bodyHash) {
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json'; 'Accept' = 'application/json'; 'Prefer' = 'return=representation' }
  return Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/{1}" -f $orgUrl.TrimEnd('/'), $set) -Headers $headers -Body ($bodyHash | ConvertTo-Json -Depth 8)
}
function Invoke-DvPatch($orgUrl, $token, $set, $id, $bodyHash) {
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Patch -Uri ("{0}/api/data/v9.2/{1}({2})" -f $orgUrl.TrimEnd('/'), $set, $id) -Headers $headers -Body ($bodyHash | ConvertTo-Json -Depth 8) | Out-Null
}
function Invoke-DvDelete($orgUrl, $token, $set, $id) {
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }
  Invoke-RestMethod -Method Delete -Uri ("{0}/api/data/v9.2/{1}({2})" -f $orgUrl.TrimEnd('/'), $set, $id) -Headers $headers | Out-Null
}

# Create -> readback -> update -> readback -> delete -> confirm-deleted. Returns an
# evidence hashtable. outcome=passed ONLY when every step (including cleanup) succeeds.
function Invoke-CrudSmoke($capability, $orgUrl, $token, $envId, $set, $nameCol, $idCol) {
  $corr = [guid]::NewGuid().ToString()
  $started = (Get-Date).ToUniversalTime().ToString('o')
  $name = "{0}-{1}" -f $MARKER, $corr
  $live = $false; $readback = $false; $rolledBack = $false; $affected = @(); $note = ''
  try {
    Write-Host ("[{0}] CREATE {1} '{2}'" -f $capability, $set, $name)
    $created = Invoke-DvPost $orgUrl $token $set @{ $nameCol = $name }
    $live = $true
    $id = [string]$created.$idCol
    if ([string]::IsNullOrWhiteSpace($id)) { throw 'create returned no id' }
    $affected = @($id)

    $back = Invoke-DataverseGet $orgUrl $token ("{0}({1})?`$select={2}" -f $set, $id, $nameCol)
    if ([string]$back.$nameCol -ne $name) { throw 'readback name mismatch after create' }

    $updated = "{0}-UPD" -f $name
    Invoke-DvPatch $orgUrl $token $set $id @{ $nameCol = $updated }
    $back2 = Invoke-DataverseGet $orgUrl $token ("{0}({1})?`$select={2}" -f $set, $id, $nameCol)
    if ([string]$back2.$nameCol -ne $updated) { throw 'readback name mismatch after update' }
    $readback = $true

    Invoke-DvDelete $orgUrl $token $set $id
    $stillThere = $true
    try { Invoke-DataverseGet $orgUrl $token ("{0}({1})?`$select={2}" -f $set, $id, $idCol) | Out-Null }
    catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { $stillThere = $false } }
    if ($stillThere) { throw 'cleanup delete did not remove the record' }
    $rolledBack = $true
    $note = "Live create/readback/update/readback/cleanup on $set succeeded (launch-test marker)."
    Write-Host ("[{0}] PASS (created, verified, cleaned up)" -f $capability)
  } catch {
    $note = "Smoke failed: $($_.Exception.Message)"
    Write-Host ("[{0}] FAIL - {1}" -f $capability, $_.Exception.Message)
  }
  $completed = (Get-Date).ToUniversalTime().ToString('o')
  $outcome = if ($live -and $readback -and $rolledBack) { 'passed' } else { 'failed' }
  return [ordered]@{
    capability            = $capability
    outcome               = $outcome
    operatorUpn           = $script:OperatorUpn
    operatorSystemUserId  = $script:OperatorSystemUserId
    environmentUrl        = $orgUrl
    environmentId         = $envId
    correlationId         = $corr
    startedAtIso          = $started
    completedAtIso        = $completed
    liveOperationPerformed = $live
    readbackVerified      = $readback
    rollbackVerified      = $rolledBack
    crmAction             = 'create -> readback -> update -> readback -> delete -> confirm-deleted'
    evidenceNote          = $note
    affectedRecordIds     = @($affected)
    cleanupRecordIds      = @($(if ($rolledBack) { $affected } else { @() }))
    rollbackNote          = $(if ($rolledBack) { 'Cleanup delete removed the launch-test record; confirmed 404 on readback.' } else { 'No cleanup performed (smoke did not reach cleanup).' })
    schemaEvidenceReference = [ordered]@{
      path          = 'scripts/dataverse/evidence/full-crm-schema-evidence.json'
      tables        = 10
      columns       = 147
      relationships = 28
      conflicts     = 0
      note          = 'Full CRM schema contract proven by the committed token-validated evidence.'
    }
  }
}

# =========================================================================================
# 1) Manual-evidence mode: validate operator-supplied JSON and record it (never invented).
# =========================================================================================
if ($RecordManualEvidence) {
  if (-not (Test-Path -LiteralPath $RecordManualEvidence)) { Write-Host "BLOCKED: evidence file not found: $RecordManualEvidence"; exit 1 }
  try { $e = Get-Content -Raw -LiteralPath $RecordManualEvidence | ConvertFrom-Json } catch { Write-Host "BLOCKED: not valid JSON: $($_.Exception.Message)"; exit 1 }
  $errs = Test-ManualEvidence $e
  if ($errs.Count -gt 0) { Write-Host ("BLOCKED: invalid evidence - " + ($errs -join '; ')); exit 1 }
  Write-Artifact $e.capability $e | Out-Null
  Write-Host ("RECORDED manual evidence for {0}: outcome={1} (validated, not invented)" -f $e.capability, $e.outcome)
  exit 0
}

# =========================================================================================
# 2) Environment validation (read-only) for dry-run preview and live ops.
# =========================================================================================
$envInfo = Resolve-DataverseEnv
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }
$script:OperatorUpn = if ($envInfo -and $envInfo.User) { $envInfo.User } else { 'unknown-operator' }
$token = if ($orgUrl) { Get-DataverseToken $orgUrl } else { $null }
$tokenOk = Test-DataverseToken $orgUrl $token
$envId = ([regex]::Match(($envInfo.Raw | Out-String), '(?im)Environment ID\s*:\s*([0-9a-f\-]+)')).Groups[1].Value
# Capture the operator's Dataverse systemuser id (WhoAmI UserId) for evidence attribution.
$script:OperatorSystemUserId = ''
if ($tokenOk) { try { $script:OperatorSystemUserId = [string](Invoke-DataverseGet $orgUrl $token 'WhoAmI').UserId } catch { } }
Write-Host ("TOKEN usable (WhoAmI): {0}; operator={1}" -f [bool]$tokenOk, $script:OperatorUpn)

$targets = if ($Capability -eq 'all') { $ALL_CAPS } else { @($Capability) }

if (-not $Apply) {
  Write-Host '---- DRY-RUN PREVIEW (no mutation, no artifact written; pass -Apply for live automated smokes) ----'
  foreach ($c in $targets) {
    if ($AUTOMATED -contains $c) {
      $set = if ($c -eq 'crmLivePersistence') { $CrmEntitySet } else { $PortfolioEntitySet }
      Write-Host ("  {0}: WOULD create/readback/update/cleanup one '{1}-<guid>' record on {2}, then write {0}.json" -f $c, $MARKER, $set)
    } else {
      Write-Host ("  {0}: app-layer smoke - run the controlled in-app smoke, then -RecordManualEvidence <{0}.json>" -f $c)
    }
  }
  Write-Host 'Preview only. Nothing was created, updated, deleted, sent, or recorded.'
  exit 0
}

# =========================================================================================
# 3) -Apply: live automated smokes (CRM / portfolio only). Fail closed without a token.
# =========================================================================================
if (-not $tokenOk) { Write-Host 'BLOCKED: no usable Dataverse token (WhoAmI failed). Live smoke cannot run; nothing written.'; exit 1 }
if (-not $Force) {
  $ans = Read-Host ("About to run LIVE launch-test CRUD smokes in {0}. Type EXACTLY 'LAUNCH-SMOKE' to proceed" -f $orgUrl)
  if ($ans -cne 'LAUNCH-SMOKE') { Write-Host 'Aborted (confirmation not given).'; exit 1 }
}

$any = $false
foreach ($c in $targets) {
  if ($AUTOMATED -notcontains $c) {
    Write-Host ("SKIP {0}: app-layer smoke - use -RecordManualEvidence (it cannot be safely automated from this script)." -f $c)
    continue
  }
  $any = $true
  if ($c -eq 'crmLivePersistence') { $ev = Invoke-CrudSmoke $c $orgUrl $token $envId $CrmEntitySet $CrmNameColumn $CrmIdColumn }
  else { $ev = Invoke-CrudSmoke $c $orgUrl $token $envId $PortfolioEntitySet $PortfolioNameColumn $PortfolioIdColumn }
  Write-Artifact $c $ev | Out-Null
  Write-Host ("EVIDENCE: [256A][final-launch-smoke] capability={0} outcome={1} corr={2}" -f $ev.capability, $ev.outcome, $ev.correlationId)
}
if (-not $any) { Write-Host 'No automated capability selected. documentChecklist/borrowerSend/stageAdvancement use -RecordManualEvidence.' }
Write-Host 'Done. Review the artifacts under docs/operator-evidence/final-launch/ before any gate flip.'
