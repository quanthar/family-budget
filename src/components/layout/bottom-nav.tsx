"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BOTTOM_NAV_ITEMS } from "@/constants";
import {
  LayoutDashboard,
  Target,
  Plus,
  BarChart3,
  Menu,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ size?: number }>> = {
  LayoutDashboard,
  Target,
  Plus,
  BarChart3,
  Menu,
};

interface BottomNavProps {
  onQuickAdd?: () => void;
}

export function BottomNav({ onQuickAdd }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "lg:hidden fixed bottom-0 left-0 right-0 z-40",
        "h-[var(--bottom-nav-height)] bg-bg-secondary/95 backdrop-blur-md",
        "border-t border-border-subtle",
        "flex items-center justify-around px-2",
        "safe-area-bottom"
      )}
      role="navigation"
      aria-label="Основная навигация"
    >
      {BOTTOM_NAV_ITEMS.map((item) => {
        const Icon = iconMap[item.icon];
        const isAction = "isAction" in item && item.isAction;
        const isActive =
          !isAction &&
          (item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href));

        if (isAction) {
          return (
            <button
              key={item.href}
              onClick={onQuickAdd}
              className={cn(
                "flex items-center justify-center",
                "w-12 h-12 -mt-4 rounded-full",
                "bg-accent text-white shadow-lg",
                "hover:bg-accent-hover active:scale-95",
                "transition-all duration-[var(--transition-fast)]"
              )}
              aria-label={item.label}
            >
              {Icon && <Icon size={24} />}
            </button>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-0.5 py-1 px-3 min-w-[56px]",
              "transition-colors duration-[var(--transition-fast)]",
              isActive
                ? "text-accent-text"
                : "text-fg-muted hover:text-fg-secondary"
            )}
          >
            {Icon && <Icon size={20} />}
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
