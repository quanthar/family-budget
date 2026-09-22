"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/constants";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Target,
  Calendar,
  BarChart3,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const iconMap: Record<string, React.ComponentType<{ size?: number }>> = {
  LayoutDashboard,
  ArrowLeftRight,
  Target,
  Calendar,
  BarChart3,
  Users,
  Settings,
};

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col h-screen sticky top-0",
        "bg-bg-secondary border-r border-border-subtle",
        "transition-all duration-[var(--transition-slow)]",
        collapsed ? "w-[var(--sidebar-collapsed-width)]" : "w-[var(--sidebar-width)]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-border-subtle">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-[var(--radius-lg)] bg-accent flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">FB</span>
          </div>
          {!collapsed && (
            <div className="animate-fade-in">
              <p className="text-sm font-semibold text-fg-primary leading-none">
                Family
              </p>
              <p className="text-sm font-semibold text-fg-primary leading-none">
                Budget
              </p>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-lg)]",
                "text-sm font-medium transition-colors duration-[var(--transition-fast)]",
                isActive
                  ? "bg-accent-muted text-accent-text"
                  : "text-fg-secondary hover:text-fg-primary hover:bg-bg-hover"
              )}
              title={collapsed ? item.label : undefined}
            >
              {Icon && <Icon size={18} />}
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-border-subtle space-y-0.5">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-lg)]",
            "text-sm font-medium transition-colors duration-[var(--transition-fast)]",
            pathname.startsWith("/settings")
              ? "bg-accent-muted text-accent-text"
              : "text-fg-secondary hover:text-fg-primary hover:bg-bg-hover"
          )}
          title={collapsed ? "Настройки" : undefined}
        >
          <Settings size={18} />
          {!collapsed && <span>Настройки</span>}
        </Link>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-lg)] text-sm text-fg-muted hover:text-fg-secondary hover:bg-bg-hover transition-colors w-full"
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span>Свернуть</span>}
        </button>
      </div>
    </aside>
  );
}
