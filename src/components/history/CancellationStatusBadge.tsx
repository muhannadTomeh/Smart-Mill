import { Ban, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CancellationStatusBadgeProps {
  kind?: "cancelled" | "reversed" | "reversal";
  reason?: string | null;
}

export function CancellationStatusBadge({
  kind = "cancelled",
  reason,
}: CancellationStatusBadgeProps) {
  const isCancelled = kind === "cancelled";
  const label = isCancelled
    ? "ملغاة"
    : kind === "reversal"
      ? "حركة عكسية"
      : "تم عكسها";
  const Icon = isCancelled ? Ban : RotateCcw;

  return (
    <Badge
      variant="outline"
      title={reason?.trim() || undefined}
      className={
        isCancelled
          ? "gap-1 border-rose-300 bg-rose-50 text-rose-700"
          : "gap-1 border-amber-300 bg-amber-50 text-amber-700"
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
