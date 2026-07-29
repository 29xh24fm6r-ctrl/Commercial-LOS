<#
  Idempotently creates only the missing custom role/workspace catalog rows
  required by the Production GO independent identities.

  Dry-run by default. -Apply never updates, deactivates, or deletes a row and
  stops if an exact name is duplicated.
#>
[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')
$envInfo = Resolve-DataverseEnv
$org = $envInfo.OrgUrl.TrimEnd('/')
$token = Get-DataverseToken $org
if (-not (Test-DataverseToken $org $token)) { throw 'Dataverse WhoAmI failed.' }
$api = "$org/api/data/v9.2"
$headers = @{
  Authorization = "Bearer $token"
  Accept = 'application/json'
  'Content-Type' = 'application/json'
  'OData-Version' = '4.0'
  'OData-MaxVersion' = '4.0'
  Prefer = 'return=representation'
}

function Escape-OData([string]$value) { return $value.Replace("'", "''") }
function Ensure-Row([string]$setName, [string]$nameField, [string]$name, [hashtable]$body) {
  $filter = "$nameField eq '$((Escape-OData $name))'"
  $rows = @((Invoke-RestMethod -Method Get -Uri "$api/${setName}?`$filter=$([uri]::EscapeDataString($filter))" -Headers $headers).value)
  if ($rows.Count -gt 1) { throw "Duplicate $setName rows named '$name' block provisioning." }
  if ($rows.Count -eq 1) {
    Write-Host ("PRESENT {0}: {1}" -f $setName, $name)
    return [string]($rows[0].PSObject.Properties | Where-Object { $_.Name -match 'id$' -and $_.Name -notmatch '^_' } | Select-Object -First 1).Value
  }
  if (-not $Apply) {
    Write-Host ("WOULD CREATE {0}: {1}" -f $setName, $name)
    return $null
  }
  $created = Invoke-RestMethod -Method Post -Uri "$api/$setName" -Headers $headers -Body ($body | ConvertTo-Json -Depth 5)
  $id = [string]($created.PSObject.Properties | Where-Object { $_.Name -match 'id$' -and $_.Name -notmatch '^_' } | Select-Object -First 1).Value
  Write-Host ("CREATED {0}: {1} ({2})" -f $setName, $name, $id)
  return $id
}

try {
  $result = [ordered]@{}
  foreach ($name in @('Credit Approver', 'Funding Approver', 'Boarding Servicing Operator')) {
    $result["platformRole:$name"] = Ensure-Row 'cr664_platformroles' 'cr664_rolename' $name @{ cr664_rolename = $name }
    $result["coreUserRole:$name"] = Ensure-Row 'cr664_userroles' 'cr664_rolename' $name @{
      cr664_rolename = $name
      cr664_description = "Least-privilege Production GO identity role: $name."
    }
  }
  foreach ($name in @('Team Workspace', 'Portfolio Management')) {
    $result["workspaceType:$name"] = Ensure-Row 'cr664_workspacetypes' 'cr664_workspacename' $name @{
      cr664_workspacename = $name
      cr664_workspacecontext = 788190001
      cr664_description = "Operational workspace type required for Production GO identity provisioning."
    }
  }
  Write-Host ("EVIDENCE: [production-go][role-catalog] mode={0} entries={1} ts={2}" -f
    $(if ($Apply) { 'apply' } else { 'dry-run' }), $result.Count, (Get-Date -Format o))
  $result.GetEnumerator() | ForEach-Object { Write-Output ("{0}={1}" -f $_.Key, $_.Value) }
} finally {
  $token = $null
}
