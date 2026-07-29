param(
  [Parameter(Mandatory = $true)][string]$EnvironmentUrl,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$schemaPath = Join-Path $PSScriptRoot 'schema\commercial-crm-growth.schema.json'
$schema = Get-Content -Raw -LiteralPath $schemaPath | ConvertFrom-Json
Write-Host "Commercial CRM growth schema $($schema.version)"
Write-Host "Environment: $EnvironmentUrl"
foreach ($table in $schema.tables) {
  $columnCount = @($table.columns.PSObject.Properties).Count
  $lookupCount = @($table.lookups.PSObject.Properties).Count
  Write-Host "VERIFY $($table.logicalName): $columnCount columns, $lookupCount lookups"
}
if (-not $Apply) {
  Write-Host 'PLAN ONLY. No tenant changes were made. Re-run with -Apply only in an approved operator change window.'
  exit 0
}
throw 'APPLY is fail-closed in source control. Execute definitions through the approved Dataverse solution tooling, regenerate services, and attach verifier evidence before enabling runtime writes.'
