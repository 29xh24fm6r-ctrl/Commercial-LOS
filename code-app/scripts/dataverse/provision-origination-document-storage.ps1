param([switch]$Apply,[switch]$Force,[string]$OrgUrl='https://org8c12c949.crm.dynamics.com')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
if($Apply -and -not $Force){throw 'Apply requires -Force after review of the dry-run output.'}
$envState=Resolve-DataverseEnv
if($envState -and $envState.OrgUrl -and $envState.OrgUrl.TrimEnd('/') -ne $OrgUrl.TrimEnd('/')){throw "pac targets $($envState.OrgUrl), not $OrgUrl."}
$token=Get-DataverseToken $OrgUrl
if(-not(Test-DataverseToken $OrgUrl $token)){throw 'Dataverse WhoAmI failed; no schema action was attempted.'}
$api="$($OrgUrl.TrimEnd('/'))/api/data/v9.2"
$headers=@{Authorization="Bearer $token";Accept='application/json';'Content-Type'='application/json';'OData-MaxVersion'='4.0';'OData-Version'='4.0'}
$created=0;$present=0;$planned=0
function L([string]$v){@{LocalizedLabels=@(@{Label=$v;LanguageCode=1033})}}
function Test-Column([string]$table,[string]$column){
  try{$uri="$api/EntityDefinitions(LogicalName='$table')/Attributes(LogicalName='$column')?"+'$select=LogicalName';Invoke-RestMethod -Headers $headers -Uri $uri|Out-Null;$true}
  catch{if($_.Exception.Response.StatusCode.value__ -eq 404){$false}else{throw}}
}
function Ensure-Table([hashtable]$d){
  $r=New-DataverseTableIfMissing -TableDef $d -OrgUrl $OrgUrl -Token $token -Apply ([bool]$Apply)
  if($r-eq'created'){$script:created++}elseif($r-eq'present'){$script:present++}else{$script:planned++}
}
function Ensure-Column([string]$table,[hashtable]$d){
  if(Test-Column $table $d.name){$script:present++;Write-Status "$table.$($d.name)" PASS 'exists (skip)';return}
  if(-not$Apply){$script:planned++;Write-Status "$table.$($d.name)" PLANNED "WOULD CREATE $($d.type)";return}
  $base=@{SchemaName=$d.name;LogicalName=$d.name;RequiredLevel=@{Value=$(if($d.required){'ApplicationRequired'}else{'None'})};DisplayName=L $d.label}
  switch($d.type){
    String{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.StringAttributeMetadata';MaxLength=$(if($d.max){$d.max}else{500});FormatName=@{Value='Text'}}}
    Memo{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.MemoAttributeMetadata';MaxLength=10000}}
    Integer{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.IntegerAttributeMetadata';MinValue=-2147483648;MaxValue=2147483647}}
    BigInt{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.BigIntAttributeMetadata';MinValue=[long]0;MaxValue=[long]9223372036854775807}}
    DateTime{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.DateTimeAttributeMetadata';Format='DateAndTime';DateTimeBehavior=@{Value='UserLocal'}}}
    Boolean{$body=$base+@{'@odata.type'='Microsoft.Dynamics.CRM.BooleanAttributeMetadata';DefaultValue=$false;OptionSet=@{'@odata.type'='Microsoft.Dynamics.CRM.BooleanOptionSetMetadata';TrueOption=@{Value=1;Label=L Yes};FalseOption=@{Value=0;Label=L No}}}}
    default{throw "Unsupported type $($d.type)"}
  }
  Invoke-RestMethod -Method Post -Headers $headers -Uri "$api/EntityDefinitions(LogicalName='$table')/Attributes" -Body ($body|ConvertTo-Json -Depth 12)|Out-Null
  $script:created++;Write-Status "$table.$($d.name)" PASS 'created'
}
function Ensure-Relationship([hashtable]$d){
  $r=New-DataverseRelationshipIfMissing -RelDef $d -OrgUrl $OrgUrl -Token $token -Apply ([bool]$Apply)
  if($r-eq'created'){$script:created++}elseif($r-eq'present'){$script:present++}else{$script:planned++}
}
function Test-Key([string]$table,[string]$schema){
  $filter=[uri]::EscapeDataString("SchemaName eq '$schema'")
  $uri="$api/EntityDefinitions(LogicalName='$table')/Keys?"+'$select=SchemaName&$filter='+$filter
  @((Invoke-RestMethod -Headers $headers -Uri $uri).value).Count-gt 0
}
function Ensure-Key([hashtable]$d){
  if(Test-Key $d.table $d.schema){$script:present++;Write-Status $d.schema PASS 'exists (skip)';return}
  if(-not$Apply){$script:planned++;Write-Status $d.schema PLANNED "WOULD CREATE key on $($d.columns -join ',')";return}
  $body=@{'@odata.type'='Microsoft.Dynamics.CRM.EntityKeyMetadata';SchemaName=$d.schema;DisplayName=L $d.label;KeyAttributes=@($d.columns)}
  Invoke-RestMethod -Method Post -Headers $headers -Uri "$api/EntityDefinitions(LogicalName='$($d.table)')/Keys" -Body ($body|ConvertTo-Json -Depth 10)|Out-Null
  $script:created++;Write-Status $d.schema PASS 'submitted'
}
$tables=@(
  @{logicalName='cr664_documentrequirementfilemap';schemaName='cr664_documentrequirementfilemap';displayName='Document Requirement File Mapping';displayCollectionName='Document Requirement File Mappings';ownershipType='UserOwned';auditEnabled=$true;primaryNameColumn='cr664_documentrequirementfilemapname'},
  @{logicalName='cr664_documentexception';schemaName='cr664_documentexception';displayName='Document Exception';displayCollectionName='Document Exceptions';ownershipType='UserOwned';auditEnabled=$true;primaryNameColumn='cr664_documentexceptionname'},
  @{logicalName='cr664_duediligencedefinition';schemaName='cr664_duediligencedefinition';displayName='Due Diligence Definition';displayCollectionName='Due Diligence Definitions';ownershipType='OrganizationOwned';auditEnabled=$true;primaryNameColumn='cr664_duediligencedefinitionname'}
)
foreach($t in $tables){Ensure-Table $t}
function C([string]$name,[string]$label,[string]$type='String',[int]$max=0,[bool]$required=$false){@{name=$name;label=$label;type=$type;max=$max;required=$required}}
$columns=@{
  cr664_loandeal=@(
    C cr664_sharepointsiteurl 'SharePoint Site URL' String 1000;C cr664_documentlibraryname 'Document Library Name' String 300
    C cr664_annualloanfolderpath 'Annual Loan Folder Path' String 1000;C cr664_companyloanfolderpath 'Company Loan Folder Path' String 1000
    C cr664_companyloanfolderurl 'Company Loan Folder URL' String 2000;C cr664_sharepointfolderitemid 'SharePoint Folder Item ID' String 500
    C cr664_folderstatus 'Folder Status' String 100;C cr664_foldercreatedon 'Folder Created On' DateTime
    C cr664_folderlastverifiedon 'Folder Last Verified On' DateTime;C cr664_foldernamingsource 'Folder Naming Source' String 100
    C cr664_storageconfigurationversion 'Storage Configuration Version' String 100;C cr664_folderborroweridentity 'Folder Borrower Identity' String 100
  )
  cr664_documentchecklist=@(
    C cr664_requirementkey 'Requirement Key' String 300;C cr664_requirementversion 'Requirement Version' Integer;C cr664_displayyear 'Display Year' Integer
    C cr664_requirementgroup 'Requirement Group' String 100;C cr664_requirementsource 'Requirement Source' String 100;C cr664_applicabilitystate 'Applicability State' String 100
    C cr664_reviewlevel 'Review Level' String 100;C cr664_blockinglevel 'Blocking Level' String 100;C cr664_stageactivated 'Stage Activated' String 100
    C cr664_storageprovider 'Storage Provider' String 100;C cr664_documentuploadstatus 'Document Upload Status' String 100
    C cr664_sharepointsiteurl 'SharePoint Site URL' String 1000;C cr664_documentlibraryname 'Document Library Name' String 300
    C cr664_sharepointfolderpath 'SharePoint Folder Path' String 1000;C cr664_sharepointfileurl 'SharePoint File URL' String 2000;C cr664_sharepointitemid 'SharePoint Item ID' String 500
    C cr664_originalfilename 'Original Filename' String 500;C cr664_storedfilename 'Stored Filename' String 500;C cr664_mimetype 'MIME Type' String 300
    C cr664_filesizebytes 'File Size Bytes' BigInt;C cr664_uploadedon 'Uploaded On' DateTime;C cr664_storageverifiedon 'Storage Verified On' DateTime
    C cr664_activeversion 'Active Version' Boolean;C cr664_reviewedon 'Reviewed On' DateTime
  )
  cr664_documentrequirementfilemap=@(C cr664_correlationid 'Correlation ID' String 100 $true;C cr664_active Active Boolean;C cr664_mappedon 'Mapped On' DateTime)
  cr664_documentexception=@(
    C cr664_requirementkey 'Requirement Key' String 300 $true;C cr664_exceptionreason 'Exception Reason' Memo 0 $true;C cr664_requestedon 'Requested On' DateTime 0 $true
    C cr664_approvalstatus 'Approval Status' String 100 $true;C cr664_decisiondate 'Decision Date' DateTime;C cr664_decisionnote 'Decision Note' Memo
    C cr664_expiration Expiration DateTime;C cr664_auditcorrelationid 'Audit Correlation ID' String 100 $true
  )
  cr664_duediligencedefinition=@(
    C cr664_stablekey 'Stable Key' String 300 $true;C cr664_definitionversion 'Definition Version' Integer 0 $true;C cr664_section Section String 100 $true
    C cr664_itemtype 'Item Type' String 100 $true;C cr664_stageactivated 'Stage Activated' String 100 $true
    C cr664_applicabilitysource 'Applicability Source' String 500;C cr664_active Active Boolean
  )
}
foreach($table in $columns.Keys){foreach($column in $columns[$table]){Ensure-Column $table $column}}
$relationships=@(
  @{schemaName='cr664_loandeal_foldercreatedby';fromTable='cr664_loandeal';fromColumn='cr664_foldercreatedby';toTable='cr664_user'},
  @{schemaName='cr664_documentchecklist_uploadedby';fromTable='cr664_documentchecklist';fromColumn='cr664_uploadedby';toTable='cr664_user'},
  @{schemaName='cr664_documentchecklist_reviewedby';fromTable='cr664_documentchecklist';fromColumn='cr664_reviewedby';toTable='cr664_user'},
  @{schemaName='cr664_documentchecklist_replacesdocument';fromTable='cr664_documentchecklist';fromColumn='cr664_replacesdocument';toTable='cr664_documentchecklist'},
  @{schemaName='cr664_documentrequirementfilemap_deal';fromTable='cr664_documentrequirementfilemap';fromColumn='cr664_deal';toTable='cr664_loandeal'},
  @{schemaName='cr664_documentrequirementfilemap_document';fromTable='cr664_documentrequirementfilemap';fromColumn='cr664_document';toTable='cr664_documentchecklist'},
  @{schemaName='cr664_documentrequirementfilemap_requirement';fromTable='cr664_documentrequirementfilemap';fromColumn='cr664_requirement';toTable='cr664_documentchecklist'},
  @{schemaName='cr664_documentrequirementfilemap_mappedby';fromTable='cr664_documentrequirementfilemap';fromColumn='cr664_mappedby';toTable='cr664_user'},
  @{schemaName='cr664_documentexception_deal';fromTable='cr664_documentexception';fromColumn='cr664_deal';toTable='cr664_loandeal'},
  @{schemaName='cr664_documentexception_requirement';fromTable='cr664_documentexception';fromColumn='cr664_requirement';toTable='cr664_documentchecklist'},
  @{schemaName='cr664_documentexception_requestedby';fromTable='cr664_documentexception';fromColumn='cr664_requestedby';toTable='cr664_user'},
  @{schemaName='cr664_documentexception_decidedby';fromTable='cr664_documentexception';fromColumn='cr664_decidedby';toTable='cr664_user'},
  @{schemaName='cr664_documentexception_supportingdocument';fromTable='cr664_documentexception';fromColumn='cr664_supportingdocument';toTable='cr664_documentchecklist'}
)
foreach($relationship in $relationships){Ensure-Relationship $relationship}
$keys=@(
  @{table='cr664_documentrequirementfilemap';schema='cr664_documentrequirementfilemap_correlation_key';label='Document mapping correlation key';columns=@('cr664_correlationid')},
  @{table='cr664_documentexception';schema='cr664_documentexception_correlation_key';label='Document exception correlation key';columns=@('cr664_auditcorrelationid')},
  @{table='cr664_duediligencedefinition';schema='cr664_duediligencedefinition_stable_key';label='Due diligence stable version key';columns=@('cr664_stablekey','cr664_definitionversion')}
)
foreach($key in $keys){Ensure-Key $key}
if($Apply){Invoke-RestMethod -Method Post -Headers $headers -Uri "$api/PublishAllXml" -Body '{}'|Out-Null;Write-Status PublishAllXml PASS 'customizations published'}
Write-Host ("RESULT mode={0} created={1} present={2} planned={3}. Generated SDK regeneration and SharePoint connector registration remain separate fail-closed gates." -f $(if($Apply){'APPLY'}else{'DRY_RUN'}),$created,$present,$planned)
