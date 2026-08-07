[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidateSet('Validate','Export','Pack','Verify')][string]$Action='Validate',
  [string]$EnvironmentUrl='https://org3a57b8d4.crm.dynamics.com',
  [string]$SolutionName='OGBSharePointTransport',
  [string]$PackagePath,
  [switch]$Apply
)
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$sourceFolder=Join-Path $repoRoot 'power-platform\solutions\CommercialLendingLOS'
$expectedEnvironment='https://org3a57b8d4.crm.dynamics.com'
if(-not $PackagePath){$PackagePath=Join-Path $repoRoot 'artifacts\OGBSharePointTransport_unmanaged.zip'}
if($EnvironmentUrl.TrimEnd('/') -ne $expectedEnvironment){throw "Environment lock failed. Expected $expectedEnvironment"}
if($SolutionName -ne 'OGBSharePointTransport'){throw 'Only the narrow OGBSharePointTransport solution is permitted.'}
if($Action -in @('Export','Pack') -and -not $Apply){throw "$Action requires -Apply because it reads the authenticated tenant solution."}
$flowNames=@(
 'OGBOriginationSharePointTransport-9448AC11-F490-F111-8076-7CED8D3BAFD4.json',
 'OGBOriginationSharePointTransportReconciliation-F4637494-69F5-4D79-9F8B-0BE46A36E71F.json'
)

function Assert-Source {
  $manifestPath=Join-Path $sourceFolder 'PowerAutomateOwned\activation-manifest.json'
  $manifest=Get-Content $manifestPath -Raw|ConvertFrom-Json
  if($manifest.defaultTransportMode -ne 'DRY_RUN'){throw 'Source transport mode is not DRY_RUN.'}
  if($manifest.environmentLock -ne $expectedEnvironment){throw 'Source environment lock differs.'}
  if($manifest.ledger.schemaName -ne 'cr664_sharepointtransportledger'){throw 'Ledger schema differs.'}
  if($manifest.ledger.statuses -notcontains 'DRY_RUN_COMPLETED'){throw 'DRY_RUN terminal ledger status is missing.'}
  if($manifest.dryRunSemantics.sharePointMutationAllowed -ne $false){throw 'DRY_RUN mutation control differs.'}
  if(($manifest.environmentVariableSchemaNames|Where-Object {$_ -notmatch '^cr664_OGBSharePoint'}).Count){throw 'A transport environment variable does not use the exact cr664 prefix.'}
  if(($manifest.environmentVariableSchemaNames -join '|') -match 'ListId|new_OGBSharePoint'){throw 'Stale environment-variable naming remains.'}
  foreach($name in $flowNames){
    $json=Join-Path $sourceFolder "Workflows\$name";$metadata="$json.data.xml"
    if(-not(Test-Path $json) -or -not(Test-Path $metadata)){throw "Missing workflow source: $name"}
    $xml=Get-Content $metadata -Raw
    if($xml -notmatch '<StateCode>0</StateCode>' -or $xml -notmatch '<StatusCode>1</StatusCode>'){throw "$name is not inactive."}
  }
  $workflowText=(Get-Content (Join-Path $sourceFolder 'Workflows\*.json') -Raw) -join [Environment]::NewLine
  if($workflowText -match '(?i)Create file|Create new folder|Delete file|Move file|Copy file|Update file'){throw 'A SharePoint mutation action is present.'}
  if($workflowText -match '(?i)access[_-]?token|client[_-]?secret|password|connectionId'){throw 'Possible secret or instance connection ID is present.'}
  [pscustomobject]@{valid=$true;solution=$SolutionName;environment=$expectedEnvironment;mode='DRY_RUN';workflowCount=2;workflowsInactive=$true;sharePointMutationActions=0}
}

function Overlay-Workflows([string]$unpacked){
  $destination=Join-Path $unpacked 'Workflows';New-Item -ItemType Directory -Force $destination|Out-Null
  foreach($name in $flowNames){
    Copy-Item -LiteralPath (Join-Path $sourceFolder "Workflows\$name") -Destination (Join-Path $destination $name) -Force
    Copy-Item -LiteralPath (Join-Path $sourceFolder "Workflows\$name.data.xml") -Destination (Join-Path $destination "$name.data.xml") -Force
  }
}

function Assert-Package([string]$path){
  if(-not(Test-Path -LiteralPath $path)){throw "Package does not exist: $path"}
  $inspection=Join-Path ([IO.Path]::GetTempPath()) ("ogb-sharepoint-package-verify-"+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $inspection|Out-Null
  try{
    Expand-Archive -LiteralPath $path -DestinationPath $inspection
    $solutionXml=Get-Content (Join-Path $inspection 'solution.xml') -Raw
    if($solutionXml -notmatch '<UniqueName>OGBSharePointTransport</UniqueName>'){throw 'Package is not the narrow OGBSharePointTransport solution.'}
    $customizations=Get-Content (Join-Path $inspection 'customizations.xml') -Raw
    if($customizations -notmatch 'cr664_sharepointtransportledger'){throw 'Package does not contain the durable ledger table.'}
    $actualVariables=@(Get-ChildItem (Join-Path $inspection 'environmentvariabledefinitions') -Directory|Select-Object -ExpandProperty Name|Sort-Object)
    $packageManifest=Get-Content (Join-Path $sourceFolder 'PowerAutomateOwned\activation-manifest.json') -Raw|ConvertFrom-Json
    $expectedVariables=@($packageManifest.environmentVariableSchemaNames|Sort-Object)
    if((Compare-Object $expectedVariables $actualVariables).Count){throw 'Package environment-variable definitions differ from the exact manifest set.'}
    foreach($name in $flowNames){
      $source=Join-Path $sourceFolder "Workflows\$name"
      $packed=Join-Path $inspection "Workflows\$name"
      if(-not(Test-Path $packed)){throw "Package is missing workflow $name"}
      $sourceJson=Get-Content -LiteralPath $source -Raw|ConvertFrom-Json|ConvertTo-Json -Depth 100 -Compress
      $packedJson=Get-Content -LiteralPath $packed -Raw|ConvertFrom-Json|ConvertTo-Json -Depth 100 -Compress
      if($sourceJson -ne $packedJson){throw "Packed workflow source differs semantically: $name"}
    }
    [xml]$customizationsXml=$customizations
    foreach($workflowId in @('9448ac11-f490-f111-8076-7ced8d3bafd4','f4637494-69f5-4d79-9f8b-0be46a36e71f')){
      $workflow=@($customizationsXml.ImportExportXml.Workflows.Workflow|Where-Object {$_.WorkflowId.Trim('{}') -eq $workflowId})
      if($workflow.Count -ne 1 -or [string]$workflow[0].StateCode -ne '0' -or [string]$workflow[0].StatusCode -ne '1'){throw "Packed workflow is missing or not inactive: $workflowId"}
    }
    $packageWorkflows=(Get-Content (Join-Path $inspection 'Workflows\*.json') -Raw)-join [Environment]::NewLine
    foreach($connectionReference in @('new_sharedsharepointonline_b8f0b','new_commondataserviceforapps_ogblos')){
      if($packageWorkflows -notmatch [regex]::Escape($connectionReference)){throw "Packed workflows are missing connection reference $connectionReference"}
    }
    if($packageWorkflows -match '(?i)Create file|Create new folder|Delete file|Move file|Copy file|Update file'){throw 'Packed workflow contains a SharePoint mutation action.'}
    $packageText=(Get-ChildItem -Recurse -File $inspection|Where-Object {$_.Extension -in '.xml','.json'}|ForEach-Object {Get-Content -LiteralPath $_.FullName -Raw})-join [Environment]::NewLine
    if($packageText -match '(?i)access[_-]?token|client[_-]?secret|password|connectionId'){throw 'Packed solution contains a possible secret or connection instance identifier.'}
    $file=Get-Item -LiteralPath $path
    [pscustomobject]@{valid=$true;path=$file.FullName;bytes=$file.Length;sha256=(Get-FileHash -Algorithm SHA256 $path).Hash;solution='OGBSharePointTransport';version=([regex]::Match($solutionXml,'<Version>([^<]+)</Version>').Groups[1].Value);environmentVariables=$actualVariables.Count;workflowCount=2;workflowsInactive=$true;sharePointMutationActions=0}
  }finally{
    $resolved=[IO.Path]::GetFullPath($inspection)
    if(-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase)){throw 'Refusing to remove a verification directory outside the OS temp directory.'}
    if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
  }
}

Assert-Source|Out-Null
switch($Action){
 'Validate'{Assert-Source|ConvertTo-Json -Depth 6}
 'Export'{
   New-Item -ItemType Directory -Force ([IO.Path]::GetDirectoryName($PackagePath))|Out-Null
   pac solution export --environment $EnvironmentUrl --name $SolutionName --path $PackagePath --overwrite
   Get-FileHash -Algorithm SHA256 $PackagePath|Select-Object Path,Hash
 }
 'Pack'{
   $temp=Join-Path ([IO.Path]::GetTempPath()) ("ogb-sharepoint-transport-"+[guid]::NewGuid().ToString('N'))
   New-Item -ItemType Directory -Force $temp|Out-Null
   try{
     $base=Join-Path $temp 'base.zip';$unpacked=Join-Path $temp 'solution'
     pac solution export --environment $EnvironmentUrl --name $SolutionName --path $base --overwrite
     pac solution unpack --zipfile $base --folder $unpacked --packagetype Unmanaged
     Overlay-Workflows $unpacked
     New-Item -ItemType Directory -Force ([IO.Path]::GetDirectoryName($PackagePath))|Out-Null
     pac solution pack --folder $unpacked --zipfile $PackagePath --packagetype Unmanaged
     Assert-Package $PackagePath|ConvertTo-Json -Depth 6
   }finally{if(Test-Path $temp){Remove-Item -LiteralPath $temp -Recurse -Force}}
 }
 'Verify'{
   Assert-Package $PackagePath|ConvertTo-Json -Depth 6
 }
}
