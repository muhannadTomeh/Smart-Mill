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
  ChevronDown, Calculator,
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
      .order("position", { ascending: true });
    const items = (data as QueueItem[]) || [];
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

    const basePayload: any = {
      user_id: targetUserId!,
      season_id: activeSeason!.id,
      name: newCustomer.name.trim(),
      phone: newCustomer.phone?.trim() || null,
      bags: parseInt(newCustomer.bags),
      notes: fallbackNotes,
      status: "waiting",
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
      setNewCustomer({ name: "", phone: "", bags: "", notes: "", estimatedMinutes: "" });
      setShowExtra(false);
      setDialogOpen(false);
      toast.success(`تم إضافة ${newCustomer.name} إلى الطابور`);
      await fetchQueue();
    } else {
      toast.error("تعذر إضافة الزبون: " + error.message);
    }
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
    setAllItems((prev) => {
      const updated = prev.map((i) => (i.id === id ? { ...i, status: "processing", started_at: startedAt } : i));
      if (activeSeason) {
        try {
          localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    // Save locally for instant cross-tab sync
    localStorage.setItem(`processing_started_${id}`, startedAt);

    // Save to database
    let { error } = await supabase.from("queue").update({
      status: "processing",
      started_at: startedAt,
    } as any).eq("id", id);

    // Fallback if started_at column is not yet migrated in Supabase
    if (error && (error.message?.includes("started_at") || error.code === "PGRST204")) {
      const target = allItems.find((i) => i.id === id);
      const updatedNotes = `[بدء_العصر:${startedAt}] ${target?.notes || ""}`.trim();
      const retry = await supabase.from("queue").update({
        status: "processing",
        notes: updatedNotes,
      }).eq("id", id);
      error = retry.error;
    }

    if (error) toast.error("تعذر بدء العصر: " + error.message);
    else toast.success("تم بدء العصر وبدء التوقيت التنازلي");
    await fetchQueue();
  };

  const openInvoiceFor = (customer: QueueItem) => {
    setSelectedForInvoice(customer);
    setInvoiceSheetOpen(true);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Clock className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-foreground">إدارة الطابور</h1>
            <p className="text-sm text-muted-foreground">
              {processing.length} قيد العصر • {waiting.length} منتظر • {completed.length} منجز
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg">
                <UserPlus className="h-5 w-5 me-2" />
                إضافة زبون
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>إضافة زبون جديد</DialogTitle>
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

                <Collapsible open={showExtra} onOpenChange={setShowExtra}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between">
                      تفاصيل إضافية
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
                      <Label htmlFor="estimatedMinutes">الوقت التقديري (دقائق)</Label>
                      <Input
                        id="estimatedMinutes"
                        type="number"
                        value={newCustomer.estimatedMinutes}
                        onChange={(e) => setNewCustomer((p) => ({ ...p, estimatedMinutes: e.target.value }))}
                        placeholder="اختياري"
                        min="1"
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
                className="inline-flex items-center"
              >
                <Monitor className="h-4 w-4 me-2" />
                شاشة العرض
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Two-column operations layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* RIGHT (first in RTL): Currently Processing (multiple allowed) */}
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" />
              قيد العصر
              {processing.length > 0 && (
                <Badge variant="secondary" className="ms-auto">{processing.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {processing.length > 0
                ? "اضغط حساب وفاتورة عند انتهاء العصر"
                : "ابدأ زبون من الطابور المنتظر"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {processing.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
                  <Play className="h-7 w-7 opacity-50" />
                </div>
                <p className="text-sm">لا يوجد زبون قيد العصر حالياً</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {processing.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <Badge className="bg-primary text-primary-foreground text-xl px-3 py-1.5 font-bold shrink-0">
                        #{p.position}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-foreground truncate text-lg">{p.name}</h3>
                          {(() => {
                            const remSec = getRemainingSeconds(p, nowMs);
                            const estMin = parseEstimatedMinutes(p);
                            if (remSec !== null) {
                              const isNear = remSec <= 5 * 60;
                              return (
                                <Badge
                                  variant="outline"
                                  className={`gap-1 text-xs font-mono font-bold transition-all ${
                                    isNear
                                      ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 animate-pulse"
                                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                  }`}
                                >
                                  <Clock className="h-3 w-3" />
                                  {remSec > 0 ? `متبقي: ${formatRemaining(remSec)}` : "أوشك على الانتهاء"}
                                  {isNear && (
                                    <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.2 rounded ms-1">
                                      استعد
                                    </span>
                                  )}
                                </Badge>
                              );
                            }
                            if (estMin) {
                              return (
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-xs">
                                  <Clock className="h-3 w-3" />
                                  {estMin} دقيقة
                                </Badge>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          🛍️ {p.bags} شوال • ⏰ {formatTime(p.created_at)}
                          {p.phone && ` • ${p.phone}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => openInvoiceFor(p)}
                      >
                        <Calculator className="h-4 w-4 me-1.5" />
                        حساب وفاتورة
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* LEFT: Waiting queue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              الطابور المنتظر
              {waiting.length > 0 && (
                <Badge variant="secondary" className="ms-auto">{waiting.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>اضغط ابدأ لأي زبون لبدء العصر</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground text-sm">جارٍ التحميل...</p>
            ) : waiting.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">لا يوجد زبائن في الطابور</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {waiting.map((customer, idx) => {
                  const isFirst = idx === 0;
                  const isAnyProcessingNear = processing.some((p) => {
                    const s = getRemainingSeconds(p, nowMs);
                    return s !== null && s <= 5 * 60;
                  });

                  return (
                  <div
                    key={customer.id}
                    className={`flex items-center gap-2 p-2.5 border rounded-lg transition-colors ${
                      isFirst && isAnyProcessingNear
                        ? "bg-emerald-500/10 border-emerald-500/40 shadow-sm"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <Badge
                      variant="outline"
                      className="text-base font-bold shrink-0 min-w-[2.5rem] justify-center"
                    >
                      #{customer.position}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate text-sm">{customer.name}</h3>
                        {parseEstimatedMinutes(customer) ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-[11px] py-0 px-1.5">
                            <Clock className="h-2.5 w-2.5" />
                            {parseEstimatedMinutes(customer)} د
                          </Badge>
                        ) : null}

                        {isFirst && isAnyProcessingNear && (
                          <Badge className="bg-emerald-500 text-white animate-bounce text-[10px] py-0.5 px-2">
                            🟢 استعد للدخول!
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        🛍️ {customer.bags} • {formatTime(customer.created_at)}
                        {customer.phone && ` • ${customer.phone}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => startProcessing(customer.id)}
                        className="h-8"
                      >
                        <Play className="h-3.5 w-3.5 me-1" />
                        ابدأ
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => openInvoiceFor(customer)}
                        title="فاتورة سريعة"
                      >
                        <Receipt className="h-4 w-4" />
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
                );
              })}
            </div>
          )}
          </CardContent>
        </Card>
      </div>

      {/* Completed (compact) */}
      {completed.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              منجز ({completed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {completed.map((c) => (
                <Badge key={c.id} variant="outline" className="text-sm py-1 px-3 line-through opacity-70">
                  #{c.position} {c.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
