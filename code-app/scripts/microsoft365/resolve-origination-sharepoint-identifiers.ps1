[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)] [securestring] $AccessToken,
  [Parameter(Mandatory = $false)] [string] $EvidenceOutputPath
)

$ErrorActionPreference = 'Stop'
$siteUrl = 'https://oldglory22.sharepoint.com/sites/BusinessLending'
$hostName = 'oldglory22.sharepoint.com'
$sitePath = '/sites/BusinessLending'
$expectedLibraryId = 'c1a62131-7946-44b9-bb4c-b4637a16f83c'
$expectedRootPath = '/(a) Loans'
$graph = 'https://graph.microsoft.com/v1.0'

if (-not $AccessToken) {
  $tokenValue = (Get-AzAccessToken -ResourceUrl 'https://graph.microsoft.com').Token
  $AccessToken = if ($tokenValue -is [securestring]) { $tokenValue } else { ConvertTo-SecureString $tokenValue -AsPlainText -Force }
}
if (-not $AccessToken) { throw 'A Microsoft Graph access token is required.' }
$plainToken = [System.Net.NetworkCredential]::new('', $AccessToken).Password
$headers = @{ Authorization = "Bearer $plainToken"; Accept = 'application/json' }

function Invoke-GraphRead([string] $Uri) {
  Invoke-RestMethod -Method Get -Uri $Uri -Headers $headers
}

try {
  $site = Invoke-GraphRead "$graph/sites/${hostName}:$sitePath`?`$select=id,webUrl"
  if ($site.webUrl -ne $siteUrl) { throw 'Resolved site URL does not match the approved Business Lending site.' }

  $drives = (Invoke-GraphRead "$graph/sites/$($site.id)/drives?`$select=id,name,webUrl,sharepointIds").value
  $candidates = @($drives | Where-Object { $_.sharepointIds.listId -eq $expectedLibraryId -or $_.name -eq 'Documents' })
  if ($candidates.Count -ne 1) { throw "Expected exactly one Documents drive candidate; found $($candidates.Count)." }
  $drive = $candidates[0]
  if ($drive.sharepointIds.listId -ne $expectedLibraryId) { throw 'Resolved drive does not map to the approved registered library ID.' }

  $rootChildren = (Invoke-GraphRead "$graph/drives/$($drive.id)/root/children?`$select=id,name,webUrl,parentReference,folder,sharepointIds").value
  $rootCandidates = @($rootChildren | Where-Object { $_.name -eq '(a) Loans' -and $_.folder })
  if ($rootCandidates.Count -ne 1) { throw "Expected exactly one governed root folder; found $($rootCandidates.Count)." }
  $root = $rootCandidates[0]
  if (-not ([uri]::UnescapeDataString(([uri]$root.webUrl).AbsolutePath).EndsWith($expectedRootPath))) { throw 'The governed root readback path is not exact.' }

  $evidence = [ordered]@{
    contractVersion = 'ogb-deal-sharepoint/v1'
    status = 'IDENTIFIERS_RESOLVED_NOT_ACTIVATED'
    tenantId = $null
    graphSiteId = $site.id
    graphDriveId = $drive.id
    governedRootItemId = $root.id
    verifiedRootPath = $expectedRootPath
    siteUrl = $site.webUrl
    libraryId = $drive.sharepointIds.listId
    libraryIdEqualsGraphListId = ($expectedLibraryId -eq $drive.sharepointIds.listId)
    libraryIdEqualsGraphDriveId = ($expectedLibraryId -eq $drive.id)
    driveName = $drive.name
    driveWebUrl = $drive.webUrl
    rootWebUrl = $root.webUrl
    resolvedOn = [DateTimeOffset]::UtcNow.ToString('o')
  }
  $json = $evidence | ConvertTo-Json -Depth 6
  if ($EvidenceOutputPath) { [System.IO.File]::WriteAllText((Join-Path (Get-Location) $EvidenceOutputPath), $json, [System.Text.UTF8Encoding]::new($false)) }
  $json
} finally {
  $plainToken = $null
  $headers.Authorization = $null
}
