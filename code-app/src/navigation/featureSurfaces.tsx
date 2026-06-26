import type { ReactNode } from 'react';
import type { WorkspaceKey } from '../bootstrap/workspaceRoutes';
import type { FeatureSurfaceFlagName } from './featureSurfaceFlags';

// ── Subsystem entry components (static imports → reachable from the app graph) ──
import { PlatformMetadataDashboard } from '../platform/PlatformMetadataDashboard';
import { IntegrationAdapterRegistryPanel } from '../integrations/IntegrationAdapterRegistryPanel';
import { AdminConfigurationSummaryPanel } from '../adminConfig/AdminConfigurationSummaryPanel';
import { deriveAdminConfigurationReviewQueue } from '../adminConfig/deriveAdminConfigurationReviewQueue';
import { CreditCommitteePackageReviewQueuePanel } from '../committee/CreditCommitteePackageReviewQueuePanel';
import { deriveCreditCommitteePackageQueue } from '../committee/creditCommitteePackageQueue';
import { AnnualPortfolioReviewCommandCenter } from '../portfolioAnnualReview/AnnualPortfolioReviewCommandCenter';
import type { AnnualReviewCycle } from '../shared/annualReview/annualReviewTypes';
import { PortfolioLoanBoardingPreview } from '../portfolioBoarding/PortfolioLoanBoardingPreview';
import { createEmptyPortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

/**
 * Phase 3 — registry of previously-unrouted subsystem surfaces.
 *
 * Each entry statically imports its subsystem's top-level component (so the
 * subsystem becomes reachable from src/main.tsx) and exposes a READ-ONLY `render()`
 * fed with empty/preview inputs — never live data, never a write. Surfaces are
 * mounted by FeatureSurfaceRoute under the owning workspace gate behind a default-off
 * route flag, and wrapped in a fail-soft error boundary.
 */
export interface FeatureSurface {
  /** Stable URL key: /surfaces/<key>. */
  readonly key: string;
  /** The default-off route flag that reveals this surface. */
  readonly flag: FeatureSurfaceFlagName;
  /** Human label for nav + the not-enabled state. */
  readonly label: string;
  /** One-line description of the read-only surface. */
  readonly description: string;
  /** Workspace whose gate authorizes this surface. */
  readonly workspace: WorkspaceKey;
  /** Render the read-only preview (empty inputs; wrapped in an error boundary). */
  readonly render: () => ReactNode;
}

/** Deterministic, non-live placeholder timestamp for preview-only view models. */
const PREVIEW_ISO = '1970-01-01T00:00:00.000Z';

/** Empty annual-review cycle for the read-only portfolio-review preview. */
const PREVIEW_ANNUAL_REVIEW_CYCLE: AnnualReviewCycle = {
  cycleId: 'preview',
  reviewYear: 1970,
  asOfDate: '1970-01-01',
  status: 'planned',
};

export const FEATURE_SURFACES: readonly FeatureSurface[] = [
  {
    key: 'platform-catalog',
    flag: 'PLATFORM_CATALOG_ROUTE_ENABLED',
    label: 'Platform metadata catalog',
    description: 'Read-only platform metadata / catalog dashboard (no schema mutation).',
    workspace: 'admin',
    render: () => <PlatformMetadataDashboard />,
  },
  {
    key: 'integrations',
    flag: 'INTEGRATIONS_ROUTE_ENABLED',
    label: 'Integration adapter registry',
    description: 'Read-only core-banking / external integration adapter registry + readiness.',
    workspace: 'admin',
    render: () => <IntegrationAdapterRegistryPanel />,
  },
  {
    key: 'admin-config',
    flag: 'ADMIN_CONFIG_ROUTE_ENABLED',
    label: 'Admin configuration review',
    description: 'Read-only admin configuration review queue preview (empty queue).',
    workspace: 'admin',
    render: () => (
      <AdminConfigurationSummaryPanel
        queue={deriveAdminConfigurationReviewQueue({
          proposals: [],
          queueId: 'preview',
          generatedAt: PREVIEW_ISO,
        })}
      />
    ),
  },
  {
    key: 'committee',
    flag: 'COMMITTEE_ROUTE_ENABLED',
    label: 'Credit committee review queue',
    description: 'Read-only credit committee package review queue preview (no packages).',
    workspace: 'manager',
    render: () => (
      <CreditCommitteePackageReviewQueuePanel queue={deriveCreditCommitteePackageQueue(undefined)} />
    ),
  },
  {
    key: 'portfolio-annual-review',
    flag: 'PORTFOLIO_ANNUAL_REVIEW_ROUTE_ENABLED',
    label: 'Annual portfolio review',
    description: 'Read-only annual portfolio review command center preview (empty cycle).',
    workspace: 'manager',
    render: () => <AnnualPortfolioReviewCommandCenter cycle={PREVIEW_ANNUAL_REVIEW_CYCLE} />,
  },
  {
    key: 'portfolio-boarding',
    flag: 'PORTFOLIO_BOARDING_SURFACE_ROUTE_ENABLED',
    label: 'Portfolio loan boarding',
    description: 'Read-only portfolio loan boarding package preview (empty package).',
    workspace: 'manager',
    render: () => (
      <PortfolioLoanBoardingPreview package={createEmptyPortfolioLoanBoardingPackage()} />
    ),
  },
];

const BY_KEY: ReadonlyMap<string, FeatureSurface> = new Map(
  FEATURE_SURFACES.map((s) => [s.key, s]),
);

/** Look up a surface by its URL key. */
export function getFeatureSurface(key: string | undefined): FeatureSurface | undefined {
  return key ? BY_KEY.get(key) : undefined;
}
