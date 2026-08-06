$ErrorActionPreference='Stop'
$script=Join-Path $PSScriptRoot 'Invoke-OGBSharePointTransportSolution.ps1'
$output=& $script -Action Validate|Out-String
if($LASTEXITCODE){throw 'Narrow solution validation failed.'}
if($output -notmatch '"solution":\s+"OGBSharePointTransport"'){throw 'Narrow solution name was not verified.'}
if($output -notmatch '"mode":\s+"DRY_RUN"'){throw 'DRY_RUN was not verified.'}
if($output -notmatch '"workflowsInactive":\s+true'){throw 'Inactive workflow state was not verified.'}
if($output -notmatch '"sharePointMutationActions":\s+0'){throw 'Static no-write result was not verified.'}
Write-Host 'OGBSharePointTransport source validation passed.'
$package=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'artifacts\OGBSharePointTransport_unmanaged.zip'
if(Test-Path -LiteralPath $package){
  $packageOutput=& $script -Action Verify -PackagePath $package|Out-String
  if($packageOutput -notmatch '"environmentVariables":\s+10'){throw 'Package environment-variable count was not verified.'}
  if($packageOutput -notmatch '"workflowsInactive":\s+true'){throw 'Package workflow state was not verified.'}
  Write-Host 'OGBSharePointTransport package validation passed.'
}
