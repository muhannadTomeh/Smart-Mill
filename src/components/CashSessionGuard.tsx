import { useCashSession } from "@/contexts/CashSessionContext";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSeason } from "@/contexts/SeasonContext";

interface Props {
  /** When true, show a full-page blocking state. When false, just return the isBlocked flag. */
  variant?: "banner" | "inline-warning";
  children?: React.ReactNode;
}

function OpenDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openSession } = useCashSession();
  const { activeSeason } = useSeason();
  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (!activeSeason) return;
    setLoading(true);
    const ok = await openSession(parseFloat(balance) || 0);
    setLoading(false);
    if (ok) onClose();
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
            أدخل الرصيد الافتتاحي (المبلغ الموجود في الدرج):
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
              onKeyDown={(e) => e.key === "Enter" && handleOpen()}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>إلغاء</Button>
          <Button onClick={handleOpen} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? "جاري الفتح..." : "فتح الصندوق"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CashSessionGuard
 * Shows a warning banner at the top of any page that requires an open cash session.
 * The backend trigger will reject the actual DB insert, but this provides instant UX feedback.
 */
export function CashSessionGuard({ children }: { children?: React.ReactNode }) {
  const { isOpen, loading } = useCashSession();
  const [showOpenDialog, setShowOpenDialog] = useState(false);

  if (loading) return <>{children}</>;
  if (isOpen) return <>{children}</>;

  // Closed state: show warning inline at top
  return (
    <>
      <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/20 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
          <Lock className="h-5 w-5 shrink-0" />
          <p className="font-semibold text-sm">الصندوق مغلق</p>
        </div>
        <p className="text-rose-700/80 dark:text-rose-400/80 text-sm flex-1">
          لا يمكن إجراء عمليات نقدية بدون فتح الصندوق. يجب فتح الصندوق أولاً.
        </p>
        <Button
          size="sm"
          onClick={() => setShowOpenDialog(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
        >
          <LockOpen className="h-4 w-4 mr-1.5" />
          فتح الصندوق
        </Button>
      </div>
      {children}
      <OpenDialog open={showOpenDialog} onClose={() => setShowOpenDialog(false)} />
    </>
  );
}

/** Returns whether the cash session is currently blocking operations */
export function useCashSessionBlocked() {
  const { isOpen, loading } = useCashSession();
  return !loading && !isOpen;
}
