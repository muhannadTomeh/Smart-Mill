import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Clock, UserPlus, Trash2, CheckCircle, Monitor, Play, Receipt,
  ChevronDown, Calculator, Users,
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
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", bags: "", notes: "", estimatedMinutes: "" });
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
    // Ensure all positions are positive sequential numbers (> 0)
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
    if (!newCustomer.name || !newCustomer.bags) {
      toast.error("يرجى إدخال الاسم وعدد الشوالات");
      return;
    }

    const estMin = newCustomer.estimatedMinutes ? parseInt(newCustomer.estimatedMinutes) : null;
    const fallbackNotes = estMin 
      ? `[وقت_تقديري:${estMin}] ${newCustomer.notes?.trim() || ""}`.trim()
      : (newCustomer.notes?.trim() || null);

    // Compute next sequential position (guaranteed >= 1)
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

    // Try inserting with estimated_minutes column
    let { data: insertedData, error } = await supabase.from("queue").insert({
      ...basePayload,
      ...(estMin ? { estimated_minutes: estMin } : {}),
    }).select().single();

    // Fallback if estimated_minutes column is not yet migrated in Supabase
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
      setNewCustomer({ name: "", phone: "", bags: "", notes: "", estimatedMinutes: "" });
      setShowExtra(false);
      setDialogOpen(false);
      toast.success(`تم إضافة ${newCustomer.name} برقم دور #${nextPosition}`);
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
    else toast.success("تم الانتهاء من العصر — انتقل لقسم تم العصر بانتظار الفوترة");
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

    toast.success(`تمت إضافة ${extraMins} دقائق إضافية (الإجمالي: ${newEst} دقيقة)`);
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

  const updateCustomerEstimatedMinutes = async (id: string, mins: number) => {
    const target = allItems.find((i) => i.id === id);
    if (!target) return;

    localStorage.setItem(`queue_est_${id}`, String(mins));
    if (target.name) localStorage.setItem(`queue_est_name_${target.name.trim()}`, String(mins));

    const updatedNotes = `[وقت_تقديري:${mins}] ${(target.notes || "").replace(/\[(?:وقت_تقديري|الوقت|est):?[^\]]*\]/gi, "")}`.trim();

    setAllItems((prev) => {
      const updated = prev.map((i) => (i.id === id ? { ...i, estimated_minutes: mins, notes: updatedNotes } : i));
      if (activeSeason) {
        try {
          localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    let { error } = await supabase.from("queue").update({
      estimated_minutes: mins,
      notes: updatedNotes,
    } as any).eq("id", id);

    if (error) {
      await supabase.from("queue").update({ notes: updatedNotes }).eq("id", id);
    }
    toast.success(`تم تعيين الوقت التقديري لـ ${target.name}: ${mins} دقيقة`);
    await fetchQueue();
  };

  const startProcessing = async (id: string) => {
    const startedAt = new Date().toISOString();
    const target = allItems.find((i) => i.id === id);
    let estMin = target ? parseEstimatedMinutes(target) : null;
    if (!estMin || estMin <= 0) {
      estMin = 30; // default to 30 mins so countdown always runs
    }

    // Save locally for instant cross-tab sync
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

    // Save to database
    let { error } = await supabase.from("queue").update({
      status: "processing",
      started_at: startedAt,
      estimated_minutes: estMin,
      notes: updatedNotes,
    } as any).eq("id", id);

    // Fallback if started_at / estimated_minutes columns are not yet migrated in Supabase
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
    <div className="space-y-6" dir="rtl">
      {/* Top Header with Traffic Light Controller */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-card border shadow-sm">
        <div className="flex items-center gap-3">
          <Clock className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">إدارة الطابور والعصر</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {waiting.length} في الانتظار • {processing.length} قيد العصر • {completed.length} بانتظار الفوترة
            </p>
          </div>
        </div>

        {/* Action Buttons: Add Customer and Open Display */}
        <div className="flex items-center gap-2 flex-wrap">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="h-10 px-4">
                <UserPlus className="h-4 w-4 me-1.5" />
                إضافة زبون
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة زبون جديد للطابور</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label htmlFor="name">الاسم *</Label>
                  <Input
                    id="name"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                    placeholder="اسم الزبون"
                    autoFocus
                  />
                </div>
                <div>
                  <Label htmlFor="bags">عدد الشوالات *</Label>
                  <Input
                    id="bags"
                    type="number"
                    value={newCustomer.bags}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, bags: e.target.value }))}
                    placeholder="عدد الشوالات"
                    min="1"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label htmlFor="estimatedMinutes" className="font-bold flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-primary" />
                      الوقت التقديري للعصر (بالدقائق)
                    </Label>
                    <div className="flex gap-1">
                      {[15, 30, 45, 60].map((m) => (
                        <Button
                          key={m}
                          type="button"
                          size="sm"
                          variant={newCustomer.estimatedMinutes === String(m) ? "default" : "outline"}
                          className="h-6 px-2 text-xs"
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
                    placeholder="مثال: 30"
                    min="1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    يبدأ العداد التنازلي من هذا الوقت فور الضغط على بدء العصر
                  </p>
                </div>

                <Collapsible open={showExtra} onOpenChange={setShowExtra}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      تفاصيل إضافية (هاتف وملاحظات)
                      <ChevronDown className={`h-4 w-4 transition-transform ${showExtra ? "rotate-180" : ""}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <div>
                      <Label htmlFor="phone">رقم الهاتف</Label>
                      <Input
                        id="phone"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="اختياري"
                      />
                    </div>
                    <div>
                      <Label htmlFor="notes">ملاحظات</Label>
                      <Textarea
                        id="notes"
                        value={newCustomer.notes}
                        onChange={(e) => setNewCustomer((p) => ({ ...p, notes: e.target.value }))}
                        placeholder="ملاحظات إضافية"
                        rows={2}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Button onClick={addToQueue} className="w-full" size="lg">
                  <UserPlus className="h-4 w-4 me-2" />
                  إضافة إلى الطابور
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {activeSeason && (
            <Button variant="outline" asChild>
              <a
                href={`/display/${activeSeason.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center h-10 px-3.5"
              >
                <Monitor className="h-4 w-4 me-2" />
                شاشة العرض
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Three-column operations layout: RIGHT to LEFT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* العمود 1 (اليمين): 1. الطابور المنتظر */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-amber-500" />
              1. الطابور المنتظر
              {waiting.length > 0 && (
                <Badge variant="secondary" className="ms-auto font-bold">{waiting.length}</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">الزبائن بانتظار بدء العصر</CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            {loading ? (
              <p className="text-center py-8 text-muted-foreground text-sm">جارٍ التحميل...</p>
            ) : waiting.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">لا يوجد زبائن في الانتظار</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[550px] overflow-y-auto">
                {waiting.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center gap-2.5 p-2.5 border rounded-lg hover:bg-accent/40 transition-colors"
                  >
                    <Badge variant="outline" className="text-base font-bold shrink-0 min-w-[2.5rem] justify-center bg-background">
                      #{customer.position}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate text-sm">{customer.name}</h3>
                        {parseEstimatedMinutes(customer) ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-[11px] py-0 px-1.5">
                            <Clock className="h-2.5 w-2.5" />
                            {parseEstimatedMinutes(customer)} د
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        🛍️ {customer.bags} شوال • ⏰ {formatTime(customer.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => startProcessing(customer.id)}
                        className="h-8 px-2.5 font-bold"
                      >
                        <Play className="h-3.5 w-3.5 me-1" />
                        ابدأ
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(customer)}
                        title="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* العمود 2 (الوسط): 2. قيد العصر */}
        <Card className="border-primary/40 shadow-sm">
          <CardHeader className="pb-3 border-b bg-primary/5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="h-5 w-5 text-primary" />
              2. قيد العصر حالياً
              {processing.length > 0 && (
                <Badge variant="default" className="ms-auto font-bold">{processing.length}</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              العصر جاري الآن — اضغط زر "تم العصر" عند الانتهاء لنقله للفوترة
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            {processing.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Play className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">لا يوجد زبون قيد العصر حالياً</p>
                <p className="text-xs opacity-70 mt-1">اضغط "ابدأ" لأي زبون من قائمة الانتظار</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[550px] overflow-y-auto">
                {processing.map((p) => {
                  const remSec = getRemainingSeconds(p, nowMs);
                  const estMin = parseEstimatedMinutes(p) || 30;
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-primary/40 bg-primary/5 p-3.5 space-y-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <Badge className="bg-primary text-primary-foreground text-xl px-3 py-1 font-bold shrink-0">
                          #{p.position}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-foreground truncate text-base">{p.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            🛍️ {p.bags} شوال • ⏰ بدأ: {formatTime(p.started_at || p.created_at)}
                          </p>
                        </div>
                      </div>

                      {/* عداد الوقت التنازلي المتبقي */}
                      <div className="flex items-center justify-between bg-card/80 border p-2 rounded-lg gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                          <Clock className="h-4 w-4 text-amber-500" />
                          <span>الوقت التقديري المتبقي :</span>
                        </div>
                        <span className="font-mono text-base font-black text-primary px-2 py-0.5 rounded bg-primary/10" dir="ltr">
                          {remSec !== null ? formatRemaining(remSec) : `${estMin}:00`}
                        </span>
                      </div>

                      {/* أزرار الوقت الإضافي إذا تأخر */}
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/50">
                        <span className="text-[11px] font-bold text-muted-foreground">وقت إضافي:</span>
                        <div className="flex items-center gap-1">
                          {[5, 10, 15].map((extra) => (
                            <Button
                              key={extra}
                              size="sm"
                              type="button"
                              variant="outline"
                              className="h-6 px-2 text-[11px] font-bold border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                              onClick={() => addExtraMinutes(p.id, extra)}
                            >
                              +{extra} د
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* زر "تم العصر" البارز لنقله لقسم تم بانتظار الفوترة */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9"
                          onClick={() => completeProcessing(p.id)}
                        >
                          <CheckCircle className="h-4 w-4 me-1.5" />
                          تم العصر
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(p)}
                          title="حذف"
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
        <Card className="border-emerald-500/30 shadow-sm">
          <CardHeader className="pb-3 border-b bg-emerald-500/5">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              3. تم العصر / بانتظار الفوترة
              {completed.length > 0 && (
                <Badge variant="outline" className="ms-auto text-emerald-600 border-emerald-500/30 font-bold">{completed.length}</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              انتهى العصر — اضغط "حساب وفاتورة" بعد تجميع الزيت لإنهاء المعاملة
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            {completed.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30 text-emerald-600" />
                <p className="text-sm">لا يوجد زبائن بانتظار الفاتورة</p>
                <p className="text-xs opacity-70 mt-1">عند الضغط على "تم العصر" سيظهر الزبون هنا</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[550px] overflow-y-auto">
                {completed.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 border border-emerald-500/20 bg-emerald-500/5 rounded-xl space-y-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <Badge variant="outline" className="text-base font-bold shrink-0 min-w-[2.5rem] justify-center bg-background border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                        #{c.position}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-foreground truncate text-sm">{c.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          🛍️ {c.bags} شوال {c.phone && `• 📞 ${c.phone}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                      <Button
                        size="sm"
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-8 text-xs"
                        onClick={() => openInvoiceFor(c)}
                      >
                        <Calculator className="h-3.5 w-3.5 me-1" />
                        حساب وفوترة
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(c)}
                        title="حذف"
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

      {/* Invoice Sheet */}
      <QuickInvoiceSheet
        open={invoiceSheetOpen}
        onOpenChange={setInvoiceSheetOpen}
        customer={selectedForInvoice}
        onCompleted={() => {
          setSelectedForInvoice(null);
          fetchQueue();
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف <strong>{deleteTarget?.name}</strong> من الطابور؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Queue;
