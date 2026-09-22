// ============================================
// Production Calendar Service (Russian Federation)
// Includes 2025, 2026, 2027 calendar data & transfer logic
// ============================================

export interface CalendarDayInfo {
  date: string; // YYYY-MM-DD
  isWorking: boolean;
  isHoliday: boolean;
  isTransferred: boolean;
  holidayName?: string;
}

// Key official Russian non-working holidays (annual)
// Jan 1-8: New Year holidays & Christmas
// Feb 23: Defender of the Fatherland Day
// Mar 8: International Women's Day
// May 1: Spring and Labor Day
// May 9: Victory Day
// Jun 12: Russia Day
// Nov 4: National Unity Day

// Pre-calculated working day exceptions and transfers for 2025-2027
// Format: YYYY-MM-DD -> { isWorking: boolean, holidayName?: string }
const SPECIAL_DAYS: Record<string, { isWorking: boolean; isHoliday?: boolean; holidayName?: string }> = {
  // --- 2025 ---
  "2025-01-01": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2025-01-02": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2025-01-03": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2025-01-04": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2025-01-05": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2025-01-06": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2025-01-07": { isWorking: false, isHoliday: true, holidayName: "Рождество Христово" },
  "2025-01-08": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2025-02-23": { isWorking: false, isHoliday: true, holidayName: "День защитника Отечества" },
  "2025-03-08": { isWorking: false, isHoliday: true, holidayName: "Международный женский день" },
  "2025-05-01": { isWorking: false, isHoliday: true, holidayName: "Праздник Весны и Труда" },
  "2025-05-02": { isWorking: false, isHoliday: true, holidayName: "Перенесенный выходной" },
  "2025-05-08": { isWorking: false, isHoliday: true, holidayName: "Перенесенный выходной" },
  "2025-05-09": { isWorking: false, isHoliday: true, holidayName: "День Победы" },
  "2025-06-12": { isWorking: false, isHoliday: true, holidayName: "День России" },
  "2025-06-13": { isWorking: false, isHoliday: true, holidayName: "Перенесенный выходной" },
  "2025-11-03": { isWorking: false, isHoliday: true, holidayName: "Перенесенный выходной" },
  "2025-11-04": { isWorking: false, isHoliday: true, holidayName: "День народного единства" },
  "2025-12-31": { isWorking: false, isHoliday: true, holidayName: "Новогодний выходной" },

  // --- 2026 ---
  "2026-01-01": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2026-01-02": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2026-01-03": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2026-01-04": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2026-01-05": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2026-01-06": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2026-01-07": { isWorking: false, isHoliday: true, holidayName: "Рождество Христово" },
  "2026-01-08": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2026-02-23": { isWorking: false, isHoliday: true, holidayName: "День защитника Отечества" },
  "2026-03-08": { isWorking: false, isHoliday: true, holidayName: "Международный женский день" },
  "2026-03-09": { isWorking: false, isHoliday: true, holidayName: "Перенесенный выходной" },
  "2026-05-01": { isWorking: false, isHoliday: true, holidayName: "Праздник Весны и Труда" },
  "2026-05-09": { isWorking: false, isHoliday: true, holidayName: "День Победы" },
  "2026-05-11": { isWorking: false, isHoliday: true, holidayName: "Перенесенный выходной" },
  "2026-06-12": { isWorking: false, isHoliday: true, holidayName: "День России" },
  "2026-11-04": { isWorking: false, isHoliday: true, holidayName: "День народного единства" },
  "2026-12-31": { isWorking: false, isHoliday: true, holidayName: "Новогодний выходной" },

  // --- 2027 ---
  "2027-01-01": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2027-01-02": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2027-01-03": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2027-01-04": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2027-01-05": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2027-01-06": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2027-01-07": { isWorking: false, isHoliday: true, holidayName: "Рождество Христово" },
  "2027-01-08": { isWorking: false, isHoliday: true, holidayName: "Новогодние каникулы" },
  "2027-02-23": { isWorking: false, isHoliday: true, holidayName: "День защитника Отечества" },
  "2027-03-08": { isWorking: false, isHoliday: true, holidayName: "Международный женский день" },
  "2027-05-01": { isWorking: false, isHoliday: true, holidayName: "Праздник Весны и Труда" },
  "2027-05-09": { isWorking: false, isHoliday: true, holidayName: "День Победы" },
  "2027-05-10": { isWorking: false, isHoliday: true, holidayName: "Перенесенный выходной" },
  "2027-06-12": { isWorking: false, isHoliday: true, holidayName: "День России" },
  "2027-11-04": { isWorking: false, isHoliday: true, holidayName: "День народного единства" },
};

function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class ProductionCalendarService {
  /**
   * Check if a given date is a working day (takes weekends and Russian holidays/transfers into account).
   */
  static isWorkingDay(date: Date): boolean {
    const key = formatDateKey(date);
    if (SPECIAL_DAYS[key] !== undefined) {
      return SPECIAL_DAYS[key].isWorking;
    }
    const dayOfWeek = date.getDay(); // 0 is Sunday, 6 is Saturday
    return dayOfWeek !== 0 && dayOfWeek !== 6;
  }

  /**
   * Returns holiday name if date is a public holiday, or undefined
   */
  static getHolidayInfo(date: Date): { isHoliday: boolean; holidayName?: string } {
    const key = formatDateKey(date);
    const special = SPECIAL_DAYS[key];
    if (special?.isHoliday) {
      return { isHoliday: true, holidayName: special.holidayName };
    }
    return { isHoliday: false };
  }

  /**
   * Returns count of working days in a given month (month: 1-12)
   */
  static getWorkingDaysInMonth(year: number, month: number): number {
    const totalDays = new Date(year, month, 0).getDate();
    let workingDays = 0;
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month - 1, day);
      if (this.isWorkingDay(d)) {
        workingDays++;
      }
    }
    return workingDays;
  }

  /**
   * Returns all working days in a month as an array of Dates
   */
  static getWorkingDatesInMonth(year: number, month: number): Date[] {
    const totalDays = new Date(year, month, 0).getDate();
    const dates: Date[] = [];
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month - 1, day);
      if (this.isWorkingDay(d)) {
        dates.push(d);
      }
    }
    return dates;
  }

  /**
   * Finds the nearest previous working day for a given date
   */
  static getPreviousWorkingDay(date: Date): Date {
    const d = new Date(date);
    while (!this.isWorkingDay(d)) {
      d.setDate(d.getDate() - 1);
    }
    return d;
  }

  /**
   * Finds the nearest next working day for a given date
   */
  static getNextWorkingDay(date: Date): Date {
    const d = new Date(date);
    while (!this.isWorkingDay(d)) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  }

  /**
   * Calculates actual payout date considering transfer rules (e.g. if the 10th falls on Sunday, pay on Friday 8th)
   */
  static getActualPaymentDate(
    year: number,
    month: number, // 1-12
    targetDay: number,
    rule: "previous_working_day" | "next_working_day" = "previous_working_day"
  ): Date {
    const maxDays = new Date(year, month, 0).getDate();
    const safeDay = Math.min(targetDay, maxDays);
    const targetDate = new Date(year, month - 1, safeDay);

    if (this.isWorkingDay(targetDate)) {
      return targetDate;
    }

    if (rule === "previous_working_day") {
      return this.getPreviousWorkingDay(targetDate);
    } else {
      return this.getNextWorkingDay(targetDate);
    }
  }
}
