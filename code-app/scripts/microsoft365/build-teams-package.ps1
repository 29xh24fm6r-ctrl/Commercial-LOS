<#
  Builds or validates the Commercial LOS Microsoft Teams app package.

  Safe by design:
    - validates only local manifest/icons;
    - writes package output only under dist/microsoft365/teams unless -ValidateOnly;
    - never uploads to Teams;
    - never calls Graph, Power Platform, or tenant APIs.
#>
[CmdletBinding()]
param(
  [string]$RepoRoot,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$repo = if ($RepoRoot) { (Resolve-Path -LiteralPath $RepoRoot).Path } else { (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }
$teamsDir = Join-Path $repo 'microsoft365\teams'
$manifestTemplate = Join-Path $teamsDir 'manifest.template.json'
$outline = Join-Path $teamsDir 'outline.png'
$color = Join-Path $teamsDir 'color.png'
$outDir = Join-Path $repo 'dist\microsoft365\teams'
$workDir = Join-Path $outDir 'package-root'
$zipPath = Join-Path $outDir 'commercial-los-teams-app.zip'

function Read-PngInfo($Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "Missing PNG: $Path" }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 33) { throw "Invalid PNG (too small): $Path" }
  $sig = @(137,80,78,71,13,10,26,10)
  for ($i = 0; $i -lt $sig.Count; $i++) {
    if ($bytes[$i] -ne $sig[$i]) { throw "Invalid PNG signature: $Path" }
  }
  $width = [System.BitConverter]::ToInt32(([byte[]]@($bytes[19],$bytes[18],$bytes[17],$bytes[16])), 0)
  $height = [System.BitConverter]::ToInt32(([byte[]]@($bytes[23],$bytes[22],$bytes[21],$bytes[20])), 0)
  $colorType = [int]$bytes[25]
  return @{ Width = $width; Height = $height; ColorType = $colorType; HasAlpha = ($colorType -eq 4 -or $colorType -eq 6) }
}

function Assert-Equal($Name, $Actual, $Expected) {
  if ($Actual -ne $Expected) { throw "$Name expected $Expected but was $Actual" }
}

if (-not (Test-Path -LiteralPath $manifestTemplate)) { throw "Missing manifest template: $manifestTemplate" }
$manifest = Get-Content -Raw -LiteralPath $manifestTemplate | ConvertFrom-Json

Assert-Equal 'manifestVersion' $manifest.manifestVersion '1.21'
Assert-Equal 'app id' $manifest.id '63858e09-3d0b-47c9-b1d2-65cef742fda4'
Assert-Equal 'outline icon name' $manifest.icons.outline 'outline.png'
Assert-Equal 'color icon name' $manifest.icons.color 'color.png'
$tab = @($manifest.staticTabs)[0]
if ([string]$tab.contentUrl -notlike '*5f2d77a5-de50-edeb-9d74-5b2400a2320d*') { throw 'contentUrl does not contain expected environment id' }
if ([string]$tab.contentUrl -notlike '*63858e09-3d0b-47c9-b1d2-65cef742fda4*') { throw 'contentUrl does not contain expected app id' }
if ([string]$tab.contentUrl -notlike '*tenantId=e5d2be43-2e2c-4968-b5f3-c73dd825ee80*') { throw 'contentUrl does not contain expected tenant id' }
if (-not (@($manifest.validDomains) -contains 'apps.powerapps.com')) { throw 'validDomains must include apps.powerapps.com' }
if (@($manifest.authorization.permissions.resourceSpecific).Count -ne 0) { throw 'Teams package must not request resource-specific Graph permissions' }

$outlineInfo = Read-PngInfo $outline
Assert-Equal 'outline width' $outlineInfo.Width 32
Assert-Equal 'outline height' $outlineInfo.Height 32
if (-not $outlineInfo.HasAlpha) { throw 'outline.png must be transparent-capable (PNG color type with alpha)' }

$colorInfo = Read-PngInfo $color
Assert-Equal 'color width' $colorInfo.Width 192
Assert-Equal 'color height' $colorInfo.Height 192

Write-Host '== Teams package validation =='
Write-Host ("manifest={0}" -f $manifestTemplate)
Write-Host ("outline=32x32 alpha={0}" -f $outlineInfo.HasAlpha)
Write-Host 'color=192x192'

if ($ValidateOnly) {
  Write-Host 'STATUS=PASS'
  Write-Host ("EVIDENCE: [teams-package] STATUS=PASS validateOnly=True ts={0}" -f (Get-Date -Format o))
  exit 0
}

New-Item -ItemType Directory -Force -Path $workDir | Out-Null
Copy-Item -LiteralPath $manifestTemplate -Destination (Join-Path $workDir 'manifest.json') -Force
Copy-Item -LiteralPath $outline -Destination (Join-Path $workDir 'outline.png') -Force
Copy-Item -LiteralPath $color -Destination (Join-Path $workDir 'color.png') -Force

$entries = @(Get-ChildItem -LiteralPath $workDir -File | Select-Object -ExpandProperty Name | Sort-Object)
$expected = @('color.png','manifest.json','outline.png')
if (($entries -join '|') -ne ($expected -join '|')) {
  throw "Package root must contain exactly: $($expected -join ', ')"
}

if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -Path (Join-Path $workDir '*') -DestinationPath $zipPath -Force

Write-Host 'STATUS=PASS'
Write-Host ("EVIDENCE: [teams-package] STATUS=PASS package={0} entries={1} ts={2}" -f $zipPath, ($entries -join ','), (Get-Date -Format o))
