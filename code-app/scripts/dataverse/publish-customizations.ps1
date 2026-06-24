<#
  Phase 243 - publish-customizations.ps1

  Publishes Dataverse customizations after schema creation (PublishAllXml). This
  makes newly-created tables/columns active. It is NOT a solution deploy and does
  NOT run `pac code push`.

  DRY-RUN BY DEFAULT. Pass -Apply to publish; -Force skips confirmation.
  No table/column delete, no feature-flag flip, no email send.

    powershell -File scripts/dataverse/publish-customizations.ps1            # dry-run
    powershell -File scripts/dataverse/publish-customizations.ps1 -Apply
#>
[CmdletBinding()]
param([switch]$Apply, [switch]$Force)

. (Join-Path $PSScriptRoot '_common.ps1')

Write-Host '== Phase 243 :: Publish Dataverse customizations =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live)' } else { 'DRY-RUN (default)' }))

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }

if (-not $Apply) {
  Write-Host 'WOULD PUBLISH all customizations (POST PublishAllXml). Dry-run performs no publish.'
  Write-Host ("EVIDENCE: [243][publish] mode=dry-run published=false ts={0}" -f (Get-Date -Format o))
  return
}

if (-not $envInfo -or -not $token) { Write-Status 'publish' 'BLOCKED' 'Apply requires a connected pac org + token. Aborting.'; exit 1 }
if (-not (Confirm-Mutation $true $Force.IsPresent $envInfo.OrgUrl)) { Write-Status 'publish' 'BLOCKED' 'Operator did not confirm. Aborting.'; exit 1 }

$headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/PublishAllXml" -f $envInfo.OrgUrl.TrimEnd('/')) -Headers $headers -Body '{}' | Out-Null
Write-Status 'publish' 'PASS' 'customizations published'
Write-Host ("EVIDENCE: [243][publish] mode=apply published=true ts={0}" -f (Get-Date -Format o))
