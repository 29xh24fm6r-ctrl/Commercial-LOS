<#
  Registers or updates DurableRecordGovernancePlugin and its 21 synchronous PreOperation steps.

  Safety:
  - dry-run by default;
  - -Apply requires an exact SHA-256 for the compiled DLL;
  - -RegisterDisabled creates/updates every step disabled for inspection;
  - a later -Apply without -RegisterDisabled enables the exact manifest;
  - no business row is created, updated, or deleted by this script;
  - access tokens are acquired in memory by _common.ps1 and never printed or persisted.
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$RegisterDisabled,
  [Parameter(Mandatory = $false)]
  [string]$ExpectedSha256,
  [string]$AssemblyPath = "dataverse-plugins\CommercialLendingLOS.Plugins\bin\Release\net462\CommercialLendingLOS.Plugins.dll",
  [string]$ManifestPath = "dataverse-plugins\CommercialLendingLOS.Plugins\DurableRecordGovernanceRegistration.json"
)

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$assemblyFullPath = (Resolve-Path (Join-Path $repo $AssemblyPath)).Path
$manifestFullPath = (Resolve-Path (Join-Path $repo $ManifestPath)).Path
$manifest = Get-Content -Raw -LiteralPath $manifestFullPath | ConvertFrom-Json
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $assemblyFullPath).Hash.ToLowerInvariant()

if (-not $Apply) {
  Write-Host 'DRY RUN: durable-record governance plug-in registration'
  Write-Host ("Assembly: {0}" -f $assemblyFullPath)
  Write-Host ("SHA-256: {0}" -f $actualHash)
  Write-Host ("Plugin type: {0}" -f $manifest.pluginType)
  Write-Host ("Steps: {0} entities x {1} messages = {2}" -f @($manifest.entities).Count, @($manifest.messages).Count, (@($manifest.entities).Count * @($manifest.messages).Count))
  Write-Host ("Target state: {0}" -f $(if ($RegisterDisabled) { 'disabled' } else { 'enabled' }))
  Write-Host 'No assembly, type, step, image, solution, schema, or business record was changed.'
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ExpectedSha256)) {
  throw '-Apply requires -ExpectedSha256.'
}
if ($ExpectedSha256.Trim().ToLowerInvariant() -ne $actualHash) {
  throw "Assembly hash mismatch. Expected $ExpectedSha256; actual $actualHash."
}

$envInfo = Resolve-DataverseEnv
$orgUrl = $envInfo.OrgUrl.TrimEnd('/')
$token = Get-DataverseToken $orgUrl
if (-not (Test-DataverseToken $orgUrl $token)) { throw 'Dataverse WhoAmI failed.' }
$api = "$orgUrl/api/data/v9.2"
$headers = @{
  Authorization = "Bearer $token"
  'OData-MaxVersion' = '4.0'
  'OData-Version' = '4.0'
  Accept = 'application/json'
  'Content-Type' = 'application/json'
  Prefer = 'return=representation'
}

function Escape-OData([string]$value) { return $value.Replace("'", "''") }
function Invoke-Get([string]$relative) {
  return Invoke-RestMethod -Method Get -Uri "$api/$relative" -Headers $headers
}
function Invoke-Post([string]$set, [hashtable]$body) {
  return Invoke-RestMethod -Method Post -Uri "$api/$set" -Headers $headers -Body ($body | ConvertTo-Json -Depth 10)
}
function Invoke-Patch([string]$set, [string]$id, [hashtable]$body) {
  Invoke-RestMethod -Method Patch -Uri "$api/$set($id)" -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) | Out-Null
}
function One([object[]]$rows, [string]$description) {
  if (@($rows).Count -ne 1) { throw "Expected exactly one $description; found $(@($rows).Count)." }
  return @($rows)[0]
}

try {
  $bytes = [System.IO.File]::ReadAllBytes($assemblyFullPath)
  $assemblyName = [System.Reflection.AssemblyName]::GetAssemblyName($assemblyFullPath)
  $publicKeyToken = ($assemblyName.GetPublicKeyToken() | ForEach-Object { $_.ToString('x2') }) -join ''
  if ([string]::IsNullOrWhiteSpace($publicKeyToken)) {
    throw 'The plug-in assembly must be strong-name signed before Dataverse registration.'
  }
  $assemblyRows = @((
    Invoke-Get ("pluginassemblies?`$select=pluginassemblyid,name,version&`$filter=name eq '{0}'" -f (Escape-OData $manifest.assemblyName))
  ).value)
  $assemblyBody = @{
    name = $manifest.assemblyName
    content = [Convert]::ToBase64String($bytes)
    isolationmode = 2
    sourcetype = 0
    version = $assemblyName.Version.ToString()
    culture = ''
    publickeytoken = $publicKeyToken
  }
  if ($assemblyRows.Count -eq 0) {
    $assembly = Invoke-Post 'pluginassemblies' $assemblyBody
    $assemblyId = [string]$assembly.pluginassemblyid
    Write-Host ("CREATED plugin assembly {0} ({1})" -f $manifest.assemblyName, $assemblyId)
  } elseif ($assemblyRows.Count -eq 1) {
    $assemblyId = [string]$assemblyRows[0].pluginassemblyid
    Invoke-Patch 'pluginassemblies' $assemblyId $assemblyBody
    Write-Host ("UPDATED plugin assembly {0} ({1})" -f $manifest.assemblyName, $assemblyId)
  } else {
    throw "More than one plugin assembly named $($manifest.assemblyName) exists."
  }

  $typeRows = @()
  for ($attempt = 0; $attempt -lt 5 -and $typeRows.Count -eq 0; $attempt++) {
    $typeRows = @((
      Invoke-Get ("plugintypes?`$select=plugintypeid,typename&`$filter=typename eq '{0}'" -f (Escape-OData $manifest.pluginType))
    ).value)
    if ($typeRows.Count -eq 0) { Start-Sleep -Seconds 1 }
  }
  if ($typeRows.Count -eq 0) {
    $shortName = ($manifest.pluginType -split '\.')[-1]
    $type = Invoke-Post 'plugintypes' @{
      typename = $manifest.pluginType
      name = $shortName
      friendlyname = $shortName
      'pluginassemblyid@odata.bind' = "/pluginassemblies($assemblyId)"
    }
    $pluginTypeId = [string]$type.plugintypeid
    Write-Host ("CREATED plugin type {0} ({1})" -f $manifest.pluginType, $pluginTypeId)
  } else {
    $pluginTypeId = [string](One $typeRows "plugin type $($manifest.pluginType)").plugintypeid
    Write-Host ("VERIFIED plugin type {0} ({1})" -f $manifest.pluginType, $pluginTypeId)
  }

  $messageIds = @{}
  foreach ($messageName in @($manifest.messages)) {
    $rows = @((Invoke-Get ("sdkmessages?`$select=sdkmessageid,name&`$filter=name eq '{0}'" -f $messageName)).value)
    $messageIds[$messageName] = [string](One $rows "SDK message $messageName").sdkmessageid
  }

  $stepCount = 0
  $imageCount = 0
  foreach ($entity in @($manifest.entities)) {
    foreach ($messageName in @($manifest.messages)) {
      $messageId = $messageIds[$messageName]
      $filterRows = @((Invoke-Get (
        "sdkmessagefilters?`$select=sdkmessagefilterid,primaryobjecttypecode&`$filter=_sdkmessageid_value eq {0} and primaryobjecttypecode eq '{1}'" -f
          $messageId, (Escape-OData $entity.logicalName)
      )).value)
      $filterId = [string](One $filterRows "SDK filter $messageName/$($entity.logicalName)").sdkmessagefilterid
      $stepName = "OGL Durable Governance | $messageName | $($entity.logicalName) | PreOperation"
      $stepRows = @((Invoke-Get (
        "sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,statecode,statuscode&`$filter=name eq '{0}'" -f
          (Escape-OData $stepName)
      )).value)
      $stepBody = @{
        name = $stepName
        description = 'Server-side durable-record identity, lifecycle, authority, dual-control, and immutable-history enforcement.'
        stage = [int]$manifest.stage
        mode = [int]$manifest.mode
        rank = [int]$manifest.rank
        supporteddeployment = [int]$manifest.supportedDeployment
        'sdkmessageid@odata.bind' = "/sdkmessages($messageId)"
        'sdkmessagefilterid@odata.bind' = "/sdkmessagefilters($filterId)"
        'eventhandler_plugintype@odata.bind' = "/plugintypes($pluginTypeId)"
      }
      if ($stepRows.Count -eq 0) {
        $step = Invoke-Post 'sdkmessageprocessingsteps' $stepBody
        $stepId = [string]$step.sdkmessageprocessingstepid
        Write-Host ("CREATED {0}" -f $stepName)
      } elseif ($stepRows.Count -eq 1) {
        $stepId = [string]$stepRows[0].sdkmessageprocessingstepid
        Invoke-Patch 'sdkmessageprocessingsteps' $stepId $stepBody
        Write-Host ("UPDATED {0}" -f $stepName)
      } else {
        throw "More than one step named '$stepName' exists."
      }
      # Dataverse creates new steps in Enabled state and ignores/rejects a
      # create-time Disabled state/status pair. Apply state only after the row
      # exists; this also makes reruns converge existing steps to the requested
      # inspection/active state.
      Invoke-Patch 'sdkmessageprocessingsteps' $stepId @{
        statecode = $(if ($RegisterDisabled) { 1 } else { 0 })
        statuscode = $(if ($RegisterDisabled) { 2 } else { 1 })
      }
      $stepCount++

      if ($messageName -eq 'Update') {
        $imageRows = @((Invoke-Get (
          "sdkmessageprocessingstepimages?`$select=sdkmessageprocessingstepimageid,name&`$filter=_sdkmessageprocessingstepid_value eq {0} and name eq 'PreImage'" -f $stepId
        )).value)
        $imageBody = @{
          name = 'PreImage'
          entityalias = 'PreImage'
          imagetype = 0
          messagepropertyname = 'Target'
          attributes = [string]$entity.preImageAttributes
          'sdkmessageprocessingstepid@odata.bind' = "/sdkmessageprocessingsteps($stepId)"
        }
        if ($imageRows.Count -eq 0) {
          Invoke-Post 'sdkmessageprocessingstepimages' $imageBody | Out-Null
          Write-Host ("CREATED PreImage for {0}" -f $entity.logicalName)
        } elseif ($imageRows.Count -eq 1) {
          Invoke-Patch 'sdkmessageprocessingstepimages' ([string]$imageRows[0].sdkmessageprocessingstepimageid) $imageBody
          Write-Host ("UPDATED PreImage for {0}" -f $entity.logicalName)
        } else {
          throw "More than one PreImage exists for '$stepName'."
        }
        $imageCount++
      }
    }
  }

  Write-Host ("EVIDENCE: [durable-record-plugin][registration] assembly={0} pluginType={1} steps={2} images={3} state={4} sha256={5} ts={6}" -f
    $assemblyId, $pluginTypeId, $stepCount, $imageCount, $(if ($RegisterDisabled) { 'disabled' } else { 'enabled' }), $actualHash, (Get-Date -Format o))
} finally {
  $token = $null
}
