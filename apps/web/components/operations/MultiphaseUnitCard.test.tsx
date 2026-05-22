import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { unit1, unit2 } from './data/units.mock';
import { MultiphaseUnitCard } from './MultiphaseUnitCard';

describe('MultiphaseUnitCard', () => {
  it('renders header with title, status chip, well and job', () => {
    render(<MultiphaseUnitCard unit={unit1} />);

    const card = screen.getByRole('article', { name: /Multiphase Unit 1/i });
    expect(within(card).getByText(/Multiphase Unit #1/i)).toBeInTheDocument();
    expect(within(card).getByText('TESTING')).toBeInTheDocument();
    expect(within(card).getByText(unit1.well)).toBeInTheDocument();
    expect(within(card).getByText(unit1.job)).toBeInTheDocument();
    expect(within(card).getByText(unit1.startedUtc)).toBeInTheDocument();
  });

  it('renders all six operational variables with engineering units', () => {
    render(<MultiphaseUnitCard unit={unit1} />);
    const labels = [
      'Oil Rate',
      'Gas Rate',
      'Water Cut',
      'Pressure',
      'Temperature',
      'Differential P.',
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(unit1.oilRate.unit)).toBeInTheDocument();
    expect(screen.getByText(unit1.gasRate.unit)).toBeInTheDocument();
  });

  it('renders the data quality footer', () => {
    render(<MultiphaseUnitCard unit={unit1} />);
    expect(screen.getByText('Data Quality')).toBeInTheDocument();
    expect(screen.getByText(`${unit1.dataQualityPct.toFixed(1)}%`)).toBeInTheDocument();
    expect(screen.getByText('Sensor Health')).toBeInTheDocument();
    expect(screen.getByText(unit1.sensorHealth)).toBeInTheDocument();
    expect(screen.getByText(`${unit1.latencyMs} ms`)).toBeInTheDocument();
  });

  it('renders status chip with the right label for STABILIZING', () => {
    render(<MultiphaseUnitCard unit={unit2} />);
    expect(screen.getByText('STABILIZING')).toBeInTheDocument();
  });
});
