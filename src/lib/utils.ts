import { clsx, type ClassValue } from "clsx";

/**
 * Utility for conditionally joining class names.
 * Wraps clsx for Tailwind class merging.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Format a number as Russian Ruble currency.
 * Uses tabular numerals for alignment.
 */
export function formatCurrency(
  amount: number,
  options?: { showSign?: boolean; compact?: boolean }
): string {
  const { showSign = false, compact = false } = options ?? {};

  const formatter = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    ...(compact && {
      notation: "compact",
      compactDisplay: "short",
    }),
  });

  const formatted = formatter.format(Math.abs(amount));

  if (showSign) {
    return amount >= 0 ? `+${formatted}` : `-${formatted}`;
  }

  return amount < 0 ? `-${formatted}` : formatted;
}

/**
 * Format a number with thousands separator (no currency symbol).
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

/**
 * Format a date in Russian locale.
 */
export function formatDate(
  date: Date | string,
  format: "short" | "medium" | "long" | "day-month" = "medium"
): string {
  const d = typeof date === "string" ? new Date(date) : date;

  switch (format) {
    case "short":
      return d.toLocaleDateString("ru-RU", { day: "numeric", month: "numeric" });
    case "medium":
      return d.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
      });
    case "long":
      return d.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    case "day-month":
      return d.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      });
    default:
      return d.toLocaleDateString("ru-RU");
  }
}

/**
 * Format a relative date (Сегодня, Вчера, etc.)
 */
export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  if (diff === -1) return "Завтра";
  if (diff > 1 && diff <= 7) return `${diff} дн. назад`;

  return formatDate(d, "medium");
}

/**
 * Get the current month name in Russian.
 */
export function getMonthName(date: Date = new Date()): string {
  return date.toLocaleDateString("ru-RU", { month: "long" });
}

/**
 * Get month + year label: "Сентябрь 2026"
 */
export function getMonthYearLabel(date: Date = new Date()): string {
  const month = date.toLocaleDateString("ru-RU", { month: "long" });
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${date.getFullYear()}`;
}

/**
 * Calculate percentage.
 */
export function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Plural form helper for Russian language.
 * pluralize(5, 'день', 'дня', 'дней') → '5 дней'
 */
export function pluralize(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod100 >= 11 && mod100 <= 19) return `${count} ${many}`;
  if (mod10 === 1) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

/**
 * Generate a random ID (for client-side temporary IDs).
 */
export function generateId(): string {
  return crypto.randomUUID();
}
