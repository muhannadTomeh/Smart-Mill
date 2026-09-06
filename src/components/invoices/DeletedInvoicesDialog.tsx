import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  Undo2,
  Calculator,
  Clock,
  Phone,
  Package,
  FileText,
  AlertTriangle,
  RotateCcw,
  Info,
} from "lucide-react";
import { useDeletedInvoices } from "@/hooks/useDeletedInvoices";
import { formatRemainingTime, type DeletedInvoice } from "@/lib/deletedInvoices";
import { formatDate, formatDateTime } from "@/lib/formatters";

interface DeletedInvoicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectForInvoice?: (item: DeletedInvoice) => void;
}

export function DeletedInvoicesDialog({
  open,
  onOpenChange,
  onSelectForInvoice,
}: DeletedInvoicesDialogProps) {
  const {
    deletedInvoices,
    count,
    restoringId,
    restoreItem,
    deletePermanently,
    clearAll,
  } = useDeletedInvoices();

  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<DeletedInvoice | null>(null);

  const handleInvoiceDirectly = (item: DeletedInvoice) => {
    if (onSelectForInvoice) {
      onSelectForInvoice(item);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-2xl max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl"
      >
        {/* Header */}
        <DialogHeader className="p-5 pb-4 border-b bg-muted/20 text-right shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <span>الفواتير والأدوار المحذوفة</span>
                  {count > 0 && (
                    <Badge variant="destructive" className="font-mono text-xs px-2 py-0.5">
                      {count}
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  تحفظ تلقائياً لمدة 24 ساعة (يوم واحد) من وقت الحذف
                </DialogDescription>
              </div>
            </div>

            <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10 gap-1 hidden sm:flex">
              <Clock className="h-3.5 w-3.5" />
              <span>مدة الحفظ: 24 ساعة فقط</span>
            </Badge>
          </div>
        </DialogHeader>

        {/* Informative Alert banner */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2.5 flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200 shrink-0">
          <Info className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            أي فاتورة تم حذفها من قائمة <strong>بانتظار الفاتورة</strong> تودع هنا مؤقتاً لحمايتها من الخطأ، ويمكنك استرجاعها مباشرة للطابور أو فوترتها فوراً.
          </span>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
          {deletedInvoices.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Trash2 className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">سلة الفواتير المحذوفة فارغة</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  لا توجد فواتير أو أدوار محذوفة حالياً. أي عملية حذف ستظهر هنا وتظل محفوظة لمدة 24 ساعة.
                </p>
              </div>
            </div>
          ) : (
            deletedInvoices.map((item) => {
              const remainingStr = formatRemainingTime(item.expires_at);
              const deletedDateStr = formatDateTime(item.deleted_at, {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={item.id}
                  className="p-4 border rounded-xl bg-card hover:border-border transition-colors shadow-2xs space-y-3"
                >
                  {/* Row 1: Header (Position, Name, Expiration) */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center h-6 min-w-[2rem] px-2 rounded-md bg-destructive/10 text-destructive font-bold text-xs font-mono">
                        #{item.position}
                      </span>
                      <h4 className="font-bold text-base text-foreground">{item.name}</h4>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className="text-[11px] font-medium bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/25 flex items-center gap-1"
                      >
                        <Clock className="h-3 w-3" />
                        <span>ينتهي بعد: {remainingStr}</span>
                      </Badge>
                    </div>
                  </div>

                  {/* Row 2: Metadata (Bags, Phone, Deletion Date) */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap bg-muted/30 p-2.5 rounded-lg border border-border/60">
                    <div className="flex items-center gap-1 font-semibold text-foreground">
                      <Package className="h-3.5 w-3.5 text-primary" />
                      <span>{item.bags} شوال</span>
                    </div>

                    {item.phone && (
                      <div className="flex items-center gap-1 font-mono">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span dir="ltr">{item.phone}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80 ms-auto">
                      <span>حُذفت:</span>
                      <span className="font-mono">{deletedDateStr}</span>
                    </div>
                  </div>

                  {/* Row 3: Notes if any */}
                  {item.notes && (
                    <p className="text-xs text-muted-foreground bg-background p-2 rounded-md border border-dashed line-clamp-2">
                      <span className="font-medium text-foreground">ملاحظات: </span>
                      {item.notes}
                    </p>
                  )}

                  {/* Row 4: Actions */}
                  <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                    {/* Permanent Delete */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => deletePermanently(item.id)}
                      className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>حذف نهائي</span>
                    </Button>

                    {/* Invoice Directly */}
                    {onSelectForInvoice && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleInvoiceDirectly(item)}
                        className="h-8 text-xs font-semibold gap-1.5"
                      >
                        <Calculator className="h-3.5 w-3.5 text-primary" />
                        <span>فوترة مباشرة</span>
                      </Button>
                    )}

                    {/* Restore to Queue */}
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={restoringId === item.id}
                      onClick={() => restoreItem(item)}
                      className="h-8 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                    >
                      <RotateCcw className={`h-3.5 w-3.5 ${restoringId === item.id ? "animate-spin" : ""}`} />
                      <span>{restoringId === item.id ? "جارٍ الاسترجاع..." : "استرجاع إلى الطابور"}</span>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {deletedInvoices.length > 0 && (
          <DialogFooter className="p-4 border-t bg-muted/20 flex flex-row items-center justify-between gap-2 shrink-0">
            {confirmClearAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive font-medium">هل أنت متأكد من حذف الكل؟</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    clearAll();
                    setConfirmClearAll(false);
                  }}
                  className="h-8 text-xs font-bold"
                >
                  نعم، احذف الكل
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmClearAll(false)}
                  className="h-8 text-xs"
                >
                  إلغاء
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmClearAll(true)}
                className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>إفراغ السلة</span>
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs font-medium"
            >
              إغلاق
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
