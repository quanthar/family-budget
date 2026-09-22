"use client";

import { cn } from "@/lib/utils";
import { getMonthYearLabel } from "@/lib/utils";
import { Settings, Bell, Plus } from "lucide-react";
import Link from "next/link";

interface HeaderProps {
  onQuickAdd?: () => void;
  className?: string;
}

export function Header({ onQuickAdd, className }: HeaderProps) {
  const currentMonth = getMonthYearLabel(new Date());

  return (
    <header
      className={cn(
        "flex items-center justify-between h-16 px-4 sm:px-6",
        "border-b border-border-subtle bg-bg-secondary/50 backdrop-blur-sm",
        "sticky top-0 z-30",
        className
      )}
    >
      {/* Left: Month label */}
      <div>
        <h1 className="text-base font-semibold text-fg-primary">
          {currentMonth}
        </h1>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Quick Add (desktop) */}
        <button
          onClick={onQuickAdd}
          className={cn(
            "hidden lg:inline-flex items-center gap-2 h-9 px-3.5",
            "bg-accent text-white text-sm font-medium",
            "rounded-[var(--radius-lg)]",
            "hover:bg-accent-hover active:bg-indigo-600",
            "transition-colors duration-[var(--transition-fast)]"
          )}
        >
          <Plus size={16} />
          <span>Добавить</span>
        </button>

        {/* Notifications */}
        <Link
          href="/notifications"
          className="p-2.5 rounded-[var(--radius-lg)] text-fg-muted hover:text-fg-secondary hover:bg-bg-hover transition-colors"
          aria-label="Уведомления"
        >
          <Bell size={18} />
        </Link>

        {/* Settings */}
        <Link
          href="/settings"
          className="p-2.5 rounded-[var(--radius-lg)] text-fg-muted hover:text-fg-secondary hover:bg-bg-hover transition-colors lg:hidden"
          aria-label="Настройки"
        >
          <Settings size={18} />
        </Link>
      </div>
    </header>
  );
}
