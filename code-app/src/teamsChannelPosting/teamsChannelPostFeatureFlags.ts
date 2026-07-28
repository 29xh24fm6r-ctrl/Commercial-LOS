export function resolveTeamsChannelPostEnabled(env: Record<string, string | undefined> = {}): boolean {
  return env.VITE_TEAMS_CHANNEL_POST_ENABLED === 'true';
}

export function isTeamsChannelPostEnabled(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return resolveTeamsChannelPostEnabled(env);
}
