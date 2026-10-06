import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ActionReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  reasonLabel?: string;
  placeholder?: string;
  pending?: boolean;
  onConfirm: (reason: string) => void;
}

export function ActionReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "تأكيد الإلغاء",
  reasonLabel = "سبب الإلغاء",
  placeholder = "اكتب سببًا واضحًا ليظهر في سجل التدقيق...",
  pending = false,
  onConfirm,
}: ActionReasonDialogProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const trimmedReason = reason.trim();

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}>
      <DialogContent dir="rtl" className="sm:max-w-md rounded-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmedReason && !pending) onConfirm(trimmedReason);
          }}
          className="space-y-5"
        >
          <DialogHeader className="text-right">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <DialogTitle className="text-base">{title}</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-right leading-6">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="action-reason" className="text-sm font-semibold">
              {reasonLabel} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="action-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={placeholder}
              className="min-h-24 resize-none rounded-xl"
              autoFocus
              disabled={pending}
              maxLength={500}
            />
            <p className="text-[11px] text-muted-foreground">
              سيُحفظ السبب في سجل التدقيق دون حذف الحركة الأصلية.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="submit"
              variant="destructive"
              disabled={!trimmedReason || pending}
              className="rounded-xl"
            >
              {pending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {pending ? "جارٍ التنفيذ..." : confirmLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
              className="rounded-xl"
            >
              رجوع
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
