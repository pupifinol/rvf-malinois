'use client';

import { cn } from '@rvf/ui';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Radio,
  Server,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useUiStore } from '@/lib/store/uiStore';

/**
 * Sidebar — fixed left navigation, always visible. UI/UX §4.
 *
 * The SCADA convention: no hamburger menu in a control room. Operators need
 * one-click access to every primary surface. F0 only renders the chrome and
 * the route list — the destinations themselves are placeholder pages.
 *
 * Collapse/expand state is persisted in localStorage via uiStore. The first
 * client render is gated by a `mounted` flag to keep the SSR markup in sync
 * with the hydration render (the persisted value applies on the next pass).
 */
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: '/operations', label: 'Operations', icon: LayoutDashboard },
  { href: '/units', label: 'Units', icon: Server },
  { href: '/sensors', label: 'Sensors', icon: Radio },
  { href: '/alarms', label: 'Alarms', icon: AlertTriangle },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export const Sidebar = () => {
  const pathname = usePathname();
  const persisted = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const collapsed = mounted ? persisted : false;

  return (
    <aside
      className={cn(
        'shrink-0 h-full bg-surface border-r border-border-subtle',
        'flex flex-col transition-[width] duration-base ease-industrial',
        collapsed ? 'w-14' : 'w-56',
      )}
      aria-label="Primary navigation"
    >
      {/* No brand band — the wordmark lives in the full-width topbar above. */}

      {/* Collapse / expand toggle — always present, position swaps with state */}
      <div
        className={cn(
          'h-9 flex items-center border-b border-border-subtle',
          collapsed ? 'justify-center' : 'justify-end px-3',
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-sm',
            'text-text-secondary hover:text-text-primary hover:bg-surface-raised',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Nav list */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="flex flex-col gap-px">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center py-2 text-sm',
                    'border-l-2',
                    collapsed ? 'justify-center px-0' : 'gap-3 px-4',
                    active
                      ? 'border-l-brand-accent bg-surface-raised text-text-primary'
                      : 'border-l-transparent text-text-secondary hover:text-text-primary hover:bg-surface-raised',
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer — phase badge */}
      <div className="px-4 py-3 border-t border-border-subtle">
        {!collapsed && (
          <span className="text-micro uppercase tracking-micro text-text-muted">
            Phase F0 · foundations
          </span>
        )}
      </div>
    </aside>
  );
};
