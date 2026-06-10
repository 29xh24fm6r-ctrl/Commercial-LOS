// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useDrillThroughDeepLink } from './useDrillThroughDeepLink';

const IDS = ['portfolio-kpi-blocked', 'portfolio-kpi-active-deals'];

function Probe({ ids }: { ids?: string[] }) {
  const dl = useDrillThroughDeepLink(ids);
  const loc = useLocation();
  return (
    <div>
      <span data-testid="active">{dl.activeId ?? 'none'}</span>
      <span data-testid="avail">{String(dl.activeAvailable)}</span>
      <span data-testid="isactive">{String(dl.isActive('portfolio-kpi-blocked'))}</span>
      <span data-testid="search">{loc.search}</span>
      <button onClick={() => dl.open('portfolio-kpi-blocked')}>open</button>
      <button onClick={() => dl.open('javascript:bad')}>open-bad</button>
      <button onClick={() => dl.close()}>close</button>
    </div>
  );
}

function renderAt(path: string, ids?: string[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe ids={ids} />
    </MemoryRouter>,
  );
}

describe('Phase 144D — useDrillThroughDeepLink', () => {
  it('reports no active target when the URL has no drill param', () => {
    renderAt('/portfolio', IDS);
    expect(screen.getByTestId('active').textContent).toBe('none');
    expect(screen.getByTestId('avail').textContent).toBe('false');
  });

  it('reads a valid, available target id from the URL', () => {
    renderAt('/portfolio?drill=portfolio-kpi-blocked', IDS);
    expect(screen.getByTestId('active').textContent).toBe('portfolio-kpi-blocked');
    expect(screen.getByTestId('avail').textContent).toBe('true');
    expect(screen.getByTestId('isactive').textContent).toBe('true');
  });

  it('fails closed for an unsafe drill param (no active target)', () => {
    renderAt('/portfolio?drill=javascript:alert', IDS);
    expect(screen.getByTestId('active').textContent).toBe('none');
    expect(screen.getByTestId('isactive').textContent).toBe('false');
  });

  it('treats a valid id not on the current page as unavailable (fails closed)', () => {
    renderAt('/portfolio?drill=manager-kpi-blocked', IDS);
    expect(screen.getByTestId('active').textContent).toBe('manager-kpi-blocked');
    expect(screen.getByTestId('avail').textContent).toBe('false');
    expect(screen.getByTestId('isactive').textContent).toBe('false');
  });

  it('open() writes the drill param into the URL', () => {
    renderAt('/portfolio?banker=lee', IDS);
    fireEvent.click(screen.getByText('open'));
    const search = screen.getByTestId('search').textContent ?? '';
    expect(search).toContain('drill=portfolio-kpi-blocked');
    expect(search).toContain('banker=lee');
  });

  it('open() ignores an unsafe id (no URL change)', () => {
    renderAt('/portfolio', IDS);
    fireEvent.click(screen.getByText('open-bad'));
    expect(screen.getByTestId('search').textContent ?? '').not.toContain('drill=');
  });

  it('close() removes the drill param, preserving other params', () => {
    renderAt('/portfolio?drill=portfolio-kpi-blocked&banker=lee', IDS);
    expect(screen.getByTestId('active').textContent).toBe('portfolio-kpi-blocked');
    fireEvent.click(screen.getByText('close'));
    const search = screen.getByTestId('search').textContent ?? '';
    expect(search).not.toContain('drill=');
    expect(search).toContain('banker=lee');
  });

  it('any valid id is available when no id set is supplied', () => {
    renderAt('/portfolio?drill=anything-valid');
    expect(screen.getByTestId('avail').textContent).toBe('true');
  });
});
