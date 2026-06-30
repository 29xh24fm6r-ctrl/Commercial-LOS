import { useEffect, useMemo, useState } from 'react';
import { Card, PageHeader, Select, Tabs } from '../../design';
import { ErrorState } from '../../shared/ErrorState';
import { LoadingState } from '../../shared/LoadingState';
import { palette, spacing, typography } from '../../shared/theme';
import { IndustryConcentrationPanel } from './IndustryConcentrationPanel';
import { AdvisorReachPanel } from './AdvisorPanels';
import {
  loadCrmIntelligenceLive,
  type CrmIntelligenceData,
  type CrmIntelligenceLoader,
} from './loadCrmIntelligence';
import { clientsForAdvisor } from '../advisors/advisorViewModel';

export interface CrmIntelligencePanelProps {
  /** Injectable governed reader (defaults to the live, fail-closed loader). */
  loader?: CrmIntelligenceLoader;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: CrmIntelligenceData }
  | { kind: 'unavailable'; reason: string };

/**
 * CRM Intelligence surface (read-only): industry concentration by NAICS sector +
 * the advisor relationship map. Loads through the governed read; honest loading /
 * unavailable / empty states. No writes.
 */
export function CrmIntelligencePanel({ loader = loadCrmIntelligenceLive }: CrmIntelligencePanelProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [advisorId, setAdvisorId] = useState('');

  useEffect(() => {
    // Initial state is already 'loading'; we only commit the resolved result here
    // (avoids a synchronous setState in the effect body).
    let cancelled = false;
    loader().then((result) => {
      if (cancelled) return;
      setState(result.status === 'ready' ? { kind: 'ready', data: result.data } : { kind: 'unavailable', reason: result.reason });
    });
    return () => {
      cancelled = true;
    };
  }, [loader]);

  const advisorOptions = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const seen = new Map<string, string>();
    for (const l of state.data.advisorLinks) if (!seen.has(l.advisorOrgId)) seen.set(l.advisorOrgId, l.advisorName);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [state]);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg, width: '100%' }} aria-label="CRM Intelligence" data-crm-intelligence>
      <PageHeader title="CRM Intelligence" subtitle="Industry concentration and the advisor relationship map — read-only." />

      {state.kind === 'loading' && <LoadingState message="Loading CRM intelligence…" />}
      {state.kind === 'unavailable' && (
        <ErrorState title="CRM intelligence is unavailable" detail={state.reason} hint="It becomes available once CRM reads are provisioned." />
      )}
      {state.kind === 'ready' && (
        <Tabs
          aria-label="CRM intelligence views"
          items={[
            {
              value: 'concentration',
              label: 'Industry concentration',
              content: <IndustryConcentrationPanel companies={state.data.companies} />,
            },
            {
              value: 'advisors',
              label: 'Advisor reach',
              content: (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
                  <div style={{ maxWidth: 360 }}>
                    <span style={{ fontSize: typography.size.xs, color: palette.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Advisor / professional
                    </span>
                    <Select
                      aria-label="Choose an advisor"
                      options={advisorOptions}
                      placeholder="Choose an advisor to see what they touch"
                      value={advisorId}
                      onChange={(e) => setAdvisorId(e.target.value)}
                    />
                  </div>
                  <Card pad>
                    <AdvisorReachPanel
                      links={advisorId ? clientsForAdvisor(state.data.advisorLinks, advisorId) : []}
                      advisorName={advisorOptions.find((o) => o.value === advisorId)?.label}
                    />
                  </Card>
                </div>
              ),
            },
          ]}
        />
      )}
    </section>
  );
}
