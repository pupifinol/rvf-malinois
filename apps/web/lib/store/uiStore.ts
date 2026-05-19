import { createStore } from './createStore';

/**
 * UI preferences that persist across navigation but don't need to be on the
 * server. Sidebar collapsed state, last selected density, etc.
 *
 * Kept minimal in F0 — only what the AppShell needs to render correctly.
 */
interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
}

export const useUiStore = createStore<UiState>(
  (set) => ({
    sidebarCollapsed: false,
    toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
  }),
  'ui',
);
