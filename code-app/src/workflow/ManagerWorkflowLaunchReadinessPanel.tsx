import { useManagerData } from '../manager/ManagerDataProvider';
import { deriveManagerWorkflowLaunchReadiness } from './workflowLaunchReadinessRollups';
import { WorkflowLaunchReadinessPanel } from './WorkflowLaunchReadinessPanel';
import { Card, CardHeader } from '../shared/Card';
import { palette } from '../shared/theme';


function loadedData<T>(result: { kind: string; data?: T }, fallback: T): T {
  return result.kind === 'loaded' && result.data ? result.data : fallback;
}
export function ManagerWorkflowLaunchReadinessPanel() {
  const data = useManagerData();
  const ready =
    data.teamPipeline.kind === 'ready' &&
    data.teamTasks.kind === 'ready' &&
    data.teamDocuments.kind === 'ready' &&
    data.teamMemos.kind === 'ready' &&
    data.teamMemoSections.kind === 'ready';

  if (!ready) {
    return (
      <Card>
        <CardHeader
          title="Workflow Launch Readiness"
          subtitle="Waiting for team-scoped workflow evidence."
        />
        <p style={{ margin: 0, color: palette.textMuted }}>
          Rollup unavailable until scoped deals, tasks, documents, memos, and memo sections load.
        </p>
      </Card>
    );
  }

  const rollup = deriveManagerWorkflowLaunchReadiness({
    deals: loadedData(data.teamPipeline, []),
    tasks: loadedData(data.teamTasks, []),
    documents: loadedData(data.teamDocuments, []),
    memos: loadedData(data.teamMemos, []),
    memoSections: loadedData(data.teamMemoSections, []),
  });

  return (
    <WorkflowLaunchReadinessPanel
      title="Workflow Launch Readiness"
      subtitle="Team-scoped deals by stage, blockers, credit gaps, closing bottlenecks, and banker workload."
      rollup={rollup}
    />
  );
}
