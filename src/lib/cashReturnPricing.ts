export const CASH_RETURN_PRICING_MODES = [
  "fixed_per_produced_kg",
  "oil_return_at_buy_price",
  "oil_return_at_sell_price",
] as const;

export type CashReturnPricingMode = (typeof CASH_RETURN_PRICING_MODES)[number];

export const DEFAULT_CASH_RETURN_PRICING_MODE: CashReturnPricingMode =
  "fixed_per_produced_kg";

export interface CashReturnPricingSettings {
  return_percent: number;
  oil_buy_price: number;
  oil_sell_price: number;
  cash_return_cost: number;
  cash_return_pricing_mode?: CashReturnPricingMode | string | null;
}

const safeNumber = (value: number) =>
  Number.isFinite(value) && value > 0 ? value : 0;

export function normalizeCashReturnPricingMode(
  value: string | null | undefined,
): CashReturnPricingMode {
  return CASH_RETURN_PRICING_MODES.includes(value as CashReturnPricingMode)
    ? (value as CashReturnPricingMode)
    : DEFAULT_CASH_RETURN_PRICING_MODE;
}

export function calculateOilReturnQuantity(
  oilProduced: number,
  returnPercent: number,
): number {
  return (safeNumber(oilProduced) * safeNumber(returnPercent)) / 100;
}

export function calculateCashReturnAmount(
  oilProduced: number,
  settings: CashReturnPricingSettings,
): number {
  const produced = safeNumber(oilProduced);
  const oilReturn = calculateOilReturnQuantity(produced, settings.return_percent);

  switch (normalizeCashReturnPricingMode(settings.cash_return_pricing_mode)) {
    case "oil_return_at_buy_price":
      return oilReturn * safeNumber(settings.oil_buy_price);
    case "oil_return_at_sell_price":
      return oilReturn * safeNumber(settings.oil_sell_price);
    case "fixed_per_produced_kg":
    default:
      return produced * safeNumber(settings.cash_return_cost);
  }
}

export function getCashReturnPricingLabel(
  mode: CashReturnPricingMode,
): string {
  switch (mode) {
    case "oil_return_at_buy_price":
      return "نسبة الرد بالزيت × سعر شراء الزيت";
    case "oil_return_at_sell_price":
      return "نسبة الرد بالزيت × سعر بيع الزيت";
    case "fixed_per_produced_kg":
    default:
      return "سعر نقدي ثابت لكل كغم زيت منتج";
  }
}
