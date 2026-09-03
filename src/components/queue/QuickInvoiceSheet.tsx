import { useEffect, useMemo, useState } from "react";
import { calculatePaymentOptions } from "@/lib/invoiceCalculations";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Droplets, Package, Wallet, CheckCircle2, Plus, Minus, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useSettings } from "@/hooks/useSettings";
import { useInventory } from "@/hooks/useInventory";
import { InvoicePreview } from "@/components/invoices/InvoicePreview";

interface ContainerType {
  id: string;
  name: string;
  price: number;
}

interface QuickInvoiceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: { id: string; name: string; phone: string | null } | null;
  onCompleted: () => void;
}

type PaymentType = "oil" | "cash" | "mixed";

export function QuickInvoiceSheet({ open, onOpenChange, customer, onCompleted }: QuickInvoiceSheetProps) {
  const { user, effectiveUserId } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { activeSeason } = useSeason();
  const { settings } = useSettings();
  const { refetch: refetchInventory } = useInventory();

  const [oilProduced, setOilProduced] = useState<number>(0);
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [containerCounts, setContainerCounts] = useState<Record<string, number>>({});
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (open && targetUserId && activeSeason) {
      fetchContainerTypes();
      // reset
      setOilProduced(0);
      setContainerCounts({});
      setPaymentType(null);
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
    return {
      oilOnly: { ...opts.oil, label: `${opts.oil.oilAmount.toFixed(2)} كغم زيت` },
      cashOnly: { ...opts.cash, label: `${opts.cash.cashAmount.toFixed(2)} ₪` },
      mixed: { ...opts.mixed, label: `${opts.mixed.oilAmount.toFixed(2)} كغم + ${opts.mixed.cashAmount.toFixed(2)} ₪` },
    };
  }, [oilProduced, totalContainerCost, settings]);

  const adjustContainer = (id: string, delta: number) => {
    setContainerCounts((p) => ({ ...p, [id]: Math.max(0, (p[id] || 0) + delta) }));
  };

  const addOil = (delta: number) => setOilProduced((v) => Math.max(0, +(v + delta).toFixed(2)));

  const handleConfirm = async () => {
    if (!customer || !paymentType || !calc) return;
    if (oilProduced <= 0) {
      toast.error("يرجى إدخال كمية الزيت");
      return;
    }
    setSaving(true);

    const selected = paymentType === "oil" ? calc.oilOnly : paymentType === "cash" ? calc.cashOnly : calc.mixed;

    // Ensure customer record
    let customerId: string | null = null;
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", user!.id)
      .eq("season_id", activeSeason!.id)
      .eq("name", customer.name)
      .maybeSingle();
    if (existing) {
      customerId = existing.id;
    } else {
      const { data: newCust } = await supabase
        .from("customers")
        .insert({ user_id: targetUserId!, season_id: activeSeason!.id, name: customer.name, phone: customer.phone })
        .select("id")
        .single();
      if (newCust) customerId = newCust.id;
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

    const shareMsg = `فاتورة ${customer.name}\nالزيت المنتج: ${oilProduced} كغم\nالتنكات: ${containerSummary}\nالمستحق: ${selected.label}`;

    toast.success("تم تأكيد الفاتورة", {
      description: selected.label,
      action: customer.phone
        ? {
            label: "📱 واتساب",
            onClick: () => {
              const phone = customer.phone!.replace(/[^0-9]/g, "");
              window.open(`https://wa.me/${phone}?text=${encodeURIComponent(shareMsg)}`, "_blank");
            },
          }
        : undefined,
    });

    setSaving(false);
    onOpenChange(false);
    onCompleted();
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
            )}
          </div>

          <Separator />

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="lg"
              className="sm:w-auto h-14 text-base"
              disabled={!paymentType || !oilProduced}
              onClick={() => setShowPreview(true)}
            >
              <Eye className="h-5 w-5 me-2" />
              إظهار الفاتورة
            </Button>
            <Button
              size="lg"
              className="flex-1 h-14 text-lg font-bold"
              disabled={!paymentType || !oilProduced || saving}
              onClick={handleConfirm}
            >
              <CheckCircle2 className="h-5 w-5 me-2" />
              {saving ? "جارٍ الحفظ..." : "تأكيد الفاتورة وإنهاء الدور"}
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
                data={{
                  customer_name: customer.name,
                  oil_produced: oilProduced,
                  container_count: totalContainerCount,
                  container_type: containerSummary,
                  payment_type: paymentType,
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
