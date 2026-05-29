/**
 * F4.5G.2.2.2 — `<OperationsTrendDrawerProvider>` + `useOperationsTrendDrawer` tests.
 *
 * Covers:
 *   - `open` shows a `<TrendDrawer>` with the right title (backend-match path).
 *   - `open` with `hasBackendMatch: false` suffixes the title with the
 *     `No backend unit match` caveat.
 *   - `close` removes the drawer.
 *   - `useOperationsTrendDrawer` outside a provider returns a no-op handle.
 *
 * The `<TrendDrawer>` body is stubbed to a probe so we can assert exactly
 * what selection it received without dragging the trend series hook + a
 * QueryClient into this spec.
 */
import { brand } from '@rvf/types';
import { render, screen, act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OperationsTrendDrawerProvider, useOperationsTrendDrawer } from './OperationsTrendDrawer';

vi.mock('./TrendDrawer', () => ({
  TrendDrawer: (props: {
    open: boolean;
    onClose: () => void;
    unitId: string;
    canonicalTagName: string;
    title: string;
    unitLabel: string;
    fallbackJobId?: string;
    fallbackTag?: string;
    hasBackendMatch?: boolean;
  }) => (
    <div
      role="dialog"
      aria-label={props.title}
      data-unit-id={props.unitId}
      data-canonical-tag={props.canonicalTagName}
      data-unit-label={props.unitLabel}
      data-fallback-job-id={props.fallbackJobId ?? 'undefined'}
      data-fallback-tag={props.fallbackTag ?? 'undefined'}
      data-has-backend-match={
        props.hasBackendMatch === undefined ? 'undefined' : String(props.hasBackendMatch)
      }
    >
      <button type="button" onClick={props.onClose} data-testid="trend-drawer-close">
        close
      </button>
    </div>
  ),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('OperationsTrendDrawerProvider', () => {
  it('renders no drawer initially', () => {
    render(
      <OperationsTrendDrawerProvider>
        <div data-testid="child">child</div>
      </OperationsTrendDrawerProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open() with hasBackendMatch=true shows the drawer with "title — unit"', () => {
    const Trigger = () => {
      const drawer = useOperationsTrendDrawer();
      return (
        <button
          type="button"
          data-testid="trigger"
          onClick={() =>
            drawer.open({
              unitId: '00000000-0000-0000-0000-000000004411',
              canonicalTagName: 'p_inlet',
              variableTitle: 'Pressure',
              unitTitle: 'Multiphase Unit #1',
              unitLabel: 'psi',
              hasBackendMatch: true,
            })
          }
        >
          open
        </button>
      );
    };

    render(
      <OperationsTrendDrawerProvider>
        <Trigger />
      </OperationsTrendDrawerProvider>,
    );

    act(() => {
      screen.getByTestId('trigger').click();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Pressure — Multiphase Unit #1');
    expect(dialog.getAttribute('data-unit-id')).toBe('00000000-0000-0000-0000-000000004411');
    expect(dialog.getAttribute('data-canonical-tag')).toBe('p_inlet');
    expect(dialog.getAttribute('data-unit-label')).toBe('psi');
  });

  it('open() with hasBackendMatch=false suffixes the title with the honest caveat', () => {
    const Trigger = () => {
      const drawer = useOperationsTrendDrawer();
      return (
        <button
          type="button"
          data-testid="trigger"
          onClick={() =>
            drawer.open({
              unitId: 'PSK-03',
              canonicalTagName: 'q_liquid',
              variableTitle: 'Liquid Rate',
              unitTitle: 'Multiphase Unit #3',
              unitLabel: 'bbl/d',
              hasBackendMatch: false,
            })
          }
        >
          open
        </button>
      );
    };

    render(
      <OperationsTrendDrawerProvider>
        <Trigger />
      </OperationsTrendDrawerProvider>,
    );

    act(() => {
      screen.getByTestId('trigger').click();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe(
      'Liquid Rate — Multiphase Unit #3 · No backend unit match',
    );
    expect(dialog.getAttribute('data-unit-id')).toBe('PSK-03');
  });

  it('forwards fallbackJobId + fallbackTag + hasBackendMatch to the drawer (F4.5G.2.2.2)', () => {
    const Trigger = () => {
      const drawer = useOperationsTrendDrawer();
      return (
        <button
          type="button"
          data-testid="trigger"
          onClick={() =>
            drawer.open({
              unitId: 'EMMAD-01',
              canonicalTagName: 't_inlet',
              variableTitle: 'Temperature',
              unitTitle: 'Multiphase Unit #1',
              unitLabel: '°F',
              hasBackendMatch: false,
              fallbackJobId: brand<string, 'JobId'>('JOB-TEST-001'),
              fallbackTag: brand<string, 'CanonicalTag'>('t_inlet'),
            })
          }
        >
          open
        </button>
      );
    };

    render(
      <OperationsTrendDrawerProvider>
        <Trigger />
      </OperationsTrendDrawerProvider>,
    );

    act(() => {
      screen.getByTestId('trigger').click();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-fallback-job-id')).toBe('JOB-TEST-001');
    expect(dialog.getAttribute('data-fallback-tag')).toBe('t_inlet');
    expect(dialog.getAttribute('data-has-backend-match')).toBe('false');
  });

  it('close() removes the drawer', () => {
    const Trigger = () => {
      const drawer = useOperationsTrendDrawer();
      return (
        <button
          type="button"
          data-testid="trigger"
          onClick={() =>
            drawer.open({
              unitId: 'u1',
              canonicalTagName: 'p_inlet',
              variableTitle: 'Pressure',
              unitTitle: 'Multiphase Unit #1',
              unitLabel: 'psi',
              hasBackendMatch: true,
            })
          }
        >
          open
        </button>
      );
    };

    render(
      <OperationsTrendDrawerProvider>
        <Trigger />
      </OperationsTrendDrawerProvider>,
    );

    act(() => {
      screen.getByTestId('trigger').click();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      screen.getByTestId('trend-drawer-close').click();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('useOperationsTrendDrawer — no provider fallback', () => {
  it('returns a no-op handle that does not throw', () => {
    const { result } = renderHook(() => useOperationsTrendDrawer());
    expect(() =>
      result.current.open({
        unitId: 'u1',
        canonicalTagName: 'p_inlet',
        variableTitle: 'Pressure',
        unitTitle: 'Multiphase Unit #1',
        unitLabel: 'psi',
        hasBackendMatch: true,
      }),
    ).not.toThrow();
    expect(() => result.current.close()).not.toThrow();
  });
});
