import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  onClick?: () => void;
}

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

export function Card({
  children,
  className,
  padding = "md",
  hover = false,
  onClick,
}: CardProps) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      className={cn(
        "bg-bg-secondary border border-border-subtle rounded-[var(--radius-xl)]",
        paddingStyles[padding],
        hover &&
          "transition-all duration-[var(--transition-fast)] hover:bg-bg-tertiary hover:border-border-default cursor-pointer",
        onClick && "text-left w-full",
        className
      )}
      onClick={onClick}
    >
      {children}
    </Component>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, className }: CardHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      <div>
        <h3 className="text-sm font-medium text-fg-secondary uppercase tracking-wider">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-fg-tertiary mt-0.5">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
