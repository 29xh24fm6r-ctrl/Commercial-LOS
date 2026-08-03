import { useState, type CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  CREDIT_INTELLIGENCE_TOOLS,
  type CreditIntelligenceResult,
  type CreditIntelligenceTool,
} from './creditIntelligence';

const LABELS: Readonly<Record<CreditIntelligenceTool, { label: string; description: string }>> = {
  research_party: { label: 'Research borrower', description: 'Research the company, principals, guarantors, approved public records, and internal relationship.' },
  build_credit_evidence_packet: { label: 'Build evidence packet', description: 'Extract and reconcile loan documents, calculate traceable ratios, and prepare cited memo inputs.' },
  explain_governance_route: { label: 'Explain governance route', description: 'Explain the stored policy evaluation, authority, separation requirements, and blockers.' },
  relationship_intelligence: { label: 'Relationship intelligence', description: 'Summarize permission-scoped CRM, Outlook, Teams, meetings, commitments, and follow-ups.' },
  portfolio_monitoring: { label: 'Monitor credit', description: 'Surface cited covenant, financial, insurance, borrowing-base, and risk-rating observations.' },
  policy_intelligence: { label: 'Analyze policy', description: 'Compare policy versions, identify stronger or weaker controls, and explain administrative blockers.' },
};

export interface CreditIntelligenceWorkbenchProps {
  readonly enabledTools: readonly CreditIntelligenceTool[];
  readonly runTool: (tool: CreditIntelligenceTool) => Promise<CreditIntelligenceResult>;
}

/** Shared LOS surface for all six governed intelligence tools. */
export function CreditIntelligenceWorkbench({ enabledTools, runTool }: CreditIntelligenceWorkbenchProps) {
  const [running, setRunning] = useState<CreditIntelligenceTool | undefined>();
  const [result, setResult] = useState<CreditIntelligenceResult | undefined>();

  async function execute(tool: CreditIntelligenceTool) {
    setRunning(tool);
    setResult(undefined);
    try {
      setResult(await runTool(tool));
    } finally {
      setRunning(undefined);
    }
  }

  return (
    <section aria-label="Commercial Credit Intelligence" style={workbenchStyle}>
      <header>
        <h3 style={headingStyle}>Commercial Credit Intelligence</h3>
        <p style={copyStyle}>Evidence-linked Microsoft Copilot assistance. Copilot cannot approve credit, assign authority, change a risk rating, or execute a proposed action.</p>
      </header>
      <div style={gridStyle}>
        {CREDIT_INTELLIGENCE_TOOLS.map((tool) => {
          const enabled = enabledTools.includes(tool);
          return <button
            key={tool}
            type="button"
            style={{ ...toolStyle, opacity: enabled ? 1 : .55 }}
            disabled={!enabled || running !== undefined}
            onClick={() => void execute(tool)}
          >
            <strong>{LABELS[tool].label}</strong>
            <span>{LABELS[tool].description}</span>
            {!enabled && <small>Not configured</small>}
          </button>;
        })}
      </div>
      {running && <p role="status">Running {LABELS[running].label} through authorized sources…</p>}
      {result?.status === 'blocked' && <div role="alert" style={blockedStyle}><strong>Blocked: {result.code}</strong><p>{result.safeMessage}</p></div>}
      {result?.status === 'complete' && <article style={resultStyle}>
        <h4>{LABELS[result.tool].label}</h4>
        {result.narrative && <p>{result.narrative.summary}</p>}
        <dl>
          <div><dt>Evidence</dt><dd>{result.evidence.length}</dd></div>
          <div><dt>Facts</dt><dd>{result.facts.length}</dd></div>
          <div><dt>Contradictions</dt><dd>{result.contradictions.length}</dd></div>
        </dl>
        {result.contradictions.map((item) => <p role="alert" key={item}>{item}</p>)}
        <details>
          <summary>Sources and provenance</summary>
          <ul>{result.evidence.map((item) => <li key={item.evidenceId}><strong>{item.title}</strong> — {item.sourceId}; retrieved <time>{item.retrievedAt}</time>; {item.freshness}; hash {item.contentHash}</li>)}</ul>
        </details>
        <small>Evaluation hash: {result.evaluationHash}</small>
      </article>}
    </section>
  );
}

const workbenchStyle: CSSProperties = { display: 'grid', gap: spacing.md };
const headingStyle: CSSProperties = { margin: 0, color: palette.text, fontSize: typography.size.lg };
const copyStyle: CSSProperties = { margin: `${spacing.xs} 0 0`, color: palette.textMuted, fontSize: typography.size.sm };
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: spacing.sm };
const toolStyle: CSSProperties = { display: 'grid', gap: spacing.xs, padding: spacing.md, textAlign: 'left', color: palette.text, background: palette.surfaceAlt, border: `1px solid ${palette.border}`, borderRadius: radius.sm, cursor: 'pointer', fontFamily: 'inherit' };
const blockedStyle: CSSProperties = { padding: spacing.md, border: `1px solid ${palette.blocked}`, borderRadius: radius.sm, color: palette.blockedFg };
const resultStyle: CSSProperties = { padding: spacing.md, border: `1px solid ${palette.border}`, borderRadius: radius.sm, color: palette.text };
