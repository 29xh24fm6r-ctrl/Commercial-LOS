// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NaicsLookupLinks, NAICS_CENSUS_URL, NAICS_DOTCOM_URL } from './NaicsLookupLinks';

describe('NaicsLookupLinks (AC1 + security)', () => {
  it('renders both external lookup links with the exact labels', () => {
    render(<NaicsLookupLinks />);
    expect(screen.getByText(/Search official Census NAICS/i)).toBeInTheDocument();
    expect(screen.getByText(/Search NAICS\.com lookup/i)).toBeInTheDocument();
  });

  it('links point at the official Census + NAICS.com URLs and open in a new tab, securely', () => {
    render(<NaicsLookupLinks />);
    const census = screen.getByRole('link', { name: /Search official Census NAICS/i });
    const dotcom = screen.getByRole('link', { name: /Search NAICS\.com lookup/i });

    expect(census).toHaveAttribute('href', NAICS_CENSUS_URL);
    expect(census).toHaveAttribute('href', 'https://www.census.gov/naics/');
    expect(dotcom).toHaveAttribute('href', NAICS_DOTCOM_URL);
    expect(dotcom).toHaveAttribute('href', 'https://www.naics.com/search/');

    for (const link of [census, dotcom]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer'); // no reverse-tabnabbing / referrer leak
    }
  });

  it('marks the third-party lookup as such and shows the banker help copy', () => {
    render(<NaicsLookupLinks />);
    expect(screen.getByText(/Third-party lookup/i)).toBeInTheDocument();
    expect(screen.getByText(/enter the six-digit code here/i)).toBeInTheDocument();
  });
});
