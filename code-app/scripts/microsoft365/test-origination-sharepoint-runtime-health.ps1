[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidatePattern('^https://')][string]$FunctionBaseUrl,[Parameter(Mandatory=$true)][string]$AccessToken)
$ErrorActionPreference='Stop'
# Read-only authentication/configuration probe. It never sends a deal or file payload.
$response=Invoke-WebRequest -Method Get -Uri "$($FunctionBaseUrl.TrimEnd('/'))/.auth/me" -Headers @{Authorization="Bearer $AccessToken"} -SkipHttpErrorCheck
if($response.StatusCode -ne 200){throw "FUNCTION_AUTH_HEALTH_FAILED:$($response.StatusCode)"}
[ordered]@{authenticated=$true;hostname=([Uri]$FunctionBaseUrl).Host;checkedAt=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json
