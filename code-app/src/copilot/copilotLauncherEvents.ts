export const OPEN_COPILOT_EVENT = 'ogb:open-copilot';
export const COPILOT_ATTENTION_EVENT = 'ogb:copilot-attention';

export function requestOpenCopilot(): void {
  window.dispatchEvent(new CustomEvent(OPEN_COPILOT_EVENT));
}

export function reportCopilotAttention(count: number): void {
  window.dispatchEvent(new CustomEvent(COPILOT_ATTENTION_EVENT, { detail: { count: Math.max(0, Math.floor(count)) } }));
}
