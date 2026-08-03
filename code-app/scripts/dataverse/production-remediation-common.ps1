$ErrorActionPreference='Stop'

function Resolve-DataverseEnv {
  $raw=(& pac org who 2>&1|Out-String)
  $url=([regex]::Match($raw,'https://[A-Za-z0-9.-]+\.dynamics\.com')).Value.TrimEnd('/')
  $user=([regex]::Match($raw,'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')).Value
  if (-not $url -or -not $user) { throw 'Unable to resolve PAC Dataverse identity.' }
  Write-Host ('TARGET url={0} actor={1}' -f $url,$user)
  [pscustomobject]@{OrgUrl=$url;User=$user;Raw=$raw}
}

function Get-DataverseToken([string]$orgUrl) {
  if ($env:DATAVERSE_ACCESS_TOKEN -and $env:DATAVERSE_ACCESS_TOKEN -ne 'System.Security.SecureString') {
    return [string]$env:DATAVERSE_ACCESS_TOKEN
  }
  $result=Get-AzAccessToken -ResourceUrl $orgUrl -ErrorAction Stop
  if (-not $result.Token) { throw 'Dataverse token unavailable.' }
  if ($result.Token -is [Security.SecureString]) {
    return [Net.NetworkCredential]::new('', $result.Token).Password
  }
  [string]$result.Token
}

function Test-DataverseToken([string]$orgUrl,[string]$token) {
  try {
    $uri='{0}/api/data/v9.2/WhoAmI' -f $orgUrl.TrimEnd('/')
    $headers=@{Authorization=('Bearer {0}' -f $token);Accept='application/json'}
    Invoke-RestMethod -Method Get -Uri $uri -Headers $headers|Out-Null
    $true
  } catch { $false }
}

function Confirm-Mutation([bool]$apply,[bool]$force,[string]$orgUrl) {
  if (-not $apply -or $force) { return $true }
  (Read-Host ('Type APPLY to mutate {0}' -f $orgUrl))-ceq'APPLY'
}
