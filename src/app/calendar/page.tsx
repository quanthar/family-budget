"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AmountDisplay } from "@/components/ui/amount-display";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Calendar as CalendarIcon,
  Briefcase,
  Sparkles,
} from "lucide-react";
import { ProductionCalendarService } from "@/lib/services/production-calendar";

interface CalendarEvent {
  date: string; // YYYY-MM-DD
  type: "salary" | "recurring" | "transaction";
  label: string;
  amount: number;
  isIncome: boolean;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1-12

  const loadMonthData = useCallback(() => {
    setLoading(true);
    fetch(`/api/dashboard?year=${year}&month=${month}`)
      .then((res) => res.json())
      .then((data) => {
        const evs: CalendarEvent[] = [];

        // Add timeline events (salary + recurring)
        if (data.forecast?.timeline) {
          data.forecast.timeline.forEach((item: any) => {
            const d = new Date(item.date);
            const dateKey = d.toISOString().slice(0, 10);
            evs.push({
              date: dateKey,
              type: item.amount > 0 ? "salary" : "recurring",
              label: item.label,
              amount: Math.abs(item.amount),
              isIncome: item.amount > 0,
            });
          });
        }

        setEvents(evs);
      })
      .catch((err) => console.error("Calendar data error:", err))
      .finally(() => setLoading(false));
  }, [year, month]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  // Calendar days grid computation
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);

    // Russian week: Monday is 0 (firstDayOfMonth.getDay(): Sunday is 0, Mon is 1)
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday

    const days = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 2, prevMonthLastDay - i);
      days.push({
        date: d,
        isCurrentMonth: false,
        isWorking: ProductionCalendarService.isWorkingDay(d),
      });
    }

    // Current month days
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      const d = new Date(year, month - 1, day);
      const holidayInfo = ProductionCalendarService.getHolidayInfo(d);
      days.push({
        date: d,
        isCurrentMonth: true,
        isWorking: ProductionCalendarService.isWorkingDay(d),
        isHoliday: holidayInfo.isHoliday,
        holidayName: holidayInfo.holidayName,
      });
    }

    // Next month padding to fill complete grid of 35 or 42
    const totalSlots = days.length <= 35 ? 35 : 42;
    const remaining = totalSlots - days.length;
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(year, month, day);
      days.push({
        date: d,
        isCurrentMonth: false,
        isWorking: ProductionCalendarService.isWorkingDay(d),
      });
    }

    return days;
  }, [year, month]);

  // Events map by YYYY-MM-DD
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const existing = map.get(ev.date) || [];
      existing.push(ev);
      map.set(ev.date, existing);
    }
    return map;
  }, [events]);

  const selectedDateKey = selectedDate.toISOString().slice(0, 10);
  const selectedDayEvents = eventsByDay.get(selectedDateKey) || [];
  const selectedDayHoliday = ProductionCalendarService.getHolidayInfo(selectedDate);

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const monthNames = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
  ];
  const weekDayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-5 animate-fade-in-up">
        {/* Header & Month Navigator */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-fg-primary flex items-center gap-2">
              <CalendarIcon className="text-accent" size={24} />
              <span>{monthNames[month - 1]} {year}</span>
            </h1>
            <p className="text-xs sm:text-sm text-fg-muted mt-0.5">
              Финансовый и производственный календарь выплат
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-lg)] bg-bg-surface hover:bg-bg-hover text-fg-primary border border-border-default transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 h-9 text-xs font-medium rounded-[var(--radius-lg)] bg-bg-surface hover:bg-bg-hover text-fg-primary border border-border-default transition-colors"
            >
              Сегодня
            </button>
            <button
              onClick={nextMonth}
              className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-lg)] bg-bg-surface hover:bg-bg-hover text-fg-primary border border-border-default transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main Month Grid (2 cols on large screen) */}
          <Card className="lg:col-span-2 p-3 sm:p-4">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {weekDayNames.map((dayName, idx) => (
                <div
                  key={dayName}
                  className={cn(
                    "text-xs font-semibold py-1.5",
                    idx >= 5 ? "text-expense-text" : "text-fg-muted"
                  )}
                >
                  {dayName}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {calendarDays.map((item, idx) => {
                const dateKey = item.date.toISOString().slice(0, 10);
                const dayEvents = eventsByDay.get(dateKey) || [];
                const isSelected = dateKey === selectedDateKey;
                const isToday =
                  dateKey === new Date().toISOString().slice(0, 10);

                const hasIncome = dayEvents.some((e) => e.isIncome);
                const hasExpense = dayEvents.some((e) => !e.isIncome);

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDate(item.date)}
                    className={cn(
                      "min-h-[64px] sm:min-h-[76px] p-1.5 rounded-[var(--radius-lg)] flex flex-col justify-between text-left transition-all relative border",
                      isSelected
                        ? "border-accent ring-1 ring-accent bg-accent-muted/20"
                        : "border-border-default/40 hover:border-border-default bg-bg-surface/50 hover:bg-bg-hover/50",
                      !item.isCurrentMonth && "opacity-35",
                      item.isHoliday && "bg-expense-muted/10 border-expense/20"
                    )}
                  >
                    {/* Date label */}
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={cn(
                          "text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center",
                          isToday && "bg-accent text-accent-fg font-bold",
                          !isToday && !item.isWorking && "text-expense-text",
                          !isToday && item.isWorking && "text-fg-secondary"
                        )}
                      >
                        {item.date.getDate()}
                      </span>

                      {item.isHoliday && (
                        <span className="w-1.5 h-1.5 rounded-full bg-expense-text" />
                      )}
                    </div>

                    {/* Event badges */}
                    <div className="space-y-0.5 w-full overflow-hidden mt-1">
                      {hasIncome && (
                        <div className="flex items-center gap-0.5 text-[10px] font-semibold text-income-text bg-income-muted/80 px-1 py-0.5 rounded truncate">
                          <ArrowUp size={9} />
                          <span>Зарплата</span>
                        </div>
                      )}
                      {hasExpense && (
                        <div className="flex items-center gap-0.5 text-[10px] font-semibold text-expense-text bg-expense-muted/80 px-1 py-0.5 rounded truncate">
                          <ArrowDown size={9} />
                          <span>Платёж</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Selected Day Inspector */}
          <div className="space-y-4">
            <Card className="p-4 space-y-4">
              <CardHeader
                title={selectedDate.toLocaleDateString("ru-RU", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
                subtitle={
                  selectedDayHoliday.isHoliday
                    ? `🎉 ${selectedDayHoliday.holidayName}`
                    : ProductionCalendarService.isWorkingDay(selectedDate)
                    ? "Рабочий день"
                    : "Выходной день"
                }
              />

              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  События дня ({selectedDayEvents.length})
                </h4>

                {selectedDayEvents.length === 0 ? (
                  <p className="text-sm text-fg-muted py-4 text-center">
                    В этот день нет запланированных выплат или платежей.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayEvents.map((ev, i) => (
                      <div
                        key={i}
                        className={cn(
                          "p-3 rounded-[var(--radius-lg)] border flex items-center justify-between",
                          ev.isIncome
                            ? "bg-income-muted/30 border-income/30"
                            : "bg-expense-muted/30 border-expense/30"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center",
                              ev.isIncome ? "bg-income-muted text-income-text" : "bg-expense-muted text-expense-text"
                            )}
                          >
                            {ev.isIncome ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-fg-primary">
                              {ev.label}
                            </p>
                            <p className="text-[10px] text-fg-muted">
                              {ev.isIncome ? "Поступление" : "Списание"}
                            </p>
                          </div>
                        </div>

                        <AmountDisplay
                          amount={ev.isIncome ? ev.amount : -ev.amount}
                          size="sm"
                          colorize
                          showSign
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Russian Production Calendar info for selected month */}
              <div className="pt-3 border-t border-border-default/50 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <Briefcase size={14} />
                  <span>Норма рабочих дней:</span>
                  <span className="font-semibold text-fg-primary">
                    {ProductionCalendarService.getWorkingDaysInMonth(year, month)} дн.
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
