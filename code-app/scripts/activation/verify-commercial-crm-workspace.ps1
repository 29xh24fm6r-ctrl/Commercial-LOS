param([switch]$RunTests)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$required = @(
  'src\App.tsx',
  'src\crm\firstClass\CrmWorkspace.tsx',
  'src\crm\firstClass\CrmExperience.tsx',
  'src\crm\firstClass\crmGrowthWriteAdapter.ts',
  'scripts\dataverse\schema\commercial-crm-growth.schema.json',
  'docs\governance\COMMERCIAL_BANKING_CRM_WORKSPACE_ARCHITECTURE_2026-07-29.md',
  'docs\governance\COMMERCIAL_BANKING_CRM_WORKSPACE_CERTIFICATION_2026-07-29.md'
)
foreach ($path in $required) {
  $resolved = Join-Path $root $path
  if (-not (Test-Path -LiteralPath $resolved)) { throw "MISSING $path" }
  Write-Host "PASS $path"
}
$app = Get-Content -Raw -LiteralPath (Join-Path $root 'src\App.tsx')
$growth = Get-Content -Raw -LiteralPath (Join-Path $root 'src\crm\firstClass\crmGrowthModel.ts')
$copilot = Get-Content -Raw -LiteralPath (Join-Path $root 'src\crm\firstClass\CrmCopilotSurface.tsx')
if ($app -notmatch 'WORKSPACE_ROUTES\.crm') { throw 'CRM route is not mounted.' }
if ($growth -notmatch "verified:\s*false") { throw 'Growth schema must remain fail-closed before tenant evidence.' }
if ($copilot -notmatch 'cannot modify CRM records') { throw 'Copilot no-autonomous-write boundary is missing.' }
$schema = Get-Content -Raw -LiteralPath (Join-Path $root 'scripts\dataverse\schema\commercial-crm-growth.schema.json') | ConvertFrom-Json
if (@($schema.tables).Count -ne 3) { throw 'Expected exactly three proposed growth tables.' }
Write-Host 'PASS first-class route, fail-closed schema, Copilot boundary, and exact growth schema.'
if ($RunTests) {
  Push-Location $root
  try { & npx vitest run src/crm/firstClass; if ($LASTEXITCODE -ne 0) { throw "CRM tests failed ($LASTEXITCODE)" } }
  finally { Pop-Location }
}
Write-Host 'COMMERCIAL CRM WORKSPACE VERIFICATION PASS (read-only; no deployment or tenant mutation).'
