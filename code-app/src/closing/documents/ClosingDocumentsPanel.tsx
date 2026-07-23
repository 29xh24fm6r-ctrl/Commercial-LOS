import { useMemo, useState, type CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../../shared/theme';
import { evaluateAllTemplates } from './closingDocumentEligibility';
import { previewClosingDocument } from './closingDocumentGeneration';
import { summarizeClosingDocumentPackage, latestManifestsByTemplate } from './closingDocumentPackage';
import type {
  ClosingDocumentFactModel,
  ClosingDocumentGenerationOutcome,
  ClosingDocumentTemplate,
  GeneratedClosingDocumentManifest,
} from './closingDocumentTypes';

/**
 * final-seven-workstreams Workstream 6 — the Closing Documents panel: eligible templates, missing
 * facts, template version, preview, generation status, superseded history, and per-document audit
 * attribution. Read-plus-governed-action only; the actual write happens through the caller's
 * `onGenerate`, which is expected to be wired to `generateClosingDocument` + a real (or in-memory)
 * storage dependency — this component never writes directly.
 *
 * NOT mounted anywhere in the live app yet (see src/navigation/intentionallyUnrouted.ts) — there is
 * no live Dataverse storage for generated documents (see closingDocumentStorage.ts's doc comment),
 * so surfacing this to a real banker today would imply a persistence guarantee that does not exist.
 */
export interface ClosingDocumentsPanelProps {
  readonly dealId: string;
  readonly facts: ClosingDocumentFactModel;
  readonly manifests: readonly GeneratedClosingDocumentManifest[];
  readonly authorized: boolean;
  readonly onGenerate: (template: ClosingDocumentTemplate) => Promise<ClosingDocumentGenerationOutcome>;
}

export function ClosingDocumentsPanel({ dealId, facts, manifests, authorized, onGenerate }: ClosingDocumentsPanelProps) {
  const eligibility = useMemo(() => evaluateAllTemplates(facts), [facts]);
  const dealManifests = useMemo(() => manifests.filter((m) => m.dealId === dealId), [manifests, dealId]);
  const currentByTemplate = useMemo(() => latestManifestsByTemplate(dealManifests), [dealManifests]);
  const summary = useMemo(
    () => summarizeClosingDocumentPackage(dealId, eligibility, dealManifests),
    [dealId, eligibility, dealManifests],
  );
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<Record<string, ClosingDocumentGenerationOutcome>>({});

  async function handleGenerate(template: ClosingDocumentTemplate) {
    setGenerating(template.key);
    try {
      const outcome = await onGenerate(template);
      setLastOutcome((prev) => ({ ...prev, [template.key]: outcome }));
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div style={styles.panel} data-closing-documents-panel data-completeness={summary.completeness}>
      <h2 style={styles.title}>Closing Documents</h2>
      <p style={styles.subtitle} data-testid="closing-documents-completeness">
        {summary.completeness === 'complete' && 'All eligible closing documents have been generated.'}
        {summary.completeness === 'partial' &&
          `${summary.documents.length} of ${summary.documents.length + summary.missingTemplates.length} eligible documents generated.`}
        {summary.completeness === 'none' && 'No closing documents generated yet.'}
      </p>
      <ul style={styles.list}>
        {eligibility.map((e) => {
          const template = e.template;
          const current = currentByTemplate.get(template.key);
          const outcome = lastOutcome[template.key];
          return (
            <li key={template.key} style={styles.item} data-closing-document-row={template.key}>
              <div style={styles.itemHeader}>
                <span style={styles.itemTitle}>{template.title}</span>
                <span style={styles.itemVersion}>v{template.version}</span>
              </div>
              {e.kind === 'eligible' ? (
                <p style={styles.eligible}>Eligible.</p>
              ) : e.kind === 'missing_facts' ? (
                <p style={styles.blocked}>Missing: {e.missingFacts.join(', ')}</p>
              ) : e.kind === 'wrong_product' ? (
                <p style={styles.blocked}>Not applicable to this deal's product.</p>
              ) : e.kind === 'wrong_jurisdiction' ? (
                <p style={styles.blocked}>Not applicable to this deal's jurisdiction.</p>
              ) : (
                <p style={styles.blocked}>Template not approved for use.</p>
              )}

              {current && (
                <p style={styles.generated} data-testid={`closing-document-generated-${template.key}`}>
                  Generated {current.generatedAtIso} by {current.generatedByActorEmail}
                  {current.supersedesManifestId ? ' (supersedes an earlier version)' : ''}
                </p>
              )}
              {dealManifests.some((m) => m.templateKey === template.key && m.manifestId !== current?.manifestId) && (
                <p style={styles.superseded}>
                  {
                    dealManifests.filter((m) => m.templateKey === template.key && m.manifestId !== current?.manifestId)
                      .length
                  }{' '}
                  superseded version(s) on record.
                </p>
              )}

              <div style={styles.actions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setPreviewKey((k) => (k === template.key ? null : template.key))}
                  disabled={e.kind !== 'eligible'}
                >
                  {previewKey === template.key ? 'Hide preview' : 'Preview'}
                </button>
                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={() => handleGenerate(template)}
                  disabled={e.kind !== 'eligible' || !authorized || generating === template.key}
                  title={!authorized ? 'Requires an authorized actor' : undefined}
                >
                  {generating === template.key ? 'Generating…' : current ? 'Regenerate' : 'Generate'}
                </button>
              </div>

              {previewKey === template.key && e.kind === 'eligible' && (
                <pre style={styles.previewBox}>{previewClosingDocument(template, facts).kind === 'preview'
                  ? (previewClosingDocument(template, facts) as { renderedContent: string }).renderedContent
                  : ''}</pre>
              )}

              {outcome && outcome.kind === 'write_failed' && (
                <p style={styles.error} role="alert">
                  Generation failed: {outcome.error}
                </p>
              )}
              {outcome && outcome.kind === 'generated' && !outcome.auditRecorded && (
                <p style={styles.warning} role="status">
                  Document generated, but audit evidence is incomplete. Admin review is required.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  title: { margin: 0, color: palette.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  subtitle: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.md },
  item: {
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  itemHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  itemTitle: { fontWeight: typography.weight.semibold, color: palette.text },
  itemVersion: { fontSize: typography.size.sm, color: palette.textMuted },
  eligible: { margin: 0, color: palette.clear, fontSize: typography.size.sm },
  blocked: { margin: 0, color: palette.blocked, fontSize: typography.size.sm },
  generated: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm },
  superseded: { margin: 0, color: palette.textMuted, fontSize: typography.size.sm, fontStyle: 'italic' },
  actions: { display: 'flex', gap: spacing.sm, marginTop: spacing.xs },
  primaryButton: {
    background: palette.primary,
    color: palette.primaryFg,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    font: 'inherit',
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
  },
  secondaryButton: {
    background: 'transparent',
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    font: 'inherit',
    cursor: 'pointer',
  },
  previewBox: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: typography.size.sm,
    whiteSpace: 'pre-wrap',
  },
  error: { margin: 0, color: palette.blocked, fontSize: typography.size.sm },
  warning: { margin: 0, color: palette.atRiskFg, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
};
