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

function Assert-ZipEntryHash($item, [string]$label) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $packagePath = (Resolve-Path (Join-Path $repo ([string]$item.packagePath))).Path
  $archive = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
  try {
    $entries = @($archive.Entries | Where-Object { $_.FullName -eq [string]$item.entry })
    if ($entries.Count -ne 1) {
      throw "Expected exactly one $label entry '$($item.entry)'; found $($entries.Count)."
    }
    $stream = $entries[0].Open()
    try {
      $sha = [System.Security.Cryptography.SHA256]::Create()
      try {
        $actual = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
      } finally {
        $sha.Dispose()
      }
    } finally {
      $stream.Dispose()
    }
    $expected = ([string]$item.sha256).ToLowerInvariant()
    if ($actual -ne $expected) {
      throw "$label hash mismatch. Expected $expected; actual $actual."
    }
    Write-Host ("PASS {0} sha256={1}" -f $label, $actual)
  } finally {
    $archive.Dispose()
  }
}

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

# dotnet test builds the referenced plug-in project and can replace its output
# with a byte-different strong-name build. The committed ZIP entry is the actual
# production artifact, so hash it directly after executable source validation.
Assert-ZipEntryHash $manifest.pluginAssembly 'plug-in assembly'
Assert-Hash $manifest.pluginPackage 'plug-in package'
Assert-Hash $manifest.schemaPlan 'schema plan'
Assert-Hash $manifest.schemaProvisioner 'schema provisioner'
Assert-Hash $manifest.initialPolicy 'initial policy'
Assert-Hash $manifest.authorityPlan 'authority plan'
Assert-Hash $manifest.registrationManifest 'registration manifest'

Write-Host 'PASS activation package is hash-consistent and executable.'
Write-Host 'NO-GO: this verifier performs no Dataverse operation and grants no production approval.'
