[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SubscriptionId,
    [Parameter(Mandatory = $true)][string]$ResourceGroupName,
    [Parameter(Mandatory = $true)][string]$FunctionAppName,
    [string]$EvidencePath = "docs/operator-evidence/sharepoint-runtime/readback-evidence.json"
)
$ErrorActionPreference = "Stop"
az account set --subscription $SubscriptionId | Out-Null
$app = az functionapp show --resource-group $ResourceGroupName --name $FunctionAppName --output json | ConvertFrom-Json
$auth = az rest --method get --url "https://management.azure.com$($app.id)/config/authsettingsV2/list?api-version=2023-12-01" | ConvertFrom-Json
$settings = az functionapp config appsettings list --resource-group $ResourceGroupName --name $FunctionAppName --output json | ConvertFrom-Json
$safeNames = @('SP_TENANT_ID','SP_GRAPH_SITE_ID','SP_GRAPH_DRIVE_ID','SP_GOVERNED_ROOT_ITEM_ID','SP_GOVERNED_ROOT_PATH','SP_SITE_URL','SP_LIBRARY_ID','SP_CONTRACT_VERSION','SP_CONFIGURATION_VERSION','SP_FUNCTION_RESOURCE_ID','SP_FUNCTION_HOSTNAME','SP_CONNECTOR_IDENTITY','SP_RUNTIME_IDENTITY','SP_PERMISSION_GRANT_EVIDENCE_ID','SP_CONFIGURATION_HASH','SP_IDEMPOTENCY_TABLE','SP_ORPHAN_TABLE','SP_DATAVERSE_AUTHORIZATION_ADAPTER')
$safeSettings = @{}; foreach ($setting in $settings) { if ($safeNames -contains $setting.name) { $safeSettings[$setting.name] = $setting.value } }
$evidence = [ordered]@{ schemaVersion='sp-a3/v1'; timestamp=(Get-Date).ToUniversalTime().ToString('o'); resourceId=$app.id; hostname=$app.defaultHostName; httpsOnly=$app.httpsOnly; managedIdentity=$app.identity; authentication=[ordered]@{ enabled=$auth.properties.platform.enabled; requireAuthentication=$auth.properties.globalValidation.requireAuthentication; unauthenticatedClientAction=$auth.properties.globalValidation.unauthenticatedClientAction }; immutableSettings=$safeSettings }
$directory=Split-Path -Parent $EvidencePath; if($directory){New-Item -ItemType Directory -Force -Path $directory|Out-Null}; $evidence|ConvertTo-Json -Depth 20|Set-Content -LiteralPath $EvidencePath -Encoding utf8
$evidence|ConvertTo-Json -Depth 20
