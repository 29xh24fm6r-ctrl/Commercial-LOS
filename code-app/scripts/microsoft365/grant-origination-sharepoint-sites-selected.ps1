[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$EnterpriseApplicationObjectId,
    [Parameter(Mandatory = $true)][string]$SiteId,
    [ValidateSet('read','write')][string]$Role = 'write',
    [string]$EvidencePath = "docs/operator-evidence/sharepoint-runtime/sites-selected-evidence.json",
    [switch]$Apply,
    [switch]$Force
)
$ErrorActionPreference='Stop'
$PinnedSiteId='oldglory22.sharepoint.com,fcef8a95-b6b8-4c7f-85d9-d30c4d13aa8a,2c7f7bf5-9995-48b2-93a4-137bc741cf48'
if($SiteId -ne $PinnedSiteId){throw 'SITE_ID_MISMATCH'}
$siteUri="https://graph.microsoft.com/v1.0/sites/$SiteId"
$site=az rest --method get --url $siteUri | ConvertFrom-Json
if($site.id -ne $PinnedSiteId -or $site.webUrl -ne 'https://oldglory22.sharepoint.com/sites/BusinessLending'){throw 'PINNED_SITE_READBACK_FAILED'}
$grants=az rest --method get --url "$siteUri/permissions" | ConvertFrom-Json
$proposal=[ordered]@{roles=@($Role);grantedToIdentities=@([ordered]@{application=[ordered]@{id=$EnterpriseApplicationObjectId;displayName='OGB Origination SharePoint Transport'}})}
if(-not $Apply){[ordered]@{mode='READ_ONLY_PROPOSAL';site=$site;existingPermissions=$grants.value;proposedGrant=$proposal}|ConvertTo-Json -Depth 20;return}
if(-not $Force){throw 'APPLY_REQUIRES_FORCE'}
if(-not $PSCmdlet.ShouldProcess($PinnedSiteId,"Grant $Role Sites.Selected permission to $EnterpriseApplicationObjectId")){return}
$temporary=New-TemporaryFile
try{$proposal|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $temporary -Encoding utf8; $created=az rest --method post --url "$siteUri/permissions" --headers 'Content-Type=application/json' --body "@$temporary" | ConvertFrom-Json}finally{Remove-Item -LiteralPath $temporary -Force}
$readback=az rest --method get --url "$siteUri/permissions/$($created.id)" | ConvertFrom-Json
if($readback.grantedToIdentitiesV2.application.id -ne $EnterpriseApplicationObjectId -and $readback.grantedToIdentities.application.id -ne $EnterpriseApplicationObjectId){throw 'PERMISSION_READBACK_FAILED'}
$evidence=[ordered]@{schemaVersion='sp-a3/v1';timestamp=(Get-Date).ToUniversalTime().ToString('o');siteId=$PinnedSiteId;permissionId=$created.id;enterpriseApplicationObjectId=$EnterpriseApplicationObjectId;roles=$readback.roles;readBack=$true}
$directory=Split-Path -Parent $EvidencePath;if($directory){New-Item -ItemType Directory -Force -Path $directory|Out-Null};$evidence|ConvertTo-Json -Depth 20|Set-Content -LiteralPath $EvidencePath -Encoding utf8
