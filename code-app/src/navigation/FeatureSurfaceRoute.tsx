import { useParams } from 'react-router-dom';
import { WorkspaceGate } from '../bootstrap/WorkspaceGate';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { ErrorState } from '../shared/ErrorState';
import { getFeatureSurface, type FeatureSurface } from './featureSurfaces';
import { isFeatureSurfaceFlagEnabled } from './featureSurfaceFlags';
import { FeatureSurfaceNotEnabled } from './FeatureSurfaceNotEnabled';
import { FeatureSurfaceErrorBoundary } from './FeatureSurfaceErrorBoundary';

/**
 * Phase 3 — route for previously-unrouted subsystem surfaces: /surfaces/:surfaceKey.
 *
 * Gated by the owning workspace's WorkspaceGate AND a default-off route flag. Flag
 * off → honest "not enabled" state. Flag on → the read-only preview, wrapped in a
 * fail-soft boundary. Never a write.
 */

/**
 * Pure presentational split-out (no router/bootstrap dependency) so the flag gating
 * is unit-testable without a bootstrap context.
 */
export function FeatureSurfaceView({
  surface,
  enabled,
}: {
  surface: FeatureSurface;
  enabled: boolean;
}) {
  if (!enabled) {
    return <FeatureSurfaceNotEnabled label={surface.label} flagName={surface.flag} />;
  }
  return (
    <FeatureSurfaceErrorBoundary label={surface.label}>
      {surface.render()}
    </FeatureSurfaceErrorBoundary>
  );
}

export function FeatureSurfaceRoute() {
  const { surfaceKey } = useParams<{ surfaceKey: string }>();
  const surface = getFeatureSurface(surfaceKey);

  if (!surface) {
    return (
      <ErrorState
        title="Unknown surface"
        detail={`No feature surface is registered for "${surfaceKey ?? ''}".`}
        hint="Return to your workspace."
      />
    );
  }

  return (
    <WorkspaceGate allowed={WORKSPACE_ROUTES[surface.workspace]}>
      <FeatureSurfaceView surface={surface} enabled={isFeatureSurfaceFlagEnabled(surface.flag)} />
    </WorkspaceGate>
  );
}
