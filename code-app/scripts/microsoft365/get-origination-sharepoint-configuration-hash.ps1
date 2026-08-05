[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ConfigurationPath)
$ErrorActionPreference='Stop'
$value=Get-Content -Raw -LiteralPath $ConfigurationPath|ConvertFrom-Json
$names=@('tenantId','graphSiteId','graphDriveId','governedRootItemId','governedRootPath','siteUrl','libraryId','contractVersion','configurationVersion','functionResourceId','functionHostname','connectorIdentity','runtimeIdentity','permissionGrantEvidenceId')
$ordered=[ordered]@{};foreach($name in $names){$field=[string]$value.$name;if([string]::IsNullOrWhiteSpace($field)-or $field -eq 'UNRESOLVED'){throw "UNRESOLVED_CONFIGURATION_FIELD:$name"};$ordered[$name]=$field}
$json=$ordered|ConvertTo-Json -Compress
$bytes=[Text.Encoding]::UTF8.GetBytes($json);$hash=[Security.Cryptography.SHA256]::HashData($bytes);[Convert]::ToHexString($hash).ToLowerInvariant()
