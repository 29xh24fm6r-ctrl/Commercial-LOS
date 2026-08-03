<#
  Verifies Microsoft Copilot full-system integration readiness artifacts.

  Read-only:
    - checks every primary LOS surface has the governed Copilot mount;
    - checks the Copilot Studio agent contract exists and covers every surface;
    - checks the Dataverse Custom API and audit ledger seams exist;
    - checks src/copilot has no browser-direct model, Graph, Outlook/Teams write, or client-secret posture.

  This script performs no Copilot Studio call, no Graph call, no Dataverse write, no model call, and no Power Apps code deployment.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$contractPath = Join-Path $repo 'microsoft365\copilot-studio\agent-contract.json'
$runbookPath = Join-Path $repo 'docs\MICROSOFT_COPILOT_FULL_INTEGRATION_RUNBOOK.md'
$copilotDir = Join-Path $repo 'src\copilot'

function Write-Check($Name, $Ok, $Detail) {
  $status = if ($Ok) { 'PASS' } else { 'BLOCKED' }
  Write-Host ("[{0}] {1} - {2}" -f $status, $Name, $Detail)
  return [bool]$Ok
}

function Read-Text($RelativePath) {
  $path = Join-Path $repo $RelativePath
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing expected file: $RelativePath"
  }
  return Get-Content -Raw -LiteralPath $path
}

function Strip-Comments($Text) {
  $withoutBlock = [regex]::Replace($Text, '/\*[\s\S]*?\*/', '')
  return [regex]::Replace($withoutBlock, '(^|\s)//.*$', '$1', 'Multiline')
}

Write-Host '== Microsoft Copilot full-system integration verification =='

$ok = $true

$expectedFiles = @(
  'src\copilot\CopilotAssistPanel.tsx',
  'src\copilot\DealCopilotAssist.tsx',
  'src\copilot\copilotConnector.ts',
  'src\copilot\copilotConnectorConfig.ts',
  'src\copilot\copilotCustomApiContract.ts',
  'src\copilot\copilotDataverseCustomApiTransport.ts',
  'src\copilot\creditIntelligence.ts',
  'src\copilot\creditIntelligenceRuntime.ts',
  'src\copilot\creditIntelligencePowerAppsClient.ts',
  'dataverse-plugins\CommercialLendingLOS.Plugins\CreditIntelligenceCustomApiPlugin.cs',
  'dataverse-plugins\CommercialLendingLOS.Plugins\CreditIntelligenceCustomApiRegistration.json',
  'deployment\copilot-credit-intelligence\dataverse-schema-plan.json',
  'scripts\dataverse\provision-credit-intelligence-schema.ps1',
  'scripts\dataverse\register-credit-intelligence-custom-api.ps1',
  'scripts\dataverse\provision-credit-intelligence-permissions.ps1',
  'azure\copilot-credit-intelligence\main.bicep',
  'azure\copilot-credit-intelligence\function-app\host.json',
  'azure\copilot-credit-intelligence\function-app\GovernedEvidence\function.json',
  'azure\copilot-credit-intelligence\function-app\index.mjs',
  'microsoft365\copilot-studio\credit-intelligence-openapi.json',
  'microsoft365\copilot-studio\security-and-compliance-contract.json',
  'microsoft365\copilot-studio\agent-evaluation-suite.json',
  'src\copilot\copilotAuditLogger.ts',
  'src\copilot\copilotServerDeploymentReadiness.ts',
  'microsoft365\copilot-studio\agent-contract.json',
  'docs\MICROSOFT_COPILOT_FULL_INTEGRATION_RUNBOOK.md'
)

foreach ($rel in $expectedFiles) {
  $path = Join-Path $repo $rel
  $ok = (Write-Check "File exists: $rel" (Test-Path -LiteralPath $path) $path) -and $ok
}

if (Test-Path -LiteralPath $contractPath) {
  $contract = Get-Content -Raw -LiteralPath $contractPath | ConvertFrom-Json
  $surfaceWorkspaces = @($contract.supportedSurfaces | ForEach-Object { [string]$_.workspace })
  foreach ($workspace in @('banker', 'manager', 'portfolio', 'team', 'executive')) {
    $ok = (Write-Check "Agent contract covers $workspace" ($surfaceWorkspaces -contains $workspace) ($surfaceWorkspaces -join ', ')) -and $ok
  }
  $ok = (Write-Check 'Agent contract Custom API' ($contract.customApi.name -eq 'cr664_RunLosCopilotAssist') "name=$($contract.customApi.name)") -and $ok
  $ok = (Write-Check 'Agent contract audit table' ($contract.customApi.auditTable -eq 'cr664_copilotauditevent') "auditTable=$($contract.customApi.auditTable)") -and $ok
  $ok = (Write-Check 'Agent contract blocks browser model calls' ($contract.policy.allowBrowserDirectModelCalls -eq $false) "allowBrowserDirectModelCalls=$($contract.policy.allowBrowserDirectModelCalls)") -and $ok
  $ok = (Write-Check 'Agent contract blocks client secrets' ($contract.policy.allowClientSecrets -eq $false) "allowClientSecrets=$($contract.policy.allowClientSecrets)") -and $ok
  $ok = (Write-Check 'Agent contract requires confirmation' ($contract.policy.requireHumanConfirmation -eq $true) "requireHumanConfirmation=$($contract.policy.requireHumanConfirmation)") -and $ok
  $tools = @($contract.creditIntelligence.tools)
  $ok = (Write-Check 'Credit intelligence Custom API' ($contract.creditIntelligence.customApi -eq 'cr664_RunCreditIntelligence') "name=$($contract.creditIntelligence.customApi)") -and $ok
  $ok = (Write-Check 'Six governed credit intelligence tools' ($tools.Count -eq 6) ($tools -join ', ')) -and $ok
  $ok = (Write-Check 'Protected characteristics rejected' ($contract.creditIntelligence.invariants -contains 'protected characteristics rejected') 'responsible AI invariant') -and $ok
  $ok = (Write-Check 'Governance remains authoritative' ($contract.creditIntelligence.invariants -contains 'governance engine remains authoritative') 'decision boundary') -and $ok
}

$surfaceChecks = @(
  @{ Name = 'Banker deal workspace'; File = 'src\deals\BankerDealWorkspace.tsx'; Pattern = 'DealCopilotAssist' },
  @{ Name = 'Manager command center'; File = 'src\manager\ManagerBloombergControlPanel.tsx'; Pattern = 'CopilotAssistPanel' },
  @{ Name = 'Portfolio command center'; File = 'src\portfolio\PortfolioCommandCenter.tsx'; Pattern = 'CopilotAssistPanel' },
  @{ Name = 'Team ops queue'; File = 'src\team\TeamOpsQueue.tsx'; Pattern = 'CopilotAssistPanel' },
  @{ Name = 'Executive command center'; File = 'src\executive\ExecutiveCommandCenter.tsx'; Pattern = 'CopilotAssistPanel' }
)

foreach ($check in $surfaceChecks) {
  $src = Read-Text $check.File
  $ok = (Write-Check $check.Name ($src -match [regex]::Escape($check.Pattern)) "$($check.File) contains $($check.Pattern)") -and $ok
}

$contractSrc = Read-Text 'src\copilot\copilotCustomApiContract.ts'
$ok = (Write-Check 'Custom API contract name referenced in source' ($contractSrc -match 'cr664_RunLosCopilotAssist|CopilotCustomApiRequest') 'copilotCustomApiContract.ts') -and $ok
$auditSrc = Read-Text 'src\copilot\copilotAuditLogger.ts'
$ok = (Write-Check 'Copilot audit table referenced in source' ($auditSrc -match 'cr664_copilotauditevent') 'copilotAuditLogger.ts') -and $ok
$configSrc = Read-Text 'src\copilot\copilotConnectorConfig.ts'
$ok = (Write-Check 'Client config uses symbolic endpoint alias' ($configSrc -match 'dataverse-custom-api') 'copilotConnectorConfig.ts') -and $ok
$ok = (Write-Check 'Client config rejects secret-looking values' ($configSrc -match 'SECRET_VALUE_PATTERNS') 'copilotConnectorConfig.ts') -and $ok

if (Test-Path -LiteralPath $copilotDir) {
  $copilotFiles = Get-ChildItem -LiteralPath $copilotDir -Recurse -Include *.ts,*.tsx |
    Where-Object {
      $_.Name -notmatch '\.test\.tsx?$' -and
      $_.Name -notmatch '\.governance\.test\.tsx?$'
    }
  $blockedPatterns = @(
    @{ Label = 'fetch'; Regex = 'fetch\s*\(' },
    @{ Label = 'XMLHttpRequest'; Regex = 'XMLHttpRequest' },
    @{ Label = 'Graph endpoint'; Regex = 'https?://graph\.microsoft\.com' },
    @{ Label = 'MSAL'; Regex = '\bmsal\b' },
    @{ Label = 'Office365 connector'; Regex = 'Office365|SendEmailV2' },
    @{ Label = 'OpenAI client secret'; Regex = '["'']sk-[A-Za-z0-9]{12,}|\bAZURE_OPENAI_API_KEY\b|\bOPENAI_API_KEY\b' }
  )
  foreach ($pattern in $blockedPatterns) {
    $hits = @()
    foreach ($file in $copilotFiles) {
      $text = Strip-Comments (Get-Content -Raw -LiteralPath $file.FullName)
      if ($text -match $pattern.Regex) {
        $hits += $file.FullName.Substring($repo.Length + 1)
      }
    }
    $ok = (Write-Check "No src/copilot browser-direct $($pattern.Label)" ($hits.Count -eq 0) ($(if ($hits.Count -eq 0) { 'no hits' } else { $hits -join ', ' }))) -and $ok
  }
}

if (Test-Path -LiteralPath $runbookPath) {
  $runbook = Get-Content -Raw -LiteralPath $runbookPath
  $ok = (Write-Check 'Runbook references Microsoft Copilot Studio code app docs' ($runbook -match 'connect-to-copilot-studio') 'MICROSOFT_COPILOT_FULL_INTEGRATION_RUNBOOK.md') -and $ok
  $ok = (Write-Check 'Runbook states no autonomous writes' ($runbook -match 'cannot autonomously write') 'MICROSOFT_COPILOT_FULL_INTEGRATION_RUNBOOK.md') -and $ok
}

if (-not $ok) {
  Write-Host 'STATUS: BLOCKED'
  exit 1
}

Write-Host 'STATUS: PASS'
Write-Host ("EVIDENCE: [copilot-full-integration] STATUS=PASS contract={0} runbook={1} ts={2}" -f $contractPath, $runbookPath, (Get-Date -Format o))
