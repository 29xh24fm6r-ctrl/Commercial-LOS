import { useState, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { ProductProcessTemplate } from './productProcessTemplateTypes';

interface Props {
  templates: readonly ProductProcessTemplate[];
}

/**
 * Phase 142D — Product / process template catalog panel (read-only).
 *
 * Shows governed templates: type, product family, loan structure, workflow
 * default, requirement counts, servicing/annual-review expectations, risk class,
 * and caveats. Controls are local search only — there is NO create / edit /
 * delete / activate template, no product / covenant / document-request / task
 * creation, no workflow mutation, no Dataverse write, and no fetch.
 */
export function ProductProcessTemplateCatalogPanel({ templates }: Props) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const shown = q ? templates.filter((t) => `${t.displayName} ${t.templateType} ${t.productFamily}`.toLowerCase().includes(q)) : templates;

  return (
    <Card>
      <CardHeader title="Product / process templates" subtitle={`${templates.length} governed templates (read-only)`} />

      <input
        aria-label="Search templates"
        placeholder="Search templates by name / type / family"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={searchStyle}
      />

      {shown.length === 0 ? (
        <span style={noneStyle}>No templates match.</span>
      ) : (
        <ul style={listStyle}>
          {shown.map((t) => (
            <li key={t.templateKey} style={itemStyle}>
              <span style={nameStyle}>{t.displayName}</span>
              <span style={metaStyle}>{t.templateType} · {t.productFamily}{t.loanStructure ? ` · ${t.loanStructure}` : ''} · route: {t.workflowDefaults.routeKey} · {t.status.replace(/_/g, ' ')}</span>
              <span style={metaStyle}>Docs: {t.documentRequirements.length} · Covenants: {t.covenantTemplates.length} · Evidence: {t.evidenceRequirements.length} · Packages: {t.packageRequirements.length}</span>
              <span style={metaStyle}>Servicing: {t.servicingExpectations.length} · Annual review: {t.annualReviewExpectations.length} · Risk: {t.riskClass}</span>
              {t.caveats.map((c) => (
                <span key={c} style={caveatStyle}>{c}</span>
              ))}
            </li>
          ))}
        </ul>
      )}

      <CardFooter>
        <span>Metadata only — no template creation/editing, product/covenant/document creation, or writes occur here.</span>
      </CardFooter>
    </Card>
  );
}

const searchStyle: CSSProperties = { width: '100%', padding: spacing.xs, fontSize: typography.size.sm, marginBottom: spacing.sm, boxSizing: 'border-box' };
const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm };
const itemStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, borderBottom: `1px solid ${palette.border}`, paddingBottom: spacing.xs };
const nameStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const metaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const caveatStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.atRiskFg, fontStyle: 'italic' };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
