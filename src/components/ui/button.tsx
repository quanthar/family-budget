import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "income" | "expense";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover active:bg-indigo-600 focus-visible:ring-2 focus-visible:ring-accent/50",
  secondary:
    "bg-bg-surface text-fg-primary border border-border-default hover:bg-bg-hover active:bg-bg-active",
  ghost:
    "text-fg-secondary hover:text-fg-primary hover:bg-bg-hover active:bg-bg-active",
  danger:
    "bg-expense/10 text-expense-text hover:bg-expense/20 active:bg-expense/30",
  expense:
    "bg-expense/10 text-expense-text hover:bg-expense/20 active:bg-expense/30",
  success:
    "bg-income/10 text-income-text hover:bg-income/20 active:bg-income/30",
  income:
    "bg-income/10 text-income-text hover:bg-income/20 active:bg-income/30",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2.5",
  icon: "h-10 w-10 justify-center",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium",
          "rounded-[var(--radius-lg)] transition-all duration-[var(--transition-fast)]",
          "outline-none cursor-pointer select-none",
          "disabled:opacity-50 disabled:pointer-events-none",
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && "w-full",
          isLoading && "pointer-events-none",
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
export type { ButtonProps };
