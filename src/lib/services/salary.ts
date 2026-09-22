// ============================================
// Salary Service (Russian labor code & practices)
// Handles net/gross conversion, advance & main salary splits,
// working days calculation, and holiday payment date shifts.
// ============================================

import { ProductionCalendarService } from "./production-calendar";

export interface SalaryConfig {
  monthlySalary: number;
  salaryType: "gross" | "net";
  payDates: number[]; // e.g. [25, 10] (advance on 25th, remaining on 10th)
  payProportions: number[]; // e.g. [0.4, 0.6]
  transferRule?: "previous_working_day" | "next_working_day";
}

export interface PayoutDetail {
  partIndex: number;
  label: string; // "Аванс" or "Основная часть"
  nominalDate: Date; // Configured date
  actualDate: Date; // Shifted for non-working day
  amount: number;
  isAdvance: boolean;
  workingDaysTotal: number;
}

export class SalaryService {
  /**
   * Convert Gross to Net (13% Russian NDFL)
   */
  static grossToNet(gross: number): number {
    return Math.round(gross * 0.87);
  }

  /**
   * Convert Net to Gross (reverse 13% Russian NDFL)
   */
  static netToGross(net: number): number {
    return Math.round(net / 0.87);
  }

  /**
   * Get effective monthly net salary
   */
  static getNetMonthlySalary(config: SalaryConfig): number {
    if (config.salaryType === "gross") {
      return this.grossToNet(config.monthlySalary);
    }
    return config.monthlySalary;
  }

  /**
   * Calculates specific payouts in a target calendar month
   * e.g. For March:
   * - Advance on 25th of March (or shifted)
   * - Remaining salary on 10th of March (for February work, or shifted)
   */
  static getMonthPayouts(
    config: SalaryConfig,
    year: number,
    month: number // 1-12
  ): PayoutDetail[] {
    const netSalary = this.getNetMonthlySalary(config);
    const rule = config.transferRule || "previous_working_day";
    const totalWorkingDays = ProductionCalendarService.getWorkingDaysInMonth(year, month);
    const payouts: PayoutDetail[] = [];

    const payDates = config.payDates && config.payDates.length >= 2 ? config.payDates : [25, 10];
    const proportions = config.payProportions && config.payProportions.length >= 2 ? config.payProportions : [0.4, 0.6];

    payDates.forEach((nominalDay, idx) => {
      const prop = proportions[idx] !== undefined ? proportions[idx] : 1 / payDates.length;
      const isAdvance = idx === 0;
      const nominalDate = new Date(year, month - 1, Math.min(nominalDay, new Date(year, month, 0).getDate()));
      const actualDate = ProductionCalendarService.getActualPaymentDate(year, month, nominalDay, rule);
      const amount = Math.round(netSalary * prop);

      payouts.push({
        partIndex: idx,
        label: isAdvance ? "Аванс" : "Зарплата",
        nominalDate,
        actualDate,
        amount,
        isAdvance,
        workingDaysTotal: totalWorkingDays,
      });
    });

    return payouts;
  }

  /**
   * Salary calculation based on days worked (Labor Code formula):
   * Actual Salary = (Monthly Salary / Working Days in Month) * Actual Days Worked
   */
  static calculateProRatedSalary(
    monthlySalary: number,
    year: number,
    month: number,
    daysWorked: number
  ): number {
    const totalWorkingDays = ProductionCalendarService.getWorkingDaysInMonth(year, month);
    if (totalWorkingDays <= 0) return monthlySalary;
    return Math.round((monthlySalary / totalWorkingDays) * daysWorked);
  }
}
