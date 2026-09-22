"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export interface ToastData {
  id: string;
  message: string;
  description?: string;
  type?: "success" | "error" | "info" | "warning";
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

// Global toast state
let toastListeners: ((toast: ToastData) => void)[] = [];

export function toast(data: Omit<ToastData, "id">) {
  const id = crypto.randomUUID();
  const toastData: ToastData = { id, ...data };
  toastListeners.forEach((listener) => listener(toastData));
}

toast.success = (message: string, options?: { description?: string; duration?: number }) => {
  toast({ message, type: "success", ...options });
};

toast.error = (message: string, options?: { description?: string; duration?: number }) => {
  toast({ message, type: "error", ...options });
};

toast.info = (message: string, options?: { description?: string; duration?: number }) => {
  toast({ message, type: "info", ...options });
};

toast.warning = (message: string, options?: { description?: string; duration?: number }) => {
  toast({ message, type: "warning", ...options });
};

const typeStyles = {
  success: "border-income/40 bg-income-muted/90 text-fg-primary",
  error: "border-expense/40 bg-expense-muted/90 text-fg-primary",
  info: "border-info/40 bg-info-muted/90 text-fg-primary",
  warning: "border-warning/40 bg-warning-muted/90 text-fg-primary",
};

function ToastItem({
  data,
  onRemove,
}: {
  data: ToastData;
  onRemove: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(data.id);
    }, data.duration || 4000);
    return () => clearTimeout(timer);
  }, [data, onRemove]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 min-w-[300px] max-w-[420px]",
        "bg-bg-elevated border border-border-default rounded-[var(--radius-lg)]",
        "shadow-2xl animate-slide-in-right",
        data.type && typeStyles[data.type]
      )}
      role="alert"
    >
      <div className="flex-1">
        <p className="text-sm font-medium text-fg-primary">{data.message}</p>
        {data.description && (
          <p className="text-xs text-fg-secondary mt-0.5">{data.description}</p>
        )}
      </div>

      {data.action && (
        <button
          onClick={() => {
            data.action!.onClick();
            onRemove(data.id);
          }}
          className="text-xs font-semibold text-accent-text hover:text-accent-hover whitespace-nowrap mt-0.5"
        >
          {data.action.label}
        </button>
      )}

      <button
        onClick={() => onRemove(data.id)}
        className="p-1 text-fg-muted hover:text-fg-secondary rounded"
        aria-label="Закрыть"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const handleRemove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const listener = (toast: ToastData) => {
      setToasts((prev) => [...prev, toast]);
    };
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem data={t} onRemove={handleRemove} />
        </div>
      ))}
    </div>
  );
}
