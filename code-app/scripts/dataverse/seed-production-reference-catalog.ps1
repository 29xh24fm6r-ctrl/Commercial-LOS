[CmdletBinding()]
param([switch]$Apply)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'production-remediation-common.ps1')
$target='https://org8c12c949.crm.dynamics.com'
$environmentId='afec9c13-e5c5-eea6-b1f7-3f51abb7571d'
$envInfo=Resolve-DataverseEnv
if ($envInfo.OrgUrl -ne $target -or $envInfo.User -ne 'mpaller@oldglorybank.com') {
  throw 'Refusing non-Production target or identity.'
}
$token=Get-DataverseToken $target
if (-not (Test-DataverseToken $target $token)) { throw 'Dataverse WhoAmI failed.' }
$api='{0}/api/data/v9.2' -f $target
$headers=@{
  Authorization=('Bearer {0}' -f $token);Accept='application/json';
  'Content-Type'='application/json';'OData-MaxVersion'='4.0';
  'OData-Version'='4.0';Prefer='return=representation'
}
$counts=@{}
function Add-Count([string]$set,[string]$kind){
  if (-not $counts.ContainsKey($set)) { $counts[$set]=[ordered]@{create=0;update=0;noop=0} }
  $counts[$set][$kind]++
}
function Ensure-Row(
  [string]$set,[string]$idField,[string]$filter,
  [hashtable]$body,[string[]]$compare,[string]$label
){
  $select=(@($idField,'statecode') + $compare | Select-Object -Unique) -join ','
  $encoded=[uri]::EscapeDataString($filter)
  $uri='{0}/{1}?$select={2}&$filter={3}' -f $api,$set,$select,$encoded
  $rows=@((Invoke-RestMethod -Method Get -Uri $uri -Headers $headers).value)
  if ($rows.Count -gt 1) { throw ('Duplicate natural key blocks {0}.' -f $label) }
  if ($rows.Count -eq 0) {
    Add-Count $set 'create'
    Write-Host ('CREATE {0} {1}' -f $set,$label)
    if ($Apply) {
      $createUri='{0}/{1}' -f $api,$set
      return Invoke-RestMethod -Method Post -Uri $createUri -Headers $headers -Body ($body|ConvertTo-Json -Depth 10)
    }
    return
  }
  $row=$rows[0]
  if ($row.statecode -ne 0) { throw ('{0} exists but is inactive.' -f $label) }
  $changes=@{}
  foreach($field in $compare){
    if ($body.ContainsKey($field) -and [string]$row.$field -ne [string]$body[$field]) {
      $changes[$field]=$body[$field]
    }
  }
  if ($changes.Count -eq 0) {
    Add-Count $set 'noop'
    Write-Host ('NO-OP {0} {1} id={2}' -f $set,$label,$row.$idField)
    return $row
  }
  Add-Count $set 'update'
  Write-Host ('UPDATE {0} {1} id={2}' -f $set,$label,$row.$idField)
  if ($Apply) {
    $patchUri='{0}/{1}({2})' -f $api,$set,$row.$idField
    Invoke-RestMethod -Method Patch -Uri $patchUri -Headers $headers -Body ($changes|ConvertTo-Json)|Out-Null
  }
  $row
}

$risk=@{
  cr664_name='Pass';cr664_code='PASS';
  cr664_description='Pass-rated credit under the active bank risk-rating policy.';
  cr664_activeflag=$true;cr664_sortorder=10
}
$riskFilter='cr664_code eq ''PASS'''
Ensure-Row 'cr664_riskratingreferences' 'cr664_riskratingreferenceid' $riskFilter $risk @(
  'cr664_name','cr664_code','cr664_description','cr664_activeflag','cr664_sortorder'
) 'PASS risk rating'|Out-Null

foreach($name in @('Super Admin','Manager','Admin','Banker','Funding Approver','Boarding Servicing Operator','Credit Approver')){
  $filter='cr664_rolename eq ''{0}''' -f $name
  Ensure-Row 'cr664_platformroles' 'cr664_platformroleid' $filter @{cr664_rolename=$name} @('cr664_rolename') ('platform role {0}' -f $name)|Out-Null
}
foreach($name in @('System Super Admin','Banker','Credit Approver','Funding Approver','Boarding Servicing Operator')){
  $filter='cr664_rolename eq ''{0}''' -f $name
  $body=@{cr664_rolename=$name;cr664_description=('Commercial LOS role catalog: {0}.' -f $name)}
  Ensure-Row 'cr664_userroles' 'cr664_userroleid' $filter $body @('cr664_rolename') ('user role {0}' -f $name)|Out-Null
}
foreach($name in @('Team Workspace','Portfolio Management')){
  $filter='cr664_workspacename eq ''{0}''' -f $name
  $body=@{
    cr664_workspacename=$name;cr664_workspacecontext=788190001;
    cr664_description='Operational Commercial LOS workspace catalog.'
  }
  Ensure-Row 'cr664_workspacetypes' 'cr664_workspacetypeid' $filter $body @(
    'cr664_workspacename','cr664_workspacecontext'
  ) ('workspace type {0}' -f $name)|Out-Null
}
foreach($name in @('Team Workspace','Portfolio Management','Manager Command Center','Executive Dashboard')){
  $filter='cr664_workspacename eq ''{0}''' -f $name
  Ensure-Row 'cr664_platformworkspaces' 'cr664_platformworkspaceid' $filter @{
    cr664_workspacename=$name
  } @('cr664_workspacename') ('platform workspace {0}' -f $name)|Out-Null
}

$totals=[ordered]@{create=0;update=0;noop=0}
foreach($set in ($counts.Keys|Sort-Object)){
  $c=$counts[$set]
  $totals.create+=$c.create;$totals.update+=$c.update;$totals.noop+=$c.noop
  Write-Host ('RESULT table={0} create={1} update={2} no-op={3}' -f $set,$c.create,$c.update,$c.noop)
}
Write-Host ('TOTAL create={0} update={1} no-op={2}' -f $totals.create,$totals.update,$totals.noop)
Write-Host ('STATUS mode={0} environmentId={1}' -f $(if($Apply){'APPLY'}else{'DRY-RUN'}),$environmentId)
$token=$null
