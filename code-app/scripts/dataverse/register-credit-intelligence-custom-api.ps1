<# Hash-gated registration of the credit-intelligence IPlugin type and unbound Dataverse Custom API. #>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedAssemblySha256,
  [string]$ExpectedManifestSha256,
  [string]$AssemblyPath='dataverse-plugins\CommercialLendingLOS.Plugins\bin\Release\net462\CommercialLendingLOS.Plugins.dll',
  [string]$ManifestPath='dataverse-plugins\CommercialLendingLOS.Plugins\CreditIntelligenceCustomApiRegistration.json'
)
. (Join-Path $PSScriptRoot '_common.ps1')
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$dll=(Resolve-Path (Join-Path $repo $AssemblyPath)).Path
$manifestFile=(Resolve-Path (Join-Path $repo $ManifestPath)).Path
$dllHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $dll).Hash.ToLowerInvariant()
$manifestHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $manifestFile).Hash.ToLowerInvariant()
$manifest=Get-Content -Raw -LiteralPath $manifestFile|ConvertFrom-Json
if($Apply -and ($dllHash -ne $ExpectedAssemblySha256.Trim().ToLowerInvariant() -or $manifestHash -ne $ExpectedManifestSha256.Trim().ToLowerInvariant())){throw 'Artifact hash mismatch.'}
Write-Host ("Mode={0} assemblySha256={1} manifestSha256={2} customApi={3}" -f $(if($Apply){'APPLY'}else{'DRY_RUN'}),$dllHash,$manifestHash,$manifest.uniqueName)
if(-not $Apply){Write-Host 'NO MUTATION: registration package validated.';exit 0}
$environment=Resolve-DataverseEnv;$orgUrl=$environment.OrgUrl.TrimEnd('/');$token=Get-DataverseToken $orgUrl
if(-not(Test-DataverseToken $orgUrl $token)){throw 'Dataverse authentication failed.'}
if(-not(Confirm-Mutation $true $Force.IsPresent $orgUrl)){throw 'Operator declined mutation.'}
$api="$orgUrl/api/data/v9.2";$headers=@{Authorization="Bearer $token";'OData-MaxVersion'='4.0';'OData-Version'='4.0';Accept='application/json';'Content-Type'='application/json';Prefer='return=representation'}
function Esc([string]$v){$v.Replace("'","''")}
function Rows([string]$path){@((Invoke-RestMethod -Method Get -Uri "$api/$path" -Headers $headers).value)}
function Post([string]$set,[hashtable]$body){Invoke-RestMethod -Method Post -Uri "$api/$set" -Headers $headers -Body($body|ConvertTo-Json -Depth 15)}
function Patch([string]$set,[string]$id,[hashtable]$body){Invoke-RestMethod -Method Patch -Uri "$api/$set($id)" -Headers $headers -Body($body|ConvertTo-Json -Depth 15)|Out-Null}
function One($rows,[string]$label){if(@($rows).Count-ne 1){throw "Expected one $label; found $(@($rows).Count)."};@($rows)[0]}
try{
  $bytes=[IO.File]::ReadAllBytes($dll);$assemblyName=[Reflection.AssemblyName]::GetAssemblyName($dll);$pkt=($assemblyName.GetPublicKeyToken()|ForEach-Object{$_.ToString('x2')})-join ''
  if(-not $pkt){throw 'Assembly must be strong-name signed.'}
  $assemblyRows=Rows "pluginassemblies?`$select=pluginassemblyid&`$filter=name eq '$(Esc $manifest.assemblyName)'"
  $assemblyBody=@{name=$manifest.assemblyName;content=[Convert]::ToBase64String($bytes);isolationmode=2;sourcetype=0;version=$assemblyName.Version.ToString();culture='';publickeytoken=$pkt}
  if($assemblyRows.Count-eq 0){$assemblyId=[string](Post pluginassemblies $assemblyBody).pluginassemblyid}else{$assemblyId=[string](One $assemblyRows 'plugin assembly').pluginassemblyid;Patch pluginassemblies $assemblyId $assemblyBody}
  $typeRows=Rows "plugintypes?`$select=plugintypeid&`$filter=typename eq '$(Esc $manifest.pluginType)'"
  if($typeRows.Count-eq 0){$short=($manifest.pluginType-split '\.')[-1];$typeId=[string](Post plugintypes @{typename=$manifest.pluginType;name=$short;friendlyname=$short;'pluginassemblyid@odata.bind'="/pluginassemblies($assemblyId)"}).plugintypeid}else{$typeId=[string](One $typeRows 'plugin type').plugintypeid}
  $apiRows=Rows "customapis?`$select=customapiid,uniquename&`$filter=uniquename eq '$(Esc $manifest.uniqueName)'"
  $apiBody=@{uniquename=$manifest.uniqueName;name=$manifest.uniqueName;displayname=$manifest.displayName;description=$manifest.description;bindingtype=[int]$manifest.bindingType;allowedcustomprocessingsteptype=[int]$manifest.allowedCustomProcessingStepType;isfunction=[bool]$manifest.isFunction;isprivate=[bool]$manifest.isPrivate;executeprivilegename=$manifest.executePrivilegeName;'PluginTypeId@odata.bind'="/plugintypes($typeId)"}
  if($apiRows.Count-eq 0){$customApiId=[string](Post customapis $apiBody).customapiid}else{$customApiId=[string](One $apiRows 'custom API').customapiid;Patch customapis $customApiId $apiBody}
  foreach($parameter in @($manifest.requestParameters)){
    $rows=Rows "customapirequestparameters?`$select=customapirequestparameterid&`$filter=_customapiid_value eq $customApiId and uniquename eq '$(Esc $parameter.uniqueName)'"
    $body=@{uniquename=$parameter.uniqueName;name=$parameter.uniqueName;displayname=$parameter.displayName;type=[int]$parameter.type;isoptional=[bool]$parameter.isOptional;'CustomAPIId@odata.bind'="/customapis($customApiId)"}
    if($rows.Count-eq 0){Post customapirequestparameters $body|Out-Null}else{Patch customapirequestparameters ([string](One $rows "request parameter $($parameter.uniqueName)").customapirequestparameterid) $body}
  }
  foreach($property in @($manifest.responseProperties)){
    $rows=Rows "customapiresponseproperties?`$select=customapiresponsepropertyid&`$filter=_customapiid_value eq $customApiId and uniquename eq '$(Esc $property.uniqueName)'"
    $body=@{uniquename=$property.uniqueName;name=$property.uniqueName;displayname=$property.displayName;type=[int]$property.type;'CustomAPIId@odata.bind'="/customapis($customApiId)"}
    if($rows.Count-eq 0){Post customapiresponseproperties $body|Out-Null}else{Patch customapiresponseproperties ([string](One $rows "response property $($property.uniqueName)").customapiresponsepropertyid) $body}
  }
  $readback=One (Rows "customapis?`$select=customapiid,uniquename,bindingtype,allowedcustomprocessingsteptype,isfunction,isprivate,_plugintypeid_value&`$filter=customapiid eq $customApiId") 'custom API readback'
  if($readback.uniquename-ne$manifest.uniqueName-or [string]$readback._plugintypeid_value-ne$typeId){throw 'Custom API readback failed.'}
  Write-Host "PASS customApiId=$customApiId pluginTypeId=$typeId assemblySha256=$dllHash manifestSha256=$manifestHash"
}finally{$token=$null}
