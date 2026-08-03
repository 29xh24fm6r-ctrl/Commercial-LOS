<# Hash-gated registration of the mailbox-automation direct task-write guard. #>
[CmdletBinding()]
param(
  [switch]$Apply,[switch]$Force,[switch]$EnableAfterApproval,
  [string]$ExpectedAssemblySha256,[string]$ExpectedManifestSha256,
  [string]$AssemblyPath='dataverse-plugins\CommercialLendingLOS.Plugins\bin\Release\net462\CommercialLendingLOS.Plugins.dll',
  [string]$ManifestPath='dataverse-plugins\CommercialLendingLOS.Plugins\EmailAutomationDirectTaskWriteGuardRegistration.json'
)
. (Join-Path $PSScriptRoot '_common.ps1')
$repo=(Resolve-Path(Join-Path $PSScriptRoot '..\..')).Path;$dll=(Resolve-Path(Join-Path $repo $AssemblyPath)).Path;$manifestFile=(Resolve-Path(Join-Path $repo $ManifestPath)).Path
$dllHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $dll).Hash.ToLowerInvariant();$manifestHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $manifestFile).Hash.ToLowerInvariant();$manifest=Get-Content -Raw $manifestFile|ConvertFrom-Json
$entities=@($manifest.steps|ForEach-Object{$_.primaryEntity}|Sort-Object -Unique)
if(@($manifest.steps).Count-ne 2-or@($manifest.steps|Where-Object{$_.message-ne'Create'-or[int]$_.stage-ne 20-or[int]$_.mode-ne 0}).Count-or@($entities).Count-ne 2-or'cr664_dealtask1'-notin$entities-or'cr664_emailservicerequestintake'-notin$entities){throw 'Guard manifest is not the approved synchronous intake/task create boundary.'}
if($Apply-and($dllHash-ne$ExpectedAssemblySha256.Trim().ToLowerInvariant()-or$manifestHash-ne$ExpectedManifestSha256.Trim().ToLowerInvariant())){throw 'Artifact hash mismatch.'}
Write-Host "Mode=$(if($Apply){'APPLY'}else{'DRY_RUN'}) assemblySha256=$dllHash manifestSha256=$manifestHash state=$(if($EnableAfterApproval){'enabled'}else{'disabled'})"
if(-not$Apply){Write-Host 'NO MUTATION: direct-write guard package validated.';exit 0}
$environment=Resolve-DataverseEnv;$orgUrl=$environment.OrgUrl.TrimEnd('/');$token=Get-DataverseToken $orgUrl
if(-not(Test-DataverseToken $orgUrl $token)){throw 'Dataverse authentication failed.'};if(-not(Confirm-Mutation $true $Force.IsPresent $orgUrl)){throw 'Operator declined mutation.'}
$api="$orgUrl/api/data/v9.2";$headers=@{Authorization="Bearer $token";'OData-MaxVersion'='4.0';'OData-Version'='4.0';Accept='application/json';'Content-Type'='application/json';Prefer='return=representation'}
function Esc([string]$v){$v.Replace("'","''")};function Rows([string]$path){@((Invoke-RestMethod -Method Get -Uri "$api/$path" -Headers $headers).value)};function One($rows,[string]$label){if(@($rows).Count-ne 1){throw "Expected one $label; found $(@($rows).Count)."};@($rows)[0]};function Post([string]$set,[hashtable]$body){Invoke-RestMethod -Method Post -Uri "$api/$set" -Headers $headers -Body($body|ConvertTo-Json -Depth 12)};function Patch([string]$set,[string]$id,[hashtable]$body){Invoke-RestMethod -Method Patch -Uri "$api/$set($id)" -Headers $headers -Body($body|ConvertTo-Json -Depth 12)|Out-Null}
try{
  $bytes=[IO.File]::ReadAllBytes($dll);$assemblyName=[Reflection.AssemblyName]::GetAssemblyName($dll);$pkt=($assemblyName.GetPublicKeyToken()|ForEach-Object{$_.ToString('x2')})-join'';if(-not$pkt){throw 'Assembly must be strong-name signed.'}
  $assemblyRows=Rows "pluginassemblies?`$select=pluginassemblyid&`$filter=name eq '$(Esc $manifest.assemblyName)'";$assemblyBody=@{name=$manifest.assemblyName;content=[Convert]::ToBase64String($bytes);isolationmode=2;sourcetype=0;version=$assemblyName.Version.ToString();culture='';publickeytoken=$pkt}
  if($assemblyRows.Count-eq 0){$assemblyId=[string](Post pluginassemblies $assemblyBody).pluginassemblyid}else{$assemblyId=[string](One $assemblyRows 'plugin assembly').pluginassemblyid;Patch pluginassemblies $assemblyId $assemblyBody}
  $typeRows=Rows "plugintypes?`$select=plugintypeid&`$filter=typename eq '$(Esc $manifest.pluginType)'";if($typeRows.Count-eq 0){$short=($manifest.pluginType-split'\.')[-1];$typeId=[string](Post plugintypes @{typename=$manifest.pluginType;name=$short;friendlyname=$short;'pluginassemblyid@odata.bind'="/pluginassemblies($assemblyId)"}).plugintypeid}else{$typeId=[string](One $typeRows 'guard type').plugintypeid}
  $registered=@()
  foreach($spec in @($manifest.steps)){
    $message=One (Rows "sdkmessages?`$select=sdkmessageid&`$filter=name eq '$($spec.message)'") 'Create message';$filter=One (Rows "sdkmessagefilters?`$select=sdkmessagefilterid&`$filter=_sdkmessageid_value eq $($message.sdkmessageid) and primaryobjecttypecode eq '$($spec.primaryEntity)'") "message filter $($spec.primaryEntity)"
    $stepRows=Rows "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid&`$filter=name eq '$(Esc $spec.name)'";$body=@{name=$spec.name;description='Blocks direct mailbox automation writes outside the governed Custom API.';configuration='';stage=20;mode=0;rank=1;supporteddeployment=0;filteringattributes='';'sdkmessageid@odata.bind'="/sdkmessages($($message.sdkmessageid))";'sdkmessagefilterid@odata.bind'="/sdkmessagefilters($($filter.sdkmessagefilterid))";'eventhandler_plugintype@odata.bind'="/plugintypes($typeId)"}
    if($stepRows.Count-eq 0){$stepId=[string](Post sdkmessageprocessingsteps $body).sdkmessageprocessingstepid}else{$stepId=[string](One $stepRows "guard step $($spec.primaryEntity)").sdkmessageprocessingstepid;Patch sdkmessageprocessingsteps $stepId $body};Patch sdkmessageprocessingsteps $stepId @{statecode=$(if($EnableAfterApproval){0}else{1});statuscode=$(if($EnableAfterApproval){1}else{2})}
    $readback=One (Rows "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,stage,mode,rank,statecode,_eventhandler_value&`$filter=sdkmessageprocessingstepid eq $stepId") "guard readback $($spec.primaryEntity)";if([int]$readback.stage-ne 20-or[int]$readback.mode-ne 0-or[string]$readback._eventhandler_value-ne$typeId){throw "Guard readback failed for $($spec.primaryEntity)."};$registered+="$($spec.primaryEntity):$($stepId):$($readback.statecode)"
  }
  Write-Host "PASS steps=$($registered-join',') typeId=$typeId assemblySha256=$dllHash manifestSha256=$manifestHash"
}finally{$token=$null}
