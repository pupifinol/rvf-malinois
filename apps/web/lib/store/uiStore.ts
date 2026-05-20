import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

/**
 * UI preferences that persist across navigation but don't need to be on the
 * server. Sidebar collapsed state, last selected density, etc.
 *
 * This is the ONE store that bypasses createStore (devtools-only) — UI
 * preferences benefit from localStorage persistence; realtime stores
 * (telemetry, alarms) must never persist. Keeping the factory pure makes
 * that distinction obvious.
 */
interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
}

export const useUiStore = create<UiState>()(
  devtools(
    persist(
      (set) => ({
        sidebarCollapsed: false,
        toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
        setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      }),
      {
        name: 'rvf-ui',
        partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
      },
    ),
    { name: 'ui', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
