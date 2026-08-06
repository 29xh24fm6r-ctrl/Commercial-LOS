param(
  [ValidateSet('Provision','Verify')][string]$Mode='Provision',
  [switch]$Apply,[switch]$Force,
  [string]$OrgUrl='https://org3a57b8d4.crm.dynamics.com',
  [int]$KeyWaitSeconds=900
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
$ExpectedOrgUrl='https://org3a57b8d4.crm.dynamics.com'
$CreationSolutionId='f51dbff0-2e1e-f111-8341-6045bd0887e4'
$CreationSolutionName='LoanOpsExport'
$TargetSolutionId='325dd06f-e114-f111-8341-7ced8d3b874a'
$TargetSolutionName='CommercialLendingLOS'
$TableName='cr664_sharepointtransportledger'
$KeyName='cr664_sharepointtransportledger_idempotency_key'
if($OrgUrl.TrimEnd('/') -ne $ExpectedOrgUrl){throw "Environment lock failed. Expected $ExpectedOrgUrl."}
if($Mode -eq 'Verify' -and ($Apply -or $Force)){throw 'Verify is read-only; do not pass -Apply or -Force.'}
if($Apply -and -not $Force){throw 'Mutation requires both -Apply and -Force.'}
$envState=Resolve-DataverseEnv
if(-not $envState -or -not $envState.OrgUrl){throw 'Unable to resolve the authenticated Dataverse environment.'}
if($envState.OrgUrl.TrimEnd('/') -ne $ExpectedOrgUrl){throw "pac targets $($envState.OrgUrl), not $ExpectedOrgUrl."}
$token=Get-DataverseToken $ExpectedOrgUrl
if(-not(Test-DataverseToken $ExpectedOrgUrl $token)){throw 'Dataverse WhoAmI failed; no schema action was attempted.'}
$api="$($ExpectedOrgUrl.TrimEnd('/'))/api/data/v9.2"
$headers=@{Authorization="Bearer $token";Accept='application/json';'Content-Type'='application/json';'OData-MaxVersion'='4.0';'OData-Version'='4.0'}
$counts=[ordered]@{present=0;planned=0;created=0;updated=0;registered=0;failed=0}
function Label([string]$v){@{LocalizedLabels=@(@{Label=$v;LanguageCode=1033})}}
function ApiGet([string]$p){Invoke-RestMethod -Method Get -Headers $headers -Uri "$api/$p"}
function ApiPost([string]$p,$body){Invoke-RestMethod -Method Post -Headers $headers -Uri "$api/$p" -Body ($body|ConvertTo-Json -Depth 20)}
function Mark([string]$label,[string]$status,[string]$detail){
  Write-Status $label $status $detail
  switch($status){'PASS'{$script:counts.present++}'PLAN'{$script:counts.planned++}'CREATED'{$script:counts.created++}'UPDATED'{$script:counts.updated++}'REGISTERED'{$script:counts.registered++}'FAILED'{$script:counts.failed++}}
}
function Assert-Solution([string]$id,[string]$name,[string]$label,[string]$expectedPrefix=''){
  $s=ApiGet ("solutions($id)?"+'$select=solutionid,uniquename,friendlyname,ismanaged,_publisherid_value')
  if([string]$s.uniquename -ne $name){throw "$label solution ID $id resolves to '$($s.uniquename)', not '$name'."}
  if([bool]$s.ismanaged){throw "$label solution $name is managed."}
  if($expectedPrefix){
    $publisher=ApiGet ("publishers($($s._publisherid_value))?"+'$select=customizationprefix')
    if([string]$publisher.customizationprefix -cne $expectedPrefix){throw "$label publisher prefix is '$($publisher.customizationprefix)', not '$expectedPrefix'."}
  }
  Write-Status $label PASS "$name ($id)"
}
function Get-Table{
  try{ApiGet ("EntityDefinitions(LogicalName='$TableName')?"+'$select=LogicalName,SchemaName,MetadataId,OwnershipType,PrimaryNameAttribute,IsAuditEnabled')}catch{if($_.Exception.Response.StatusCode.value__ -eq 404){return $null};throw}
}
function Assert-Table($t){
  if([string]$t.OwnershipType -ne 'OrganizationOwned'){throw 'Existing ledger table is not OrganizationOwned.'}
  if([string]$t.PrimaryNameAttribute -ne 'cr664_sharepointtransportledgername'){throw 'Existing ledger primary-name column differs.'}
  if(-not [bool]$t.IsAuditEnabled.Value){throw 'Existing ledger table auditing is disabled.'}
}
function New-Table{
  $body=@{'@odata.type'='Microsoft.Dynamics.CRM.EntityMetadata';SchemaName=$TableName;LogicalName=$TableName;DisplayName=Label 'SharePoint Transport Ledger';DisplayCollectionName=Label 'SharePoint Transport Ledgers';OwnershipType='OrganizationOwned';IsAuditEnabled=@{Value=$true};HasActivities=$false;HasNotes=$false;Attributes=@(@{'@odata.type'='Microsoft.Dynamics.CRM.StringAttributeMetadata';SchemaName='cr664_sharepointtransportledgername';LogicalName='cr664_sharepointtransportledgername';MaxLength=200;FormatName=@{Value='Text'};IsPrimaryName=$true;RequiredLevel=@{Value='ApplicationRequired'};IsAuditEnabled=@{Value=$true};DisplayName=Label 'SharePoint Transport Ledger Name'})}
  ApiPost "EntityDefinitions?MSCRM.SolutionUniqueName=$CreationSolutionName" $body|Out-Null
}
$columns=@(
  @{n='cr664_idempotencykey';l='Idempotency Key';t='String';m=450;r=$true},
  @{n='cr664_correlationid';l='Correlation ID';t='String';m=100;r=$true},
  @{n='cr664_requestfingerprint';l='Request Fingerprint';t='String';m=128;r=$true},
  @{n='cr664_dealid';l='Deal ID';t='String';m=100;r=$true},
  @{n='cr664_operation';l='Operation';t='String';m=50;r=$true},
  @{n='cr664_targetpath';l='Target Path';t='Memo';r=$false},
  @{n='cr664_filename';l='File Name';t='String';m=260;r=$false},
  @{n='cr664_expectedsize';l='Expected Size';t='BigInt';r=$false},
  @{n='cr664_transportstatus';l='Transport Status';t='String';m=100;r=$true},
  @{n='cr664_sharepointitemid';l='SharePoint Item ID';t='String';m=100;r=$false},
  @{n='cr664_sharepointuniqueid';l='SharePoint Unique ID';t='String';m=100;r=$false},
  @{n='cr664_etag';l='ETag';t='String';m=250;r=$false},
  @{n='cr664_weburl';l='Web URL';t='String';m=2000;r=$false},
  @{n='cr664_startedon';l='Started On';t='DateTime';r=$false},
  @{n='cr664_completedon';l='Completed On';t='DateTime';r=$false},
  @{n='cr664_failurecode';l='Failure Code';t='String';m=100;r=$false},
  @{n='cr664_failuremessage';l='Failure Message';t='Memo';r=$false},
  @{n='cr664_filemayexist';l='File May Exist';t='Boolean';r=$false},
  @{n='cr664_reconciliationrequired';l='Reconciliation Required';t='Boolean';r=$false},
  @{n='cr664_reconciliationstatus';l='Reconciliation Status';t='String';m=100;r=$false},
  @{n='cr664_retrycount';l='Retry Count';t='Integer';r=$false},
  @{n='cr664_lastreconciledon';l='Last Reconciled On';t='DateTime';r=$false}
)
if($columns.Count -ne 22){throw 'Internal column plan must contain exactly 22 columns.'}
function Get-Column([string]$n,[string]$type){
  try {
    if($type -eq 'String'){
      $path = "EntityDefinitions(LogicalName='$TableName')/Attributes(LogicalName='$n')/Microsoft.Dynamics.CRM.StringAttributeMetadata?" +
        '$select=LogicalName,AttributeType,MaxLength,RequiredLevel'
    } else {
      $path = "EntityDefinitions(LogicalName='$TableName')/Attributes(LogicalName='$n')?" +
        '$select=LogicalName,AttributeType,RequiredLevel'
    }
    ApiGet $path
  } catch {
    if($_.Exception.Response.StatusCode.value__ -eq 404){return $null}
    throw
  }
}
function Assert-Column($a,$p){
  if([string]$a.AttributeType -ne [string]$p.t){throw "$TableName.$($p.n) type is $($a.AttributeType), expected $($p.t)."}
  if($p.t -eq 'String' -and [int]$a.MaxLength -ne [int]$p.m){throw "$TableName.$($p.n) max length differs."}
  $required=if($p.r){'ApplicationRequired'}else{'None'}
  if([string]$a.RequiredLevel.Value -ne $required){throw "$TableName.$($p.n) required level differs."}
}
function New-Column($p){
  $base=@{SchemaName=$p.n;LogicalName=$p.n;RequiredLevel=@{Value=$(if($p.r){'ApplicationRequired'}else{'None'})};DisplayName=Label $p.l;IsAuditEnabled=@{Value=$true}}
  switch($p.t){
    'String'{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.StringAttributeMetadata';MaxLength=[int]$p.m;FormatName=@{Value='Text'}}}
    'Memo'{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.MemoAttributeMetadata';MaxLength=1048576}}
    'BigInt'{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.BigIntAttributeMetadata';MinValue=[long]0;MaxValue=[long]9223372036854775807}}
    'Integer'{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.IntegerAttributeMetadata';MinValue=0;MaxValue=2147483647}}
    'DateTime'{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.DateTimeAttributeMetadata';Format='DateAndTime';DateTimeBehavior=@{Value='UserLocal'}}}
    'Boolean'{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.BooleanAttributeMetadata';DefaultValue=$false;OptionSet=@{'@odata.type'='Microsoft.Dynamics.CRM.BooleanOptionSetMetadata';TrueOption=@{Value=1;Label=Label 'Yes'};FalseOption=@{Value=0;Label=Label 'No'}}}}
    default{throw "Unsupported type $($p.t)."}
  }
  ApiPost "EntityDefinitions(LogicalName='$TableName')/Attributes?MSCRM.SolutionUniqueName=$CreationSolutionName" $body|Out-Null
}
function Get-Key{
  $filter=[uri]::EscapeDataString("SchemaName eq '$KeyName'")
  $rows=@((ApiGet ("EntityDefinitions(LogicalName='$TableName')/Keys?"+'$select=SchemaName,KeyAttributes,EntityKeyIndexStatus,MetadataId&$filter='+$filter)).value)
  if($rows.Count -eq 0){return $null};if($rows.Count -ne 1){throw "Key $KeyName is ambiguous."};$rows[0]
}
function KeyStatus($s){
  $value = [string]$s

  switch -Regex ($value.Trim()) {
    '^(0|Pending)$' { return 'Pending' }
    '^(1|In Progress|InProgress)$' { return 'In Progress' }
    '^(2|Active)$' { return 'Active' }
    '^(3|Failed)$' { return 'Failed' }
    default { return "Unknown ($value)" }
  }
}
function Assert-Key($k,[bool]$active){
  if(@($k.KeyAttributes).Count -ne 1 -or [string]$k.KeyAttributes[0] -ne 'cr664_idempotencykey'){throw 'Alternate key attributes differ.'}
  $status=KeyStatus $k.EntityKeyIndexStatus
  Write-Status $KeyName $(if($status -eq 'Active'){'PASS'}elseif($status -eq 'Failed'){'FAILED'}else{'PENDING'}) "status=$status"
  if($status -eq 'Failed'){throw "Alternate key $KeyName failed."};if($active -and $status -ne 'Active'){throw "Alternate key status is $status; Active is required."}
}
function New-Key{
  ApiPost "EntityDefinitions(LogicalName='$TableName')/Keys?MSCRM.SolutionUniqueName=$CreationSolutionName" @{'@odata.type'='Microsoft.Dynamics.CRM.EntityKeyMetadata';SchemaName=$KeyName;DisplayName=Label 'SharePoint Transport Idempotency Key';KeyAttributes=@('cr664_idempotencykey')}|Out-Null
}
function Wait-Key{
  $deadline=[DateTime]::UtcNow.AddSeconds($KeyWaitSeconds)
  do{$k=Get-Key;if($k){$s=KeyStatus $k.EntityKeyIndexStatus;Write-Status $KeyName $(if($s -eq 'Active'){'PASS'}elseif($s -eq 'Failed'){'FAILED'}else{'PENDING'}) "status=$s";if($s -eq 'Active'){return $k};if($s -eq 'Failed'){throw "Alternate key $KeyName failed."}};Start-Sleep 5}while([DateTime]::UtcNow -lt $deadline)
  throw "Alternate key did not become Active within $KeyWaitSeconds seconds."
}
function Has-Component([int]$type,[string]$id){
  $filter=[uri]::EscapeDataString("_solutionid_value eq $TargetSolutionId and componenttype eq $type and objectid eq $id")
  @((ApiGet ('solutioncomponents?'+ '$select=solutioncomponentid&$filter='+$filter)).value).Count -gt 0
}
function Ensure-Component([string]$label,[string]$id,[int]$type,[bool]$noSubs){
  if(Has-Component $type $id){Mark $label PASS 'member of CommercialLendingLOS';return}
  if($Mode -eq 'Verify'){throw "$label is not a member of CommercialLendingLOS."}
  if(-not $Apply){Mark $label PLAN 'WOULD ADD to CommercialLendingLOS';return}
  $doNotIncludeSubcomponents = ($type -eq 1)
  $body=@{
    ComponentId=$id
    ComponentType=$type
    SolutionUniqueName=$TargetSolutionName
    AddRequiredComponents=$false
    DoNotIncludeSubcomponents=$doNotIncludeSubcomponents
  }
  try{ApiPost 'AddSolutionComponent' $body|Out-Null}catch{if(-not(Has-Component $type $id)){throw}}
  if(-not(Has-Component $type $id)){throw "$label solution registration failed."}
  Mark $label REGISTERED 'added to CommercialLendingLOS'
}
$variables=@(
  @{s='cr664_OGBSharePointSiteUrl';d='OGB SharePoint Site URL';t=100000000;v='https://oldglory22.sharepoint.com/sites/BusinessLending'},
  @{s='cr664_OGBSharePointLibraryName';d='OGB SharePoint Library Name';t=100000000;v='Documents'},
  @{s='cr664_OGBSharePointGovernedRoot';d='OGB SharePoint Governed Root';t=100000000;v='/(a) Loans'},
  @{s='cr664_OGBSharePointLibraryId';d='OGB SharePoint Library ID';t=100000000;v='c1a62131-7946-44b9-bb4c-b4637a16f83c'},
  @{s='cr664_OGBSharePointGraphSiteId';d='OGB SharePoint Graph Site ID';t=100000000;v='oldglory22.sharepoint.com,fcef8a95-b6b8-4c7f-85d9-d30c4d13aa8a,2c7f7bf5-9995-48b2-93a4-137bc741cf48'},
  @{s='cr664_OGBSharePointGraphDriveId';d='OGB SharePoint Graph Drive ID';t=100000000;v='b!lYrv_Li2f0yF2dMMTROqivV7fyyVmbJIk6QTe8dBz0gxIabBRnm5RLtMtGN6Fvg8'},
  @{s='cr664_OGBSharePointGovernedRootItemId';d='OGB SharePoint Governed Root Item ID';t=100000000;v='01GLFG6KONJ5W27MKUD5AZRKTJWP2MGT5P'},
  @{s='cr664_OGBSharePointContractVersion';d='OGB SharePoint Contract Version';t=100000000;v='ogb-deal-sharepoint/v2'},
  @{s='cr664_OGBSharePointTransportMode';d='OGB SharePoint Transport Mode';t=100000000;v='DRY_RUN'},
  @{s='cr664_OGBSharePointMaxUploadBytes';d='OGB SharePoint Max Upload Bytes';t=100000001;v='26214400'}
)
function Get-Definition([string]$schema){
  $filter=[uri]::EscapeDataString("schemaname eq '$($schema.Replace("'","''"))'")
  $rows=@((ApiGet ('environmentvariabledefinitions?'+ '$select=environmentvariabledefinitionid,schemaname,type,defaultvalue,displayname&$filter='+$filter)).value)
  if($rows.Count -eq 0){return $null};if($rows.Count -ne 1){throw "$schema definition is ambiguous."};$rows[0]
}
function Get-Value([string]$id){
  $filter=[uri]::EscapeDataString("_environmentvariabledefinitionid_value eq $id and statecode eq 0")
  $rows=@((ApiGet ('environmentvariablevalues?'+ '$select=environmentvariablevalueid,value,schemaname,statecode&$filter='+$filter)).value)
  if($rows.Count -eq 0){return $null};if($rows.Count -ne 1){throw "$id has multiple active values."};$rows[0]
}
function Matches($def,$value,$plan){$def -and $value -and [int]$def.type -eq [int]$plan.t -and [string]$def.defaultvalue -ceq [string]$plan.v -and [string]$value.value -ceq [string]$plan.v}
function Ensure-Variable($p){
  $def=Get-Definition $p.s;$value=if($def){Get-Value ([string]$def.environmentvariabledefinitionid)}else{$null}
  if(Matches $def $value $p){Mark $p.s PASS 'definition and current value match'}
  elseif($Mode -eq 'Verify'){throw "$($p.s) definition or value differs."}
  elseif(-not $Apply){Mark $p.s PLAN 'WOULD UPSERT definition/current value'}
  else{ApiPost 'UpsertEnvironmentVariable' @{SchemaName=$p.s;DisplayName=$p.d;Type=[int]$p.t;DefaultValue=[string]$p.v;Value=[string]$p.v}|Out-Null;Mark $p.s $(if($def){'UPDATED'}else{'CREATED'}) 'definition/current value upserted'}
  $def=Get-Definition $p.s
  if($Apply -and -not $def){throw "$($p.s) not readable after upsert."}
  if($def){
    $value=Get-Value ([string]$def.environmentvariabledefinitionid)
    if($Apply -and -not(Matches $def $value $p)){throw "$($p.s) failed readback."}
    Ensure-Component "$($p.s) definition" ([string]$def.environmentvariabledefinitionid) 380 $true
    if($value){Ensure-Component "$($p.s) value" ([string]$value.environmentvariablevalueid) 381 $true}
    elseif($Mode -eq 'Verify' -or $Apply){throw "$($p.s) current value is missing."}
    else{Mark "$($p.s) value registration" PLAN 'WOULD ADD after value creation'}
  }else{
    Mark "$($p.s) definition registration" PLAN 'WOULD ADD after creation'
    Mark "$($p.s) value registration" PLAN 'WOULD ADD after creation'
  }
}
Write-Host '== SharePoint transport platform provisioning =='
Write-Host "Environment: $ExpectedOrgUrl"
Write-Host "Authenticated identity: $($envState.User)"
Write-Host "Creation solution: $CreationSolutionName ($CreationSolutionId)"
Write-Host "Target solution: $TargetSolutionName ($TargetSolutionId)"
Write-Host "Mode: $(if($Mode -eq 'Verify'){'VERIFY'}elseif($Apply){'APPLY'}else{'DRY_RUN'})"
Assert-Solution $CreationSolutionId $CreationSolutionName 'Creation solution' 'cr664'
Assert-Solution $TargetSolutionId $TargetSolutionName 'Target solution'
$table=Get-Table
if($table){Assert-Table $table;Mark $TableName PASS 'table exists and metadata matches'}
elseif($Mode -eq 'Verify'){throw "$TableName is missing."}
elseif(-not $Apply){Mark $TableName PLAN 'WOULD CREATE in LoanOpsExport'}
else{New-Table;Mark $TableName CREATED 'created in LoanOpsExport';$table=Get-Table;if(-not $table){throw 'Table readback failed.'};Assert-Table $table}
foreach($p in $columns){
  $a=if(Get-Table){Get-Column $p.n $p.t}else{$null}
  if($a){Assert-Column $a $p;Mark "$TableName.$($p.n)" PASS 'column exists and matches'}
  elseif($Mode -eq 'Verify'){throw "$TableName.$($p.n) is missing."}
  elseif(-not $Apply){Mark "$TableName.$($p.n)" PLAN "WOULD CREATE $($p.t)"}
  else{New-Column $p;Mark "$TableName.$($p.n)" CREATED "$($p.t) created"}
}
$key=if(Get-Table){Get-Key}else{$null}
if($key){Assert-Key $key ($Mode -eq 'Verify');Mark $KeyName PASS "exists; status=$(KeyStatus $key.EntityKeyIndexStatus)"}
elseif($Mode -eq 'Verify'){throw "$KeyName is missing."}
elseif(-not $Apply){Mark $KeyName PLAN 'WOULD CREATE on cr664_idempotencykey and monitor until Active'}
else{New-Key;Mark $KeyName CREATED 'submitted';$key=Wait-Key;Assert-Key $key $true}
$table=Get-Table
if($table){Ensure-Component $TableName ([string]$table.MetadataId) 1 $false}else{Mark "$TableName solution registration" PLAN 'WOULD ADD after table creation'}
foreach($p in $variables){Ensure-Variable $p}
if($Mode -eq 'Verify'){
  $modeDef=Get-Definition 'cr664_OGBSharePointTransportMode';$modeValue=if($modeDef){Get-Value ([string]$modeDef.environmentvariabledefinitionid)}else{$null}
  if(-not $modeValue -or [string]$modeValue.value -cne 'DRY_RUN'){throw 'Transport mode is not DRY_RUN.'}
  Write-Status Verify PASS 'table, 22 columns, Active key, ten variables, values, DRY_RUN, and solution memberships verified'
}
if($Apply){
  $key=Wait-Key
  foreach($p in $variables){$d=Get-Definition $p.s;$v=Get-Value ([string]$d.environmentvariabledefinitionid);if(-not(Matches $d $v $p)){throw "Final readback failed for $($p.s)."}}
  ApiPost 'PublishAllXml' @{}|Out-Null
  Write-Status PublishAllXml PASS 'published after all schema and key checks succeeded'
}
Write-Host ("TOTALS present={0} planned={1} created={2} updated={3} registered={4} failed={5}" -f $counts.present,$counts.planned,$counts.created,$counts.updated,$counts.registered,$counts.failed)
Write-Host 'No business data, SharePoint content, workflow state, or LIVE activation was changed.'
