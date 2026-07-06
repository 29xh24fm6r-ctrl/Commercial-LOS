param(
  [Parameter(Mandatory = $true)]
  [string] $SolutionUniqueName,

  [switch] $IncludeTier2
)

$ErrorActionPreference = "Stop"

$OrgUrl = if ($env:DATAVERSE_ORG_URL) { $env:DATAVERSE_ORG_URL } else { "https://org3a57b8d4.crm.dynamics.com" }
$ApiBase = "$OrgUrl/api/data/v9.2"

function Get-DataverseToken {
  if ($env:DATAVERSE_BEARER_TOKEN) {
    return $env:DATAVERSE_BEARER_TOKEN
  }

  if ($env:DATAVERSE_ACCESS_TOKEN) {
    return $env:DATAVERSE_ACCESS_TOKEN
  }

  if ($env:DATAVERSE_TOKEN) {
    return $env:DATAVERSE_TOKEN
  }

  throw "No Dataverse token found. Run Connect-AzAccount + Get-AzAccessToken block first."
}

$Token = Get-DataverseToken

$Headers = @{
  "Authorization" = "Bearer $Token"
  "Accept" = "application/json"
  "Content-Type" = "application/json; charset=utf-8"
  "OData-MaxVersion" = "4.0"
  "OData-Version" = "4.0"
  "MSCRM.SolutionUniqueName" = $SolutionUniqueName
}

function Invoke-DvGet {
  param([string] $Url)
  Invoke-RestMethod -Method Get -Uri $Url -Headers $Headers
}

function Invoke-DvPost {
  param(
    [string] $Url,
    [object] $Body
  )

  $json = $Body | ConvertTo-Json -Depth 20
  Invoke-RestMethod -Method Post -Uri $Url -Headers $Headers -Body $json
}

function Assert-SolutionExists {
  param([string] $UniqueName)

  $url = "$ApiBase/solutions?`$select=uniquename,friendlyname&`$filter=uniquename eq '$UniqueName'"
  $result = Invoke-DvGet -Url $url

  if (-not $result.value -or $result.value.Count -eq 0) {
    throw "Solution unique name '$UniqueName' was not found. List solutions and use the exact uniquename."
  }

  Write-Host "Using solution: $($result.value[0].friendlyname) [$($result.value[0].uniquename)]"
}

function Get-EntityDefinition {
  param([string] $LogicalName)

  $url = "$ApiBase/EntityDefinitions(LogicalName='$LogicalName')?`$select=LogicalName,SchemaName,MetadataId"
  Invoke-DvGet -Url $url
}

function Test-AttributeExists {
  param(
    [string] $EntityLogicalName,
    [string] $AttributeLogicalName
  )

  $url = "$ApiBase/EntityDefinitions(LogicalName='$EntityLogicalName')/Attributes(LogicalName='$AttributeLogicalName')?`$select=LogicalName,SchemaName"
  try {
    $null = Invoke-DvGet -Url $url
    return $true
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
      return $false
    }
    throw
  }
}

function New-MemoColumn {
  param(
    [string] $EntityLogicalName,
    [string] $SchemaName,
    [string] $DisplayName,
    [int] $MaxLength
  )

  $logical = $SchemaName.ToLowerInvariant()

  if (Test-AttributeExists -EntityLogicalName $EntityLogicalName -AttributeLogicalName $logical) {
    Write-Host "Exists: $EntityLogicalName.$logical"
    return
  }

  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"
    "SchemaName" = $SchemaName
    "DisplayName" = @{
      "LocalizedLabels" = @(
        @{
          "Label" = $DisplayName
          "LanguageCode" = 1033
        }
      )
    }
    "Description" = @{
      "LocalizedLabels" = @(
        @{
          "Label" = $DisplayName
          "LanguageCode" = 1033
        }
      )
    }
    "RequiredLevel" = @{
      "Value" = "None"
      "CanBeChanged" = $true
      "ManagedPropertyLogicalName" = "canmodifyrequirementlevelsettings"
    }
    "MaxLength" = $MaxLength
  }

  $url = "$ApiBase/EntityDefinitions(LogicalName='$EntityLogicalName')/Attributes"
  Invoke-DvPost -Url $url -Body $body | Out-Null
  Write-Host "Created memo column: $EntityLogicalName.$logical"
}

function New-StringColumn {
  param(
    [string] $EntityLogicalName,
    [string] $SchemaName,
    [string] $DisplayName,
    [int] $MaxLength = 250
  )

  $logical = $SchemaName.ToLowerInvariant()

  if (Test-AttributeExists -EntityLogicalName $EntityLogicalName -AttributeLogicalName $logical) {
    Write-Host "Exists: $EntityLogicalName.$logical"
    return
  }

  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
    "SchemaName" = $SchemaName
    "DisplayName" = @{
      "LocalizedLabels" = @(
        @{
          "Label" = $DisplayName
          "LanguageCode" = 1033
        }
      )
    }
    "RequiredLevel" = @{
      "Value" = "None"
      "CanBeChanged" = $true
      "ManagedPropertyLogicalName" = "canmodifyrequirementlevelsettings"
    }
    "MaxLength" = $MaxLength
    "FormatName" = @{
      "Value" = "Text"
    }
  }

  $url = "$ApiBase/EntityDefinitions(LogicalName='$EntityLogicalName')/Attributes"
  Invoke-DvPost -Url $url -Body $body | Out-Null
  Write-Host "Created text column: $EntityLogicalName.$logical"
}

function New-IntegerColumn {
  param(
    [string] $EntityLogicalName,
    [string] $SchemaName,
    [string] $DisplayName
  )

  $logical = $SchemaName.ToLowerInvariant()

  if (Test-AttributeExists -EntityLogicalName $EntityLogicalName -AttributeLogicalName $logical) {
    Write-Host "Exists: $EntityLogicalName.$logical"
    return
  }

  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
    "SchemaName" = $SchemaName
    "DisplayName" = @{
      "LocalizedLabels" = @(
        @{
          "Label" = $DisplayName
          "LanguageCode" = 1033
        }
      )
    }
    "RequiredLevel" = @{
      "Value" = "None"
      "CanBeChanged" = $true
      "ManagedPropertyLogicalName" = "canmodifyrequirementlevelsettings"
    }
    "MinValue" = 0
    "MaxValue" = 2147483647
  }

  $url = "$ApiBase/EntityDefinitions(LogicalName='$EntityLogicalName')/Attributes"
  Invoke-DvPost -Url $url -Body $body | Out-Null
  Write-Host "Created whole-number column: $EntityLogicalName.$logical"
}

function New-MoneyColumn {
  param(
    [string] $EntityLogicalName,
    [string] $SchemaName,
    [string] $DisplayName
  )

  $logical = $SchemaName.ToLowerInvariant()

  if (Test-AttributeExists -EntityLogicalName $EntityLogicalName -AttributeLogicalName $logical) {
    Write-Host "Exists: $EntityLogicalName.$logical"
    return
  }

  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.MoneyAttributeMetadata"
    "SchemaName" = $SchemaName
    "DisplayName" = @{
      "LocalizedLabels" = @(
        @{
          "Label" = $DisplayName
          "LanguageCode" = 1033
        }
      )
    }
    "RequiredLevel" = @{
      "Value" = "None"
      "CanBeChanged" = $true
      "ManagedPropertyLogicalName" = "canmodifyrequirementlevelsettings"
    }
    "MinValue" = 0
    "MaxValue" = 100000000000
    "Precision" = 2
  }

  $url = "$ApiBase/EntityDefinitions(LogicalName='$EntityLogicalName')/Attributes"
  Invoke-DvPost -Url $url -Body $body | Out-Null
  Write-Host "Created currency column: $EntityLogicalName.$logical"
}

function New-DateTimeColumn {
  param(
    [string] $EntityLogicalName,
    [string] $SchemaName,
    [string] $DisplayName
  )

  $logical = $SchemaName.ToLowerInvariant()

  if (Test-AttributeExists -EntityLogicalName $EntityLogicalName -AttributeLogicalName $logical) {
    Write-Host "Exists: $EntityLogicalName.$logical"
    return
  }

  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
    "SchemaName" = $SchemaName
    "DisplayName" = @{
      "LocalizedLabels" = @(
        @{
          "Label" = $DisplayName
          "LanguageCode" = 1033
        }
      )
    }
    "RequiredLevel" = @{
      "Value" = "None"
      "CanBeChanged" = $true
      "ManagedPropertyLogicalName" = "canmodifyrequirementlevelsettings"
    }
    "Format" = "DateAndTime"
    "DateTimeBehavior" = @{
      "Value" = "UserLocal"
    }
  }

  $url = "$ApiBase/EntityDefinitions(LogicalName='$EntityLogicalName')/Attributes"
  Invoke-DvPost -Url $url -Body $body | Out-Null
  Write-Host "Created date-time column: $EntityLogicalName.$logical"
}

function Test-TableExists {
  param([string] $LogicalName)

  try {
    $null = Get-EntityDefinition -LogicalName $LogicalName
    return $true
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
      return $false
    }
    throw
  }
}

function New-PortfolioMigrationControlTable {
  $logical = "cr664_portfoliomigrationcontrol"

  if (Test-TableExists -LogicalName $logical) {
    Write-Host "Exists: $logical"
    return
  }

  $body = @{
    "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"
    "SchemaName" = "cr664_PortfolioMigrationControl"
    "DisplayName" = @{
      "LocalizedLabels" = @(
        @{
          "Label" = "Portfolio Migration Control"
          "LanguageCode" = 1033
        }
      )
    }
    "DisplayCollectionName" = @{
      "LocalizedLabels" = @(
        @{
          "Label" = "Portfolio Migration Controls"
          "LanguageCode" = 1033
        }
      )
    }
    "Description" = @{
      "LocalizedLabels" = @(
        @{
          "Label" = "One row per portfolio migration batch."
          "LanguageCode" = 1033
        }
      )
    }
    "OwnershipType" = "UserOwned"
    "IsActivity" = $false
    "HasActivities" = $false
    "HasNotes" = $false
    "Attributes" = @(
      @{
        "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
        "SchemaName" = "cr664_Name"
        "DisplayName" = @{
          "LocalizedLabels" = @(
            @{
              "Label" = "Name"
              "LanguageCode" = 1033
            }
          )
        }
        "RequiredLevel" = @{
          "Value" = "ApplicationRequired"
          "CanBeChanged" = $true
          "ManagedPropertyLogicalName" = "canmodifyrequirementlevelsettings"
        }
        "MaxLength" = 100
        "FormatName" = @{
          "Value" = "Text"
        }
        "IsPrimaryName" = $true
      }
    )
  }

  Invoke-DvPost -Url "$ApiBase/EntityDefinitions" -Body $body | Out-Null
  Write-Host "Created table: $logical"
}

Assert-SolutionExists -UniqueName $SolutionUniqueName

Write-Host ""
Write-Host "Checking existing boarded-loan table..."
Get-EntityDefinition -LogicalName "cr664_portfolioboardedloan" | Out-Null
Write-Host "Found: cr664_portfolioboardedloan"

Write-Host ""
Write-Host "TIER 1: creating required extended-loan-attributes column..."
New-MemoColumn `
  -EntityLogicalName "cr664_portfolioboardedloan" `
  -SchemaName "cr664_extendedloanattributes" `
  -DisplayName "Extended Loan Attributes" `
  -MaxLength 4000

if ($IncludeTier2) {
  Write-Host ""
  Write-Host "TIER 2: creating optional migration-control table and tie-out columns..."

  New-PortfolioMigrationControlTable

  New-StringColumn  -EntityLogicalName "cr664_portfoliomigrationcontrol" -SchemaName "cr664_migrationbatchid" -DisplayName "Migration Batch ID"
  New-StringColumn  -EntityLogicalName "cr664_portfoliomigrationcontrol" -SchemaName "cr664_operator" -DisplayName "Operator"
  New-IntegerColumn -EntityLogicalName "cr664_portfoliomigrationcontrol" -SchemaName "cr664_enteredloancount" -DisplayName "Entered Loan Count"
  New-MoneyColumn   -EntityLogicalName "cr664_portfoliomigrationcontrol" -SchemaName "cr664_enteredaggregateoutstanding" -DisplayName "Entered Aggregate Outstanding"
  New-MemoColumn    -EntityLogicalName "cr664_portfoliomigrationcontrol" -SchemaName "cr664_segmentsubtotalsjson" -DisplayName "Segment Subtotals JSON" -MaxLength 4000
  New-MemoColumn    -EntityLogicalName "cr664_portfoliomigrationcontrol" -SchemaName "cr664_expectedloannumbersjson" -DisplayName "Expected Loan Numbers JSON" -MaxLength 4000
  New-MemoColumn    -EntityLogicalName "cr664_portfoliomigrationcontrol" -SchemaName "cr664_sourcedescription" -DisplayName "Source Description" -MaxLength 4000
  New-DateTimeColumn -EntityLogicalName "cr664_portfoliomigrationcontrol" -SchemaName "cr664_enteredat" -DisplayName "Entered At"

  New-StringColumn `
    -EntityLogicalName "cr664_portfolioboardedloan" `
    -SchemaName "cr664_migrationbatchid" `
    -DisplayName "Migration Batch ID"
}

Write-Host ""
Write-Host "Publishing customizations..."
pac solution publish --environment $OrgUrl

Write-Host ""
Write-Host "Verifying Tier 1..."
if (-not (Test-AttributeExists -EntityLogicalName "cr664_portfolioboardedloan" -AttributeLogicalName "cr664_extendedloanattributes")) {
  throw "Tier 1 verification failed: cr664_extendedloanattributes not found."
}

Write-Host "PASS: cr664_portfolioboardedloan.cr664_extendedloanattributes exists."
Write-Host ""
Write-Host "DB provisioning complete."
