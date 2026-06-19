import { useExecutiveData } from '../executive/ExecutiveDataProvider';
import { Card, CardHeader } from '../shared/Card';
import { palette } from '../shared/theme';
import { deriveExecutiveWorkflowLaunchReadiness } from './workflowLaunchReadinessRollups';
import { WorkflowLaunchReadinessPanel } from './WorkflowLaunchReadinessPanel';

export function ExecutiveWorkflowLaunchReadinessPanel() {
  const data = useExecutiveData();

  if (data.snapshotReadiness.kind !== 'ready') {
    return (
      <Card>
        <CardHeader
          title="Workflow Launch Readiness"
          subtitle="Waiting for governed executive readiness snapshots."
        />
        <p style={{ margin: 0, color: palette.textMuted }}>
          Rollup unavailable until snapshot readiness rows load.
        </p>
      </Card>
    );
  }

  const rollup = deriveExecutiveWorkflowLaunchReadiness({
    readinessSnapshots: data.snapshotReadiness.data,
  });

  return (
    <WorkflowLaunchReadinessPanel
      title="Workflow Launch Readiness"
      subtitle="Board-safe snapshot rollup of blockers, missing documents, approvals, stale items, and readiness score."
      rollup={rollup}
    />
  );
}
