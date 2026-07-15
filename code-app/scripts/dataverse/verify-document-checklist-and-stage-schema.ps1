<#
  verify-document-checklist-and-stage-schema.ps1

  READ-ONLY. Companion to create-document-checklist-file-columns.ps1 and
  create-dealstagereference-sequence-column.ps1 — never mutates anything, no -Apply flag exists on
  this script at all (mirrors verify-banker-credit-authority.ps1 / verify-full-schema.ps1's pattern).

  This is the item-A "inspect live Dataverse metadata before modifying anything" step — run this
  FIRST, before either provisioning script, so the plan below is checked against reality rather than
  assumed.

  Reports:
    - Existence + AttributeType for the six new cr664_documentchecklist upload columns.
    - Existence + AttributeType for cr664_dealstagereference.cr664_sequence /
      cr664_stagetype — and whether the live column actually exists (the generated TS model already
      has cr664_sequence?: number, which does NOT prove the live column exists; this check resolves
      that discrepancy directly rather than assuming either way).
    - Row count + cr664_sequence uniqueness for cr664_dealstagereferences (does NOT print row data
      by default — aggregate counts only, since row content may include operator-entered labels).
    - Repo-artifact cross-check: whether both generated service files exist and whether the new
      columns are visible in the generated models yet (they won't be for the six new upload columns
      until a real SDK regeneration runs — expected, not a failure, until that happens).

    powershell -File scripts/dataverse/verify-document-checklist-and-stage-schema.ps1
#>
[CmdletBinding()]
param()

. (Join-Path $PSScriptRoot '_common.ps1')
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

Write-Host '== verify-document-checklist-and-stage-schema :: read-only report =='

$envInfo = Resolve-DataverseEnv
$token = if ($envInfo) { Get-DataverseToken $envInfo.OrgUrl } else { $null }
$orgUrl = if ($envInfo) { $envInfo.OrgUrl } else { $null }

function Get-DataverseAttributeType([string]$OrgUrl, [string]$Token, [string]$TableLogical, [string]$ColumnLogical) {
  if (-not $Token -or -not $OrgUrl) { return $null }
  try {
    $r = Invoke-DataverseGet $OrgUrl $Token ("EntityDefinitions(LogicalName='{0}')/Attributes(LogicalName='{1}')?`$select=AttributeType" -f $TableLogical, $ColumnLogical)
    return $r.AttributeType
  } catch { return $null }
}

# --- 1. cr664_documentchecklist upload columns ---
Write-Host '-- cr664_documentchecklist upload columns --'
$uploadColumns = @(
  @{ logical = 'cr664_documentfile'; expected = 'File' },
  @{ logical = 'cr664_originalfilename'; expected = 'String' },
  @{ logical = 'cr664_mimetype'; expected = 'String' },
  @{ logical = 'cr664_filesizebytes'; expected = 'Integer' },
  @{ logical = 'cr664_uploadedon'; expected = 'DateTime' },
  @{ logical = 'cr664_uploadedby'; expected = 'Lookup' }
)
$uploadColumnsOk = 0
foreach ($c in $uploadColumns) {
  $actual = Get-DataverseAttributeType $orgUrl $token 'cr664_documentchecklist' $c.logical
  $status = if ($actual -eq $c.expected) { 'PASS' } elseif ($null -eq $actual) { 'UNKNOWN' } else { 'BLOCKED' }
  if ($status -eq 'PASS') { $uploadColumnsOk++ }
  Write-Status ("cr664_documentchecklist.{0}" -f $c.logical) $status ("AttributeType={0} expected={1}" -f $(if ($actual) { $actual } else { '(unreadable — likely does not exist yet)' }), $c.expected)
}
Write-Host ("EVIDENCE: [document-checklist-upload][verify-columns] ok={0}/{1} ts={2}" -f $uploadColumnsOk, $uploadColumns.Count, (Get-Date -Format o))

# --- 2. cr664_dealstagereference sequence column — resolve the generated-model-vs-live
#     discrepancy directly rather than assuming either state. ---
Write-Host '-- cr664_dealstagereferences ordering column --'
$stageColumns = @(
  @{ logical = 'cr664_sequence'; expected = 'Integer' },
  @{ logical = 'cr664_stagetype'; expected = 'String' }
)
foreach ($c in $stageColumns) {
  $actual = Get-DataverseAttributeType $orgUrl $token 'cr664_dealstagereference' $c.logical
  $status = if ($actual -eq $c.expected) { 'PASS' } elseif ($null -eq $actual) { 'UNKNOWN' } else { 'BLOCKED' }
  Write-Status ("cr664_dealstagereference.{0}" -f $c.logical) $status ("AttributeType={0} expected={1}" -f $(if ($actual) { $actual } else { '(unreadable — likely does not exist yet)' }), $c.expected)
}
$modelPath = Join-Path $repo 'src\generated\models\Cr664_dealstagereferencesModel.ts'
if (Test-Path $modelPath) {
  $modelHasSequence = (Get-Content $modelPath -Raw) -match 'cr664_sequence\?:\s*number'
  Write-Status 'generated model' $(if ($modelHasSequence) { 'PASS' } else { 'UNKNOWN' }) ("Cr664_dealstagereferencesModel.ts {0} cr664_sequence — this reflects what a PRIOR regen produced, not necessarily the current live schema; trust the live AttributeType check above." -f $(if ($modelHasSequence) { 'already declares' } else { 'does not yet declare' }))
} else {
  Write-Status 'generated model' 'UNKNOWN' 'Cr664_dealstagereferencesModel.ts not found in this checkout.'
}

# --- 3. Row count + sequence uniqueness (aggregate only — no row content printed). ---
Write-Host '-- cr664_dealstagereferences row state (aggregate only) --'
if ($token -and $orgUrl) {
  try {
    $rows = Invoke-DataverseGet $orgUrl $token 'cr664_dealstagereferences?$select=cr664_code,cr664_sequence,cr664_activeflag'
    $all = $rows.value
    $active = @($all | Where-Object { $_.cr664_activeflag -eq $true })
    $withSequence = @($active | Where-Object { $null -ne $_.cr664_sequence })
    $sequenceValues = $withSequence | ForEach-Object { $_.cr664_sequence }
    $distinctSequences = @($sequenceValues | Select-Object -Unique)
    $duplicatesFound = $sequenceValues.Count -ne $distinctSequences.Count
    Write-Status 'row count' 'PASS' ("{0} total row(s), {1} active" -f $all.Count, $active.Count)
    Write-Status 'sequence coverage' $(if ($withSequence.Count -eq $active.Count -and $active.Count -gt 0) { 'PASS' } else { 'UNKNOWN' }) ("{0}/{1} active row(s) have cr664_sequence populated" -f $withSequence.Count, $active.Count)
    Write-Status 'sequence uniqueness (active rows)' $(if ($duplicatesFound) { 'BLOCKED' } else { 'PASS' }) ("{0} distinct value(s) across {1} populated sequence(s)" -f $distinctSequences.Count, $sequenceValues.Count)
  } catch {
    Write-Status 'row state' 'UNKNOWN' ("could not read cr664_dealstagereferences rows: {0}" -f $_.Exception.Message)
  }
} else {
  Write-Status 'row state' 'UNKNOWN' 'no token — cannot read live rows.'
}

# --- 4. Repo-artifact cross-check. ---
Write-Host '-- repo artifact cross-check --'
$checklistServicePath = Join-Path $repo 'src\generated\services\Cr664_documentchecklistsService.ts'
$checklistModelPath = Join-Path $repo 'src\generated\models\Cr664_documentchecklistsModel.ts'
Write-Status 'Cr664_documentchecklistsService.ts' $(if (Test-Path $checklistServicePath) { 'PASS' } else { 'BLOCKED' }) $(if (Test-Path $checklistServicePath) { 'present' } else { 'missing from this checkout' })
if (Test-Path $checklistModelPath) {
  $modelHasFile = (Get-Content $checklistModelPath -Raw) -match 'cr664_documentfile'
  Write-Status 'Cr664_documentchecklistsModel.ts' $(if ($modelHasFile) { 'PASS' } else { 'UNKNOWN' }) ("{0} cr664_documentfile — expected UNKNOWN until a real SDK regen runs after the columns above are created." -f $(if ($modelHasFile) { 'already declares' } else { 'does not yet declare' }))
}

Write-Host ("EVIDENCE: [document-checklist-and-stage-schema][verify] ts={0}" -f (Get-Date -Format o))
