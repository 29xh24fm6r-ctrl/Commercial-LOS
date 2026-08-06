[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidateSet('Export','Validate','Pack','Import','Publish','Verify')][string]$Action='Validate',
  [string]$EnvironmentUrl='https://org3a57b8d4.crm.dynamics.com',
  [string]$SolutionName='CommercialLendingLOS',
  [string]$SolutionFolder,
  [string]$PackagePath,
  [string]$PlatformGeneratedComponentFolder,
  [switch]$Apply
)
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if(-not $SolutionFolder){$SolutionFolder=Join-Path $repoRoot 'power-platform\solutions\CommercialLendingLOS'}
if(-not $PackagePath){$PackagePath=Join-Path $repoRoot 'artifacts\CommercialLendingLOS_PA2_unmanaged.zip'}
$expectedEnvironment='https://org3a57b8d4.crm.dynamics.com'
if($EnvironmentUrl.TrimEnd('/') -ne $expectedEnvironment){throw "Environment lock failed. Expected $expectedEnvironment"}
if($Action -in @('Import','Publish') -and -not $Apply){throw "$Action requires -Apply. No tenant mutation was performed."}
$flowNames=@(
 'OGBOriginationSharePointTransport-9448AC11-F490-F111-8076-7CED8D3BAFD4.json',
 'OGBOriginationSharePointTransportReconciliation-F4637494-69F5-4D79-9F8B-0BE46A36E71F.json'
)
$manifestPath=Join-Path $SolutionFolder 'PowerAutomateOwned\activation-manifest.json'
function Test-Pa2Source {
 if(-not(Test-Path $manifestPath)){throw 'PA-2 activation manifest is missing.'}
 $manifest=Get-Content $manifestPath -Raw|ConvertFrom-Json
 if($manifest.defaultTransportMode -ne 'DRY_RUN'){throw 'DRY_RUN must remain the source default.'}
 if($manifest.environmentLock -ne $expectedEnvironment){throw 'Manifest environment lock differs.'}
 if($manifest.ledger.schemaName -ne 'cr664_sharepointtransportledger'){throw 'Ledger declaration differs.'}
 if($manifest.ledger.uniqueKey.Count -ne 1 -or $manifest.ledger.uniqueKey[0] -ne 'cr664_idempotencykey'){throw 'Ledger idempotency key differs.'}
 foreach($name in $flowNames){if(-not(Test-Path (Join-Path $SolutionFolder "Workflows\$name"))){throw "Missing curated workflow $name"}}
 $transport=Get-Content (Join-Path $SolutionFolder "Workflows\$($flowNames[0])") -Raw|ConvertFrom-Json
 if($transport.properties.definition.actions.Governed_fail_closed_response.inputs.errorCode -ne 'ACTOR_IDENTITY_CONTEXT_UNAVAILABLE'){throw 'Transport is not blocked on trusted actor context.'}
 if($transport.properties.definition.actions.Governed_fail_closed_response.inputs.contractVersion -ne 'ogb-deal-sharepoint/v2'){throw 'Contract version differs.'}
 $reconciliation=Get-Content (Join-Path $SolutionFolder "Workflows\$($flowNames[1])") -Raw|ConvertFrom-Json
 if($reconciliation.properties.definition.triggers.recurrence.recurrence.startTime -ne '2099-01-01T00:00:00Z'){throw 'Reconciliation is not development-safe.'}
 $forbidden=Get-ChildItem $SolutionFolder -Directory|Where-Object Name -in @('CanvasApps','Entities','WebResources','Roles','OptionSets')
 if($forbidden){throw "Curated overlay contains forbidden full-solution directories: $($forbidden.Name -join ', ')"}
 $text=(Get-Content $manifestPath -Raw)+(Get-Content (Join-Path $SolutionFolder 'Workflows\*.json') -Raw)
 if($text -match '(?i)access[_-]?token|client[_-]?secret|password|connectionId'){throw 'Possible secret or instance connection ID found.'}
 [pscustomobject]@{valid=$true;environment=$expectedEnvironment;transportMode='DRY_RUN';liveEnabled=$false;workflowCount=2;requiresPlatformGeneratedArtifacts=$manifest.platformGeneratedArtifactsRequired}
}
function Copy-PaOwnedOverlay([string]$Destination) {
 if(-not $PlatformGeneratedComponentFolder){throw 'Pack requires -PlatformGeneratedComponentFolder containing reviewed platform exports for environment variables, ledger, and connector actions.'}
 if(-not(Test-Path $PlatformGeneratedComponentFolder)){throw 'Platform-generated component folder was not found.'}

 Copy-Item -Path (Join-Path $PlatformGeneratedComponentFolder '*') -Destination $Destination -Recurse -Force

 $workflowDestination=Join-Path $Destination 'Workflows'
 New-Item -ItemType Directory -Force $workflowDestination|Out-Null

 foreach($name in $flowNames){
   $jsonSource = Join-Path $SolutionFolder "Workflows\$name"
   $metadataName = "$name.data.xml"
   $metadataSource = Join-Path $SolutionFolder "Workflows\$metadataName"

   if(-not (Test-Path $jsonSource)){
     throw "Missing curated workflow JSON: $jsonSource"
   }

   if(-not (Test-Path $metadataSource)){
     throw "Missing curated workflow metadata: $metadataSource"
   }

   Copy-Item -LiteralPath $jsonSource -Destination (Join-Path $workflowDestination $name) -Force
   Copy-Item -LiteralPath $metadataSource -Destination (Join-Path $workflowDestination $metadataName) -Force
 }
}
switch($Action){
 'Export' {
   New-Item -ItemType Directory -Force ([IO.Path]::GetDirectoryName($PackagePath))|Out-Null
   pac solution export --environment $EnvironmentUrl --name $SolutionName --path $PackagePath --overwrite
 }
 'Validate' {Test-Pa2Source|ConvertTo-Json -Depth 8}
 'Pack' {
   Test-Pa2Source|Out-Null
   if(-not $PlatformGeneratedComponentFolder){throw 'Pack requires -PlatformGeneratedComponentFolder containing reviewed platform exports for environment variables, ledger, and connector actions.'}
   if(-not(Test-Path $PlatformGeneratedComponentFolder)){throw 'Platform-generated component folder was not found.'}
   $temp=Join-Path ([IO.Path]::GetTempPath()) ("commercial-los-pa2-"+[guid]::NewGuid().ToString('N'))
   New-Item -ItemType Directory -Force $temp|Out-Null
   try {
     $baseZip=Join-Path $temp 'base.zip';$unpacked=Join-Path $temp 'solution'
     pac solution export --environment $EnvironmentUrl --name $SolutionName --path $baseZip --overwrite
     pac solution unpack --zipfile $baseZip --folder $unpacked --packagetype Unmanaged
     Copy-PaOwnedOverlay $unpacked
     New-Item -ItemType Directory -Force ([IO.Path]::GetDirectoryName($PackagePath))|Out-Null
     pac solution pack --folder $unpacked --zipfile $PackagePath --packagetype Unmanaged
     Get-FileHash -Algorithm SHA256 $PackagePath|Select-Object Path,Hash
   } finally {if(Test-Path $temp){Remove-Item -LiteralPath $temp -Recurse -Force}}
 }
 'Import' {pac solution import --environment $EnvironmentUrl --path $PackagePath --publish-changes}
 'Publish' {pac solution publish --environment $EnvironmentUrl}
 'Verify' {pac solution list --environment $EnvironmentUrl;Test-Pa2Source|ConvertTo-Json -Depth 8}
}
