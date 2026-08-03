<# Additive, hash-gated Dataverse schema provisioning for governed Copilot credit intelligence. #>
[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Force,
  [string]$ExpectedSchemaSha256,
  [string]$SchemaPath = 'deployment\copilot-credit-intelligence\dataverse-schema-plan.json'
)

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$fullPath = (Resolve-Path (Join-Path $repo $SchemaPath)).Path
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $fullPath).Hash.ToLowerInvariant()
$plan = Get-Content -Raw -LiteralPath $fullPath | ConvertFrom-Json
if ($plan.mutationSemantics -ne 'CREATE_MISSING_ONLY' -or @($plan.destructiveOperations).Count -ne 0) { throw 'Schema plan is not additive.' }
if (@($plan.tables.logicalName | Group-Object | Where-Object Count -gt 1).Count) { throw 'Duplicate table definitions.' }
if (@($plan.columns | Group-Object table,logicalName | Where-Object Count -gt 1).Count) { throw 'Duplicate column definitions.' }
if ($Apply -and ([string]::IsNullOrWhiteSpace($ExpectedSchemaSha256) -or $hash -ne $ExpectedSchemaSha256.Trim().ToLowerInvariant())) { throw 'Schema hash mismatch or missing expected hash.' }

Write-Host ("Mode={0} schemaSha256={1} tables={2} columns={3} relationships={4}" -f $(if($Apply){'APPLY'}else{'DRY_RUN'}),$hash,@($plan.tables).Count,@($plan.columns).Count,@($plan.relationships).Count)
if (-not $Apply) { Write-Host 'NO MUTATION: create-missing-only plan validated.'; exit 0 }
$environment = Resolve-DataverseEnv
$orgUrl = if($environment){$environment.OrgUrl.TrimEnd('/')}else{$null}
$token = if($orgUrl){Get-DataverseToken $orgUrl}else{$null}
if ($Apply -and (-not $orgUrl -or -not (Test-DataverseToken $orgUrl $token))) { throw 'Apply requires an authenticated Dataverse connection.' }
if ($Apply -and -not (Confirm-Mutation $true $Force.IsPresent $orgUrl)) { throw 'Operator declined mutation.' }

$api = "$orgUrl/api/data/v9.2"
$headers = @{ Authorization="Bearer $token"; 'OData-MaxVersion'='4.0'; 'OData-Version'='4.0'; Accept='application/json'; 'Content-Type'='application/json' }
function Get-Metadata([string]$path) { try { Invoke-RestMethod -Method Get -Uri "$api/$path" -Headers $headers } catch { if($_.Exception.Response.StatusCode.value__ -eq 404){return $false}; throw } }
function Post-Metadata([string]$path,$body) { Invoke-RestMethod -Method Post -Uri "$api/$path" -Headers $headers -Body ($body|ConvertTo-Json -Depth 20)|Out-Null }
function Label([string]$value) { @{ LocalizedLabels=@(@{Label=$value;LanguageCode=1033}) } }

try {
  foreach($table in @($plan.tables)) {
    $actual = Get-Metadata "EntityDefinitions(LogicalName='$($table.logicalName)')?`$select=LogicalName,OwnershipType,PrimaryNameAttribute"
    if($actual) {
      if([string]$actual.OwnershipType -ne [string]$table.ownershipType -or [string]$actual.PrimaryNameAttribute -ne [string]$table.primaryNameColumn){throw "Existing table $($table.logicalName) conflicts with the plan."}
      Write-Host "PASS table $($table.logicalName) exists"
      continue
    }
    $primary = @($plan.columns|Where-Object {$_.table -eq $table.logicalName -and $_.logicalName -eq $table.primaryNameColumn})
    if($primary.Count -ne 1){throw "Primary name definition missing for $($table.logicalName)."}
    Post-Metadata 'EntityDefinitions' @{
      '@odata.type'='Microsoft.Dynamics.CRM.EntityMetadata';SchemaName=$table.schemaName;LogicalName=$table.logicalName
      DisplayName=(Label $table.displayName);DisplayCollectionName=(Label $table.displayCollectionName)
      OwnershipType=$table.ownershipType;IsAuditEnabled=@{Value=$true};HasActivities=$false;HasNotes=$false
      Attributes=@(@{'@odata.type'='Microsoft.Dynamics.CRM.StringAttributeMetadata';SchemaName=$primary[0].schemaName;LogicalName=$primary[0].logicalName;MaxLength=[int]$primary[0].maxLength;FormatName=@{Value='Text'};IsPrimaryName=$true;RequiredLevel=@{Value='ApplicationRequired'};DisplayName=(Label $primary[0].displayName);IsAuditEnabled=@{Value=$true}})
    }
    Write-Host "CREATED table $($table.logicalName)"
  }

  foreach($column in @($plan.columns)) {
    $table = @($plan.tables|Where-Object logicalName -eq $column.table)[0]
    if($column.logicalName -eq $table.primaryNameColumn){continue}
    $actual = Get-Metadata "EntityDefinitions(LogicalName='$($column.table)')/Attributes(LogicalName='$($column.logicalName)')?`$select=LogicalName,AttributeType"
    if($actual){ if([string]$actual.AttributeType -ne [string]$column.type){throw "Column type mismatch $($column.table).$($column.logicalName)."}; Write-Host "PASS column $($column.table).$($column.logicalName) exists"; continue }
    $common=@{SchemaName=$column.schemaName;LogicalName=$column.logicalName;RequiredLevel=@{Value=[string]$column.requiredLevel};DisplayName=(Label $column.displayName);IsAuditEnabled=@{Value=$true}}
    $body = switch([string]$column.type) {
      'String' { $common+@{'@odata.type'='Microsoft.Dynamics.CRM.StringAttributeMetadata';MaxLength=[int]$column.maxLength;FormatName=@{Value='Text'}} }
      'Memo' { $common+@{'@odata.type'='Microsoft.Dynamics.CRM.MemoAttributeMetadata';MaxLength=[int]$column.maxLength;Format='Text'} }
      'Boolean' { $common+@{'@odata.type'='Microsoft.Dynamics.CRM.BooleanAttributeMetadata';DefaultValue=$false;OptionSet=@{'@odata.type'='Microsoft.Dynamics.CRM.BooleanOptionSetMetadata';TrueOption=@{Value=1;Label=(Label 'Yes')};FalseOption=@{Value=0;Label=(Label 'No')}}} }
      'DateTime' { $common+@{'@odata.type'='Microsoft.Dynamics.CRM.DateTimeAttributeMetadata';Format='DateAndTime';DateTimeBehavior=@{Value='UserLocal'}} }
      'Integer' { $common+@{'@odata.type'='Microsoft.Dynamics.CRM.IntegerAttributeMetadata';Format='None';MinValue=-2147483648;MaxValue=2147483647} }
      'Decimal' { $common+@{'@odata.type'='Microsoft.Dynamics.CRM.DecimalAttributeMetadata';Precision=6;MinValue=-100000000000.0;MaxValue=100000000000.0} }
      default { throw "Unsupported column type $($column.type)." }
    }
    Post-Metadata "EntityDefinitions(LogicalName='$($column.table)')/Attributes" $body
    Write-Host "CREATED column $($column.table).$($column.logicalName)"
  }

  foreach($relationship in @($plan.relationships)) {
    $actual = Get-Metadata "RelationshipDefinitions(SchemaName='$($relationship.schemaName)')/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?`$select=SchemaName,ReferencedEntity,ReferencingEntity,ReferencingAttribute"
    if($actual){if($actual.ReferencedEntity -ne $relationship.toTable -or $actual.ReferencingEntity -ne $relationship.fromTable -or $actual.ReferencingAttribute -ne $relationship.fromColumn){throw "Relationship mismatch $($relationship.schemaName)."};Write-Host "PASS relationship $($relationship.schemaName) exists";continue}
    Post-Metadata 'RelationshipDefinitions' @{
      '@odata.type'='Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata';SchemaName=$relationship.schemaName
      ReferencedEntity=$relationship.toTable;ReferencingEntity=$relationship.fromTable
      Lookup=@{'@odata.type'='Microsoft.Dynamics.CRM.LookupAttributeMetadata';SchemaName=$relationship.fromColumn;LogicalName=$relationship.fromColumn;RequiredLevel=@{Value=$relationship.requiredLevel};DisplayName=(Label $relationship.fromColumn)}
    }
    Write-Host "CREATED relationship $($relationship.schemaName)"
  }
  Write-Host "PASS additive Copilot credit-intelligence schema readback complete schemaSha256=$hash"
} finally { $token=$null }
