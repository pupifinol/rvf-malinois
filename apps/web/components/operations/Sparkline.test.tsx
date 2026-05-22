import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders a polyline when data is provided', () => {
    const { container } = render(<Sparkline data={[1, 4, 2, 6, 3]} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    const points = polyline?.getAttribute('points') ?? '';
    expect(points.split(' ').length).toBe(5);
  });

  it('renders a dashed mid-line for empty data', () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.querySelector('polyline')).toBeNull();
    const line = container.querySelector('line');
    expect(line).not.toBeNull();
    expect(line?.getAttribute('stroke-dasharray')).toBe('2 2');
  });

  it('handles a single-value series without throwing', () => {
    const { container } = render(<Sparkline data={[42]} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
  });
});
