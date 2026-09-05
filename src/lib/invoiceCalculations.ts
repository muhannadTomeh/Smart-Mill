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

/**
 * حساب تخصيص الدفع المختلط بناءً على كمية الزيت المدخلة يدوياً.
 * إذا دفع الزبون زيتاً أقل من نسبة الرد، يتم تعويض الفارق نقداً.
 * إذا دفع زيتاً أكثر من نسبة الرد، يتم خصم الزيادة من تكلفة التنكات/المصاريف النقدية.
 */
export function calculateCustomMixedFromOil(
  oilProduced: number,
  containerCost: number,
  settings: MillSettings,
  customOil: number
): PaymentBreakdown {
  const oilReturn = (oilProduced * settings.return_percent) / 100;
  const containerOilEquiv = settings.oil_buy_price > 0 ? containerCost / settings.oil_buy_price : 0;
  const totalOilPayment = oilReturn + containerOilEquiv;
  const cashReturn = oilProduced * settings.cash_return_cost;

  const pressingCashRate = oilReturn > 0 ? cashReturn / oilReturn : (settings.oil_sell_price || 25);
  const containerCashRate = settings.oil_buy_price > 0 ? settings.oil_buy_price : (settings.oil_sell_price || 23);

  const clampedOil = Math.max(0, Math.min(totalOilPayment, customOil));
  let calculatedCash = 0;

  if (clampedOil <= oilReturn) {
    const unpaidPressingOil = oilReturn - clampedOil;
    calculatedCash = containerCost + unpaidPressingOil * pressingCashRate;
  } else {
    const extraOilForContainers = clampedOil - oilReturn;
    calculatedCash = Math.max(0, containerCost - extraOilForContainers * containerCashRate);
  }

  return {
    type: "mixed",
    oilAmount: Math.round(clampedOil * 100) / 100,
    cashAmount: Math.round(calculatedCash * 100) / 100,
    oilReturn,
    containerOilEquiv,
    cashReturn,
    containerCashCost: containerCost,
  };
}

/**
 * حساب تخصيص الدفع المختلط بناءً على المبلغ النقدي المدخل يدوياً.
 * يعكس الحساب لمعرفة كمية الزيت المتبقية لتغطية كامل الفاتورة.
 */
export function calculateCustomMixedFromCash(
  oilProduced: number,
  containerCost: number,
  settings: MillSettings,
  customCash: number
): PaymentBreakdown {
  const oilReturn = (oilProduced * settings.return_percent) / 100;
  const containerOilEquiv = settings.oil_buy_price > 0 ? containerCost / settings.oil_buy_price : 0;
  const totalOilPayment = oilReturn + containerOilEquiv;
  const cashReturn = oilProduced * settings.cash_return_cost;
  const totalCashPayment = cashReturn + containerCost;

  const pressingCashRate = oilReturn > 0 ? cashReturn / oilReturn : (settings.oil_sell_price || 25);
  const containerCashRate = settings.oil_buy_price > 0 ? settings.oil_buy_price : (settings.oil_sell_price || 23);

  const clampedCash = Math.max(0, Math.min(totalCashPayment, customCash));
  let calculatedOil = 0;

  if (clampedCash <= containerCost) {
    const unpaidContainers = containerCost - clampedCash;
    calculatedOil = oilReturn + (containerCashRate > 0 ? unpaidContainers / containerCashRate : 0);
  } else {
    const extraCashForPressing = clampedCash - containerCost;
    const pressingOilCovered = pressingCashRate > 0 ? extraCashForPressing / pressingCashRate : 0;
    calculatedOil = Math.max(0, oilReturn - pressingOilCovered);
  }

  return {
    type: "mixed",
    oilAmount: Math.round(calculatedOil * 100) / 100,
    cashAmount: Math.round(clampedCash * 100) / 100,
    oilReturn,
    containerOilEquiv,
    cashReturn,
    containerCashCost: containerCost,
  };
}

