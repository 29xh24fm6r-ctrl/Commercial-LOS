[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$SubscriptionId,
    [Parameter(Mandatory = $true)][string]$ResourceGroupName,
    [Parameter(Mandatory = $true)][string]$ParametersFile,
    [string]$DeploymentName = "ogb-origination-sharepoint-runtime",
    [string]$EvidencePath = "docs/operator-evidence/sharepoint-runtime/provisioning-evidence.json",
    [switch]$Apply
)
$ErrorActionPreference = "Stop"
$template = Join-Path $PSScriptRoot "../../microsoft365/sharepoint-transport/azure-function/infra/main.bicep"
if (-not (Test-Path -LiteralPath $template) -or -not (Test-Path -LiteralPath $ParametersFile)) { throw "Template or parameters file not found." }
az account set --subscription $SubscriptionId | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to select the requested subscription." }

$mode = if ($Apply) { "APPLY" } else { "WHAT_IF" }
if (-not $Apply) {
    az deployment group what-if --name $DeploymentName --resource-group $ResourceGroupName --template-file $template --parameters "@$ParametersFile"
    if ($LASTEXITCODE -ne 0) { throw "Azure deployment what-if failed." }
    return
}
if (-not $PSCmdlet.ShouldProcess("$SubscriptionId/$ResourceGroupName", "Apply the reviewed SP-A3 Bicep deployment")) { return }
$output = az deployment group create --name $DeploymentName --resource-group $ResourceGroupName --template-file $template --parameters "@$ParametersFile" --output json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw "Azure deployment failed." }
$evidence = [ordered]@{ schemaVersion = "sp-a3/v1"; mode = $mode; timestamp = (Get-Date).ToUniversalTime().ToString("o"); subscriptionId = $SubscriptionId; resourceGroup = $ResourceGroupName; deploymentName = $DeploymentName; outputs = $output.properties.outputs }
$directory = Split-Path -Parent $EvidencePath; if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
$evidence | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
