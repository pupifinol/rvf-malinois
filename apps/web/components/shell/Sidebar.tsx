'use client';

import { cn } from '@rvf/ui';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  FileText,
  Gauge,
  LayoutDashboard,
  LineChart,
  type LucideIcon,
  PanelLeft,
  Radio,
  ScrollText,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useUiStore } from '@/lib/store/uiStore';

/**
 * Sidebar — fixed left navigation, always visible. UI/UX §4.
 *
 * The SCADA convention: no hamburger menu in a control room. Operators need
 * one-click access to every primary surface. F0 only renders the chrome and
 * the route list — the destinations themselves are placeholder pages.
 */
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: '/operations', label: 'Operations', icon: LayoutDashboard },
  { href: '/multiwell', label: 'Multiwell', icon: Gauge },
  { href: '/wells', label: 'Wells', icon: Activity },
  { href: '/jobs', label: 'Jobs', icon: ClipboardList },
  { href: '/equipment', label: 'Equipment', icon: Wrench },
  { href: '/sensors', label: 'Sensors', icon: Radio },
  { href: '/alarms', label: 'Alarms', icon: AlertTriangle },
  { href: '/trends', label: 'Trends', icon: LineChart },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/audit', label: 'Audit', icon: ScrollText },
  { href: '/catalog', label: 'Catalog', icon: Boxes },
];

export const Sidebar = () => {
  const pathname = usePathname();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        'shrink-0 h-screen sticky top-0 bg-surface border-r border-border-subtle',
        'flex flex-col transition-[width] duration-base ease-industrial',
        collapsed ? 'w-11' : 'w-9 md:w-10 lg:w-11 xl:w-11 2xl:w-11',
        // We use a fixed pixel-ish width to keep dense layouts predictable.
        collapsed ? '!w-14' : '!w-56',
      )}
      aria-label="Primary navigation"
    >
      {/* Brand mark */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border-subtle">
        {!collapsed && (
          <span className="font-semibold text-sm tracking-wide text-text-primary">
            RVF Malinois
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="text-text-secondary hover:text-text-primary p-1 rounded-sm"
        >
          <PanelLeft className="w-4 h-4" />
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
                  className={cn(
                    'flex items-center gap-3 px-4 py-2 text-sm',
                    'border-l-2',
                    active
                      ? 'border-l-brand-accent bg-surface-raised text-text-primary'
                      : 'border-l-transparent text-text-secondary hover:text-text-primary hover:bg-surface-raised',
                  )}
                  aria-current={active ? 'page' : undefined}
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
