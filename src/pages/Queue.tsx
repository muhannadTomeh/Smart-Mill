import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Clock, UserPlus, Trash2, CheckCircle, Monitor, Play,
  ChevronDown, Calculator, Users, Package, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { QuickInvoiceSheet } from "@/components/queue/QuickInvoiceSheet";

interface QueueItem {
  id: string;
  name: string;
  phone: string | null;
  bags: number;
  notes: string | null;
  position: number;
  created_at: string;
  status: string;
  estimated_minutes?: number | null;
  started_at?: string | null;
}

export function parseEstimatedMinutes(item: { estimated_minutes?: number | null; notes?: string | null; id?: string }): number | null {
  if (item.estimated_minutes != null && !isNaN(Number(item.estimated_minutes))) {
    return Number(item.estimated_minutes);
  }
  if (item.notes) {
    const match = item.notes.match(/\[(?:وقت_تقديري|الوقت|est):?\s*(\d+)/i);
    if (match) return parseInt(match[1]);
  }
  if (item.id) {
    const local = localStorage.getItem(`queue_est_${item.id}`);
    if (local) {
      const n = parseInt(local, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

export function parseStartedAt(item: { started_at?: string | null; notes?: string | null; id?: string }): number | null {
  if (item.started_at) {
    const t = new Date(item.started_at).getTime();
    if (!isNaN(t)) return t;
  }
  if (item.notes) {
    const match = item.notes.match(/\[بدء_العصر:([^\]]+)\]/);
    if (match) {
      const t = new Date(match[1]).getTime();
      if (!isNaN(t)) return t;
      const num = Number(match[1]);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  if (item.id) {
    const local = localStorage.getItem(`processing_started_${item.id}`);
    if (local) {
      const t = new Date(local).getTime();
      if (!isNaN(t)) return t;
    }
  }
  return null;
}

export function getRemainingSeconds(item: QueueItem, nowMs: number): number | null {
  const estMin = parseEstimatedMinutes(item);
  if (!estMin || estMin <= 0) return null;
  let startedAt = parseStartedAt(item);
  if (!startedAt && item.id) {
    if (item.status === "processing") {
      startedAt = Date.now();
      localStorage.setItem(`processing_started_${item.id}`, new Date(startedAt).toISOString());
    }
  }
  if (!startedAt) return null;
  const elapsed = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  return Math.max(0, estMin * 60 - elapsed);
}

export function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: false });
};

const Queue = () => {
  const [allItems, setAllItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", bags: "", notes: "", estimatedMinutes: "30" });
  const [showExtra, setShowExtra] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invoiceSheetOpen, setInvoiceSheetOpen] = useState(false);
  const [selectedForInvoice, setSelectedForInvoice] = useState<QueueItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QueueItem | null>(null);
  const { user, effectiveUserId } = useAuth();
  const { activeSeason } = useSeason();

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
    let curSeq = 1;
    const items = raw.map((item) => {
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

  const addToQueue = async () => {
    if (!newCustomer.name.trim() || !newCustomer.bags) {
      toast.error("يرجى إدخال الاسم وعدد الشوالات");
      return;
    }

    const estMin = newCustomer.estimatedMinutes ? parseInt(newCustomer.estimatedMinutes) : 30;
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
      bags: parseInt(newCustomer.bags),
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
      if (newCustomer.name) {
        localStorage.setItem(`queue_est_name_${newCustomer.name.trim()}`, String(estMin || 30));
      }
      setNewCustomer({ name: "", phone: "", bags: "", notes: "", estimatedMinutes: "30" });
      setShowExtra(false);
      setDialogOpen(false);
      toast.success(`تمت إضافة الزبون "${newCustomer.name.trim()}" برقم دور #${nextPosition}`);
      await fetchQueue();
    } else {
      toast.error("تعذر إضافة الزبون: " + error.message);
    }
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
    setAllItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    await supabase.from("queue").delete().eq("id", deleteTarget.id);
    toast.success("تم حذف الزبون من الطابور");
    setDeleteTarget(null);
    await fetchQueue();
  };

  const startProcessing = async (id: string) => {
    const startedAt = new Date().toISOString();
    const target = allItems.find((i) => i.id === id);
    let estMin = target ? parseEstimatedMinutes(target) : null;
    if (!estMin || estMin <= 0) {
      estMin = 30;
    }

    localStorage.setItem(`processing_started_${id}`, startedAt);
    localStorage.setItem(`queue_est_${id}`, String(estMin));
    if (target?.name) {
      localStorage.setItem(`queue_est_name_${target.name.trim()}`, String(estMin));
    }

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

  const openInvoiceFor = (customer: QueueItem) => {
    setSelectedForInvoice(customer);
    setInvoiceSheetOpen(true);
  };

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header Container with Centered Action Button */}
      <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-b from-card via-card to-card/70 p-6 md:p-8 shadow-sm">
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />

        {/* Top bar: Title & Screen Link */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-inner">
              <Clock className="h-6 w-6" />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
              إدارة الطابور والعصر
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchQueue}
              className="h-10 px-3 rounded-xl border-border/70 hover:bg-accent gap-1.5 text-xs font-semibold text-muted-foreground"
              title="تحديث البيانات"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              تحديث
            </Button>

            {activeSeason && (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="h-10 px-4 rounded-xl border-primary/25 hover:border-primary/50 hover:bg-primary/5 transition-all text-xs font-bold gap-2 text-foreground"
              >
                <a
                  href={`/display/${activeSeason.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Monitor className="h-4 w-4 text-primary" />
                  شاشة العرض
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* PROMINENT CENTERED ACTION: إضافة زبون في النصف تماماً */}
        <div className="relative z-10 mt-6 flex justify-center">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="lg"
                className="h-14 px-8 md:px-12 rounded-2xl text-base md:text-lg font-black bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 gap-3 group border border-primary/30"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 group-hover:scale-110 transition-transform">
                  <UserPlus className="h-5 w-5 text-white" />
                </div>
                <span>إضافة زبون جديد للطابور</span>
              </Button>
            </DialogTrigger>

            <DialogContent dir="rtl" className="max-w-md rounded-3xl p-6">
              <DialogHeader className="text-right">
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-primary" />
                  تسجيل زبون جديد في الطابور
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-3">
                {/* اسم الزبون */}
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-semibold">اسم الزبون *</Label>
                  <Input
                    id="name"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                    className="h-11 rounded-xl text-base"
                    autoFocus
                  />
                </div>

                {/* رقم التواصل (إختياري) */}
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-sm font-semibold">رقم التواصل (إختياري)</Label>
                  <Input
                    id="phone"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                    className="h-11 rounded-xl text-base"
                  />
                </div>

                {/* عدد الشوالات */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bags" className="text-sm font-semibold">عدد الشوالات *</Label>
                    <div className="flex gap-1">
                      {[10, 20, 30, 50].map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setNewCustomer((p) => ({ ...p, bags: String(b) }))}
                          className="text-[11px] px-2 py-0.5 rounded-lg border border-border/80 bg-muted/50 hover:bg-muted text-muted-foreground font-medium transition-colors"
                        >
                          +{b}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Input
                    id="bags"
                    type="number"
                    value={newCustomer.bags}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, bags: e.target.value }))}
                    min="1"
                    className="h-11 rounded-xl text-base"
                  />
                </div>

                {/* طي: الوقت التقديري (افتراضي نص ساعة) + ملاحظات */}
                <Collapsible open={showExtra} onOpenChange={setShowExtra}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between rounded-xl text-muted-foreground hover:text-foreground">
                      <span className="text-xs font-semibold">خيارات إضافية (الوقت التقديري، ملاحظات)</span>
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showExtra ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="estimatedMinutes" className="text-sm font-semibold flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-primary" />
                          الوقت التقديري (بالدقائق)
                        </Label>
                        <div className="flex gap-1">
                          {[15, 30, 45, 60].map((m) => (
                            <Button
                              key={m}
                              type="button"
                              size="sm"
                              variant={newCustomer.estimatedMinutes === String(m) ? "default" : "outline"}
                              className="h-6 px-2 text-xs rounded-lg"
                              onClick={() => setNewCustomer((p) => ({ ...p, estimatedMinutes: String(m) }))}
                            >
                              {m} د
                            </Button>
                          ))}
                        </div>
                      </div>
                      <Input
                        id="estimatedMinutes"
                        type="number"
                        value={newCustomer.estimatedMinutes}
                        onChange={(e) => setNewCustomer((p) => ({ ...p, estimatedMinutes: e.target.value }))}
                        min="1"
                        className="h-11 rounded-xl"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="notes" className="text-xs font-semibold">ملاحظات</Label>
                      <Textarea
                        id="notes"
                        value={newCustomer.notes}
                        onChange={(e) => setNewCustomer((p) => ({ ...p, notes: e.target.value }))}
                        rows={2}
                        className="rounded-xl resize-none"
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Button
                  onClick={addToQueue}
                  className="w-full h-12 rounded-xl text-base font-bold shadow-md shadow-primary/20"
                >
                  <UserPlus className="h-5 w-5 me-2" />
                  حفظ وإصدار رقم الدور
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Operations Columns: 3 Columns from Right to Left */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* العمود 1 (اليمين): 1. قائمة الانتظار */}
        <Card className="border-border/80 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-bold">1. قائمة الانتظار</CardTitle>
              </div>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 font-extrabold px-2 py-0.5">
                {waiting.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 p-3.5">
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                <span>جارٍ التحميل...</span>
              </div>
            ) : waiting.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground px-4">
                <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3 text-muted-foreground/60">
                  <Users className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">لا يوجد زبائن بالانتظار</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
                {waiting.map((customer) => {
                  const estMin = parseEstimatedMinutes(customer);
                  return (
                    <div
                      key={customer.id}
                      className="group relative flex items-center gap-3 p-3 border border-border/70 rounded-2xl bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200"
                    >
                      {/* Position Badge */}
                      <div className="flex flex-col items-center justify-center w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 shrink-0 font-black">
                        <span className="text-[10px] leading-none opacity-60">دور</span>
                        <span className="text-base leading-tight">#{customer.position}</span>
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-foreground truncate text-sm">
                            {customer.name}
                          </h3>
                          {estMin ? (
                            <Badge variant="outline" className="bg-muted/80 text-muted-foreground border-border text-[10px] py-0 px-1.5 gap-1 font-semibold">
                              <Clock className="h-2.5 w-2.5 text-primary" />
                              {estMin} د
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1 font-medium">
                            <Package className="h-3 w-3 text-amber-500" />
                            {customer.bags} شوال
                          </span>
                          <span>•</span>
                          <span>{formatTime(customer.created_at)}</span>
                          {customer.phone && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[11px] truncate">{customer.phone}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => startProcessing(customer.id)}
                          className="h-9 px-3 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20 gap-1.5 text-xs"
                        >
                          <Play className="h-3.5 w-3.5" />
                          بدء العصر
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(customer)}
                          title="حذف"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* العمود 2 (الوسط): 2. قيد العصر */}
        <Card className="border-primary/40 shadow-sm rounded-2xl overflow-hidden bg-gradient-to-b from-primary/[0.03] to-transparent">
          <CardHeader className="pb-3 border-b bg-primary/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                  <Play className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-bold">2. قيد العصر حالياً</CardTitle>
              </div>
              <Badge className="bg-primary text-primary-foreground font-extrabold px-2 py-0.5">
                {processing.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 p-3.5">
            {processing.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground px-4">
                <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3 text-muted-foreground/60">
                  <Play className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">لا يوجد زبون قيد العصر</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
                {processing.map((p) => {
                  const remSec = getRemainingSeconds(p, nowMs);
                  const estMin = parseEstimatedMinutes(p) || 30;
                  return (
                    <div
                      key={p.id}
                      className="rounded-2xl border-2 border-primary/40 bg-card p-4 space-y-3 shadow-md relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-primary via-emerald-400 to-primary" />

                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground font-black shadow-md shadow-primary/25 shrink-0">
                          <span className="text-[10px] leading-none opacity-80">دور</span>
                          <span className="text-lg leading-tight">#{p.position}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-extrabold text-foreground truncate text-base">{p.name}</h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1 font-medium">
                              <Package className="h-3 w-3 text-primary" />
                              {p.bags} شوال
                            </span>
                            <span>•</span>
                            <span>بدأ {formatTime(p.started_at || p.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Digital Timer Countdown */}
                      <div className="flex items-center justify-between bg-primary/5 border border-primary/20 p-2.5 rounded-xl">
                        <div className="flex items-center gap-2">
                          <div className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                          </div>
                          <span className="text-xs font-bold text-foreground">الوقت المتبقي:</span>
                        </div>
                        <span className="font-mono text-xl font-black text-primary tracking-wider" dir="ltr">
                          {remSec !== null ? formatRemaining(remSec) : `${estMin}:00`}
                        </span>
                      </div>

                      {/* Quick Extra Minutes Buttons */}
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/60">
                        <span className="text-[11px] font-semibold text-muted-foreground">تمديد وقت:</span>
                        <div className="flex items-center gap-1.5">
                          {[5, 10, 15].map((extra) => (
                            <Button
                              key={extra}
                              size="sm"
                              type="button"
                              variant="outline"
                              className="h-6 px-2 text-[11px] font-bold rounded-lg border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                              onClick={() => addExtraMinutes(p.id, extra)}
                            >
                              +{extra} د
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Main Finish Button */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 rounded-xl shadow-md shadow-emerald-600/20 text-xs md:text-sm"
                          onClick={() => completeProcessing(p.id)}
                        >
                          <CheckCircle className="h-4 w-4 me-1.5" />
                          تم العصر (جاهز للفوترة)
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(p)}
                          title="إلغاء وحذف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* العمود 3 (اليسار): 3. تم العصر / بانتظار الفوترة */}
        <Card className="border-emerald-500/40 shadow-sm rounded-2xl overflow-hidden bg-gradient-to-b from-emerald-500/[0.03] to-transparent">
          <CardHeader className="pb-3 border-b bg-emerald-500/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4" />
                </div>
                <CardTitle className="text-base font-bold">3. بانتظار الفوترة</CardTitle>
              </div>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-extrabold px-2 py-0.5">
                {completed.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 p-3.5">
            {completed.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground px-4">
                <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3 text-muted-foreground/60">
                  <CheckCircle className="h-6 w-6 text-emerald-600/50" />
                </div>
                <p className="text-sm font-semibold text-foreground">لا يوجد زبائن بانتظار الفاتورة</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
                {completed.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 border border-emerald-500/30 bg-card rounded-2xl space-y-2.5 shadow-sm hover:border-emerald-500/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center justify-center w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 font-black shrink-0">
                        <span className="text-[10px] leading-none opacity-60">دور</span>
                        <span className="text-base leading-tight">#{c.position}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-foreground truncate text-sm">{c.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          🛍️ {c.bags} شوال {c.phone && `• 📞 ${c.phone}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                      <Button
                        size="sm"
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-9 rounded-xl text-xs shadow-sm shadow-primary/20 gap-1.5"
                        onClick={() => openInvoiceFor(c)}
                      >
                        <Calculator className="h-4 w-4" />
                        حساب وفوترة الزبون
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(c)}
                        title="حذف من السجل"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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
        onCompleted={() => {
          setSelectedForInvoice(null);
          fetchQueue();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">تأكيد حذف الزبون</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من حذف الزبون <strong>{deleteTarget?.name}</strong> من الطابور؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90 rounded-xl">
              تأكيد الحذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Queue;

