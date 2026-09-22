/**
 * Default expense categories with SVG icon names (Lucide) and colors.
 * No emoji — only minimalist SVG icons.
 */
export const DEFAULT_CATEGORIES = [
  { name: "Жилье", icon: "Home", color: "#6366f1" },
  { name: "Продукты", icon: "ShoppingCart", color: "#22c55e" },
  { name: "Транспорт", icon: "Car", color: "#3b82f6" },
  { name: "Здоровье", icon: "Heart", color: "#ef4444" },
  { name: "Красота", icon: "Sparkles", color: "#ec4899" },
  { name: "Развлечения", icon: "Gamepad2", color: "#f59e0b" },
  { name: "Одежда", icon: "Shirt", color: "#8b5cf6" },
  { name: "Дети", icon: "Baby", color: "#14b8a6" },
  { name: "Дом", icon: "Wrench", color: "#78716c" },
  { name: "Подписки", icon: "CreditCard", color: "#a78bfa" },
  { name: "Связь", icon: "Smartphone", color: "#06b6d4" },
  { name: "Путешествия", icon: "Plane", color: "#f97316" },
  { name: "Подарки", icon: "Gift", color: "#e879f9" },
  { name: "Кредиты", icon: "Landmark", color: "#dc2626" },
  { name: "Другое", icon: "MoreHorizontal", color: "#71717a" },
] as const;

/**
 * Income types with Russian labels.
 */
export const INCOME_TYPES = [
  { value: "salary", label: "Зарплата" },
  { value: "bonus", label: "Премия" },
  { value: "refund", label: "Возврат" },
  { value: "freelance", label: "Подработка" },
  { value: "gift", label: "Подарок" },
  { value: "other", label: "Другое" },
] as const;

/**
 * Recurring periods with Russian labels.
 */
export const RECURRING_PERIODS = [
  { value: "monthly", label: "Ежемесячно" },
  { value: "quarterly", label: "Ежеквартально" },
  { value: "yearly", label: "Ежегодно" },
] as const;

/**
 * Owner types with Russian labels.
 */
export const OWNER_TYPES = [
  { value: "person1", label: "Участник 1" },
  { value: "person2", label: "Участник 2" },
  { value: "shared", label: "Общий" },
] as const;

/**
 * Russian NDFL tax rate (13% standard, 15% for income > 5M/year).
 */
export const NDFL_RATE_STANDARD = 0.13;
export const NDFL_RATE_ELEVATED = 0.15;
export const NDFL_THRESHOLD = 5_000_000;

/**
 * Navigation items for sidebar and bottom nav.
 */
export const NAV_ITEMS = [
  { href: "/", label: "Обзор", icon: "LayoutDashboard" },
  { href: "/transactions", label: "Транзакции", icon: "ArrowLeftRight" },
  { href: "/plan", label: "План", icon: "Target" },
  { href: "/calendar", label: "Календарь", icon: "Calendar" },
  { href: "/analytics", label: "Аналитика", icon: "BarChart3" },
  { href: "/people", label: "Участники", icon: "Users" },
] as const;

/**
 * Bottom nav items (mobile) — subset with "+" button.
 */
export const BOTTOM_NAV_ITEMS = [
  { href: "/", label: "Главная", icon: "LayoutDashboard" },
  { href: "/plan", label: "План", icon: "Target" },
  { href: "#add", label: "Добавить", icon: "Plus", isAction: true },
  { href: "/analytics", label: "Аналитика", icon: "BarChart3" },
  { href: "/more", label: "Ещё", icon: "Menu" },
] as const;

/**
 * Settings navigation sections.
 */
export const SETTINGS_SECTIONS = [
  { id: "profile", label: "Профиль семьи", icon: "Home" },
  { id: "members", label: "Участники", icon: "Users" },
  { id: "salary", label: "Зарплата", icon: "Banknote" },
  { id: "categories", label: "Категории", icon: "Tag" },
  { id: "recurring", label: "Регулярные платежи", icon: "Repeat" },
  { id: "calendar", label: "Производственный календарь", icon: "Calendar" },
  { id: "notifications", label: "Уведомления", icon: "Bell" },
  { id: "currency", label: "Валюта", icon: "CircleDollarSign" },
  { id: "security", label: "Безопасность", icon: "Shield" },
  { id: "export", label: "Экспорт данных", icon: "Download" },
] as const;
