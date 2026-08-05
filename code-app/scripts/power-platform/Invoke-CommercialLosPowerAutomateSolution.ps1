[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidateSet('Export','Unpack','Validate','Pack','Import','Publish','Verify')][string]$Action='Validate',
  [string]$EnvironmentUrl='https://org3a57b8d4.crm.dynamics.com',
  [string]$SolutionName='CommercialLendingLOS',
  [string]$SolutionFolder,
  [string]$PackagePath,
  [switch]$Apply
)
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if(-not $SolutionFolder){$SolutionFolder=Join-Path $repoRoot 'power-platform\solutions\CommercialLendingLOS'}
if(-not $PackagePath){$PackagePath=Join-Path $repoRoot 'artifacts\CommercialLendingLOS_PA1_unmanaged.zip'}
$expected='https://org3a57b8d4.crm.dynamics.com'
if($EnvironmentUrl.TrimEnd('/') -ne $expected){ throw "Target environment must be explicit and equal $expected" }
$mutating=$Action -in @('Export','Import','Publish')
if($mutating -and -not $Apply){ throw "$Action requires -Apply. No tenant mutation was performed." }
$flow=Join-Path $SolutionFolder 'Workflows\OGBOriginationSharePointTransport-9448AC11-F490-F111-8076-7CED8D3BAFD4.json'
$recon=Join-Path $SolutionFolder 'Workflows\OGBOriginationSharePointTransportReconciliation-F4637494-69F5-4D79-9F8B-0BE46A36E71F.json'
function Test-Source {
 $f=Get-Content $flow -Raw|ConvertFrom-Json; $r=Get-Content $recon -Raw|ConvertFrom-Json
 $required=@('operation','dealId','correlationId','idempotencyKey')
 if((Compare-Object $required $f.properties.definition.triggers.manual.inputs.schema.required)){throw 'Trigger required fields differ.'}
 if($f.properties.definition.actions.Governed_fail_closed_response.inputs.errorCode -ne 'AUTHORIZATION_ADAPTER_UNRESOLVED'){throw 'Flow is not fail closed.'}
 if($r.properties.definition.triggers.recurrence.recurrence.startTime -ne '2099-01-01T00:00:00Z'){throw 'Reconciliation is not development-safe.'}
 if((Get-Content $SolutionFolder\Other\Customizations.xml -Raw) -match 'connectionId|access.token|client.secret'){throw 'Possible secret or connection ID found.'}
 [pscustomobject]@{valid=$true;transportMode='DRY_RUN';liveEnabled=$false;workflowId='9448ac11-f490-f111-8076-7ced8d3bafd4';reconciliationWorkflowId='f4637494-69f5-4d79-9f8b-0be46a36e71f'}
}
switch($Action){
 'Export' { pac solution export --environment $EnvironmentUrl --name $SolutionName --path $PackagePath --overwrite }
 'Unpack' { pac solution unpack --zipfile $PackagePath --folder $SolutionFolder --packagetype Unmanaged }
 'Validate' { Test-Source|ConvertTo-Json }
 'Pack' { Test-Source|Out-Null; New-Item -ItemType Directory -Force ([IO.Path]::GetDirectoryName($PackagePath))|Out-Null; pac solution pack --folder $SolutionFolder --zipfile $PackagePath --packagetype Unmanaged }
 'Import' { pac solution import --environment $EnvironmentUrl --path $PackagePath --publish-changes }
 'Publish' { pac solution publish --environment $EnvironmentUrl }
 'Verify' { pac solution list --environment $EnvironmentUrl; Test-Source|ConvertTo-Json }
}
