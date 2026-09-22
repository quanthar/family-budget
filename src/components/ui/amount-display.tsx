import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";

interface AmountDisplayProps {
  amount: number;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  showSign?: boolean;
  compact?: boolean;
  colorize?: boolean;
  className?: string;
}

const sizeStyles = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-2xl",
  hero: "text-3xl sm:text-4xl",
};

export function AmountDisplay({
  amount,
  size = "md",
  showSign = false,
  compact = false,
  colorize = false,
  className,
}: AmountDisplayProps) {
  const formatted = formatCurrency(amount, { showSign, compact });

  return (
    <span
      className={cn(
        "tabular-nums font-semibold tracking-tight",
        sizeStyles[size],
        colorize && amount > 0 && "text-income-text",
        colorize && amount < 0 && "text-expense-text",
        colorize && amount === 0 && "text-fg-secondary",
        !colorize && "text-fg-primary",
        className
      )}
    >
      {formatted}
    </span>
  );
}
