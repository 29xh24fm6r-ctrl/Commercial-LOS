// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductProcessTemplateCatalogPanel } from './ProductProcessTemplateCatalogPanel';
import { PRODUCT_PROCESS_TEMPLATE_REGISTRY } from './productProcessTemplateRegistry';

describe('Phase 142D — template catalog panel', () => {
  it('renders the template catalog with requirement counts and caveats', () => {
    render(<ProductProcessTemplateCatalogPanel templates={PRODUCT_PROCESS_TEMPLATE_REGISTRY} />);
    expect(screen.getByText('SBA 7(a) Standard')).toBeInTheDocument();
    expect(screen.getAllByText(/Docs:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Template guidance only/i).length).toBeGreaterThan(0);
  });

  it('supports local search only', async () => {
    render(<ProductProcessTemplateCatalogPanel templates={PRODUCT_PROCESS_TEMPLATE_REGISTRY} />);
    await userEvent.type(screen.getByLabelText('Search templates'), 'sba');
    expect(screen.getByText('SBA 7(a) Standard')).toBeInTheDocument();
    expect(screen.queryByText('Commercial Real Estate')).toBeNull();
  });

  it('has no create / edit / delete / activate controls and no fetch', () => {
    const { container } = render(<ProductProcessTemplateCatalogPanel templates={PRODUCT_PROCESS_TEMPLATE_REGISTRY} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    const text = (container.textContent ?? '').toLowerCase();
    for (const w of ['create template', 'edit template', 'delete template', 'activate template', 'create product']) {
      expect(text).not.toContain(w);
    }
  });
});
