import { useState, useEffect, useCallback } from "react";
import { useSeason } from "@/contexts/SeasonContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  type DeletedInvoice,
  getDeletedInvoices,
  removeDeletedInvoice,
  clearAllDeletedInvoices,
  restoreDeletedInvoiceToQueue,
} from "@/lib/deletedInvoices";
import { useToast } from "@/hooks/use-toast";

export function useDeletedInvoices() {
  const { activeSeason } = useSeason();
  const { user, millId } = useAuth();
  const { toast } = useToast();

  const [deletedInvoices, setDeletedInvoices] = useState<DeletedInvoice[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const list = getDeletedInvoices(activeSeason?.id);
    setDeletedInvoices(list);
  }, [activeSeason?.id]);

  useEffect(() => {
    refresh();

    // Listen for cross-tab or local updates
    const handleCustom = (e: any) => {
      if (!e.detail?.seasonId || !activeSeason?.id || e.detail.seasonId === activeSeason.id) {
        refresh();
      }
    };
    window.addEventListener("deleted_invoices_updated", handleCustom);

    // Cross-tab broadcast channel
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("smart_mill_deleted_invoices_channel");
      bc.onmessage = (ev) => {
        if (!ev.data?.seasonId || !activeSeason?.id || ev.data.seasonId === activeSeason.id) {
          refresh();
        }
      };
    } catch {}

    // Check expiration every 60 seconds
    const interval = setInterval(refresh, 60000);

    return () => {
      window.removeEventListener("deleted_invoices_updated", handleCustom);
      bc?.close();
      clearInterval(interval);
    };
  }, [refresh, activeSeason?.id]);

  const restoreItem = async (item: DeletedInvoice) => {
    setRestoringId(item.id);
    const targetMillId = item.mill_id || activeSeason?.mill_id || millId || "";
    const res = await restoreDeletedInvoiceToQueue(item, targetMillId, user?.id);
    setRestoringId(null);

    if (res.success) {
      toast({
        title: "تم استرجاع الفاتورة بنجاح",
        description: `تمت إعادة دور "${item.name}" إلى قائمة بانتظار الفاتورة في الطابور`,
      });
      refresh();
      return true;
    } else {
      toast({
        variant: "destructive",
        title: "تعذر استرجاع الفاتورة",
        description: res.error || "حدث خطأ غير متوقع",
      });
      return false;
    }
  };

  const deletePermanently = (id: string) => {
    removeDeletedInvoice(id, activeSeason?.id);
    refresh();
    toast({
      title: "تم الحذف النهائي",
      description: "تم حذف الفاتورة نهائياً من سلة المحذوفات",
    });
  };

  const clearAll = () => {
    clearAllDeletedInvoices(activeSeason?.id);
    refresh();
    toast({
      title: "تم إفراغ السلة",
      description: "تم إفراغ جميع الفواتير المحذوفة نهائياً",
    });
  };

  return {
    deletedInvoices,
    count: deletedInvoices.length,
    restoringId,
    restoreItem,
    deletePermanently,
    clearAll,
    refresh,
  };
}
