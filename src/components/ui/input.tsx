import * as React from "react"

import { cn } from "@/lib/utils"

export const toLatinDigits = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
};

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, lang, dir, onChange, ...props }, ref) => {
    const isNumeric =
      type === "number" ||
      type === "tel" ||
      props.inputMode === "numeric" ||
      props.inputMode === "decimal";

    // Use type="text" with inputMode="decimal" when type="number" is passed
    // to prevent Chromium from natively formatting numbers into Eastern Arabic / Hindi numerals (١٢٣)
    // based on the host Windows/OS regional locale.
    const resolvedType = type === "number" ? "text" : type;
    const resolvedInputMode =
      props.inputMode || (type === "number" ? "decimal" : undefined);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isNumeric && e.target.value) {
        const normalized = toLatinDigits(e.target.value);
        if (normalized !== e.target.value) {
          e.target.value = normalized;
        }
      }
      onChange?.(e);
    };

    // Ensure value passed in string form is normalized to Latin digits
    const rawValue = props.value;
    const normalizedValue =
      typeof rawValue === "string" && isNumeric
        ? toLatinDigits(rawValue)
        : rawValue;

    return (
      <input
        type={resolvedType}
        inputMode={resolvedInputMode}
        lang={lang || (isNumeric ? "en-US" : undefined)}
        dir={dir || (isNumeric ? "ltr" : undefined)}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          isNumeric && "font-mono tabular-nums",
          className
        )}
        onChange={handleChange}
        ref={ref}
        {...props}
        value={normalizedValue}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

