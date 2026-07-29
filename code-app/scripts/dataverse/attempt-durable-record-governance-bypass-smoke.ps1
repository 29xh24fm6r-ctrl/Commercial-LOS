<#
  Attempts seven direct Web API creates with a spoofed actor.

  Expected result: every request is synchronously rejected by
  DurableRecordGovernancePlugin and table counts remain unchanged.
  No valid record is created and there is no cleanup/delete path.
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [string]$DealId = 'e262b023-5a8b-f111-ab10-70a8a59b1fe2'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
$orgInfo = Resolve-DataverseEnv
$org = $orgInfo.OrgUrl.TrimEnd('/')
$token = Get-DataverseToken $org
if (-not (Test-DataverseToken $org $token)) { throw 'Dataverse WhoAmI failed.' }
$api = "$org/api/data/v9.2"
$headers = @{
  Authorization = "Bearer $token"
  Accept = 'application/json'
  'Content-Type' = 'application/json'
  'OData-Version' = '4.0'
  'OData-MaxVersion' = '4.0'
}
$actor = ([string]$orgInfo.User).Trim().ToLowerInvariant()
$spoofed = 'spoofed.actor@oldglorybank.com'

function Get-Count([string]$setName) {
  $response = Invoke-RestMethod -Method Get -Uri "${api}/${setName}?`$count=true&`$top=1" -Headers $headers
  return [int]$response.'@odata.count'
}

$attempts = @(
  @{
    entitySet = 'cr664_creditapprovaldecisions'
    body = @{ cr664_correlationid = [guid]::NewGuid().ToString(); cr664_dealid = $DealId; cr664_decisionstatus = 'APPROVED'; cr664_requestedby = $actor; cr664_decidedby = $spoofed; cr664_rationale = 'Expected-rejection server enforcement smoke.'; cr664_authoritytier = 'committee' }
  },
  @{
    entitySet = 'cr664_commitmentrecords'
    body = @{ cr664_correlationid = [guid]::NewGuid().ToString(); cr664_dealid = $DealId; cr664_commitmentstatus = 'ISSUED'; cr664_issuedby = $spoofed; cr664_keytermssummary = 'Expected-rejection server enforcement smoke.' }
  },
  @{
    entitySet = 'cr664_conditionverifications'
    body = @{ cr664_correlationid = [guid]::NewGuid().ToString(); cr664_dealid = $DealId; cr664_conditiontype = 'COLLATERAL'; cr664_verificationstatus = 'CLEARED'; cr664_verifiedby = $spoofed; cr664_notes = 'Expected-rejection server enforcement smoke.' }
  },
  @{
    entitySet = 'cr664_executeddocattestations'
    body = @{ cr664_correlationid = [guid]::NewGuid().ToString(); cr664_dealid = $DealId; cr664_attestationstatus = 'ATTESTED'; cr664_attestedby = $spoofed; cr664_executeddate = (Get-Date).ToUniversalTime().ToString('o'); cr664_notes = 'Expected-rejection server enforcement smoke.' }
  },
  @{
    entitySet = 'cr664_bookingqcchecks'
    body = @{ cr664_correlationid = [guid]::NewGuid().ToString(); cr664_dealid = $DealId; cr664_qcstatus = 'PASSED'; cr664_reviewedby = $spoofed; cr664_notes = 'Expected-rejection server enforcement smoke.' }
  },
  @{
    entitySet = 'cr664_adverseactionrecords'
    body = @{ cr664_correlationid = [guid]::NewGuid().ToString(); cr664_dealid = $DealId; cr664_actionstatus = 'SENT'; cr664_recordedby = $spoofed; cr664_notes = 'Expected-rejection server enforcement smoke.' }
  },
  @{
    entitySet = 'cr664_fundingauthorizations'
    body = @{ cr664_correlationid = [guid]::NewGuid().ToString(); cr664_dealid = $DealId; cr664_authorizationstatus = 'PENDING'; cr664_requestedby = $spoofed; cr664_requestedamount = 1.0 }
  }
)

try {
  $deal = Invoke-RestMethod -Method Get -Uri "$api/cr664_loandeals($DealId)?`$select=cr664_loandealid,cr664_dealname" -Headers $headers
  Write-Host ("Controlled target resolved: {0} ({1})" -f $deal.cr664_dealname, $deal.cr664_loandealid)
  if (-not $Apply) {
    Write-Host ("DRY RUN: would attempt {0} spoofed direct creates; no request sent." -f $attempts.Count)
    exit 0
  }

  $before = @{}
  foreach ($attempt in $attempts) { $before[$attempt.entitySet] = Get-Count $attempt.entitySet }
  $rejections = @()
  foreach ($attempt in $attempts) {
    $rejected = $false
    $message = ''
    try {
      Invoke-RestMethod -Method Post -Uri "$api/$($attempt.entitySet)" -Headers $headers -Body ($attempt.body | ConvertTo-Json -Depth 5) | Out-Null
    } catch {
      $message = [string]$_.ErrorDetails.Message
      if ($message -match 'must match the initiating Dataverse user') { $rejected = $true }
    }
    if (-not $rejected) {
      throw "Expected server rejection was not proven for $($attempt.entitySet). Response: $message"
    }
    $rejections += $attempt.entitySet
    Write-Host ("PASS rejected spoofed direct create: {0}" -f $attempt.entitySet)
  }

  foreach ($attempt in $attempts) {
    $after = Get-Count $attempt.entitySet
    if ($after -ne $before[$attempt.entitySet]) {
      throw "Row count drift for $($attempt.entitySet): before=$($before[$attempt.entitySet]) after=$after."
    }
  }
  Write-Host ("EVIDENCE: [durable-record-plugin][bypass-smoke] actor={0} deal={1} rejected={2}/7 countsUnchanged=true ts={3}" -f
    $actor, $DealId, $rejections.Count, (Get-Date -Format o))
} finally {
  $token = $null
}
