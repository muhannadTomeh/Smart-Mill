import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Clock, UserPlus, Trash2, CheckCircle, Monitor, Play,
  ChevronDown, Calculator, Users, Package, RefreshCw, Printer, Pencil,
  GripVertical, Undo2, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { QuickInvoiceSheet } from "@/components/queue/QuickInvoiceSheet";
import { printThermalQueueTicket } from "@/lib/thermalReceiptPrinter";
import {
  QueueItem,
  parseEstimatedMinutes,
  parseStartedAt,
  getRemainingSeconds,
  formatRemaining,
  formatTimeSafe,
} from "@/lib/queueUtils";

// Re-export for backwards compatibility
export { parseEstimatedMinutes, parseStartedAt, getRemainingSeconds, formatRemaining, formatTimeSafe };
export type { QueueItem };

const formatTime = formatTimeSafe;

const Queue = () => {
  const [allItems, setAllItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", bags: "", notes: "", estimatedMinutes: "" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<{
    id: string;
    name: string;
    phone: string;
    bags: string;
    notes: string;
    estimatedMinutes: string;
    position: number;
  } | null>(null);
  const [invoiceSheetOpen, setInvoiceSheetOpen] = useState(false);
  const [selectedForInvoice, setSelectedForInvoice] = useState<QueueItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QueueItem | null>(null);

  // Drag & drop reorder state
  const [draggedItem, setDraggedItem] = useState<QueueItem | null>(null);
  const [dragOverItem, setDragOverItem] = useState<QueueItem | null>(null);
  const [reorderConfirm, setReorderConfirm] = useState<{
    sourceCustomer: QueueItem;
    targetCustomer: QueueItem;
    newPosition: number;
    reorderedQueue: QueueItem[];
    updates: { id: string; position: number }[];
  } | null>(null);

  const { user, effectiveUserId, profile } = useAuth();
  const { activeSeason } = useSeason();

  useEffect(() => {
    if (profile?.mill_name) {
      try {
        localStorage.setItem("mill_name", profile.mill_name);
      } catch {}
    }
  }, [profile?.mill_name]);

  // Tick every second for live countdown
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const targetUserId = effectiveUserId || user?.id;

  const processing = allItems.filter((i) => i.status === "processing");
  const waiting = allItems.filter((i) => i.status === "waiting");
  const completed = allItems.filter((i) => i.status === "completed");

  useEffect(() => {
    if (targetUserId && activeSeason) fetchQueue();
  }, [targetUserId, activeSeason]);

  // Realtime subscription
  useEffect(() => {
    if (!targetUserId || !activeSeason) return;
    const channel = supabase
      .channel("queue-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue", filter: `season_id=eq.${activeSeason.id}` },
        () => fetchQueue()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetUserId, activeSeason]);

  const fetchQueue = async () => {
    if (!targetUserId || !activeSeason) return;
    const { data } = await supabase
      .from("queue")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: true });

    const raw = (data as QueueItem[]) || [];
    const activeRaw = raw.filter((item) => item.status !== "done");
    let curSeq = 1;
    const items = activeRaw.map((item) => {
      const pos = item.position && Number(item.position) > 0 ? Number(item.position) : curSeq;
      curSeq = Math.max(curSeq, pos) + 1;
      return { ...item, position: pos };
    });

    setAllItems(items);
    setLoading(false);
    try {
      localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(items));
    } catch {}
  };

  const calculateQueueWaitAhead = (targetPosition: number) => {
    // 1. Current processing items
    const processingItems = allItems.filter((i) => i.status === "processing");
    let processingRemainingMins = 0;
    for (const p of processingItems) {
      const remSec = getRemainingSeconds(p, nowMs);
      if (remSec !== null && remSec > 0) {
        processingRemainingMins += Math.max(1, Math.ceil(remSec / 60));
      } else {
        const pEst = parseEstimatedMinutes(p) || 30;
        processingRemainingMins += pEst;
      }
    }

    // 2. Waiting items ahead of targetPosition
    const waitingAhead = allItems.filter(
      (i) => i.status === "waiting" && Number(i.position) < targetPosition
    );
    let waitingMins = 0;
    for (const w of waitingAhead) {
      const wEst = parseEstimatedMinutes(w) || 30;
      waitingMins += wEst;
    }

    const aheadCount = processingItems.length + waitingAhead.length;
    const waitMinutes = processingRemainingMins + waitingMins;

    return { aheadCount, waitMinutes };
  };

  const addToQueue = async (shouldPrint = false) => {
    if (!newCustomer.name.trim()) {
      toast.error("يرجى إدخال اسم الزبون");
      return;
    }

    const estMin = newCustomer.estimatedMinutes ? parseInt(newCustomer.estimatedMinutes, 10) : null;
    const bagsCount = newCustomer.bags ? parseInt(newCustomer.bags, 10) : 0;
    const fallbackNotes = estMin 
      ? `[وقت_تقديري:${estMin}] ${newCustomer.notes?.trim() || ""}`.trim()
      : (newCustomer.notes?.trim() || null);

    const existingPositions = allItems.map((i) => Number(i.position) || 0);
    const maxPos = existingPositions.length > 0 ? Math.max(0, ...existingPositions) : 0;
    const nextPosition = maxPos + 1;

    const basePayload: any = {
      user_id: targetUserId!,
      season_id: activeSeason!.id,
      name: newCustomer.name.trim(),
      phone: newCustomer.phone?.trim() || null,
      bags: bagsCount,
      notes: fallbackNotes,
      status: "waiting",
      position: nextPosition,
    };

    let { data: insertedData, error } = await supabase.from("queue").insert({
      ...basePayload,
      ...(estMin ? { estimated_minutes: estMin } : {}),
    }).select().single();

    if (error && (error.message?.includes("estimated_minutes") || error.code === "PGRST204")) {
      const retry = await supabase.from("queue").insert({
        ...basePayload,
        notes: fallbackNotes || null,
      }).select().single();
      error = retry.error;
      insertedData = retry.data;
    }

    if (!error) {
      if (insertedData?.id && estMin) {
        localStorage.setItem(`queue_est_${insertedData.id}`, String(estMin));
      }
      if (newCustomer.name && estMin) {
        localStorage.setItem(`queue_est_name_${newCustomer.name.trim()}`, String(estMin));
      }

      if (shouldPrint) {
        try {
          const { aheadCount, waitMinutes } = calculateQueueWaitAhead(nextPosition);
          printThermalQueueTicket(
            {
              turn_number: nextPosition,
              customer_name: newCustomer.name.trim(),
              bags_count: bagsCount,
              notes: newCustomer.notes?.trim() || null,
              phone: newCustomer.phone?.trim() || null,
              season_name: activeSeason?.name,
              estimated_minutes: estMin,
              ahead_count: aheadCount,
              estimated_wait_minutes: waitMinutes,
            },
            profile?.mill_name || localStorage.getItem("mill_name") || "معصرة الزيتون"
          );
        } catch (printErr) {
          console.error("Queue ticket printing error:", printErr);
        }
      }

      setNewCustomer({ name: "", phone: "", bags: "", notes: "", estimatedMinutes: "" });
      setDialogOpen(false);
      toast.success(`تمت إضافة الزبون "${newCustomer.name.trim()}" برقم دور #${nextPosition}`);
      await fetchQueue();
    } else {
      toast.error("تعذر إضافة الزبون: " + error.message);
    }
  };

  const handlePrintTicket = (customer: QueueItem) => {
    try {
      const { aheadCount, waitMinutes } = calculateQueueWaitAhead(Number(customer.position));
      printThermalQueueTicket(
        {
          turn_number: customer.position,
          customer_name: customer.name,
          bags_count: customer.bags,
          notes: customer.notes,
          phone: customer.phone,
          created_at: customer.created_at,
          season_name: activeSeason?.name,
          estimated_minutes: parseEstimatedMinutes(customer),
          ahead_count: aheadCount,
          estimated_wait_minutes: waitMinutes,
        },
        profile?.mill_name || localStorage.getItem("mill_name") || "معصرة الزيتون"
      );
    } catch (err) {
      console.error("Print ticket error:", err);
    }
  };

  const openEditDialog = (customer: QueueItem) => {
    const est = parseEstimatedMinutes(customer);
    const cleanNotes = (customer.notes || "")
      .replace(/\[(?:وقت_تقديري|الوقت|est|بدء_العصر):?[^\]]*\]/gi, "")
      .trim();
    setEditingCustomer({
      id: customer.id,
      name: customer.name || "",
      phone: customer.phone || "",
      bags: customer.bags && customer.bags > 0 ? String(customer.bags) : "",
      notes: cleanNotes,
      estimatedMinutes: est ? String(est) : "",
      position: customer.position,
    });
    setEditDialogOpen(true);
  };

  const saveEditCustomer = async () => {
    if (!editingCustomer || !editingCustomer.name.trim()) {
      toast.error("يرجى إدخال اسم الزبون");
      return;
    }

    const estMin = editingCustomer.estimatedMinutes ? parseInt(editingCustomer.estimatedMinutes, 10) : null;
    const bagsCount = editingCustomer.bags ? parseInt(editingCustomer.bags, 10) : 0;
    const fallbackNotes = estMin 
      ? `[وقت_تقديري:${estMin}] ${editingCustomer.notes?.trim() || ""}`.trim()
      : (editingCustomer.notes?.trim() || null);

    setAllItems((prev) => {
      const updated = prev.map((i) =>
        i.id === editingCustomer.id
          ? {
              ...i,
              name: editingCustomer.name.trim(),
              phone: editingCustomer.phone?.trim() || null,
              bags: bagsCount,
              notes: fallbackNotes,
              estimated_minutes: estMin,
            }
          : i
      );
      if (activeSeason) {
        try {
          localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    if (estMin) {
      localStorage.setItem(`queue_est_${editingCustomer.id}`, String(estMin));
      localStorage.setItem(`queue_est_name_${editingCustomer.name.trim()}`, String(estMin));
    }

    let { error } = await supabase
      .from("queue")
      .update({
        name: editingCustomer.name.trim(),
        phone: editingCustomer.phone?.trim() || null,
        bags: bagsCount,
        notes: fallbackNotes,
        estimated_minutes: estMin,
      } as any)
      .eq("id", editingCustomer.id);

    if (error) {
      await supabase
        .from("queue")
        .update({
          name: editingCustomer.name.trim(),
          phone: editingCustomer.phone?.trim() || null,
          bags: bagsCount,
          notes: fallbackNotes,
        })
        .eq("id", editingCustomer.id);
    }

    toast.success(`تم تحديث بيانات الزبون "${editingCustomer.name.trim()}" بنجاح`);
    setEditDialogOpen(false);
    setEditingCustomer(null);
    await fetchQueue();
  };

  const completeProcessing = async (id: string) => {
    setAllItems((prev) => {
      const updated = prev.map((i) => (i.id === id ? { ...i, status: "completed" } : i));
      if (activeSeason) {
        try {
          localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    const { error } = await supabase.from("queue").update({ status: "completed" }).eq("id", id);
    if (error) toast.error("تعذر إنهاء العصر: " + error.message);
    else toast.success("تم الانتهاء من العصر — انتقل لقسم الفوترة");
    await fetchQueue();
  };

  const addExtraMinutes = async (id: string, extraMins: number) => {
    const target = allItems.find((i) => i.id === id);
    if (!target) return;

    const currentEst = parseEstimatedMinutes(target) || 30;
    const newEst = currentEst + extraMins;

    localStorage.setItem(`queue_est_${id}`, String(newEst));
    if (target.name) localStorage.setItem(`queue_est_name_${target.name.trim()}`, String(newEst));

    const updatedNotes = `[وقت_تقديري:${newEst}] ${(target.notes || "").replace(/\[(?:وقت_تقديري|الوقت|est):?[^\]]*\]/gi, "")}`.trim();

    setAllItems((prev) => {
      const updated = prev.map((i) => (i.id === id ? { ...i, estimated_minutes: newEst, notes: updatedNotes } : i));
      if (activeSeason) {
        try {
          localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    let { error } = await supabase.from("queue").update({
      estimated_minutes: newEst,
      notes: updatedNotes,
    } as any).eq("id", id);

    if (error) {
      await supabase.from("queue").update({ notes: updatedNotes }).eq("id", id);
    }

    toast.success(`تمت إضافة ${extraMins} دقيقة إضافية`);
    await fetchQueue();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const deletedName = deleteTarget.name;
    setAllItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    await supabase.from("queue").delete().eq("id", deleteTarget.id);
    toast.success(`تمت إزالة ${deletedName} من الطابور`);
    setDeleteTarget(null);
    await fetchQueue();
  };

  const startProcessing = async (id: string) => {
    // 1. التحقق أولاً: منع بدء عصر زبون جديد إذا كان هناك زبون قيد العصر بالفعل
    const currentActive = allItems.find((i) => i.status === "processing");
    if (currentActive) {
      toast.error(`يوجد زبون بالفعل قيد العصر (${currentActive.name})`, {
        description: "إذا انتهى دوره اضغط على 'تم العصر'",
        duration: 5000,
      });
      return;
    }

    const startedAt = new Date().toISOString();
    const target = allItems.find((i) => i.id === id);
    let estMin = target ? parseEstimatedMinutes(target) : null;
    if (!estMin || estMin <= 0) {
      estMin = 30;
    }

    try {
      localStorage.setItem(`processing_started_${id}`, startedAt);
      localStorage.setItem(`queue_est_${id}`, String(estMin));
      if (target?.name) {
        localStorage.setItem(`queue_est_name_${target.name.trim()}`, String(estMin));
      }
    } catch {}

    const updatedNotes = `[بدء_العصر:${startedAt}] [وقت_تقديري:${estMin}] ${(target?.notes || "").replace(/\[(?:بدء_العصر|وقت_تقديري|الوقت|est):?[^\]]*\]/gi, "")}`.trim();

    setAllItems((prev) => {
      const updated = prev.map((i) => (i.id === id ? { ...i, status: "processing", started_at: startedAt, estimated_minutes: estMin, notes: updatedNotes } : i));
      if (activeSeason) {
        try {
          localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    let { error } = await supabase.from("queue").update({
      status: "processing",
      started_at: startedAt,
      estimated_minutes: estMin,
      notes: updatedNotes,
    } as any).eq("id", id);

    if (error) {
      const retry = await supabase.from("queue").update({
        status: "processing",
        notes: updatedNotes,
      }).eq("id", id);
      error = retry.error;
    }

    if (error) toast.error("تعذر بدء العصر: " + error.message);
    else toast.success(`تم بدء العصر — الوقت التقديري: ${estMin} دقيقة`);
    await fetchQueue();
  };

  const returnToQueue = async (id: string) => {
    const target = allItems.find((i) => i.id === id);
    if (!target) return;

    try {
      localStorage.removeItem(`processing_started_${id}`);
    } catch {}

    const cleanNotes = (target.notes || "")
      .replace(/\[بدء_العصر:[^\]]*\]/gi, "")
      .trim();

    setAllItems((prev) => {
      const updated = prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status: "waiting",
              started_at: null,
              notes: cleanNotes || null,
            }
          : i
      );
      if (activeSeason) {
        try {
          localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    const { error } = await supabase
      .from("queue")
      .update({
        status: "waiting",
        started_at: null,
        notes: cleanNotes || null,
      })
      .eq("id", id);

    if (error) {
      toast.error("تعذر إرجاع الزبون: " + error.message);
    } else {
      toast.success(`تم إرجاع الزبون "${target.name}" إلى قائمة الانتظار`);
    }
    await fetchQueue();
  };

  const handleDragStart = (e: React.DragEvent, item: QueueItem) => {
    setDraggedItem(item);
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, item: QueueItem) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverItem?.id !== item.id) {
      setDragOverItem(item);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetItem: QueueItem) => {
    e.preventDefault();
    setDragOverItem(null);
    if (!draggedItem || draggedItem.id === targetItem.id) {
      setDraggedItem(null);
      return;
    }

    // Sort current waiting items by position
    const waitingList = allItems
      .filter((i) => i.status === "waiting")
      .sort((a, b) => Number(a.position) - Number(b.position));

    const sourceIdx = waitingList.findIndex((i) => i.id === draggedItem.id);
    const targetIdx = waitingList.findIndex((i) => i.id === targetItem.id);
    if (sourceIdx === -1 || targetIdx === -1) {
      setDraggedItem(null);
      return;
    }

    const newWaiting = [...waitingList];
    const [moved] = newWaiting.splice(sourceIdx, 1);
    newWaiting.splice(targetIdx, 0, moved);

    // Re-assign existing ascending positions
    const originalPositions = waitingList.map((w) => Number(w.position));
    const updates: { id: string; position: number }[] = [];
    const reorderedWithPositions = newWaiting.map((item, idx) => {
      const newPos = originalPositions[idx] || (idx + 1);
      if (item.position !== newPos) {
        updates.push({ id: item.id, position: newPos });
      }
      return { ...item, position: newPos };
    });

    const newSourcePosition =
      reorderedWithPositions.find((i) => i.id === draggedItem.id)?.position ?? targetItem.position;

    // Combine with non-waiting items
    const nonWaiting = allItems.filter((i) => i.status !== "waiting");
    const combinedQueue = [...nonWaiting, ...reorderedWithPositions];

    setReorderConfirm({
      sourceCustomer: draggedItem,
      targetCustomer: targetItem,
      newPosition: newSourcePosition,
      reorderedQueue: combinedQueue,
      updates,
    });

    setDraggedItem(null);
  };

  const applyReorder = async () => {
    if (!reorderConfirm) return;
    const { sourceCustomer, newPosition, reorderedQueue, updates } = reorderConfirm;

    setAllItems(reorderedQueue);
    if (activeSeason) {
      try {
        localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(reorderedQueue));
      } catch {}
    }
    setReorderConfirm(null);

    try {
      await Promise.all(
        updates.map((u) =>
          supabase.from("queue").update({ position: u.position }).eq("id", u.id)
        )
      );
      toast.success(`تم تبديل الدور — أصبح دور "${sourceCustomer.name}" رقم #${newPosition}`);
    } catch {
      toast.error("حدث خطأ أثناء حفظ الترتيب الجديد في قاعدة البيانات");
    }

    await fetchQueue();
  };

  const openInvoiceFor = (customer: QueueItem) => {
    setSelectedForInvoice(customer);
    setInvoiceSheetOpen(true);
  };

  return (
    <div className="space-y-5 pb-8" dir="rtl">
      {/* 1. Header: Compact, Functional SaaS Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 md:px-5 md:py-3.5 rounded-xl bg-card border border-border shadow-xs">
        {/* Right side (RTL start): Title + Primary CTA */}
        <div className="flex items-center gap-3 md:gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Clock className="h-4 w-4" />
            </div>
            <h1 className="text-lg md:text-xl font-semibold text-foreground tracking-tight">
              إدارة الطابور والعصر
            </h1>
          </div>

          {/* Primary CTA: + إضافة زبون near the title */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="h-9 px-3.5 rounded-lg text-sm font-semibold shadow-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                <span>+ إضافة زبون</span>
              </Button>
            </DialogTrigger>

            <DialogContent dir="rtl" className="max-w-md rounded-xl p-5">
              <DialogHeader className="text-right">
                <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  تسجيل زبون جديد في الطابور
                </DialogTitle>
                <DialogDescription className="sr-only">
                  نموذج تسجيل وإضافة زبون جديد إلى طابور الانتظار
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3.5 mt-2">
                {/* اسم الزبون (إلزامي فقط) */}
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs font-semibold">
                    اسم الزبون <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                    className="h-10 rounded-lg text-sm"
                    autoFocus
                  />
                </div>

                {/* عدد الشوالات (اختياري) */}
                <div className="space-y-1">
                  <Label htmlFor="bags" className="text-xs font-medium text-muted-foreground">
                    عدد الشوالات (اختياري)
                  </Label>
                  <Input
                    id="bags"
                    type="number"
                    value={newCustomer.bags}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, bags: e.target.value }))}
                    min="0"
                    className="h-10 rounded-lg text-sm"
                  />
                </div>

                {/* رقم التواصل (اختياري) */}
                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground">
                    رقم التواصل (اختياري)
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                    className="h-10 rounded-lg text-sm"
                  />
                </div>

                {/* الوقت التقديري (اختياري) */}
                <div className="space-y-1">
                  <Label htmlFor="estimatedMinutes" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    الوقت التقديري بالدقائق (اختياري)
                  </Label>
                  <Input
                    id="estimatedMinutes"
                    type="number"
                    value={newCustomer.estimatedMinutes}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, estimatedMinutes: e.target.value }))}
                    min="1"
                    className="h-10 rounded-lg text-sm"
                  />
                </div>

                {/* ملاحظات (اختياري) */}
                <div className="space-y-1">
                  <Label htmlFor="notes" className="text-xs font-medium text-muted-foreground">
                    ملاحظات (اختياري)
                  </Label>
                  <Textarea
                    id="notes"
                    value={newCustomer.notes}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, notes: e.target.value }))}
                    rows={2}
                    className="rounded-lg resize-none text-sm"
                  />
                </div>

                {/* أزرار تأكيد / تأكيد وطباعة */}
                <div className="grid grid-cols-2 gap-2.5 mt-4 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => addToQueue(false)}
                    className="h-10 rounded-lg text-sm font-semibold border-border hover:bg-muted text-foreground"
                  >
                    <CheckCircle className="h-4 w-4 me-1.5 text-muted-foreground" />
                    تأكيد
                  </Button>
                  <Button
                    type="button"
                    onClick={() => addToQueue(true)}
                    className="h-10 rounded-lg text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                  >
                    <Printer className="h-4 w-4 me-1.5" />
                    تأكيد وطباعة
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Left side (Secondary Actions): تحديث + شاشة العرض */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchQueue}
            className="h-9 px-3 rounded-lg border-border text-xs font-medium text-muted-foreground hover:text-foreground gap-1.5"
            title="تحديث البيانات"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>تحديث</span>
          </Button>

          {activeSeason && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-9 px-3 rounded-lg border-border hover:bg-accent text-xs font-medium text-foreground gap-1.5"
              title="فتح شاشة العرض العامة في نافذة جديدة"
            >
              <a
                href={`/display/${activeSeason.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Monitor className="h-3.5 w-3.5 text-primary" />
                <span>شاشة العرض</span>
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Operations Workflow Columns: 30% Waiting - 40% Processing - 30% Invoicing */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 md:gap-5 items-start">
        {/* العمود 1 (اليمين): 1. قائمة الانتظار (30%) */}
        <Card className="lg:col-span-3 border border-border shadow-xs rounded-xl overflow-hidden bg-card">
          <CardHeader className="py-3 px-4 border-b border-border/80 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <CardTitle className="text-base font-semibold">1. قائمة الانتظار</CardTitle>
              </div>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25 font-bold px-2 py-0 text-xs">
                {waiting.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {loading ? (
              <div className="py-10 text-center text-muted-foreground text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                <span>جارٍ التحميل...</span>
              </div>
            ) : waiting.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/30" />
                <p className="text-xs font-medium">لا يوجد زبائن في الانتظار</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-0.5">
                {waiting.map((customer) => {
                  const estMin = parseEstimatedMinutes(customer);
                  return (
                    <div
                      key={customer.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, customer)}
                      onDragOver={(e) => handleDragOver(e, customer)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, customer)}
                      className={cn(
                        "p-3 border rounded-xl bg-card space-y-2.5 shadow-xs transition-all select-none",
                        dragOverItem?.id === customer.id
                          ? "border-primary ring-2 ring-primary/30 scale-[1.01] bg-primary/5 shadow-md"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      {/* Row 1: #Position + Customer Name + Est Time + Drag Handle + Action Buttons */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <GripVertical
                            className="h-4 w-4 text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing shrink-0 transition-colors"
                            title="اسحب لتبديل الدور لأعلى أو لأسفل"
                          />
                          <span className="inline-flex items-center justify-center h-6 min-w-[1.75rem] px-1.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-200 font-bold text-xs shrink-0">
                            #{customer.position}
                          </span>
                          <span className="font-bold text-foreground text-sm truncate">
                            {customer.name}
                          </span>
                          {estMin ? (
                            <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 font-medium">
                              {estMin} د
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
                            onClick={() => openEditDialog(customer)}
                            title="تعديل بيانات الزبون"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0"
                            onClick={() => handlePrintTicket(customer)}
                            title="طباعة إيصال الدور (80mm)"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => setDeleteTarget(customer)}
                            title="إزالة الزبون"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Row 2: Secondary info (Bags, Time, Phone) */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span className="font-semibold text-foreground/90">{customer.bags ?? 0} شوال</span>
                        <span>•</span>
                        <span>{formatTime(customer.created_at)}</span>
                        {customer.phone && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[11px]">{customer.phone}</span>
                          </>
                        )}
                      </div>

                      {/* Row 3: Action Button */}
                      <Button
                        size="sm"
                        onClick={() => startProcessing(customer.id)}
                        className="w-full h-8 rounded-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 transition-colors shadow-xs"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>بدء العصر</span>
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* العمود 2 (الوسط): 2. قيد العصر حالياً (40% - Visual Focal Point) */}
        <Card className="lg:col-span-4 border-2 border-primary/40 shadow-xs rounded-xl overflow-hidden bg-card">
          <CardHeader className="py-3 px-4 border-b border-border/80 bg-primary/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold text-foreground">
                  2. قيد العصر حالياً
                </CardTitle>
              </div>
              <Badge className="bg-primary text-primary-foreground font-bold px-2 py-0 text-xs">
                {processing.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3.5">
            {processing.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Play className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/30" />
                <p className="text-xs font-medium">لا يوجد زبون قيد العصر حالياً</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-0.5">
                {processing.map((p) => {
                  const remSec = getRemainingSeconds(p, nowMs);
                  const estMin = parseEstimatedMinutes(p) || 30;
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-primary/30 bg-card p-4 space-y-3.5 shadow-xs"
                    >
                      {/* Row 1: #Position + Customer Name + Bags + Trash Button */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="inline-flex items-center justify-center h-7 min-w-[2rem] px-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm shrink-0">
                            #{p.position}
                          </span>
                          <h3 className="text-base font-bold text-foreground truncate">
                            {p.name}
                          </h3>
                          <Badge variant="outline" className="text-xs font-semibold px-2 py-0 border-border text-muted-foreground shrink-0">
                            {p.bags ?? 0} شوال
                          </Badge>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => setDeleteTarget(p)}
                          title="إزالة الزبون"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        بدأ {formatTime(p.started_at || p.created_at)}
                      </p>

                      {/* Prominent Operational Timer */}
                      <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-muted/40 border border-border/50 text-center">
                        <span className="text-xs font-medium text-muted-foreground mb-1">
                          الوقت المتبقي
                        </span>
                        <span className="text-3xl md:text-4xl font-bold font-mono text-primary tracking-tight" dir="ltr">
                          {remSec !== null ? formatRemaining(remSec) : `${estMin}:00`}
                        </span>
                      </div>

                      {/* Time Extensions: +5 د, +10 د, +15 د */}
                      <div className="flex items-center justify-center gap-2">
                        {[5, 10, 15].map((extra) => (
                          <Button
                            key={extra}
                            size="sm"
                            type="button"
                            variant="outline"
                            className="h-7 px-3 text-xs font-medium rounded-lg border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                            onClick={() => addExtraMinutes(p.id, extra)}
                          >
                            +{extra} د
                          </Button>
                        ))}
                      </div>

                      {/* Main Action: إرجاع إلى الطابور + تم العصر */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-lg text-xs font-semibold border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 gap-1.5 transition-colors"
                          onClick={() => returnToQueue(p.id)}
                          title="إلغاء بدء العصر وإرجاع الزبون إلى قائمة الانتظار"
                        >
                          <Undo2 className="h-4 w-4" />
                          <span>إرجاع إلى الطابور</span>
                        </Button>
                        <Button
                          type="button"
                          className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs text-xs gap-1.5 transition-colors"
                          onClick={() => completeProcessing(p.id)}
                        >
                          <CheckCircle className="h-4 w-4" />
                          <span>تم العصر</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* العمود 3 (اليسار): 3. بانتظار الفاتورة (30%) */}
        <Card className="lg:col-span-3 border border-border shadow-xs rounded-xl overflow-hidden bg-card">
          <CardHeader className="py-3 px-4 border-b border-border/80 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <CardTitle className="text-base font-semibold">3. بانتظار الفاتورة</CardTitle>
              </div>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25 font-bold px-2 py-0 text-xs">
                {completed.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {completed.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/30" />
                <p className="text-xs font-medium">لا يوجد زبائن بانتظار الفاتورة</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-0.5">
                {completed.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 border border-border rounded-xl bg-card space-y-2.5 shadow-xs hover:border-emerald-500/40 transition-colors"
                  >
                    {/* Row 1: #Position + Name + Trash */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="inline-flex items-center justify-center h-6 min-w-[1.75rem] px-1.5 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 font-bold text-xs shrink-0">
                          #{c.position}
                        </span>
                        <span className="font-bold text-foreground text-sm truncate">
                          {c.name}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => setDeleteTarget(c)}
                        title="إزالة الزبون"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Row 2: Secondary info (Bags, Phone) */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="font-semibold text-foreground/90">{c.bags} شوال</span>
                      {c.phone && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-[11px]">{c.phone}</span>
                        </>
                      )}
                    </div>

                    {/* Row 3: Action Button */}
                    <Button
                      size="sm"
                      className="w-full h-8 rounded-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 transition-colors shadow-xs"
                      onClick={() => openInvoiceFor(c)}
                    >
                      <Calculator className="h-3.5 w-3.5" />
                      <span>حساب وفوترة</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Invoice Sheet */}
      <QuickInvoiceSheet
        open={invoiceSheetOpen}
        onOpenChange={setInvoiceSheetOpen}
        customer={selectedForInvoice}
        onCompleted={(invoicedQueueId?: string) => {
          const finishedId = invoicedQueueId || selectedForInvoice?.id;
          if (finishedId) {
            setAllItems((prev) => {
              const updated = prev.filter((item) => item.id !== finishedId);
              if (activeSeason) {
                try {
                  localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(updated));
                } catch {}
              }
              return updated;
            });
          }
          setSelectedForInvoice(null);
          fetchQueue();
        }}
      />

      {/* 5. Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="max-w-sm rounded-xl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-base font-semibold">تأكيد الإزالة</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              هل تريد إزالة هذا الزبون ({deleteTarget?.name}) من الطابور؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 mt-2">
            <AlertDialogCancel className="rounded-lg text-xs h-9">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-lg text-xs h-9 font-medium"
            >
              إزالة الزبون
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 5.5 Reorder Confirmation Dialog */}
      <AlertDialog open={!!reorderConfirm} onOpenChange={(o) => !o && setReorderConfirm(null)}>
        <AlertDialogContent dir="rtl" className="max-w-md rounded-2xl p-6">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <ArrowUpDown className="h-5 w-5 text-primary" />
              تأكيد تبديل الدور
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-foreground pt-2 space-y-3">
                <p className="text-foreground">
                  هل تود تبديل الأدوار في الطابور للزبون{" "}
                  <strong className="text-primary font-bold">"{reorderConfirm?.sourceCustomer.name}"</strong>؟
                </p>
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-1">
                  <div className="text-xs text-muted-foreground">الترتيب الجديد:</div>
                  <div className="font-extrabold text-xl text-primary tracking-wide">
                    سيصبح رقمه: #{reorderConfirm?.newPosition}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    (بدلاً من الدور #{reorderConfirm?.sourceCustomer.position})
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  سيتم تحديث ترتيب باقي الزبائن في قائمة الانتظار تلقائياً بناءً على هذا التبديل.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2.5 mt-4 pt-1">
            <AlertDialogCancel className="rounded-lg text-xs h-9 font-medium">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={applyReorder}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs h-9 font-bold px-4 shadow-sm"
            >
              تأكيد التبديل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 6. Edit Customer Dialog in Waiting Queue */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent dir="rtl" className="max-w-md rounded-xl p-5">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              تعديل بيانات الزبون {editingCustomer?.position ? `(دور #${editingCustomer.position})` : ""}
            </DialogTitle>
            <DialogDescription className="sr-only">
              تعديل بيانات الزبون في طابور الانتظار
            </DialogDescription>
          </DialogHeader>

          {editingCustomer && (
            <div className="space-y-3.5 mt-2">
              {/* اسم الزبون (إلزامي فقط) */}
              <div className="space-y-1">
                <Label htmlFor="edit-name" className="text-xs font-semibold">
                  اسم الزبون <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-name"
                  value={editingCustomer.name}
                  onChange={(e) => setEditingCustomer((p) => p ? { ...p, name: e.target.value } : null)}
                  className="h-10 rounded-lg text-sm"
                  autoFocus
                />
              </div>

              {/* عدد الشوالات (اختياري) */}
              <div className="space-y-1">
                <Label htmlFor="edit-bags" className="text-xs font-medium text-muted-foreground">
                  عدد الشوالات (اختياري)
                </Label>
                <Input
                  id="edit-bags"
                  type="number"
                  value={editingCustomer.bags}
                  onChange={(e) => setEditingCustomer((p) => p ? { ...p, bags: e.target.value } : null)}
                  min="0"
                  className="h-10 rounded-lg text-sm"
                />
              </div>

              {/* رقم التواصل (اختياري) */}
              <div className="space-y-1">
                <Label htmlFor="edit-phone" className="text-xs font-medium text-muted-foreground">
                  رقم التواصل (اختياري)
                </Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={editingCustomer.phone}
                  onChange={(e) => setEditingCustomer((p) => p ? { ...p, phone: e.target.value } : null)}
                  className="h-10 rounded-lg text-sm"
                />
              </div>

              {/* الوقت التقديري (اختياري) */}
              <div className="space-y-1">
                <Label htmlFor="edit-est" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  الوقت التقديري بالدقائق (اختياري)
                </Label>
                <Input
                  id="edit-est"
                  type="number"
                  value={editingCustomer.estimatedMinutes}
                  onChange={(e) => setEditingCustomer((p) => p ? { ...p, estimatedMinutes: e.target.value } : null)}
                  min="1"
                  className="h-10 rounded-lg text-sm"
                />
              </div>

              {/* ملاحظات (اختياري) */}
              <div className="space-y-1">
                <Label htmlFor="edit-notes" className="text-xs font-medium text-muted-foreground">
                  ملاحظات (اختياري)
                </Label>
                <Textarea
                  id="edit-notes"
                  value={editingCustomer.notes}
                  onChange={(e) => setEditingCustomer((p) => p ? { ...p, notes: e.target.value } : null)}
                  rows={2}
                  className="rounded-lg resize-none text-sm"
                />
              </div>

              {/* أزرار الحفظ والإلغاء */}
              <div className="grid grid-cols-2 gap-2.5 mt-4 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                  className="h-10 rounded-lg text-sm font-semibold border-border hover:bg-muted text-foreground"
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  onClick={saveEditCustomer}
                  className="h-10 rounded-lg text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                >
                  <CheckCircle className="h-4 w-4 me-1.5" />
                  حفظ التعديلات
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Queue;


