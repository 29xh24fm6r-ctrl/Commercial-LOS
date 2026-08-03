<# Creates explicit effective-dated Copilot tool permissions for one real Dataverse user. Dry-run by default. #>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$UserUpn,
  [Parameter(Mandatory)][string]$BankId,
  [Parameter(Mandatory)][ValidateSet('research_party','build_credit_evidence_packet','explain_governance_route','relationship_intelligence','portfolio_monitoring','policy_intelligence')][string[]]$Tools,
  [Parameter(Mandatory)][datetime]$EffectiveFrom,
  [datetime]$EffectiveThrough,
  [switch]$Apply,
  [switch]$Force,
  [string]$ApprovedPermissionSetSha256
)
. (Join-Path $PSScriptRoot '_common.ps1')
if($UserUpn -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$'){throw 'A real user UPN is required.'}
if([string]::IsNullOrWhiteSpace($BankId)){throw 'BankId is required.'}
$normalizedTools=@($Tools|Sort-Object -Unique)
if($normalizedTools.Count-ne $Tools.Count){throw 'Duplicate tools are not allowed.'}
$from=$EffectiveFrom.ToUniversalTime();$through=if($PSBoundParameters.ContainsKey('EffectiveThrough')){$EffectiveThrough.ToUniversalTime()}else{$null}
if($through -and $through-le $from){throw 'EffectiveThrough must follow EffectiveFrom.'}
$canonical="v1|$($UserUpn.Trim().ToLowerInvariant())|$($BankId.Trim().ToLowerInvariant())|$($from.ToString('o'))|$(if($through){$through.ToString('o')}else{'none'})|$($normalizedTools -join ',')"
$bytes=[Text.Encoding]::UTF8.GetBytes($canonical);$sha=[Security.Cryptography.SHA256]::Create()
try{$permissionHash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
Write-Host ("Mode={0} upn={1} bank={2} tools={3} permissionSetSha256={4}" -f $(if($Apply){'APPLY'}else{'DRY_RUN'}),$UserUpn,$BankId,($normalizedTools-join ','),$permissionHash)
if(-not $Apply){Write-Host 'NO MUTATION: explicit permission set validated.';exit 0}
if([string]::IsNullOrWhiteSpace($ApprovedPermissionSetSha256)-or$permissionHash-ne$ApprovedPermissionSetSha256.Trim().ToLowerInvariant()){throw 'Permission-set approval hash mismatch.'}
$environment=Resolve-DataverseEnv;$orgUrl=$environment.OrgUrl.TrimEnd('/');$token=Get-DataverseToken $orgUrl
if(-not(Test-DataverseToken $orgUrl $token)){throw 'Dataverse authentication failed.'}
if(-not(Confirm-Mutation $true $Force.IsPresent $orgUrl)){throw 'Operator declined mutation.'}
$api="$orgUrl/api/data/v9.2";$headers=@{Authorization="Bearer $token";'OData-MaxVersion'='4.0';'OData-Version'='4.0';Accept='application/json';'Content-Type'='application/json';Prefer='return=representation'}
function Esc([string]$v){$v.Replace("'","''")}
function Rows([string]$path){@((Invoke-RestMethod -Method Get -Uri "$api/$path" -Headers $headers).value)}
try{
  $users=Rows "systemusers?`$select=systemuserid,domainname,internalemailaddress,isdisabled&`$filter=(domainname eq '$(Esc $UserUpn)' or internalemailaddress eq '$(Esc $UserUpn)')"
  $users=@($users|Where-Object{-not $_.isdisabled})
  if($users.Count-ne 1){throw "Expected one enabled Dataverse identity for $UserUpn; found $($users.Count)."}
  $actorId=[string]$users[0].systemuserid
  foreach($tool in $normalizedTools){
    $existing=Rows "cr664_creditintelligencepermissions?`$select=cr664_creditintelligencepermissionid,cr664_effectivefrom,cr664_effectivethrough,statecode&`$filter=_cr664_actor_value eq $actorId and cr664_tool eq '$(Esc $tool)' and cr664_bankid eq '$(Esc $BankId)' and statecode eq 0"
    $overlap=@($existing|Where-Object{([datetime]$_.cr664_effectivefrom)-le$(if($through){$through}else{[datetime]::MaxValue}) -and (-not $_.cr664_effectivethrough -or ([datetime]$_.cr664_effectivethrough)-ge$from)})
    if($overlap.Count){throw "An effective permission already overlaps for $tool."}
    $seed="permission|$actorId|$($BankId.ToLowerInvariant())|$tool|$($from.ToString('o'))";$seedBytes=[Text.Encoding]::UTF8.GetBytes($seed);$idSha=[Security.Cryptography.SHA256]::Create()
    try{$idBytes=$idSha.ComputeHash($seedBytes)[0..15]}finally{$idSha.Dispose()};$permissionId=[guid]::new($idBytes)
    $body=@{cr664_name="$UserUpn | $tool";cr664_tool=$tool;cr664_bankid=$BankId;cr664_effectivefrom=$from.ToString('o');'cr664_actor@odata.bind'="/systemusers($actorId)"}
    if($through){$body.cr664_effectivethrough=$through.ToString('o')}
    Invoke-RestMethod -Method Put -Uri "$api/cr664_creditintelligencepermissions($permissionId)" -Headers $headers -Body($body|ConvertTo-Json -Depth 8)|Out-Null
  }
  $readback=Rows "cr664_creditintelligencepermissions?`$select=cr664_tool,cr664_bankid,cr664_effectivefrom,cr664_effectivethrough,_cr664_actor_value,statecode&`$filter=_cr664_actor_value eq $actorId and cr664_bankid eq '$(Esc $BankId)' and statecode eq 0"
  foreach($tool in $normalizedTools){if(@($readback|Where-Object cr664_tool -eq $tool).Count-ne 1){throw "Permission readback failed for $tool."}}
  Write-Host "PASS actor=$actorId permissionSetSha256=$permissionHash tools=$($normalizedTools.Count)"
}finally{$token=$null}
