<# Creates one explicit, effective-dated mailbox automation permission. Dry-run by default. #>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [Parameter(Mandatory=$true)][string]$MailboxId,
  [Parameter(Mandatory=$true)][string]$ServiceActorUpn,
  [Parameter(Mandatory=$true)][string]$CoreUserEmail,
  [Parameter(Mandatory=$true)][datetime]$EffectiveFrom,
  [Nullable[datetime]]$EffectiveThrough,
  [decimal]$MinimumConfidence = 0.90,
  [int]$MaximumMessageAgeHours = 24,
  [int]$DefaultDueHours = 24,
  [string[]]$AllowedCategories = @('document_request','loan_information_request','servicing_request'),
  [switch]$AutomaticTaskCreation,
  [string]$ExpectedApprovalSha256
)
. (Join-Path $PSScriptRoot '_common.ps1')
$mailbox=$MailboxId.Trim().ToLowerInvariant();$upn=$ServiceActorUpn.Trim().ToLowerInvariant();$coreEmail=$CoreUserEmail.Trim().ToLowerInvariant()
$allowed=@($AllowedCategories|ForEach-Object{$_.Trim().ToLowerInvariant()}|Sort-Object -Unique)
$known=@('document_request','payment_or_payoff_question','loan_information_request','servicing_request','complaint','suspected_fraud','other')
if(-not $mailbox.Contains('@')-or-not $upn.Contains('@')-or-not $coreEmail.Contains('@')){throw 'Mailbox, service actor, and core-user email must be explicit email addresses.'}
if($MinimumConfidence-lt 0-or$MinimumConfidence-gt 1){throw 'MinimumConfidence must be between 0 and 1.'}
if($MaximumMessageAgeHours-lt 1-or$DefaultDueHours-lt 1){throw 'Age and due-hour values must be positive.'}
if(@($allowed|Where-Object{$_-notin$known}).Count){throw 'Unknown service-request category.'}
if($EffectiveThrough.HasValue-and$EffectiveThrough.Value-le$EffectiveFrom){throw 'EffectiveThrough must follow EffectiveFrom.'}
$canonical=[ordered]@{mailboxId=$mailbox;serviceActorUpn=$upn;coreUserEmail=$coreEmail;effectiveFrom=$EffectiveFrom.ToUniversalTime().ToString('o');effectiveThrough=$(if($EffectiveThrough.HasValue){$EffectiveThrough.Value.ToUniversalTime().ToString('o')}else{$null});minimumConfidence=$MinimumConfidence;maximumMessageAgeHours=$MaximumMessageAgeHours;defaultDueHours=$DefaultDueHours;allowedCategories=$allowed;automaticTaskCreation=$AutomaticTaskCreation.IsPresent}
$json=$canonical|ConvertTo-Json -Compress
$sha=[Security.Cryptography.SHA256]::Create();try{$approvalHash=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($json))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
Write-Host "Mode=$(if($Apply){'APPLY'}else{'DRY_RUN'}) approvalSha256=$approvalHash mailbox=$mailbox actor=$upn autoCreate=$($AutomaticTaskCreation.IsPresent)"
if(-not$Apply){Write-Host 'NO MUTATION: explicit mailbox permission validated.';exit 0}
if([string]::IsNullOrWhiteSpace($ExpectedApprovalSha256)-or$ExpectedApprovalSha256.Trim().ToLowerInvariant()-ne$approvalHash){throw 'Permission approval hash mismatch or missing expected hash.'}
$environment=Resolve-DataverseEnv;$orgUrl=$environment.OrgUrl.TrimEnd('/');$token=Get-DataverseToken $orgUrl
if(-not(Test-DataverseToken $orgUrl $token)){throw 'Dataverse authentication failed.'}
if(-not(Confirm-Mutation $true $Force.IsPresent $orgUrl)){throw 'Operator declined mutation.'}
$api="$orgUrl/api/data/v9.2";$headers=@{Authorization="Bearer $token";'OData-MaxVersion'='4.0';'OData-Version'='4.0';Accept='application/json';'Content-Type'='application/json';Prefer='return=representation'}
function Esc([string]$value){$value.Replace("'","''")}
function Rows([string]$path){@((Invoke-RestMethod -Method Get -Uri "$api/$path" -Headers $headers).value)}
function One($rows,[string]$label){if(@($rows).Count-ne 1){throw "Expected one $label; found $(@($rows).Count)."};@($rows)[0]}
try{
  $actor=One (Rows "systemusers?`$select=systemuserid,isdisabled,domainname,internalemailaddress&`$filter=(domainname eq '$(Esc $upn)' or internalemailaddress eq '$(Esc $upn)')") 'enabled service systemuser'
  if($actor.isdisabled){throw 'Service systemuser is disabled.'}
  $core=One (Rows "cr664_users?`$select=cr664_userid,cr664_email&`$filter=cr664_email eq '$(Esc $coreEmail)'") 'core audit user'
  $overlap=Rows "cr664_emailautomationpermissions?`$select=cr664_emailautomationpermissionid,cr664_effectivefrom,cr664_effectivethrough,statecode&`$filter=_cr664_serviceactor_value eq $($actor.systemuserid) and cr664_mailboxid eq '$(Esc $mailbox)' and statecode eq 0"
  foreach($row in $overlap){$from=[datetime]$row.cr664_effectivefrom;$through=if($row.cr664_effectivethrough){[datetime]$row.cr664_effectivethrough}else{[datetime]::MaxValue};$newThrough=if($EffectiveThrough.HasValue){$EffectiveThrough.Value}else{[datetime]::MaxValue};if($from-lt$newThrough-and$EffectiveFrom-lt$through){throw 'An overlapping active mailbox permission already exists.'}}
  $idSha=[Security.Cryptography.SHA256]::Create();try{[byte[]]$idBytes=$idSha.ComputeHash([Text.Encoding]::UTF8.GetBytes("email-permission|$approvalHash"))[0..15]}finally{$idSha.Dispose()};$permissionId=[Guid]::new($idBytes)
  $body=@{cr664_emailautomationpermissionid=$permissionId;cr664_name="$mailbox | $upn";cr664_mailboxid=$mailbox;cr664_automatictaskcreation=$AutomaticTaskCreation.IsPresent;cr664_minimumconfidence=$MinimumConfidence;cr664_maximumagehours=$MaximumMessageAgeHours;cr664_defaultduehours=$DefaultDueHours;cr664_allowedcategoriescsv=($allowed-join',');cr664_effectivefrom=$EffectiveFrom.ToUniversalTime().ToString('o');'cr664_serviceactor@odata.bind'="/systemusers($($actor.systemuserid))";'cr664_coreuser@odata.bind'="/cr664_users($($core.cr664_userid))"}
  if($EffectiveThrough.HasValue){$body.cr664_effectivethrough=$EffectiveThrough.Value.ToUniversalTime().ToString('o')}
  $created=Invoke-RestMethod -Method Post -Uri "$api/cr664_emailautomationpermissions" -Headers $headers -Body($body|ConvertTo-Json -Depth 8)
  $readback=One (Rows "cr664_emailautomationpermissions?`$select=cr664_emailautomationpermissionid,cr664_mailboxid,cr664_automatictaskcreation,cr664_minimumconfidence,cr664_allowedcategoriescsv&`$filter=cr664_emailautomationpermissionid eq $permissionId") 'permission readback'
  if($readback.cr664_mailboxid-ne$mailbox-or[decimal]$readback.cr664_minimumconfidence-ne$MinimumConfidence){throw 'Permission readback failed.'}
  Write-Host "PASS permissionId=$permissionId approvalSha256=$approvalHash"
}finally{$token=$null}
