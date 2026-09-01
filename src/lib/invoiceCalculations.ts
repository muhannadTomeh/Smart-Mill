import type { MillSettings } from "@/hooks/useSettings";

export type PaymentType = "oil" | "cash" | "mixed";

export interface PaymentBreakdown {
  type: PaymentType;
  oilAmount: number;
  cashAmount: number;
  oilReturn: number;
  containerOilEquiv: number;
  cashReturn: number;
  containerCashCost: number;
}

export interface PaymentOptions {
  oil: PaymentBreakdown;
  cash: PaymentBreakdown;
  mixed: PaymentBreakdown;
}

/**
 * المنطق الموحّد لحساب طرق الدفع الثلاث (زيت فقط / نقدي فقط / مختلط).
 * مصدر الحقيقة الوحيد — يستخدمه كل من صفحة الفواتير وورقة الفاتورة السريعة.
 */
export function calculatePaymentOptions(
  oilProduced: number,
  containerCost: number,
  settings: MillSettings
): PaymentOptions {
  const oilReturn = (oilProduced * settings.return_percent) / 100;
  const containerOilEquiv = containerCost / settings.oil_buy_price;
  const totalOilPayment = oilReturn + containerOilEquiv;
  const cashReturn = oilProduced * settings.cash_return_cost;
  const totalCashPayment = cashReturn + containerCost;

  return {
    oil: {
      type: "oil",
      oilAmount: totalOilPayment,
      cashAmount: 0,
      oilReturn,
      containerOilEquiv,
      cashReturn: 0,
      containerCashCost: 0,
    },
    cash: {
      type: "cash",
      oilAmount: 0,
      cashAmount: totalCashPayment,
      oilReturn: 0,
      containerOilEquiv: 0,
      cashReturn,
      containerCashCost: containerCost,
    },
    mixed: {
      type: "mixed",
      oilAmount: oilReturn,
      cashAmount: containerCost,
      oilReturn,
      containerOilEquiv: 0,
      cashReturn: 0,
      containerCashCost: containerCost,
    },
  };
}
