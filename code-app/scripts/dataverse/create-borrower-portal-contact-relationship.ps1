<#
  Adds the contact-scoping relationship required by Power Pages table permissions.

  Safety: dry-run by default, create-missing-only, exact org + solution checks,
  no update/delete path. The relationship lets an authenticated portal Contact
  see only its own cr664_clientrelationship; child permissions can then traverse
  cr664_loandeal.cr664_client and cr664_documentchecklist.cr664_deal.
#>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedOrgHost = 'org3a57b8d4.crm.dynamics.com'
)

. (Join-Path $PSScriptRoot '_common.ps1')

$SolutionUniqueName = 'CommercialLendingLOS'
$Relationship = @{
  schemaName = 'cr664_clientrelationship_portalcontact_contact'
  fromTable  = 'cr664_clientrelationship'
  fromColumn = 'cr664_PortalContact'
  toTable    = 'contact'
}

Write-Host '== create-borrower-portal-contact-relationship =='
Write-Host ("Mode: {0}" -f $(if ($Apply) { 'APPLY (live, gated)' } else { 'DRY-RUN' }))

$envInfo = Resolve-DataverseEnv
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }
$token = if ($orgUrl) { Get-DataverseToken $orgUrl } else { $null }

if (-not $orgUrl -or $orgUrl -notmatch [regex]::Escape($ExpectedOrgHost)) {
  Write-Status 'environment' 'BLOCKED' ("Resolved org '{0}' does not match '{1}'." -f $orgUrl, $ExpectedOrgHost)
  exit 1
}
Write-Status 'environment' 'PASS' ("org host matches '{0}'" -f $ExpectedOrgHost)

$solution = Invoke-DataverseGet $orgUrl $token ("solutions?`$select=uniquename&`$filter=uniquename eq '{0}'" -f $SolutionUniqueName)
if ($solution.value.Count -eq 0) {
  Write-Status $SolutionUniqueName 'BLOCKED' 'solution not found; no mutation performed.'
  exit 1
}
Write-Status $SolutionUniqueName 'PASS' 'solution exists'

foreach ($table in @($Relationship.fromTable, $Relationship.toTable)) {
  if ((Test-DataverseTable $orgUrl $token $table) -ne $true) {
    Write-Status $table 'BLOCKED' 'required table is missing; no mutation performed.'
    exit 1
  }
  Write-Status $table 'PASS' 'table exists'
}

if ($Apply) {
  if (-not (Test-DataverseToken $orgUrl $token)) {
    Write-Status 'token' 'BLOCKED' 'Dataverse rejected the access token.'
    exit 1
  }
  if (-not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) {
    Write-Status 'mutation' 'BLOCKED' 'operator did not confirm.'
    exit 1
  }
}

$result = New-DataverseRelationshipIfMissing `
  -RelDef $Relationship `
  -OrgUrl $orgUrl `
  -Token $token `
  -Apply:$Apply.IsPresent

if ($Apply -and $result -eq 'created') {
  $headers = @{
    Authorization = "Bearer $token"
    'OData-MaxVersion' = '4.0'
    'OData-Version' = '4.0'
    'Content-Type' = 'application/json'
  }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/PublishAllXml" -f $orgUrl.TrimEnd('/')) -Headers $headers -Body '{}' | Out-Null
  Write-Status 'publish' 'PASS' 'customizations published'
}

Write-Host ("EVIDENCE: [borrower-portal-contact-scope] mode={0} relationship={1} result={2} ts={3}" -f `
  $(if ($Apply) { 'apply' } else { 'dry-run' }), $Relationship.schemaName, $result, (Get-Date -Format o))
