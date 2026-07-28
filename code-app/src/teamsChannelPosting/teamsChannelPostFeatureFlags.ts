import { resolveM365ActivationConfig, getM365ActivationConfig } from '../microsoft365/m365ActivationConfig';

export function resolveTeamsChannelPostEnabled(env: Record<string, string | undefined> = {}): boolean {
  return resolveM365ActivationConfig(env).teamsChannelPostEnabled;
}

export function isTeamsChannelPostEnabled(): boolean {
  return getM365ActivationConfig().teamsChannelPostEnabled;
}
