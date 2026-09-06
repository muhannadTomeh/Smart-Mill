/**
 * Helper utility ensuring all dates, times, and numbers in the system
 * strictly render using Western Arabic / Latin digits (0, 1, 2, 3, 4, 5, 6, 7, 8, 9).
 */

export const LATIN_ARABIC_LOCALE = "ar-u-nu-latn";

export function formatDate(
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(LATIN_ARABIC_LOCALE, options || {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

export function formatDateTime(
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(LATIN_ARABIC_LOCALE, options || {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(LATIN_ARABIC_LOCALE, options || {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatNumber(
  num: number | string | null | undefined,
  decimals?: number
): string {
  if (num === null || num === undefined || num === "") return "0";
  const n = typeof num === "string" ? parseFloat(num) : num;
  if (isNaN(n)) return "0";
  if (decimals !== undefined) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return n.toLocaleString("en-US");
}

export function toLatinDigits(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}
