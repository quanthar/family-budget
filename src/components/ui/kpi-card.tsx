import { cn } from "@/lib/utils";
import { AmountDisplay } from "@/components/ui/amount-display";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  label: string;
  amount: number;
  change?: number; // percentage
  changeLabel?: string;
  icon?: React.ReactNode;
  variant?: "default" | "income" | "expense" | "warning" | "accent";
  className?: string;
}

const variantAccent = {
  default: "bg-bg-surface",
  income: "bg-income-muted",
  expense: "bg-expense-muted",
  warning: "bg-warning-muted",
  accent: "bg-accent-muted",
};

const variantIcon = {
  default: "text-fg-muted",
  income: "text-income-text",
  expense: "text-expense-text",
  warning: "text-warning-text",
  accent: "text-accent-text",
};

export function KPICard({
  label,
  amount,
  change,
  changeLabel,
  icon,
  variant = "default",
  className,
}: KPICardProps) {
  return (
    <div
      className={cn(
        "bg-bg-secondary border border-border-subtle rounded-[var(--radius-xl)]",
        "p-4 sm:p-5 flex flex-col gap-3",
        "transition-colors duration-[var(--transition-fast)]",
        "hover:border-border-default",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-tertiary uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <div
            className={cn(
              "w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center",
              variantAccent[variant]
            )}
          >
            <span className={variantIcon[variant]}>{icon}</span>
          </div>
        )}
      </div>

      {/* Amount */}
      <AmountDisplay amount={amount} size="xl" />

      {/* Change indicator */}
      {change !== undefined && (
        <div className="flex items-center gap-1.5">
          {change > 0 && (
            <TrendingUp size={14} className="text-income-text" />
          )}
          {change < 0 && (
            <TrendingDown size={14} className="text-expense-text" />
          )}
          {change === 0 && <Minus size={14} className="text-fg-muted" />}
          <span
            className={cn(
              "text-xs font-medium",
              change > 0 && "text-income-text",
              change < 0 && "text-expense-text",
              change === 0 && "text-fg-muted"
            )}
          >
            {change > 0 ? "+" : ""}
            {change}%
          </span>
          {changeLabel && (
            <span className="text-xs text-fg-muted">{changeLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
