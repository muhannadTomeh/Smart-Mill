import { Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/formatters";

interface OperationDateTimeProps {
  value: string | number | Date | null | undefined;
  className?: string;
  showClockIcon?: boolean;
}

export function OperationDateTime({
  value,
  className,
  showClockIcon = true,
}: OperationDateTimeProps) {
  return (
    <div className={cn("whitespace-nowrap font-mono", className)}>
      <div className="text-xs text-foreground">{formatDate(value)}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium leading-4 text-muted-foreground">
        {showClockIcon && <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />}
        <span>الساعة {formatTime(value)}</span>
      </div>
    </div>
  );
}
