/**
 * Helper utility ensuring all dates, times, and numbers in the system
 * strictly render using Western Arabic / Latin digits (0, 1, 2, 3, 4, 5, 6, 7, 8, 9).
 */

export const LATIN_ARABIC_LOCALE = "ar-u-nu-latn";

function timeFormatOptions(): Intl.DateTimeFormatOptions {
  const timeFormat = typeof window !== "undefined" && localStorage.getItem("smart_mill_time_format") === "12" ? "12" : "24";
  return { hour12: timeFormat === "12" };
}

export function formatDate(
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return toLatinDigits(
    d.toLocaleDateString(LATIN_ARABIC_LOCALE, options || {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    })
  );
}

export function formatDateTime(
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return toLatinDigits(
    d.toLocaleString(LATIN_ARABIC_LOCALE, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...timeFormatOptions(),
      ...options,
    })
  );
}

export function formatTime(
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return "";
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return toLatinDigits(
    d.toLocaleTimeString(LATIN_ARABIC_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
      ...timeFormatOptions(),
      ...options,
    })
  );
}

export function getTimeParts(
  date: Date,
  { timeFormat = "24" }: { timeFormat?: "12" | "24" } = {}
) {
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");

  if (timeFormat === "12") {
    return {
      hours: String(hours24 % 12 || 12).padStart(2, "0"),
      minutes,
      period: hours24 < 12 ? "ص" : "م",
    };
  }

  return { hours: String(hours24).padStart(2, "0"), minutes, period: "" };
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
