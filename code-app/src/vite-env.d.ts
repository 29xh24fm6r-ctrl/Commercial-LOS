/**
 * Injected by vite.config.ts / vitest.config.ts via `define` as a JSON-stringified
 * literal at build/test-run time. See src/shared/deploymentCommit.ts.
 */
declare const __PLATFORM_DEPLOYMENT_COMMIT__: string;

interface ImportMetaEnv {
  readonly VITE_OUTLOOK_CALENDAR_READ_MODE?: 'disabled' | 'live_read_only' | string;
  readonly VITE_OUTLOOK_CALENDAR_WRITE_ENABLED?: 'true' | 'false' | string;
  readonly VITE_TEAMS_MEETING_CREATION_ENABLED?: 'true' | 'false' | string;
  readonly VITE_TEAMS_CHANNEL_POST_ENABLED?: 'true' | 'false' | string;
  readonly VITE_TEAMS_CHANNEL_POST_TRANSPORT_ALIAS?: string;
  readonly VITE_TEAMS_MEETING_TRANSPORT_ALIAS?: string;
  readonly VITE_M365_ACTIVATION_POLICY_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
