import { useEffect, useMemo, useState } from "react";
import { calculatePaymentOptions, calculateCustomMixedFromOil, calculateCustomMixedFromCash } from "@/lib/invoiceCalculations";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Droplets, Package, Wallet, CheckCircle2, Plus, Minus, Eye, Printer, SlidersHorizontal, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useSettings } from "@/hooks/useSettings";
import { useInventory } from "@/hooks/useInventory";
import { InvoicePreview } from "@/components/invoices/InvoicePreview";
import { printThermalReceipt } from "@/lib/thermalReceiptPrinter";

interface ContainerType {
  id: string;
  name: string;
  price: number;
}

interface QuickInvoiceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string; phone: string | null } | null;
  onCompleted: (invoicedQueueId?: string) => void;
}

type PaymentType = "oil" | "cash" | "mixed";

export function QuickInvoiceSheet({ open, onOpenChange, customer, onCompleted }: QuickInvoiceSheetProps) {
  const { user, effectiveUserId, profile } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { activeSeason } = useSeason();
  const { settings } = useSettings();
  const { refetch: refetchInventory } = useInventory();

  const [oilProduced, setOilProduced] = useState<number>(0);
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [containerCounts, setContainerCounts] = useState<Record<string, number>>({});
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [customMixedOil, setCustomMixedOil] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (open && targetUserId && activeSeason) {
      fetchContainerTypes();
      // reset
      setOilProduced(0);
      setContainerCounts({});
      setPaymentType(null);
      setCustomMixedOil(null);
    }
  }, [open, targetUserId, activeSeason]);

  const fetchContainerTypes = async () => {
    if (!targetUserId || !activeSeason) return;
    const { data } = await supabase
      .from("container_types")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: true });
    const types = (data as ContainerType[]) || [];
    setContainerTypes(types);
    const counts: Record<string, number> = {};
    types.forEach((t) => (counts[t.id] = 0));
    setContainerCounts(counts);
  };

  const totalContainerCost = useMemo(() => {
    return containerTypes.reduce((sum, ct) => sum + (containerCounts[ct.id] || 0) * ct.price, 0);
  }, [containerTypes, containerCounts]);

  const totalContainerCount = useMemo(
    () => Object.values(containerCounts).reduce((s, v) => s + v, 0),
    [containerCounts]
  );

  const containerSummary = useMemo(() => {
    return containerTypes
      .filter((ct) => (containerCounts[ct.id] || 0) > 0)
      .map((ct) => `${containerCounts[ct.id]} ${ct.name}`)
      .join(" + ") || "بدون تنكات";
  }, [containerTypes, containerCounts]);

  const calc = useMemo(() => {
    if (!oilProduced) return null;
    const opts = calculatePaymentOptions(oilProduced, totalContainerCost, settings);

    let mixedBreakdown = opts.mixed;
    if (customMixedOil !== null) {
      mixedBreakdown = calculateCustomMixedFromOil(oilProduced, totalContainerCost, settings, customMixedOil);
    }

    return {
      oilOnly: { ...opts.oil, label: `${opts.oil.oilAmount.toFixed(2)} كغم زيت` },
      cashOnly: { ...opts.cash, label: `${opts.cash.cashAmount.toFixed(2)} ₪` },
      mixed: { ...mixedBreakdown, label: `${mixedBreakdown.oilAmount.toFixed(2)} كغم + ${mixedBreakdown.cashAmount.toFixed(2)} ₪` },
      defaultMixed: opts.mixed,
    };
  }, [oilProduced, totalContainerCost, settings, customMixedOil]);

  const adjustContainer = (id: string, delta: number) => {
    setContainerCounts((p) => ({ ...p, [id]: Math.max(0, (p[id] || 0) + delta) }));
  };

  const addOil = (delta: number) => setOilProduced((v) => Math.max(0, +(v + delta).toFixed(2)));

  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";

  const handleConfirm = async (shouldPrint = false) => {
    if (!customer || !paymentType || !calc) return;
    if (oilProduced <= 0) {
      toast.error("يرجى إدخال كمية الزيت");
      return;
    }
    setSaving(true);

    const selected = paymentType === "oil" ? calc.oilOnly : paymentType === "cash" ? calc.cashOnly : calc.mixed;

    // Ensure customer record (Keep distinct per queue customer)
    let customerId: string | null = null;
    if (customer.id) {
      customerId = localStorage.getItem(`queue_cust_${customer.id}`);
    }
    if (!customerId && customer.notes) {
      const match = customer.notes.match(/\[cust_id:([^\]]+)\]/);
      if (match) customerId = match[1];
    }

    if (!customerId) {
      const cleanPhone = customer.phone?.trim();
      let existingCust: any = null;
      // Match existing customer ONLY if a valid phone number is provided and matches
      if (cleanPhone && cleanPhone.length >= 7) {
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("user_id", targetUserId!)
          .eq("season_id", activeSeason!.id)
          .eq("name", customer.name.trim())
          .eq("phone", cleanPhone)
          .maybeSingle();
        existingCust = data;
      }

      if (existingCust) {
        customerId = existingCust.id;
      } else {
        // Always create a new distinct customer record
        const { data: newCust } = await supabase
          .from("customers")
          .insert({
            user_id: targetUserId!,
            season_id: activeSeason!.id,
            name: customer.name.trim(),
            phone: cleanPhone || null,
          })
          .select("id")
          .single();
        if (newCust) customerId = newCust.id;
      }
    }

    const { error } = await supabase.rpc("create_invoice_and_settle", {
      p_season_id: activeSeason!.id,
      p_customer_id: customerId,
      p_customer_name: customer.name,
      p_oil_produced: oilProduced,
      p_container_count: totalContainerCount,
      p_container_type: containerSummary,
      p_payment_type: paymentType,
      p_oil_amount: selected.oilAmount,
      p_cash_amount: selected.cashAmount,
      p_total_display: selected.label,
      p_queue_id: customer.id,
    });

    if (error) {
      console.error("create_invoice_and_settle error", error);
      toast.error(error.message || "حدث خطأ أثناء حفظ الفاتورة");
      setSaving(false);
      return;
    }

    refetchInventory();

    // Explicitly update the queue item status to 'done' in Supabase
    if (customer?.id) {
      const { error: queueUpdateErr } = await supabase
        .from("queue")
        .update({ status: "done" })
        .eq("id", customer.id);

      if (queueUpdateErr) {
        console.warn("Could not update queue status to done, attempting delete:", queueUpdateErr);
        await supabase.from("queue").delete().eq("id", customer.id);
      }

      // Update cached active_queue in localStorage
      if (activeSeason) {
        try {
          const cached = localStorage.getItem(`active_queue_${activeSeason.id}`);
          if (cached) {
            const list = JSON.parse(cached);
            if (Array.isArray(list)) {
              const filtered = list.filter((item: any) => item.id !== customer.id);
              localStorage.setItem(`active_queue_${activeSeason.id}`, JSON.stringify(filtered));
            }
          }
        } catch {}
      }
    }

    if (shouldPrint) {
      printThermalReceipt({
        customer_name: customer.name,
        customer_phone: customer.phone,
        oil_produced: oilProduced,
        container_count: totalContainerCount,
        container_type: containerSummary,
        payment_type: paymentType,
        oil_amount: selected.oilAmount,
        cash_amount: selected.cashAmount,
        total_display: selected.label,
        season_name: activeSeason?.name,
      }, millName);
    }

    toast.success(shouldPrint ? "تم حفظ الفاتورة وإرسال أمر الطباعة" : "تم تأكيد الفاتورة بنجاح", {
      description: selected.label,
    });

    const invoicedId = customer.id;
    setSaving(false);
    onOpenChange(false);
    onCompleted(invoicedId);
  };

  const paymentCards: { type: PaymentType; icon: any; title: string; color: string; bg: string; ring: string }[] = [
    { type: "oil", icon: Droplets, title: "زيت فقط", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", ring: "ring-emerald-500" },
    { type: "cash", icon: Wallet, title: "نقدي فقط", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", ring: "ring-blue-500" },
    { type: "mixed", icon: Package, title: "مختلط", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", ring: "ring-amber-500" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto p-0" dir="rtl">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <SheetHeader className="text-right">
            <SheetTitle className="text-2xl flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-primary" />
              حساب فاتورة — {customer?.name}
            </SheetTitle>
            <SheetDescription>أدخل البيانات بسرعة وأكمل الدور</SheetDescription>
          </SheetHeader>

          {/* Step 1: Oil */}
          <div className="space-y-3 rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">1</span>
              <Label className="text-lg font-semibold">كمية الزيت المنتج (كغم)</Label>
            </div>
            <Input
              type="number"
              value={oilProduced || ""}
              onChange={(e) => setOilProduced(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="text-3xl h-16 text-center font-bold"
              min="0"
              step="0.1"
            />
            <div className="flex gap-2 justify-center">
              {[1, 5, 10].map((n) => (
                <Button key={n} variant="secondary" size="sm" onClick={() => addOil(n)} className="flex-1">
                  +{n}
                </Button>
              ))}
              <Button variant="outline" size="sm" onClick={() => setOilProduced(0)}>تصفير</Button>
            </div>
          </div>

          {/* Step 2: Containers */}
          <div className="space-y-3 rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">2</span>
              <Label className="text-lg font-semibold">التنكات</Label>
              {totalContainerCost > 0 && (
                <Badge variant="secondary" className="ms-auto">{totalContainerCost.toFixed(2)} ₪</Badge>
              )}
            </div>
            {containerTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">أضف أنواع تنكات من الإعدادات</p>
            ) : (
              <div className="space-y-2">
                {containerTypes.map((ct) => (
                  <div key={ct.id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
                    <div className="flex-1">
                      <p className="font-medium">{ct.name}</p>
                      <p className="text-xs text-muted-foreground">{ct.price} ₪ / تنكة</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => adjustContainer(ct.id, -1)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-12 text-center text-xl font-bold">{containerCounts[ct.id] || 0}</span>
                      <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => adjustContainer(ct.id, +1)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step 3: Payment */}
          <div className="space-y-3 rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">3</span>
              <Label className="text-lg font-semibold">طريقة الدفع</Label>
            </div>
            {!calc ? (
              <p className="text-sm text-muted-foreground text-center py-4">أدخل كمية الزيت أولاً</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {paymentCards.map((p) => {
                    const data = p.type === "oil" ? calc.oilOnly : p.type === "cash" ? calc.cashOnly : calc.mixed;
                    const selected = paymentType === p.type;
                    return (
                      <button
                        key={p.type}
                        onClick={() => setPaymentType(p.type)}
                        className={`${p.bg} rounded-xl p-4 text-right transition-all ${selected ? `ring-2 ${p.ring} scale-[1.02]` : "hover:scale-[1.01]"}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p.icon className={`h-5 w-5 ${p.color}`} />
                          {selected && <CheckCircle2 className={`h-5 w-5 ${p.color}`} />}
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">{p.title}</p>
                        <p className={`text-lg font-bold mt-1 ${p.color}`}>{data.label}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Mixed payment customization panel */}
                {paymentType === "mixed" && (
                  <div className="mt-3 p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-amber-600" />
                        <span className="text-sm font-bold text-amber-900 dark:text-amber-200">
                          تخصيص الدفع المختلط (تعديل حصة الزيت أو النقد)
                        </span>
                      </div>
                      {customMixedOil !== null && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setCustomMixedOil(null)}
                          className="h-7 px-2 text-xs text-amber-700 hover:text-amber-900 dark:text-amber-400"
                        >
                          <RotateCcw className="h-3.5 w-3.5 me-1" />
                          استعادة الافتراضي ({calc.defaultMixed.oilAmount.toFixed(2)} كغم)
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Oil amount input */}
                      <div className="space-y-1.5 bg-background/90 dark:bg-card p-3 rounded-lg border border-amber-200/60 dark:border-amber-900/40">
                        <div className="flex justify-between items-center text-xs">
                          <Label className="font-semibold text-foreground">كمية الزيت (كغم)</Label>
                          <span className="text-muted-foreground text-[11px]">الافتراضي: {calc.defaultMixed.oilAmount.toFixed(2)} كغم</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 shrink-0"
                            onClick={() => {
                              const cur = calc.mixed.oilAmount;
                              const next = Math.max(0, +(cur - 0.5).toFixed(2));
                              setCustomMixedOil(next);
                            }}
                            disabled={calc.mixed.oilAmount <= 0}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max={calc.oilOnly.oilAmount}
                            value={calc.mixed.oilAmount}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setCustomMixedOil(isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            className="text-center font-bold text-base h-9 text-amber-700 dark:text-amber-400"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 shrink-0"
                            onClick={() => {
                              const cur = calc.mixed.oilAmount;
                              const next = Math.min(calc.oilOnly.oilAmount, +(cur + 0.5).toFixed(2));
                              setCustomMixedOil(next);
                            }}
                            disabled={calc.mixed.oilAmount >= calc.oilOnly.oilAmount}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex gap-1 pt-1 justify-center flex-wrap">
                          {[1, 2, 3].filter(v => v <= calc.oilOnly.oilAmount).map((v) => (
                            <Button
                              key={v}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => setCustomMixedOil(v)}
                            >
                              {v} كغم
                            </Button>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() => setCustomMixedOil(Math.floor(calc.defaultMixed.oilAmount))}
                          >
                            {Math.floor(calc.defaultMixed.oilAmount)} كغم
                          </Button>
                        </div>
                      </div>

                      {/* Cash amount input */}
                      <div className="space-y-1.5 bg-background/90 dark:bg-card p-3 rounded-lg border border-amber-200/60 dark:border-amber-900/40">
                        <div className="flex justify-between items-center text-xs">
                          <Label className="font-semibold text-foreground">المبلغ النقدي المتبقي (شيكل)</Label>
                          <span className="text-muted-foreground text-[11px]">الافتراضي: {calc.defaultMixed.cashAmount.toFixed(2)} ₪</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 shrink-0"
                            onClick={() => {
                              const cur = calc.mixed.cashAmount;
                              const next = Math.max(0, +(cur - 5).toFixed(2));
                              const res = calculateCustomMixedFromCash(oilProduced, totalContainerCost, settings, next);
                              setCustomMixedOil(res.oilAmount);
                            }}
                            disabled={calc.mixed.cashAmount <= 0}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            max={calc.cashOnly.cashAmount}
                            value={calc.mixed.cashAmount}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              const next = isNaN(val) ? 0 : Math.max(0, val);
                              const res = calculateCustomMixedFromCash(oilProduced, totalContainerCost, settings, next);
                              setCustomMixedOil(res.oilAmount);
                            }}
                            className="text-center font-bold text-base h-9 text-amber-700 dark:text-amber-400"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 shrink-0"
                            onClick={() => {
                              const cur = calc.mixed.cashAmount;
                              const next = Math.min(calc.cashOnly.cashAmount, +(cur + 5).toFixed(2));
                              const res = calculateCustomMixedFromCash(oilProduced, totalContainerCost, settings, next);
                              setCustomMixedOil(res.oilAmount);
                            }}
                            disabled={calc.mixed.cashAmount >= calc.cashOnly.cashAmount}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex gap-1 pt-1 justify-center">
                          <p className="text-[11px] text-muted-foreground text-center py-0.5">
                            يتم احتساب النقد تلقائياً لتغطية كامل الفاتورة
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-100/70 dark:bg-amber-900/40 rounded-lg p-2.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-amber-950 dark:text-amber-200">
                        النتيجة النهائية للمختلط:
                      </span>
                      <span className="font-bold text-sm text-amber-900 dark:text-amber-100">
                        {calc.mixed.oilAmount.toFixed(2)} كغم زيت + {calc.mixed.cashAmount.toFixed(2)} ₪ نقداً
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row gap-2.5">
            <Button
              variant="outline"
              size="lg"
              className="sm:w-auto h-14 text-base"
              disabled={!paymentType || !oilProduced}
              onClick={() => setShowPreview(true)}
            >
              <Eye className="h-5 w-5 me-2" />
              معاينة
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="sm:w-auto h-14 text-base font-semibold"
              disabled={!paymentType || !oilProduced || saving}
              onClick={() => handleConfirm(false)}
            >
              <CheckCircle2 className="h-5 w-5 me-2" />
              {saving ? "جارٍ الحفظ..." : "حفظ فقط"}
            </Button>
            <Button
              size="lg"
              className="flex-1 h-14 text-lg font-bold gap-2 shadow-md hover:shadow-lg transition-all"
              disabled={!paymentType || !oilProduced || saving}
              onClick={() => handleConfirm(true)}
            >
              <Printer className="h-5 w-5" />
              {saving ? "جارٍ الحفظ..." : "تأكيد وطباعة الإيصال (80mm)"}
            </Button>
          </div>
        </div>

        {/* Invoice preview dialog (shown to customer) */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader>
              <DialogTitle>معاينة الفاتورة</DialogTitle>
            </DialogHeader>
            {customer && paymentType && calc && (
              <InvoicePreview
                millName={millName}
                data={{
                  customer_name: customer.name,
                  customer_phone: customer.phone,
                  oil_produced: oilProduced,
                  container_count: totalContainerCount,
                  container_type: containerSummary,
                  payment_type: paymentType,
                  season_name: activeSeason?.name,
                  oil_amount:
                    paymentType === "oil"
                      ? calc.oilOnly.oilAmount
                      : paymentType === "cash"
                      ? calc.cashOnly.oilAmount
                      : calc.mixed.oilAmount,
                  cash_amount:
                    paymentType === "oil"
                      ? calc.oilOnly.cashAmount
                      : paymentType === "cash"
                      ? calc.cashOnly.cashAmount
                      : calc.mixed.cashAmount,
                  total_display:
                    paymentType === "oil"
                      ? calc.oilOnly.label
                      : paymentType === "cash"
                      ? calc.cashOnly.label
                      : calc.mixed.label,
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
