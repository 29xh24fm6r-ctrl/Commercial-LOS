[CmdletBinding()]
param(
  [string]$ManifestPath = 'deployment\bank-credit-governance\activation-manifest.json',
  [string]$DotnetPath = '.\.tmp-dotnet-sdk\dotnet.exe'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$manifestFullPath = (Resolve-Path (Join-Path $repo $ManifestPath)).Path
$manifest = Get-Content -Raw -LiteralPath $manifestFullPath | ConvertFrom-Json

if ($manifest.activationState -ne 'NO_GO') {
  throw 'The preparation package must remain NO_GO.'
}

function Assert-Hash($item, [string]$label) {
  $path = (Resolve-Path (Join-Path $repo ([string]$item.path))).Path
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
  $expected = ([string]$item.sha256).ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "$label hash mismatch. Expected $expected; actual $actual."
  }
  Write-Host ("PASS {0} sha256={1}" -f $label, $actual)
}

Assert-Hash $manifest.pluginAssembly 'plug-in assembly'
Assert-Hash $manifest.pluginPackage 'plug-in package'
Assert-Hash $manifest.schemaPlan 'schema plan'
Assert-Hash $manifest.initialPolicy 'initial policy'
Assert-Hash $manifest.authorityPlan 'authority plan'
Assert-Hash $manifest.registrationManifest 'registration manifest'

$dotnet = (Resolve-Path (Join-Path $repo $DotnetPath)).Path
$sdkVersion = (& $dotnet --version).Trim()
if ($sdkVersion -ne [string]$manifest.sdk.version) {
  throw "SDK mismatch. Expected $($manifest.sdk.version); actual $sdkVersion."
}

$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'
& $dotnet test (Join-Path $repo 'dataverse-plugins\CommercialLendingLOS.Plugins.Tests\CommercialLendingLOS.Plugins.Tests.csproj') `
  --configuration Release --no-restore --logger 'console;verbosity=minimal'
if ($LASTEXITCODE -ne 0) { throw 'C# plug-in suite failed.' }

Write-Host 'PASS activation package is hash-consistent and executable.'
Write-Host 'NO-GO: this verifier performs no Dataverse operation and grants no production approval.'
