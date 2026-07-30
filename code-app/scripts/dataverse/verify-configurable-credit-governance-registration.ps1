[CmdletBinding()]
param(
  [ValidateSet('Enabled', 'Disabled')]
  [string]$ExpectedState = 'Disabled',
  [Parameter(Mandatory)]
  [string]$ExpectedAssemblySha256,
  [string]$ManifestPath = 'dataverse-plugins\CommercialLendingLOS.Plugins\ConfigurableCreditGovernanceRegistration.json'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifest = Get-Content -Raw (Join-Path $repo $ManifestPath) | ConvertFrom-Json
$envInfo = Resolve-DataverseEnv
$orgUrl = $envInfo.OrgUrl.TrimEnd('/')
$token = Get-DataverseToken $orgUrl
if (-not (Test-DataverseToken $orgUrl $token)) { throw 'Dataverse WhoAmI failed.' }
$api = "$orgUrl/api/data/v9.2"
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json' }

function Escape-OData([string]$value) { $value.Replace("'", "''") }
function Get-Rows([string]$relative) {
  return (Invoke-RestMethod -Method Get -Uri "$api/$relative" -Headers $headers).value
}
function Get-One($rows, [string]$label) {
  $items = @($rows)
  if ($items.Count -ne 1) { throw "Expected one $label; found $($items.Count)." }
  return $items[0]
}

try {
  $assembly = Get-One (Get-Rows "pluginassemblies?`$select=pluginassemblyid,content&`$filter=name eq '$(Escape-OData $manifest.assemblyName)'") 'plug-in assembly'
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $assemblyHash = ([BitConverter]::ToString(
      $sha.ComputeHash([Convert]::FromBase64String([string]$assembly.content))
    )).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
  if ($assemblyHash -ne $ExpectedAssemblySha256.Trim().ToLowerInvariant()) {
    throw "Assembly readback hash mismatch. Expected $ExpectedAssemblySha256; actual $assemblyHash."
  }

  $specifications = @()
  foreach ($boundary in @($manifest.boundaries)) {
    foreach ($stage in @($boundary.stages)) {
      $stageName = if ([int]$stage -eq 10) { 'PreValidation' } elseif ([int]$stage -eq 20) { 'PreOperation' } else { 'PostOperation' }
      $specifications += [pscustomobject]@{
        Type = [string]$manifest.pluginType
        Name = "OGL Configurable Credit Governance | $($boundary.action) | $stageName | $($boundary.message) | $($boundary.entity)"
        Stage = [int]$stage
        Mode = [int]$manifest.mode
        Rank = [int]$manifest.rank
        FilteringAttributes = [string]$boundary.filteringAttributes
        PreImageAttributes = [string]$boundary.preImageAttributes
        Message = [string]$boundary.message
        Entity = [string]$boundary.entity
      }
    }
  }
  foreach ($boundary in @($manifest.duplicateGuard.boundaries)) {
    $specifications += [pscustomobject]@{
      Type = [string]$manifest.duplicateGuard.pluginType
      Name = "OGL Governance Natural Key Guard | PreOperation | $($boundary.message) | $($boundary.entity)"
      Stage = 20
      Mode = [int]$manifest.duplicateGuard.mode
      Rank = [int]$manifest.duplicateGuard.rank
      FilteringAttributes = [string]$boundary.filteringAttributes
      PreImageAttributes = [string]$boundary.preImageAttributes
      Message = [string]$boundary.message
      Entity = [string]$boundary.entity
    }
  }

  $expectedStateCode = if ($ExpectedState -eq 'Enabled') { 0 } else { 1 }
  $imageCount = 0
  foreach ($specification in $specifications) {
    $type = Get-One (Get-Rows "plugintypes?`$select=plugintypeid,_pluginassemblyid_value&`$filter=typename eq '$(Escape-OData $specification.Type)'") "type $($specification.Type)"
    if ($type._pluginassemblyid_value -ne $assembly.pluginassemblyid) {
      throw "Plug-in type assembly mismatch: $($specification.Type)."
    }
    $step = Get-One (Get-Rows "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,stage,mode,rank,filteringattributes,statecode,_sdkmessageid_value,_sdkmessagefilterid_value&`$filter=name eq '$(Escape-OData $specification.Name)'") "step $($specification.Name)"
    if (
      [int]$step.stage -ne $specification.Stage -or
      [int]$step.mode -ne $specification.Mode -or
      [int]$step.rank -ne $specification.Rank -or
      [int]$step.statecode -ne $expectedStateCode -or
      [string]$step.filteringattributes -ne $specification.FilteringAttributes
    ) {
      throw "Step readback mismatch: $($specification.Name)."
    }
    $message = Get-One (Get-Rows "sdkmessages?`$select=name&`$filter=sdkmessageid eq $($step._sdkmessageid_value)") "message $($specification.Name)"
    $filter = Get-One (Get-Rows "sdkmessagefilters?`$select=primaryobjecttypecode&`$filter=sdkmessagefilterid eq $($step._sdkmessagefilterid_value)") "filter $($specification.Name)"
    if ([string]$message.name -ne $specification.Message -or [string]$filter.primaryobjecttypecode -ne $specification.Entity) {
      throw "Message/entity readback mismatch: $($specification.Name)."
    }

    $images = @(Get-Rows "sdkmessageprocessingstepimages?`$select=name,entityalias,imagetype,messagepropertyname,attributes&`$filter=_sdkmessageprocessingstepid_value eq $($step.sdkmessageprocessingstepid)")
    if ($specification.Message -eq 'Update') {
      $image = Get-One $images "image $($specification.Name)"
      if (
        [string]$image.name -ne 'PreImage' -or
        [string]$image.entityalias -ne 'PreImage' -or
        [int]$image.imagetype -ne 0 -or
        [string]$image.messagepropertyname -ne 'Target' -or
        [string]$image.attributes -ne $specification.PreImageAttributes
      ) {
        throw "Pre-image readback mismatch: $($specification.Name)."
      }
      $imageCount += 1
    } elseif ($images.Count -ne 0) {
      throw "Unexpected image registered: $($specification.Name)."
    }
  }

  if ($specifications.Count -ne 58 -or $imageCount -ne 28) {
    throw "Registration cardinality mismatch: $($specifications.Count) steps / $imageCount images."
  }
  Write-Host "PASS assemblySha256=$assemblyHash types=2 steps=58 images=28 state=$ExpectedState"
} finally {
  $token = $null
}
