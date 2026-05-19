import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlaceholderPage } from './PlaceholderPage';

describe('PlaceholderPage', () => {
  it('renders title, phase, and description', () => {
    render(
      <PlaceholderPage title="Alarms" phase="Phase F4" description="ISA-18.2 alarm centre." />,
    );

    expect(screen.getByRole('heading', { name: 'Alarms' })).toBeInTheDocument();
    expect(screen.getByText('ISA-18.2 alarm centre.')).toBeInTheDocument();
    expect(screen.getByText('Phase F4')).toBeInTheDocument();
  });
});
