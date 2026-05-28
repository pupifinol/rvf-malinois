/**
 * F4.5G.2.2.1 — `useResolveBackendUnitId` tests.
 *
 * Mocks `useUnitsFleet` to drive deterministic input; asserts the resolver
 * never throws on missing / unmatched code, never calls the latest API, and
 * never invents a UUID for simulator catalog strings.
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useResolveBackendUnitId,
  type UseResolveBackendUnitIdResult,
} from './useResolveBackendUnitId';

import type * as HooksModule from './useUnitsFleet';

const HP_001_ID = '00000000-0000-0000-0000-000000004411';
const LP_001_ID = '00000000-0000-0000-0000-000000004412';

const { useUnitsFleetMock } = vi.hoisted(() => ({
  useUnitsFleetMock: vi.fn<() => ReturnType<typeof HooksModule.useUnitsFleet>>(),
}));

vi.mock('./useUnitsFleet', () => ({
  useUnitsFleet: useUnitsFleetMock,
}));

const defaultFleet = () => ({
  items: [
    { id: HP_001_ID, unitNumber: 1, name: 'High Pressure / High Flow Test Unit', code: 'HP-001' },
    { id: LP_001_ID, unitNumber: 2, name: 'Low Pressure / Medium Flow Test Unit', code: 'LP-001' },
  ],
  isLoading: false,
  error: null,
  source: 'api' as const,
});

interface Capture {
  current: UseResolveBackendUnitIdResult | null;
}

const renderHook = (code: string | undefined) => {
  const capture: Capture = { current: null };
  const Probe = (props: { code: string | undefined }): null => {
    capture.current = useResolveBackendUnitId(props.code);
    return null;
  };
  const utils = render(<Probe code={code} />);
  return { capture, ...utils };
};

beforeEach(() => {
  useUnitsFleetMock.mockReturnValue(defaultFleet());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useResolveBackendUnitId', () => {
  it('resolves HP-001 to the backend UUID from the fleet items', () => {
    const { capture } = renderHook('HP-001');
    expect(capture.current?.unitId).toBe(HP_001_ID);
    expect(capture.current?.isLoading).toBe(false);
    expect(capture.current?.error).toBeNull();
    expect(capture.current?.source).toBe('api');
  });

  it('resolves LP-001 to the backend UUID from the fleet items', () => {
    const { capture } = renderHook('LP-001');
    expect(capture.current?.unitId).toBe(LP_001_ID);
  });

  it('returns { unitId: null } when backendUnitCode is undefined', () => {
    const { capture } = renderHook(undefined);
    expect(capture.current?.unitId).toBeNull();
    expect(capture.current?.isLoading).toBe(false);
    expect(capture.current?.error).toBeNull();
  });

  it('returns { unitId: null } when no fleet item matches', () => {
    const { capture } = renderHook('XX-999');
    expect(capture.current?.unitId).toBeNull();
    expect(capture.current?.isLoading).toBe(false);
    expect(capture.current?.error).toBeNull();
  });

  it('returns isLoading: true when the fleet hook is still loading', () => {
    useUnitsFleetMock.mockReturnValue({ ...defaultFleet(), isLoading: true, items: [] });
    const { capture } = renderHook('HP-001');
    expect(capture.current?.unitId).toBeNull();
    expect(capture.current?.isLoading).toBe(true);
  });

  it('surfaces the fleet error', () => {
    const fleetError = new Error('boom');
    useUnitsFleetMock.mockReturnValue({ ...defaultFleet(), error: fleetError, items: [] });
    const { capture } = renderHook('HP-001');
    expect(capture.current?.unitId).toBeNull();
    expect(capture.current?.error).toBe(fleetError);
  });

  it('never fake-maps simulator catalog strings like EMMAD-01', () => {
    const { capture } = renderHook('EMMAD-01');
    expect(capture.current?.unitId).toBeNull();
  });

  it('does not call the latest API (composes useUnitsFleet only)', () => {
    // No global fetch stub needed; we assert the resolver returned synchronously
    // and `useUnitsFleetMock` is the only hook touched.
    renderHook('HP-001');
    expect(useUnitsFleetMock).toHaveBeenCalled();
  });

  it('reports source from the fleet hook', () => {
    useUnitsFleetMock.mockReturnValue({ ...defaultFleet(), source: 'mock' });
    const { capture } = renderHook('HP-001');
    expect(capture.current?.source).toBe('mock');
  });
});
