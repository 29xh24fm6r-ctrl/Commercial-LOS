<#
  Registers the configurable governance IPlugin host disabled-first.

  Safety:
  - dry-run by default;
  - -Apply requires exact DLL and registration-manifest SHA-256 values;
  - -RegisterDisabled is mandatory unless -EnableAfterApproval is explicitly used;
  - only this manifest's plugin type and named steps/images are created or updated;
  - no legacy step and no business/configuration row is changed.
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$RegisterDisabled,
  [switch]$EnableAfterApproval,
  [string]$ExpectedAssemblySha256,
  [string]$ExpectedManifestSha256,
  [string]$AssemblyPath = 'dataverse-plugins\CommercialLendingLOS.Plugins\bin\Release\net462\CommercialLendingLOS.Plugins.dll',
  [string]$ManifestPath = 'dataverse-plugins\CommercialLendingLOS.Plugins\ConfigurableCreditGovernanceRegistration.json'
)

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$assemblyFullPath = (Resolve-Path (Join-Path $repo $AssemblyPath)).Path
$manifestFullPath = (Resolve-Path (Join-Path $repo $ManifestPath)).Path
$assemblyHash = (Get-FileHash -Algorithm SHA256 $assemblyFullPath).Hash.ToLowerInvariant()
$manifestHash = (Get-FileHash -Algorithm SHA256 $manifestFullPath).Hash.ToLowerInvariant()
$manifest = Get-Content -Raw $manifestFullPath | ConvertFrom-Json

if ($RegisterDisabled -and $EnableAfterApproval) { throw 'Choose disabled registration or approved enablement, never both.' }
if ($Apply -and -not $RegisterDisabled -and -not $EnableAfterApproval) {
  throw '-Apply requires -RegisterDisabled or -EnableAfterApproval.'
}
if ($Apply) {
  if ($assemblyHash -ne $ExpectedAssemblySha256.Trim().ToLowerInvariant()) { throw 'Assembly hash mismatch.' }
  if ($manifestHash -ne $ExpectedManifestSha256.Trim().ToLowerInvariant()) { throw 'Registration-manifest hash mismatch.' }
}

Write-Host ("Mode={0} state={1} assemblySha256={2} manifestSha256={3} steps={4}" -f
  $(if ($Apply) { 'APPLY' } else { 'DRY_RUN' }),
  $(if ($EnableAfterApproval) { 'ENABLED' } else { 'DISABLED' }),
  $assemblyHash, $manifestHash, (($manifest.boundaries | ForEach-Object { @($_.stages).Count } | Measure-Object -Sum).Sum))
if (-not $Apply) {
  Write-Host 'NO-GO: no assembly, step, image, policy, authority, or business row was changed.'
  exit 0
}

$envInfo = Resolve-DataverseEnv
$orgUrl = $envInfo.OrgUrl.TrimEnd('/')
$token = Get-DataverseToken $orgUrl
if (-not (Test-DataverseToken $orgUrl $token)) { throw 'Dataverse WhoAmI failed.' }
$api = "$orgUrl/api/data/v9.2"
$headers = @{
  Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'
  Accept = 'application/json'; 'Content-Type' = 'application/json'; Prefer = 'return=representation'
}
function Esc([string]$value) { $value.Replace("'", "''") }
function Get-Rows([string]$relative) { @((Invoke-RestMethod Get "$api/$relative" -Headers $headers).value) }
function Post-Row([string]$set, [hashtable]$body) {
  Invoke-RestMethod Post "$api/$set" -Headers $headers -Body ($body | ConvertTo-Json -Depth 10)
}
function Patch-Row([string]$set, [string]$id, [hashtable]$body) {
  Invoke-RestMethod Patch "$api/$set($id)" -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) | Out-Null
}
function One($rows, [string]$label) {
  if (@($rows).Count -ne 1) { throw "Expected one $label; found $(@($rows).Count)." }
  @($rows)[0]
}

try {
  $bytes = [IO.File]::ReadAllBytes($assemblyFullPath)
  $assemblyName = [Reflection.AssemblyName]::GetAssemblyName($assemblyFullPath)
  $pkt = ($assemblyName.GetPublicKeyToken() | ForEach-Object { $_.ToString('x2') }) -join ''
  if (-not $pkt) { throw 'Assembly is not strong-name signed.' }
  $assemblyRows = Get-Rows "pluginassemblies?`$select=pluginassemblyid&`$filter=name eq '$(Esc $manifest.assemblyName)'"
  $assemblyBody = @{
    name=$manifest.assemblyName; content=[Convert]::ToBase64String($bytes); isolationmode=2
    sourcetype=0; version=$assemblyName.Version.ToString(); culture=''; publickeytoken=$pkt
  }
  if ($assemblyRows.Count -eq 0) {
    $assemblyId = [string](Post-Row pluginassemblies $assemblyBody).pluginassemblyid
  } else {
    $assemblyId = [string](One $assemblyRows 'plugin assembly').pluginassemblyid
    Patch-Row pluginassemblies $assemblyId $assemblyBody
  }
  $typeRows = Get-Rows "plugintypes?`$select=plugintypeid&`$filter=typename eq '$(Esc $manifest.pluginType)'"
  if ($typeRows.Count -eq 0) {
    $short = ($manifest.pluginType -split '\.')[-1]
    $typeId = [string](Post-Row plugintypes @{
      typename=$manifest.pluginType; name=$short; friendlyname=$short
      'pluginassemblyid@odata.bind'="/pluginassemblies($assemblyId)"
    }).plugintypeid
  } else { $typeId = [string](One $typeRows 'configurable plugin type').plugintypeid }

  foreach ($boundary in @($manifest.boundaries)) {
    foreach ($stage in @($boundary.stages)) {
    $message = One (Get-Rows "sdkmessages?`$select=sdkmessageid&`$filter=name eq '$($boundary.message)'") "message $($boundary.message)"
    $filter = One (Get-Rows ("sdkmessagefilters?`$select=sdkmessagefilterid&`$filter=_sdkmessageid_value eq {0} and primaryobjecttypecode eq '{1}'" -f
      $message.sdkmessageid, (Esc $boundary.entity))) "filter $($boundary.message)/$($boundary.entity)"
    $stageName = $(if ([int]$stage -eq 10) { 'PreValidation' } elseif ([int]$stage -eq 20) { 'PreOperation' } else { 'PostOperation' })
    $stepName = "OGL Configurable Credit Governance | $($boundary.action) | $stageName | $($boundary.message) | $($boundary.entity)"
    $stepRows = Get-Rows "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid&`$filter=name eq '$(Esc $stepName)'"
    $body = @{
      name=$stepName
      description='Fail-closed configurable bank policy, authority, separation, committee, and evidence enforcement.'
      configuration="bankId=$($manifest.bankId);action=$($boundary.action)"
      stage=[int]$stage; mode=[int]$manifest.mode; rank=[int]$manifest.rank
      supporteddeployment=[int]$manifest.supportedDeployment
      filteringattributes=[string]$boundary.filteringAttributes
      'sdkmessageid@odata.bind'="/sdkmessages($($message.sdkmessageid))"
      'sdkmessagefilterid@odata.bind'="/sdkmessagefilters($($filter.sdkmessagefilterid))"
      'eventhandler_plugintype@odata.bind'="/plugintypes($typeId)"
    }
    if ($stepRows.Count -eq 0) {
      $stepId = [string](Post-Row sdkmessageprocessingsteps $body).sdkmessageprocessingstepid
    } else {
      $stepId = [string](One $stepRows "step $stepName").sdkmessageprocessingstepid
      Patch-Row sdkmessageprocessingsteps $stepId $body
    }
    Patch-Row sdkmessageprocessingsteps $stepId @{
      statecode=$(if ($EnableAfterApproval) { 0 } else { 1 })
      statuscode=$(if ($EnableAfterApproval) { 1 } else { 2 })
    }
    if ($boundary.message -eq 'Update') {
      if ([string]::IsNullOrWhiteSpace([string]$boundary.preImageAttributes)) {
        throw "Update boundary $($boundary.action) has no pre-image attributes."
      }
      $images = Get-Rows "sdkmessageprocessingstepimages?`$select=sdkmessageprocessingstepimageid&`$filter=_sdkmessageprocessingstepid_value eq $stepId and name eq 'PreImage'"
      $imageBody = @{
        name='PreImage'; entityalias='PreImage'; imagetype=0; messagepropertyname='Target'
        attributes=[string]$boundary.preImageAttributes
        'sdkmessageprocessingstepid@odata.bind'="/sdkmessageprocessingsteps($stepId)"
      }
      if ($images.Count -eq 0) { Post-Row sdkmessageprocessingstepimages $imageBody | Out-Null }
      else { Patch-Row sdkmessageprocessingstepimages ([string](One $images "image $stepName").sdkmessageprocessingstepimageid) $imageBody }
    }
    }
  }
  Write-Host ("EVIDENCE configurableType={0} steps={1} state={2} assemblySha256={3} manifestSha256={4}" -f
    $typeId, (($manifest.boundaries | ForEach-Object { @($_.stages).Count } | Measure-Object -Sum).Sum), $(if ($EnableAfterApproval) { 'enabled' } else { 'disabled' }),
    $assemblyHash, $manifestHash)
} finally {
  $token = $null
}
