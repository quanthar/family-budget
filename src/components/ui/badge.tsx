import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "neutral" | "income" | "expense" | "warning" | "info" | "accent" | "transfer";
  size?: "sm" | "md";
  className?: string;
}

const variantStyles = {
  default: "bg-bg-surface text-fg-secondary",
  neutral: "bg-bg-surface text-fg-secondary",
  income: "bg-income-muted text-income-text",
  expense: "bg-expense-muted text-expense-text",
  warning: "bg-warning-muted text-warning-text",
  info: "bg-info-muted text-info-text",
  accent: "bg-accent-muted text-accent-text",
  transfer: "bg-transfer-muted text-transfer",
};

const sizeStyles = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
};

export function Badge({
  children,
  variant = "default",
  size = "md",
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-[var(--radius-full)]",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
}
