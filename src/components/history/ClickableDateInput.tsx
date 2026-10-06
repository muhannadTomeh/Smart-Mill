import { useRef } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ClickableDateInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  className?: string;
  inputClassName?: string;
}

export function ClickableDateInput({
  label,
  value,
  onChange,
  min,
  max,
  className,
  inputClassName,
}: ClickableDateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;

    input.focus();
    try {
      input.showPicker?.();
    } catch {
      // Focusing keeps the native date input usable in browsers without showPicker support.
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div
        className="cursor-pointer"
        onClick={(event) => {
          if (event.target !== inputRef.current) openPicker();
        }}
      >
        <Input
          ref={inputRef}
          type="date"
          aria-label={label}
          dir="ltr"
          value={value}
          min={min}
          max={max}
          onClick={(event) => {
            event.stopPropagation();
            openPicker();
          }}
          onChange={(event) => onChange(event.target.value)}
          className={cn("h-9 cursor-pointer text-xs", inputClassName)}
        />
      </div>
    </div>
  );
}
