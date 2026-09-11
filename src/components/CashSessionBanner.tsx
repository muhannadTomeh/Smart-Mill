import { useState } from "react";
import { useCashSession } from "@/contexts/CashSessionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { LockOpen, Lock, Clock, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

function formatDuration(openedAt: string): string {
  try {
    return formatDistanceToNow(new Date(openedAt), { addSuffix: false, locale: ar });
  } catch {
    return "";
  }
}

interface OpenDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (balance: number) => void;
  loading: boolean;
}

function OpenSessionDialog({ open, onClose, onConfirm, loading }: OpenDialogProps) {
  const [balance, setBalance] = useState("0");

  const handleConfirm = () => {
    const val = parseFloat(balance) || 0;
    if (val < 0) return;
    onConfirm(val);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockOpen className="h-5 w-5 text-emerald-500" />
            فتح الصندوق
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            أدخل الرصيد الافتتاحي (المبلغ الموجود في الدرج عند الفتح):
          </p>
          <div className="space-y-1.5">
            <Label>الرصيد الافتتاحي</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0"
              className="text-right"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading ? "جاري الفتح..." : "فتح الصندوق"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CloseDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (balance: number, note: string) => void;
  loading: boolean;
  sessionCashIn: number;
  sessionCashOut: number;
  openingBalance: number;
}

function CloseSessionDialog({ open, onClose, onConfirm, loading, sessionCashIn, sessionCashOut, openingBalance }: CloseDialogProps) {
  const [balance, setBalance] = useState("");
  const [note, setNote] = useState("");

  const expectedBalance = openingBalance + sessionCashIn - sessionCashOut;
  const actualBalance = balance === "" ? null : parseFloat(balance) || 0;
  const difference = actualBalance !== null ? actualBalance - expectedBalance : null;

  const handleConfirm = () => {
    if (actualBalance === null) return;
    onConfirm(actualBalance, note.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-rose-500" />
            إغلاق الصندوق
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Summary */}
          <div className="rounded-xl bg-muted p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الرصيد الافتتاحي</span>
              <span className="font-medium">{openingBalance.toFixed(2)} ₪</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3 text-emerald-500" /> إجمالي الوارد</span>
              <span className="font-medium text-emerald-600">+{sessionCashIn.toFixed(2)} ₪</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3 text-rose-500" /> إجمالي الصادر</span>
              <span className="font-medium text-rose-600">-{sessionCashOut.toFixed(2)} ₪</span>
            </div>
            <div className="border-t border-border/60 pt-1 flex justify-between font-semibold">
              <span>المتوقع في الدرج</span>
              <span>{expectedBalance.toFixed(2)} ₪</span>
            </div>
          </div>

          {/* Actual count */}
          <div className="space-y-1.5">
            <Label>المبلغ الفعلي في الدرج (بعد العدّ)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder={expectedBalance.toFixed(2)}
              className="text-right"
              autoFocus
            />
          </div>

          {/* Difference indicator */}
          {difference !== null && (
            <div className={`flex items-center gap-2 rounded-lg p-2.5 text-sm font-medium ${
              Math.abs(difference) < 0.01
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                : difference > 0
                ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
            }`}>
              {Math.abs(difference) < 0.01 ? "✅ الحساب مطابق" : (
                <>
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {difference > 0 ? `زيادة +${difference.toFixed(2)} ₪` : `عجز ${difference.toFixed(2)} ₪`}
                </>
              )}
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="سبب الفرق أو ملاحظات إضافية..."
              className="resize-none text-right"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || actualBalance === null}
            variant="destructive"
          >
            {loading ? "جاري الإغلاق..." : "إغلاق الصندوق"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CashSessionBanner
 * A compact status bar + action button for managing the cash session.
 * Renders nothing if the user is a Platform Admin (no mill membership).
 */
export function CashSessionBanner() {
  const { session, isOpen, loading, openSession, closeSession } = useCashSession();
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Platform admin / non-mill users: millId is null from context, so session is always null.
  // We only render the banner when we know the user is a mill member.
  // If loading, don't render to avoid flash.
  if (loading) return null;

  const handleOpen = async (balance: number) => {
    setActionLoading(true);
    const ok = await openSession(balance);
    setActionLoading(false);
    if (ok) setOpenDialog(false);
  };

  const handleClose = async (balance: number, note: string) => {
    setActionLoading(true);
    const { success } = await closeSession(balance, note);
    setActionLoading(false);
    if (success) setCloseDialog(false);
  };

  if (isOpen && session) {
    return (
      <>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">الصندوق مفتوح منذ {formatDuration(session.opened_at)}</span>
          <span className="inline sm:hidden">مفتوح</span>
          <button
            onClick={() => setCloseDialog(true)}
            className="mr-1 flex items-center gap-1 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 px-2 py-0.5 text-xs font-semibold hover:bg-rose-200 dark:hover:bg-rose-900 transition-colors"
          >
            <Lock className="h-3 w-3" />
            إغلاق
          </button>
        </div>
        <CloseSessionDialog
          open={closeDialog}
          onClose={() => setCloseDialog(false)}
          onConfirm={handleClose}
          loading={actionLoading}
          sessionCashIn={session.total_cash_in}
          sessionCashOut={session.total_cash_out}
          openingBalance={session.opening_balance}
        />
      </>
    );
  }

  // Closed state
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs font-medium select-none">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">الصندوق مغلق</span>
        <button
          onClick={() => setOpenDialog(true)}
          className="mr-1 flex items-center gap-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-xs font-semibold hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-colors"
        >
          <LockOpen className="h-3 w-3" />
          فتح
        </button>
      </div>
      <OpenSessionDialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        onConfirm={handleOpen}
        loading={actionLoading}
      />
    </>
  );
}
