import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-6",
        className
      )}
    >
      {icon && (
        <div className="w-12 h-12 rounded-[var(--radius-xl)] bg-bg-surface flex items-center justify-center mb-4 text-fg-muted">
          {icon}
        </div>
      )}
      <h3 className="text-base font-medium text-fg-primary mb-1.5">{title}</h3>
      <p className="text-sm text-fg-tertiary max-w-sm mb-5">{description}</p>
      {action}
    </div>
  );
}

interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className, lines = 1 }: SkeletonProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "skeleton h-4",
            i === lines - 1 && lines > 1 && "w-3/4"
          )}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-bg-secondary border border-border-subtle rounded-[var(--radius-xl)] p-5",
        className
      )}
    >
      <div className="skeleton h-3 w-20 mb-3" />
      <div className="skeleton h-7 w-32 mb-2" />
      <div className="skeleton h-3 w-16" />
    </div>
  );
}
