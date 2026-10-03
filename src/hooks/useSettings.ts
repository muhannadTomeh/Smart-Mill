import { useSeason } from "@/contexts/SeasonContext";
import {
  DEFAULT_CASH_RETURN_PRICING_MODE,
  normalizeCashReturnPricingMode,
  type CashReturnPricingMode,
} from "@/lib/cashReturnPricing";

export interface MillSettings {
  return_percent: number;
  oil_sell_price: number;
  oil_buy_price: number;
  cash_return_cost: number;
  cash_return_pricing_mode: CashReturnPricingMode;
  plastic_container_price: number;
  metal_container_price: number;
}

const DEFAULT_SETTINGS: MillSettings = {
  return_percent: 6,
  oil_sell_price: 25,
  oil_buy_price: 23,
  cash_return_cost: 1.5,
  cash_return_pricing_mode: DEFAULT_CASH_RETURN_PRICING_MODE,
  plastic_container_price: 10,
  metal_container_price: 15,
};

export function useSettings() {
  const { activeSeason } = useSeason();

  const settings: MillSettings = activeSeason
    ? {
        return_percent: Number(activeSeason.return_percent),
        oil_sell_price: Number(activeSeason.oil_sell_price),
        oil_buy_price: Number(activeSeason.oil_buy_price),
        cash_return_cost: Number(activeSeason.cash_return_cost),
        cash_return_pricing_mode: normalizeCashReturnPricingMode(
          activeSeason.cash_return_pricing_mode,
        ),
        plastic_container_price: Number(activeSeason.plastic_container_price),
        metal_container_price: Number(activeSeason.metal_container_price),
      }
    : DEFAULT_SETTINGS;

  // الإعدادات تُدار لكل موسم عبر جدول المواسم (SeasonSetup)
  return { settings, loading: false };
}
