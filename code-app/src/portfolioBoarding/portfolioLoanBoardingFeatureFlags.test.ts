import { describe, it, expect } from 'vitest';
import {
  resolvePortfolioBoardingFeatureFlags,
  PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS,
} from './portfolioLoanBoardingFeatureFlags';

/**
 * Portfolio Loan Boarding feature flags — fail-closed discipline, with an emphasis on the Phase 264
 * SharePoint-upload flag being DEFAULT OFF and INDEPENDENT of document-metadata persistence.
 */

describe('portfolioLoanBoardingFeatureFlags — defaults', () => {
  it('every flag defaults to OFF (fail-closed)', () => {
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(true);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_ROUTE_ENABLED).toBe(true);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_DOCUMENT_METADATA_ENABLED).toBe(true);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED).toBe(true);
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_FDIC_PACKAGE_ENABLED).toBe(true);
  });

  it('the SharePoint upload flag exists and defaults OFF', () => {
    expect(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_DOCUMENT_SHAREPOINT_UPLOAD_ENABLED).toBe(false);
  });

  it('an empty / undefined config resolves every flag to false', () => {
    const none = resolvePortfolioBoardingFeatureFlags();
    expect(none).toEqual(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS);
    const empty = resolvePortfolioBoardingFeatureFlags({});
    for (const value of Object.values(empty)) expect(value).toBe(false);
  });
});

describe('portfolioLoanBoardingFeatureFlags — SharePoint upload flag is independent + fail-closed', () => {
  it('only an exact `true` enables the SharePoint upload flag (fail-closed against truthy values)', () => {
    expect(
      resolvePortfolioBoardingFeatureFlags({ documentSharePointUploadEnabled: true })
        .PORTFOLIO_BOARDING_DOCUMENT_SHAREPOINT_UPLOAD_ENABLED,
    ).toBe(true);
    for (const bad of [undefined, false, 1, 'true', {}] as unknown[]) {
      expect(
        resolvePortfolioBoardingFeatureFlags({ documentSharePointUploadEnabled: bad as boolean })
          .PORTFOLIO_BOARDING_DOCUMENT_SHAREPOINT_UPLOAD_ENABLED,
      ).toBe(false);
    }
  });

  it('enabling SharePoint upload does NOT enable document-metadata persistence (independent gates)', () => {
    const flags = resolvePortfolioBoardingFeatureFlags({ documentSharePointUploadEnabled: true });
    expect(flags.PORTFOLIO_BOARDING_DOCUMENT_SHAREPOINT_UPLOAD_ENABLED).toBe(true);
    expect(flags.PORTFOLIO_BOARDING_DOCUMENT_METADATA_ENABLED).toBe(false);
  });

  it('enabling document-metadata persistence does NOT enable SharePoint upload (independent gates)', () => {
    const flags = resolvePortfolioBoardingFeatureFlags({ documentMetadataEnabled: true });
    expect(flags.PORTFOLIO_BOARDING_DOCUMENT_METADATA_ENABLED).toBe(true);
    expect(flags.PORTFOLIO_BOARDING_DOCUMENT_SHAREPOINT_UPLOAD_ENABLED).toBe(false);
  });

  it('enabling SharePoint upload leaves every OTHER boarding flag untouched (off)', () => {
    const flags = resolvePortfolioBoardingFeatureFlags({ documentSharePointUploadEnabled: true });
    expect(flags.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED).toBe(false);
    expect(flags.PORTFOLIO_BOARDING_ROUTE_ENABLED).toBe(false);
    expect(flags.PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED).toBe(false);
    expect(flags.PORTFOLIO_BOARDING_FDIC_PACKAGE_ENABLED).toBe(false);
  });
});
