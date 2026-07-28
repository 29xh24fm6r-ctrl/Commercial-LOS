<#
  Phase 243 - _common.ps1  (shared helpers for the Dataverse schema scripts)

  SAFETY MODEL (enforced by callers + governance test):
    - DRY-RUN BY DEFAULT. Mutation happens only when the caller passes -Apply.
    - Confirms the target environment via `pac org who` and prints org URL + user
      before any mutation.
    - CREATE-MISSING-ONLY: every create checks existence first and skips if present.
      Nothing is ever overwritten, renamed, or deleted. There is NO delete path.
    - No feature-flag flip, no email send, no `pac code push`, no route change.
#>

$ErrorActionPreference = 'Stop'

function Write-Status([string]$label, [string]$status, [string]$detail = '') {
  Write-Host ("[{0}] {1}{2}" -f $status, $label, $(if ($detail) { " - $detail" } else { '' }))
}

# Read-only environment confirmation via the Power Platform CLI.
function Resolve-DataverseEnv {
  $who = $null
  try { $who = & pac org who 2>&1 } catch { }
  if (-not $who) {
    Write-Status 'pac org who' 'BLOCKED' 'pac is not connected. Run `pac auth create` / `pac org select` for the INTENDED environment, then retry.'
    return $null
  }
  $text = ($who | Out-String)
  $url = ([regex]::Match($text, 'https://[a-zA-Z0-9\.\-]+\.dynamics\.com[^\s]*')).Value
  # Parse the operator UPN robustly across pac output formats: "Connected as <upn>"
  # (no colon), "User Email: <upn>", or "User: <upn>". Fall back to the first email
  # token in the output. This resolves the real authenticated operator (fixes the
  # prior unknown-operator capture caused by the labeled-colon-only regex).
  $emailRe = '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}'
  $user = ([regex]::Match($text, "(?im)^\s*(?:User Email|Connected as|User)\s*:?\s*($emailRe)")).Groups[1].Value.Trim()
  if (-not $user) { $user = ([regex]::Match($text, $emailRe)).Value.Trim() }
  Write-Host '== Target environment (confirm before any mutation) =='
  Write-Host $text.Trim()
  Write-Host ("ORG URL: {0}" -f $(if ($url) { $url } else { '(unparsed - see above)' }))
  return [pscustomobject]@{ OrgUrl = $url; User = $user; Raw = $text }
}

# Best-effort read-only access token for the Dataverse Web API. Returns $null if
# none is available (dry-run can still print the plan; -Apply requires one).
# Sources, in order: DATAVERSE_ACCESS_TOKEN env, az CLI, Az PowerShell module.
function Get-DataverseToken([string]$orgUrl) {
  if ($env:DATAVERSE_ACCESS_TOKEN) { return $env:DATAVERSE_ACCESS_TOKEN }
  if (-not $orgUrl) { return $null }
  $resource = ([uri]$orgUrl).GetLeftPart([System.UriPartial]::Authority)
  # 1) az CLI (if installed + logged in)
  try {
    $json = & az account get-access-token --resource $resource 2>$null | ConvertFrom-Json
    if ($json -and $json.accessToken) { return $json.accessToken }
  } catch { }
  # 2) Az PowerShell module (Get-AzAccessToken) if a context is present.
  try {
    if (Get-Command Get-AzAccessToken -ErrorAction SilentlyContinue) {
      $t = Get-AzAccessToken -ResourceUrl $resource -ErrorAction Stop
      if ($t -and $t.Token) {
        if ($t.Token -is [System.Security.SecureString]) {
          return [System.Net.NetworkCredential]::new('', $t.Token).Password
        }
        return [string]$t.Token
      }
    }
  } catch { }
  return $null
}

# Validates a token actually works against THIS org via WhoAmI. A token can be
# issued for the user yet rejected by Dataverse (e.g. the calling app is not a
# provisioned application user -> 401). Returns $true only on a 200 WhoAmI.
function Test-DataverseToken([string]$orgUrl, [string]$token) {
  if (-not $token -or -not $orgUrl) { return $false }
  try {
    Invoke-DataverseGet $orgUrl $token 'WhoAmI' | Out-Null
    return $true
  } catch { return $false }
}

function Invoke-DataverseGet([string]$orgUrl, [string]$token, [string]$path) {
  $headers = @{ Authorization = "Bearer $token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; Accept = 'application/json' }
  return Invoke-RestMethod -Method Get -Uri ("{0}/api/data/v9.2/{1}" -f $orgUrl.TrimEnd('/'), $path) -Headers $headers
}

# Returns $true / $false / $null(unknown - no token).
function Test-DataverseTable([string]$orgUrl, [string]$token, [string]$logicalName) {
  if (-not $token -or -not $orgUrl) { return $null }
  try {
    Invoke-DataverseGet $orgUrl $token ("EntityDefinitions(LogicalName='{0}')?`$select=LogicalName" -f $logicalName) | Out-Null
    return $true
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) { return $false }
    return $null
  }
}

# CREATE-MISSING-ONLY. Mutates only when $Apply is $true. Never overwrites/deletes.
function New-DataverseTableIfMissing {
  param(
    [Parameter(Mandatory)] $TableDef,
    [string]$OrgUrl, [string]$Token, [bool]$Apply
  )
  $logical = $TableDef.logicalName
  $exists = Test-DataverseTable $OrgUrl $Token $logical
  if ($exists -eq $true) { Write-Status $logical 'PASS' 'table already exists (skip - never overwritten)'; return 'present' }

  if (-not $Apply) {
    Write-Status $logical $(if ($exists -eq $false) { 'BLOCKED' } else { 'UNKNOWN' }) 'WOULD CREATE (dry-run; pass -Apply to create the missing table)'
    return 'planned'
  }

  # -Apply: create the missing table (POST EntityDefinitions). Existence was
  # re-checked above; we only ever POST a NEW table, never PATCH/DELETE.
  $primary = $TableDef.primaryNameColumn
  $body = @{
    '@odata.type'         = 'Microsoft.Dynamics.CRM.EntityMetadata'
    SchemaName            = $TableDef.schemaName
    LogicalName           = $logical
    DisplayName           = @{ LocalizedLabels = @(@{ Label = $TableDef.displayName; LanguageCode = 1033 }) }
    DisplayCollectionName = @{ LocalizedLabels = @(@{ Label = $TableDef.displayCollectionName; LanguageCode = 1033 }) }
    OwnershipType         = $TableDef.ownershipType
    IsAuditEnabled        = @{ Value = [bool]$TableDef.auditEnabled }
    HasActivities         = $false
    HasNotes              = $false
    Attributes            = @(@{
      '@odata.type'  = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'
      SchemaName     = $primary.Substring(0,1).ToUpper() + $primary.Substring(1)
      LogicalName    = $primary
      MaxLength      = 200
      IsPrimaryName  = $true
      RequiredLevel  = @{ Value = 'ApplicationRequired' }
      DisplayName    = @{ LocalizedLabels = @(@{ Label = 'Name'; LanguageCode = 1033 }) }
    })
  } | ConvertTo-Json -Depth 12
  $headers = @{ Authorization = "Bearer $Token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/EntityDefinitions" -f $OrgUrl.TrimEnd('/')) -Headers $headers -Body $body | Out-Null
  Write-Status $logical 'PASS' 'table created (was missing)'
  return 'created'
}

function Get-AttributeOdataType([string]$type) {
  switch ($type) {
    'String'   { 'Microsoft.Dynamics.CRM.StringAttributeMetadata' }
    'Memo'     { 'Microsoft.Dynamics.CRM.MemoAttributeMetadata' }
    'Boolean'  { 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata' }
    'DateTime' { 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata' }
    default    { 'Microsoft.Dynamics.CRM.StringAttributeMetadata' }
  }
}

# CREATE-MISSING-ONLY column. Mutates only when $Apply. Never overwrites/deletes.
function New-DataverseColumnIfMissing {
  param([Parameter(Mandatory)]$ColumnDef, [string]$TableLogical, [string]$OrgUrl, [string]$Token, [bool]$Apply)
  if ($ColumnDef.logicalName -match 'name$' -and $ColumnDef.requiredLevel -eq 'ApplicationRequired') { return 'present' } # primary name is created with the table
  $exists = $null
  if ($Token -and $OrgUrl) {
    try {
      Invoke-DataverseGet $OrgUrl $Token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=LogicalName" -f $TableLogical, $ColumnDef.logicalName) | Out-Null
      $exists = $true
    } catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { $exists = $false } }
  }
  if ($exists -eq $true) { Write-Status ("{0}.{1}" -f $TableLogical, $ColumnDef.logicalName) 'PASS' 'column exists (skip)'; return 'present' }
  if (-not $Apply) { Write-Status ("{0}.{1}" -f $TableLogical, $ColumnDef.logicalName) 'UNKNOWN' 'WOULD CREATE column (dry-run)'; return 'planned' }

  $odt = Get-AttributeOdataType $ColumnDef.type
  $attr = @{ '@odata.type' = $odt; SchemaName = ($ColumnDef.logicalName.Substring(0,1).ToUpper() + $ColumnDef.logicalName.Substring(1)); LogicalName = $ColumnDef.logicalName; RequiredLevel = @{ Value = $(if ($ColumnDef.requiredLevel) { $ColumnDef.requiredLevel } else { 'None' }) }; DisplayName = @{ LocalizedLabels = @(@{ Label = $ColumnDef.displayName; LanguageCode = 1033 }) } }
  if ($odt -like '*String*') { $attr.MaxLength = $(if ($ColumnDef.maxLength) { $ColumnDef.maxLength } else { 200 }); $attr.FormatName = @{ Value = 'Text' } }
  if ($odt -like '*Boolean*') { $attr.OptionSet = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata'; TrueOption = @{ Value = 1; Label = @{ LocalizedLabels = @(@{ Label = 'Yes'; LanguageCode = 1033 }) } }; FalseOption = @{ Value = 0; Label = @{ LocalizedLabels = @(@{ Label = 'No'; LanguageCode = 1033 }) } } } }
  $body = $attr | ConvertTo-Json -Depth 12
  $headers = @{ Authorization = "Bearer $Token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/EntityDefinitions(LogicalName='{1}')/Attributes" -f $OrgUrl.TrimEnd('/'), $TableLogical) -Headers $headers -Body $body | Out-Null
  Write-Status ("{0}.{1}" -f $TableLogical, $ColumnDef.logicalName) 'PASS' 'column created (was missing)'
  return 'created'
}

# CREATE-MISSING-ONLY lookup relationship (OneToMany). Never overwrites/deletes.
function New-DataverseRelationshipIfMissing {
  param([Parameter(Mandatory)]$RelDef, [string]$OrgUrl, [string]$Token, [bool]$Apply)
  if (-not $RelDef.schemaName) { return 'skipped' }
  $exists = $null
  if ($Token -and $OrgUrl) {
    try { Invoke-DataverseGet $OrgUrl $Token ("RelationshipDefinitions(SchemaName='{0}')?`$select=SchemaName" -f $RelDef.schemaName) | Out-Null; $exists = $true }
    catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { $exists = $false } }
  }
  if ($exists -eq $true) { Write-Status $RelDef.schemaName 'PASS' 'relationship exists (skip)'; return 'present' }
  if (-not $Apply) { Write-Status $RelDef.schemaName 'UNKNOWN' 'WOULD CREATE relationship (dry-run)'; return 'planned' }

  $body = @{
    '@odata.type'         = 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'
    SchemaName            = $RelDef.schemaName
    ReferencedEntity      = $RelDef.toTable
    ReferencingEntity     = $RelDef.fromTable
    Lookup                = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.LookupAttributeMetadata'; SchemaName = $RelDef.fromColumn; RequiredLevel = @{ Value = 'None' }; DisplayName = @{ LocalizedLabels = @(@{ Label = $RelDef.fromColumn; LanguageCode = 1033 }) } }
  } | ConvertTo-Json -Depth 12
  $headers = @{ Authorization = "Bearer $Token"; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0'; 'Content-Type' = 'application/json' }
  Invoke-RestMethod -Method Post -Uri ("{0}/api/data/v9.2/RelationshipDefinitions" -f $OrgUrl.TrimEnd('/')) -Headers $headers -Body $body | Out-Null
  Write-Status $RelDef.schemaName 'PASS' 'relationship created (was missing)'
  return 'created'
}

# Confirm before mutation unless -Force. Returns $true to proceed.
function Confirm-Mutation([bool]$Apply, [bool]$Force, [string]$orgUrl) {
  if (-not $Apply) { return $true }
  if ($Force) { return $true }
  Write-Host ("ABOUT TO MUTATE schema in: {0}" -f $orgUrl)
  $ans = Read-Host 'Type EXACTLY "APPLY" to proceed (anything else aborts)'
  return ($ans -ceq 'APPLY')
}
