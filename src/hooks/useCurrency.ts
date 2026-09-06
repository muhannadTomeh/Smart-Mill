import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

export interface CurrencyOption {
  symbol: string;
  name: string;
  country: string;
}

export const POPULAR_CURRENCIES: CurrencyOption[] = [
  { symbol: "₪", name: "شيكل", country: "فلسطين" },
  { symbol: "د.أ", name: "دينار أردني", country: "الأردن" },
  { symbol: "ل.س", name: "ليرة سورية", country: "سوريا" },
  { symbol: "$", name: "دولار أمريكي", country: "دولي / عام" },
  { symbol: "ر.س", name: "ريال سعودي", country: "السعودية" },
  { symbol: "د.ت", name: "دينار تونسي", country: "تونس" },
  { symbol: "د.م", name: "درهم مغربي", country: "المغرب" },
  { symbol: "د.ج", name: "دينار جزائري", country: "الجزائر" },
  { symbol: "ل.ل", name: "ليرة لبنانية", country: "لبنان" },
  { symbol: "₺", name: "ليرة تركية", country: "تركيا" },
];

export function getDefaultCurrencyForCountry(country?: string | null): string {
  if (!country) return "₪";
  switch (country.trim()) {
    case "الأردن": return "د.أ";
    case "سوريا": return "ل.س";
    case "لبنان": return "ل.ل";
    case "تونس": return "د.ت";
    case "المغرب": return "د.م";
    case "الجزائر": return "د.ج";
    case "السعودية": return "ر.س";
    case "تركيا": return "₺";
    case "فلسطين":
    default:
      return "₪";
  }
}

export const STORAGE_KEY_CURRENCY = "mill_currency";
export const CURRENCY_CHANGE_EVENT = "smart_mill_currency_change";

export function useCurrency() {
  const { profile } = useAuth();
  const defaultCurrency = getDefaultCurrencyForCountry(profile?.country);

  const [currency, setCurrencyState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_CURRENCY) || defaultCurrency;
  });

  // If user hasn't explicitly customized currency, align with profile country
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_CURRENCY);
    if (!saved && profile?.country) {
      const countryCurr = getDefaultCurrencyForCountry(profile.country);
      setCurrencyState(countryCurr);
    }
  }, [profile?.country]);

  // Sync across tabs and custom events
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_CURRENCY && e.newValue) {
        setCurrencyState(e.newValue);
      }
    };
    const handleCustom = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setCurrencyState(customEvent.detail);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(CURRENCY_CHANGE_EVENT, handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(CURRENCY_CHANGE_EVENT, handleCustom);
    };
  }, []);

  const setCurrency = useCallback((newCurrency: string) => {
    const val = newCurrency.trim() || "₪";
    localStorage.setItem(STORAGE_KEY_CURRENCY, val);
    setCurrencyState(val);
    window.dispatchEvent(new CustomEvent(CURRENCY_CHANGE_EVENT, { detail: val }));
  }, []);

  return { 
    currency, 
    setCurrency, 
    currencies: POPULAR_CURRENCIES,
    defaultCurrency 
  };
}
