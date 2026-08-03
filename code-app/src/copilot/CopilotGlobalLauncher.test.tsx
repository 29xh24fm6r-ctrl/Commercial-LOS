import { act, fireEvent, render, screen } from '@testing-library/react';
// @vitest-environment jsdom
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CopilotGlobalLauncher } from './CopilotGlobalLauncher';
import { requestOpenCopilot } from './copilotLauncherEvents';

describe('CopilotGlobalLauncher', () => {
  it('is always identifiable after authentication and opens a governed drawer', () => {
    render(<MemoryRouter><CopilotGlobalLauncher /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Open Microsoft Copilot' }));
    expect(screen.getByRole('dialog', { name: 'Microsoft Copilot' })).toBeTruthy();
    expect(screen.getByText(/cannot approve credit/i)).toBeTruthy();
  });

  it('opens from the app-wide command event and keyboard shortcut', async () => {
    render(<MemoryRouter><CopilotGlobalLauncher /></MemoryRouter>);
    act(() => requestOpenCopilot());
    expect(await screen.findByRole('dialog', { name: 'Microsoft Copilot' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close Microsoft Copilot' }));
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('dialog', { name: 'Microsoft Copilot' })).toBeTruthy();
  });
});
