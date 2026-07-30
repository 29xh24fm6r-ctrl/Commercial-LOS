[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$CertificationKey = 'OGB-GOV-CERT-20260730-01'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
if (-not $Apply) {
  Write-Host "DRY-RUN certificationKey=$CertificationKey no records changed"
  exit 0
}
$envInfo = Resolve-DataverseEnv
$orgUrl = $envInfo.OrgUrl.TrimEnd('/')
$token = Get-DataverseToken $orgUrl
if (-not (Test-DataverseToken $orgUrl $token)) { throw 'Dataverse WhoAmI failed.' }
if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { throw 'Operator did not confirm live certification.' }
$api = "$orgUrl/api/data/v9.2"
$headers = @{
  Authorization = "Bearer $token"
  Accept = 'application/json'
  'Content-Type' = 'application/json'
  Prefer = 'return=representation'
}
function Escape-OData([string]$value) { $value.Replace("'", "''") }
function Get-Rows([string]$relative) {
  return (Invoke-RestMethod -Method Get -Uri "$api/$relative" -Headers $headers).value
}
function Get-One($rows, [string]$label) {
  $items = @($rows)
  if ($items.Count -ne 1) { throw "Expected one $label; found $($items.Count)." }
  return $items[0]
}
function Post-Row([string]$set, [hashtable]$body) {
  return Invoke-RestMethod -Method Post -Uri "$api/$set" -Headers $headers -Body ($body | ConvertTo-Json -Depth 100)
}
function Patch-Row([string]$set, [string]$id, [hashtable]$body) {
  $patchHeaders = @{} + $headers
  $patchHeaders['If-Match'] = '*'
  Invoke-RestMethod -Method Patch -Uri "$api/$set($id)" -Headers $patchHeaders -Body ($body | ConvertTo-Json -Depth 100) | Out-Null
}
function Assert-Or-Create([string]$set, [string]$query, [hashtable]$body, [string]$idField, [string]$label) {
  $rows = @(Get-Rows "${set}?$query")
  if ($rows.Count -gt 1) { throw "Duplicate $label records exist." }
  if ($rows.Count -eq 0) { Post-Row $set $body | Out-Null }
  $row = Get-One (Get-Rows "${set}?$query") $label
  if ([string]::IsNullOrWhiteSpace([string]$row.$idField)) { throw "$label has no native Dataverse GUID." }
  return $row
}
function Disable-ConfigurableSteps {
  $rollbackHeaders = @{} + $headers
  $rollbackHeaders['If-Match'] = '*'
  foreach ($typeName in @(
    'CommercialLendingLOS.Plugins.ConfigurableCreditGovernancePlugin',
    'CommercialLendingLOS.Plugins.GovernanceNaturalKeyGuardPlugin'
  )) {
    $types = @(Get-Rows "plugintypes?`$select=plugintypeid&`$filter=typename eq '$(Escape-OData $typeName)'")
    foreach ($type in $types) {
      $steps = @(Get-Rows "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,statecode&`$filter=_plugintypeid_value eq $($type.plugintypeid)")
      foreach ($step in $steps) {
        if ([int]$step.statecode -eq 0) {
          Invoke-RestMethod -Method Patch -Uri "$api/sdkmessageprocessingsteps($($step.sdkmessageprocessingstepid))" `
            -Headers $rollbackHeaders -Body '{"statecode":1,"statuscode":2}' | Out-Null
        }
      }
    }
  }
}
function Expect-Blocked([string]$label, [scriptblock]$operation) {
  try {
    & $operation
  } catch {
    Write-Host "PASS blocked=$label"
    return
  }
  throw "Mandatory negative control was permitted: $label."
}
function Set-Stage([string]$dealId, $stage) {
  Patch-Row 'cr664_loandeals' $dealId @{
    'cr664_StageReference@odata.bind' = "/cr664_dealstagereferences($($stage.cr664_dealstagereferenceid))"
    cr664_stageentrydate = [DateTime]::UtcNow.ToString('o')
  }
}

try {
  $systemUser = Get-One (Get-Rows "systemusers?`$select=systemuserid,fullname,domainname,azureactivedirectoryobjectid,isdisabled&`$filter=domainname eq 'mpaller@oldglorybank.com'") 'Matthew systemuser'
  if ($systemUser.isdisabled -or [string]::IsNullOrWhiteSpace([string]$systemUser.azureactivedirectoryobjectid)) {
    throw 'Matthew’s systemuser-to-Entra identity chain is incomplete.'
  }
  $banker = Get-One (Get-Rows "cr664_bankers?`$select=cr664_bankerid,cr664_email,_cr664_userloginmapping_value&`$filter=cr664_email eq 'mpaller@oldglorybank.com'") 'Matthew banker'
  if ([string]::IsNullOrWhiteSpace([string]$banker._cr664_userloginmapping_value)) {
    throw 'Matthew’s banker-to-platform-user identity chain is incomplete.'
  }
  $platformUserId = [string]$banker._cr664_userloginmapping_value

  $profile = Get-One (Get-Rows "cr664_creditgovernanceprofiles?`$select=cr664_creditgovernanceprofileid,cr664_profileenabled&`$filter=cr664_bankkey eq 'OGB'") 'active OGB profile'
  $policy = Get-One (Get-Rows "cr664_creditpolicyversions?`$select=cr664_creditpolicyversionid,cr664_snapshotsha256,cr664_policystatus&`$filter=cr664_policyid eq 'ogb-option-a-initial' and cr664_versionnumber eq 1") 'active OGB policy'
  $authority = Get-One (Get-Rows "cr664_authoritygrants?`$select=cr664_authoritygrantid,cr664_grantstate,cr664_maximumamount,cr664_maximumrelationshipexposure,cr664_maximumunsecuredamount&`$filter=cr664_grantid eq 'ogb-option-a-matthew-authority'") 'Matthew authority'
  if (
    -not $profile.cr664_profileenabled -or $policy.cr664_policystatus -ne 'ACTIVE' -or
    $policy.cr664_snapshotsha256 -ne '833f936dfddfdb3ddce8b3d7a78de62946131e96498431dfcfd772a5e96c919d' -or
    $authority.cr664_grantstate -ne 'ACTIVE'
  ) { throw 'The approved active profile/policy/authority readback failed.' }

  $stages = @{}
  foreach ($stage in @(Get-Rows "cr664_dealstagereferences?`$select=cr664_dealstagereferenceid,cr664_code&`$filter=cr664_activeflag eq true")) {
    $stages[[string]$stage.cr664_code] = $stage
  }
  foreach ($requiredStage in @('INTAKE','UNDERWRITING','CREDIT_APPROVAL','COMMITMENT','DOCUMENTATION','CLOSING_FUNDING','BOARDED')) {
    if (-not $stages.ContainsKey($requiredStage)) { throw "Missing active stage $requiredStage." }
  }
  $openStatus = Get-One (Get-Rows "cr664_dealstatusreferences?`$select=cr664_dealstatusreferenceid&`$filter=cr664_code eq 'OPEN' and cr664_activeflag eq true") 'OPEN status'
  $boardedStatus = Get-One (Get-Rows "cr664_dealstatusreferences?`$select=cr664_dealstatusreferenceid&`$filter=cr664_code eq 'BOARDED' and cr664_activeflag eq true") 'BOARDED status'
  $product = Get-One (Get-Rows "cr664_producttypereferences?`$select=cr664_producttypereferenceid,cr664_name&`$filter=cr664_name eq 'Owner-occupied CRE'") 'Owner-occupied CRE product'
  $excludedProducts = @(Get-Rows "cr664_producttypereferences?`$select=cr664_producttypereferenceid,cr664_name&`$filter=cr664_name eq 'Construction Loan'")
  $excludedProduct = Get-One $excludedProducts 'excluded product'
  $risk = Assert-Or-Create 'cr664_riskratingreferences' `
    "`$select=cr664_riskratingreferenceid,cr664_name,cr664_code,cr664_activeflag&`$filter=cr664_code eq 'PASS'" `
    @{ cr664_name = 'PASS'; cr664_code = 'PASS'; cr664_activeflag = $true } `
    'cr664_riskratingreferenceid' 'PASS risk reference'

  $client = Assert-Or-Create 'cr664_clientrelationships' `
    "`$select=cr664_clientrelationshipid,cr664_clientname&`$filter=cr664_clientname eq 'CERTIFICATION - OGB Option A Positive'" `
    @{ cr664_clientname = 'CERTIFICATION - OGB Option A Positive'; cr664_borrowertype = 788190001 } `
    'cr664_clientrelationshipid' 'positive certification client'
  $negativeClient = Assert-Or-Create 'cr664_clientrelationships' `
    "`$select=cr664_clientrelationshipid,cr664_clientname&`$filter=cr664_clientname eq 'CERTIFICATION - OGB Option A Negative'" `
    @{ cr664_clientname = 'CERTIFICATION - OGB Option A Negative'; cr664_borrowertype = 788190001 } `
    'cr664_clientrelationshipid' 'negative certification client'

  $dealName = "CERTIFICATION - $CertificationKey - POSITIVE"
  $dealBody = @{
    cr664_dealname = $dealName
    cr664_amount = 1000
    cr664_stageentrydate = [DateTime]::UtcNow.ToString('o')
    'cr664_StageReference@odata.bind' = "/cr664_dealstagereferences($($stages['INTAKE'].cr664_dealstagereferenceid))"
    'cr664_StatusReference@odata.bind' = "/cr664_dealstatusreferences($($openStatus.cr664_dealstatusreferenceid))"
    'cr664_AssignedBanker@odata.bind' = "/cr664_bankers($($banker.cr664_bankerid))"
    'cr664_Client@odata.bind' = "/cr664_clientrelationships($($client.cr664_clientrelationshipid))"
    'cr664_ProductTypeReference@odata.bind' = "/cr664_producttypereferences($($product.cr664_producttypereferenceid))"
    'cr664_RiskLevelReference@odata.bind' = "/cr664_riskratingreferences($($risk.cr664_riskratingreferenceid))"
    cr664_industry = 788190000
    cr664_collateralsummary = 'Eligible first-lien commercial real estate collateral; certification only.'
    cr664_geography = 'US'
    cr664_haspolicyexception = $false
    cr664_policyexceptiontypesjson = '[]'
    cr664_insiderstatus = $false
    cr664_concentrationjson = '[]'
    cr664_governmentguaranteedprogram = 'NONE'
    cr664_criticizedclassifiedstatus = 'NONE'
  }
  $deal = Assert-Or-Create 'cr664_loandeals' `
    "`$select=cr664_loandealid,cr664_dealname&`$filter=cr664_dealname eq '$(Escape-OData $dealName)'" `
    $dealBody 'cr664_loandealid' 'positive certification deal'
  $dealId = [string]$deal.cr664_loandealid

  Patch-Row 'cr664_loandeals' $dealId @{
    cr664_riskratinginputs = '{"rating":"PASS","source":"LIVE_CERTIFICATION"}'
    'cr664_StageReference@odata.bind' = "/cr664_dealstagereferences($($stages['UNDERWRITING'].cr664_dealstagereferenceid))"
    cr664_stageentrydate = [DateTime]::UtcNow.ToString('o')
  }
  Patch-Row 'cr664_loandeals' $dealId @{
    cr664_underwritingrecommendationinputs = '{"recommendation":"APPROVE","source":"LIVE_CERTIFICATION"}'
    'cr664_StageReference@odata.bind' = "/cr664_dealstagereferences($($stages['CREDIT_APPROVAL'].cr664_dealstagereferenceid))"
    cr664_stageentrydate = [DateTime]::UtcNow.ToString('o')
  }

  $approvalCorrelation = "$CertificationKey-APPROVE"
  Assert-Or-Create 'cr664_creditapprovaldecisions' `
    "`$select=cr664_creditapprovaldecisionid,cr664_decisionid&`$filter=cr664_correlationid eq '$(Escape-OData $approvalCorrelation)'" `
    @{
      cr664_decisionid = $approvalCorrelation
      cr664_dealid = $dealId
      cr664_decisionstatus = 'APPROVED'
      cr664_approvedamount = 1000
      cr664_decidedby = 'mpaller@oldglorybank.com'
      cr664_decidedat = [DateTime]::UtcNow.ToString('o')
      cr664_correlationid = $approvalCorrelation
    } 'cr664_creditapprovaldecisionid' 'approval decision' | Out-Null
  Set-Stage $dealId $stages['COMMITMENT']

  $commitCorrelation = "$CertificationKey-COMMIT"
  Assert-Or-Create 'cr664_commitmentrecords' `
    "`$select=cr664_commitmentrecordid,cr664_commitmentid&`$filter=cr664_correlationid eq '$(Escape-OData $commitCorrelation)'" `
    @{
      cr664_commitmentid = $commitCorrelation
      cr664_dealid = $dealId
      cr664_commitmentstatus = 'AUTHORIZED'
      cr664_approvedamount = 1000
      cr664_correlationid = $commitCorrelation
    } 'cr664_commitmentrecordid' 'commitment record' | Out-Null
  Set-Stage $dealId $stages['DOCUMENTATION']

  $closeCorrelation = "$CertificationKey-CLOSE"
  Assert-Or-Create 'cr664_bookingqcchecks' `
    "`$select=cr664_bookingqccheckid,cr664_checkid&`$filter=cr664_correlationid eq '$(Escape-OData $closeCorrelation)'" `
    @{
      cr664_checkid = $closeCorrelation
      cr664_dealid = $dealId
      cr664_qcstatus = 'CERTIFIED'
      cr664_correlationid = $closeCorrelation
    } 'cr664_bookingqccheckid' 'closing QC record' | Out-Null
  Set-Stage $dealId $stages['CLOSING_FUNDING']

  $fundCorrelation = "$CertificationKey-FUNDING-NO-FUNDS"
  $funding = Assert-Or-Create 'cr664_fundingauthorizations' `
    "`$select=cr664_fundingauthorizationid,cr664_recordid,cr664_fundingdate&`$filter=cr664_correlationid eq '$(Escape-OData $fundCorrelation)'" `
    @{
      cr664_recordid = $fundCorrelation
      cr664_dealid = $dealId
      cr664_requestedamount = 1000
      cr664_authorizationstatus = 'CERTIFICATION_PENDING_NO_FUNDS'
      cr664_correlationid = $fundCorrelation
    } 'cr664_fundingauthorizationid' 'no-funds authorization record'
  $fundingId = [string]$funding.cr664_fundingauthorizationid
  Patch-Row 'cr664_fundingauthorizations' $fundingId @{
    cr664_authorizedby = 'mpaller@oldglorybank.com'
    cr664_approvedamount = 1000
    cr664_authorizedat = [DateTime]::UtcNow.ToString('o')
    cr664_authorizationstatus = 'CERTIFICATION_AUTHORIZED_NO_FUNDS'
  }
  Patch-Row 'cr664_fundingauthorizations' $fundingId @{
    cr664_fundingdate = [DateTime]::UtcNow.ToString('o')
    cr664_authorizationstatus = 'CERTIFICATION_CONFIRMED_NO_FUNDS'
  }

  $boardedName = "CERTIFICATION - $CertificationKey - BOARDED"
  $boarded = Assert-Or-Create 'cr664_portfolioboardedloans' `
    "`$select=cr664_portfolioboardedloanid,cr664_name&`$filter=cr664_name eq '$(Escape-OData $boardedName)'" `
    @{
      cr664_name = $boardedName
      cr664_originateddealid = $dealId
      'cr664_OriginatedLoanDeal@odata.bind' = "/cr664_loandeals($dealId)"
      'cr664_Client@odata.bind' = "/cr664_clientrelationships($($client.cr664_clientrelationshipid))"
      cr664_originalcommitmentamount = 1000
      cr664_boardingstatus = 'CERTIFIED'
      cr664_loanstatus = 'ACTIVE_CERTIFICATION_NO_FUNDS'
    } 'cr664_portfolioboardedloanid' 'boarded certification loan'
  $boardedId = [string]$boarded.cr664_portfolioboardedloanid
  Patch-Row 'cr664_portfolioboardedloans' $boardedId @{
    'cr664_AssignedServicingOwner@odata.bind' = "/systemusers($($systemUser.systemuserid))"
  }
  Patch-Row 'cr664_loandeals' $dealId @{
    'cr664_StageReference@odata.bind' = "/cr664_dealstagereferences($($stages['BOARDED'].cr664_dealstagereferenceid))"
    'cr664_StatusReference@odata.bind' = "/cr664_dealstatusreferences($($boardedStatus.cr664_dealstatusreferenceid))"
    cr664_stageentrydate = [DateTime]::UtcNow.ToString('o')
  }

  $negativeBase = @{} + $dealBody
  $negativeBase['cr664_dealname'] = "CERTIFICATION - $CertificationKey - NEGATIVE"
  $negativeBase['cr664_Client@odata.bind'] = "/cr664_clientrelationships($($negativeClient.cr664_clientrelationshipid))"
  Expect-Blocked 'amount above individual authority' {
    $body = @{} + $negativeBase; $body.cr664_dealname += '-AMOUNT'; $body.cr664_amount = 1000001
    Post-Row 'cr664_loandeals' $body | Out-Null
  }
  Expect-Blocked 'unsecured credit' {
    $body = @{} + $negativeBase; $body.cr664_dealname += '-UNSECURED'; $body.cr664_collateralsummary = ''
    Post-Row 'cr664_loandeals' $body | Out-Null
  }
  Expect-Blocked 'policy exception' {
    $body = @{} + $negativeBase; $body.cr664_dealname += '-EXCEPTION'; $body.cr664_haspolicyexception = $true; $body.cr664_policyexceptiontypesjson = '["COLLATERAL"]'
    Post-Row 'cr664_loandeals' $body | Out-Null
  }
  Expect-Blocked 'insider lending' {
    $body = @{} + $negativeBase; $body.cr664_dealname += '-INSIDER'; $body.cr664_insiderstatus = $true
    Post-Row 'cr664_loandeals' $body | Out-Null
  }
  Expect-Blocked 'criticized or classified credit' {
    $body = @{} + $negativeBase; $body.cr664_dealname += '-CLASSIFIED'; $body.cr664_criticizedclassifiedstatus = 'SUBSTANDARD'
    Post-Row 'cr664_loandeals' $body | Out-Null
  }
  Expect-Blocked 'excluded product' {
    $body = @{} + $negativeBase; $body.cr664_dealname += '-PRODUCT'
    $body['cr664_ProductTypeReference@odata.bind'] = "/cr664_producttypereferences($($excludedProduct.cr664_producttypereferenceid))"
    Post-Row 'cr664_loandeals' $body | Out-Null
  }
  Expect-Blocked 'direct governance duplicate write' {
    Post-Row 'cr664_governanceroleassignments' @{
      cr664_name = 'DUPLICATE-CERTIFICATION-ATTEMPT'
      'cr664_Governanceprofile@odata.bind' = "/cr664_creditgovernanceprofiles($($profile.cr664_creditgovernanceprofileid))"
      'cr664_Officer@odata.bind' = "/systemusers($($systemUser.systemuserid))"
      cr664_assignmentid = 'ogb-option-a-matthew-authorized-officer'
      cr664_rolecode = 'OGB_AUTHORIZED_OFFICER'
      cr664_effectivefrom = '2026-07-30T00:00:00.000Z'
      cr664_assignmentstate = 'ACTIVE'
    } | Out-Null
  }

  $actions = @('ORIGINATE','UNDERWRITE','RECOMMEND','APPROVE','COMMIT','CLOSE','AUTHORIZE_FUNDING','CONFIRM_DISBURSEMENT','BOARD','SERVICE')
  foreach ($action in $actions) {
    $timelineTitle = "$CertificationKey | GOVERNANCE | $action"
    $existingTimeline = @(Get-Rows "cr664_dealtimelineevents?`$select=cr664_dealtimelineeventid&`$filter=cr664_title eq '$(Escape-OData $timelineTitle)'")
    if ($existingTimeline.Count -eq 0) {
      Post-Row 'cr664_dealtimelineevents' @{
        cr664_title = $timelineTitle
        cr664_eventat = [DateTime]::UtcNow.ToString('o')
        cr664_eventtype = 788190002
        cr664_eventsubtype = "CONFIGURABLE_GOVERNANCE_$action"
        cr664_issystemgenerated = $true
        'cr664_Deal@odata.bind' = "/cr664_loandeals($dealId)"
        'cr664_EventBy@odata.bind' = "/cr664_users($platformUserId)"
      } | Out-Null
    }
  }
  $auditName = "$CertificationKey | CONFIGURABLE GOVERNANCE CERTIFIED"
  $existingAudit = @(Get-Rows "cr664_auditevents?`$select=cr664_auditeventid&`$filter=cr664_auditeventname eq '$(Escape-OData $auditName)'")
  if ($existingAudit.Count -eq 0) {
    Post-Row 'cr664_auditevents' @{
      cr664_auditeventname = $auditName
      cr664_eventcategory = 788190002
      cr664_eventtype = 788190007
      cr664_correlationid = $CertificationKey
      cr664_fieldname = 'CONFIGURABLE_GOVERNANCE_LIFECYCLE'
      cr664_changedbyname = 'Matthew Paller'
      'cr664_LoanDeal@odata.bind' = "/cr664_loandeals($dealId)"
      'cr664_ActorUser@odata.bind' = "/cr664_users($platformUserId)"
    } | Out-Null
  }

  $evaluations = @(Get-Rows "cr664_governanceevaluations?`$select=cr664_evaluationid,cr664_actioncode,cr664_decisioncode,_cr664_actor_value,_cr664_loandeal_value,cr664_requestsha256,cr664_resultsha256&`$filter=_cr664_loandeal_value eq $dealId")
  $evidence = @(Get-Rows "cr664_governedactionevidences?`$select=cr664_evidenceid,cr664_actioncode,_cr664_actor_value,_cr664_loandeal_value,cr664_evidencesha256&`$filter=_cr664_loandeal_value eq $dealId")
  $timeline = @(Get-Rows "cr664_dealtimelineevents?`$select=cr664_dealtimelineeventid,_cr664_deal_value,_cr664_eventby_value&`$filter=startswith(cr664_title,'$(Escape-OData $CertificationKey) | GOVERNANCE |')")
  $audit = @(Get-Rows "cr664_auditevents?`$select=cr664_auditeventid,_cr664_loandeal_value,_cr664_actoruser_value&`$filter=cr664_correlationid eq '$(Escape-OData $CertificationKey)'")
  if (
    $evaluations.Count -ne 10 -or $evidence.Count -ne 10 -or
    @($evaluations | Where-Object {
      $_.cr664_decisioncode -ne 'PERMIT' -or $_._cr664_actor_value -ne $systemUser.systemuserid -or
      [string]::IsNullOrWhiteSpace([string]$_.cr664_requestsha256) -or [string]::IsNullOrWhiteSpace([string]$_.cr664_resultsha256)
    }).Count -ne 0 -or
    @($evidence | Where-Object {
      $_._cr664_actor_value -ne $systemUser.systemuserid -or [string]::IsNullOrWhiteSpace([string]$_.cr664_evidencesha256)
    }).Count -ne 0 -or
    $timeline.Count -ne 10 -or $audit.Count -ne 1
  ) { throw "Evidence reconciliation failed: evaluations=$($evaluations.Count) evidence=$($evidence.Count) timeline=$($timeline.Count) audit=$($audit.Count)." }
  $actualActions = @($evidence.cr664_actioncode | Sort-Object -Unique)
  foreach ($action in $actions) {
    if ($action -notin $actualActions) { throw "Missing durable action evidence for $action." }
  }
  Write-Host "PASS deal=$dealId boardedLoan=$boardedId evaluations=10 actionEvidence=10 timeline=10 audit=1 actor=$($systemUser.systemuserid) negativeControls=7 noFunds=true"
} catch {
  try { Disable-ConfigurableSteps } catch { Write-Warning 'Automatic configurable-step rollback also failed.' }
  throw
} finally {
  $token = $null
}
