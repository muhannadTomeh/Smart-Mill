import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Receipt, 
  FileText, 
  CheckCircle, 
  Eye, 
  Printer, 
  Calculator as CalcIcon, 
  Plus, 
  ArrowLeft,
  Sliders,
  Sparkles,
  Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/useSettings";
import { useInventory } from "@/hooks/useInventory";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useLocation, useNavigate } from "react-router-dom";
import { InvoicePreview, type InvoicePreviewData } from "@/components/invoices/InvoicePreview";
import { SimpleCalculator } from "@/components/invoices/SimpleCalculator";
import { 
  calculatePaymentOptions, 
  calculateCustomMixedFromOil, 
  type PaymentBreakdown 
} from "@/lib/invoiceCalculations";
import { printThermalReceipt } from "@/lib/thermalReceiptPrinter";

interface PaymentMethod extends PaymentBreakdown {
  total: string;
}

interface ContainerType {
  id: string;
  name: string;
  price: number;
}

const paymentLabel = (type: string) => {
  if (type === "oil") return "دفع بالزيت (رد عيني)";
  if (type === "cash") return "دفع نقدي (رد كاش)";
  return "دفع مختلط (زيت + نقدي)";
};

export default function Invoices() {
  const { user, effectiveUserId, profile } = useAuth();
  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";
  const { activeSeason } = useSeason();
  const { settings } = useSettings();
  const { refetch: refetchInventory } = useInventory();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const targetUserId = effectiveUserId || user?.id;

  const [invoiceData, setInvoiceData] = useState({
    customerName: "",
    customerPhone: "",
    oilProduced: 0,
    notes: "",
  });
  const [containerCounts, setContainerCounts] = useState<Record<string, number>>({});
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [queueCustomers, setQueueCustomers] = useState<{ id: string; name: string; phone: string | null; position: number }[]>([]);
  
  // Custom mixed payment adjustments
  const [customMixedOil, setCustomMixedOil] = useState<number | null>(null);
  const [isCustomizingMixed, setIsCustomizingMixed] = useState(false);

  // Preview Dialog Modal
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (location.state) {
      const s = location.state as any;
      if (s.customerName) setInvoiceData(p => ({ ...p, customerName: s.customerName, customerPhone: s.customerPhone || "" }));
      if (s.queueId) setQueueId(s.queueId);
    }
  }, [location.state]);

  useEffect(() => {
    if (targetUserId && activeSeason) {
      fetchQueueCustomers();
      fetchContainerTypes();
    }
  }, [targetUserId, activeSeason]);

  const fetchContainerTypes = async () => {
    if (!targetUserId || !activeSeason) return;
    try {
      const { data } = await supabase
        .from("container_types")
        .select("*")
        .eq("user_id", targetUserId)
        .eq("season_id", activeSeason.id)
        .order("created_at", { ascending: true });
      const types = (data as ContainerType[]) || [];
      setContainerTypes(types);
      const counts: Record<string, number> = {};
      types.forEach(t => { counts[t.id] = 0; });
      setContainerCounts(prev => {
        const merged = { ...counts };
        Object.keys(prev).forEach(k => { if (merged[k] !== undefined) merged[k] = prev[k]; });
        return merged;
      });
    } catch (err) {
      console.error("Error fetching container types:", err);
    }
  };

  const fetchQueueCustomers = async () => {
    if (!targetUserId || !activeSeason) return;
    try {
      const { data } = await supabase
        .from("queue")
        .select("id, name, phone, position")
        .eq("user_id", targetUserId)
        .eq("season_id", activeSeason.id)
        .neq("status", "done")
        .order("position", { ascending: true });
      setQueueCustomers(data || []);
    } catch (err) {
      console.error("Error fetching queue customers:", err);
    }
  };

  const getTotalContainerCost = () => {
    let total = 0;
    containerTypes.forEach(ct => {
      total += (containerCounts[ct.id] || 0) * ct.price;
    });
    return total;
  };

  const getTotalContainerCount = () => {
    return Object.values(containerCounts).reduce((s, v) => s + v, 0);
  };

  const getContainerSummary = () => {
    return containerTypes
      .filter(ct => (containerCounts[ct.id] || 0) > 0)
      .map(ct => `${containerCounts[ct.id]} ${ct.name}`)
      .join(" + ");
  };

  // Recalculate standard payment methods when oil or containers change
  useEffect(() => {
    if (!invoiceData.oilProduced || invoiceData.oilProduced <= 0) {
      setPaymentMethods([]);
      setSelectedPayment(null);
      setCustomMixedOil(null);
      setIsCustomizingMixed(false);
      return;
    }
    const totalContainerCost = getTotalContainerCost();
    const opts = calculatePaymentOptions(invoiceData.oilProduced, totalContainerCost, settings);

    const methods: PaymentMethod[] = [
      { ...opts.oil, total: `${opts.oil.oilAmount.toFixed(2)} كغم زيت` },
      { ...opts.cash, total: `${opts.cash.cashAmount.toFixed(2)} شيكل` },
      { ...opts.mixed, total: `${opts.mixed.oilAmount.toFixed(2)} كغم زيت + ${opts.mixed.cashAmount.toFixed(2)} شيكل` },
    ];
    setPaymentMethods(methods);

    // Keep selection if still valid
    if (selectedPayment) {
      if (selectedPayment.type === "mixed" && isCustomizingMixed && customMixedOil !== null) {
        const customBreakdown = calculateCustomMixedFromOil(
          invoiceData.oilProduced,
          totalContainerCost,
          settings,
          customMixedOil
        );
        setSelectedPayment({
          ...customBreakdown,
          total: `${customBreakdown.oilAmount.toFixed(2)} كغم زيت + ${customBreakdown.cashAmount.toFixed(2)} شيكل`,
        });
      } else {
        const updated = methods.find(m => m.type === selectedPayment.type);
        setSelectedPayment(updated || methods[0]);
      }
    } else {
      setSelectedPayment(methods[0]); // Default to first method (oil)
    }
  }, [invoiceData.oilProduced, containerCounts, settings]);

  // Handle custom mixed oil adjustment
  const handleCustomMixedOilChange = (val: number) => {
    setCustomMixedOil(val);
    const totalContainerCost = getTotalContainerCost();
    const customBreakdown = calculateCustomMixedFromOil(
      invoiceData.oilProduced,
      totalContainerCost,
      settings,
      val
    );
    setSelectedPayment({
      ...customBreakdown,
      total: `${customBreakdown.oilAmount.toFixed(2)} كغم زيت + ${customBreakdown.cashAmount.toFixed(2)} شيكل`,
    });
  };

  const confirmInvoice = async (shouldPrint = false) => {
    if (!selectedPayment) {
      toast({ title: "تنبيه", description: "يرجى اختيار طريقة الدفع أولاً", variant: "destructive" });
      return;
    }
    if (!invoiceData.customerName.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم الزبون", variant: "destructive" });
      return;
    }
    if (!invoiceData.oilProduced || invoiceData.oilProduced <= 0) {
      toast({ title: "خطأ", description: "يرجى إدخال كمية الزيت المنتج بشكل صحيح", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      let customerId: string | null = null;
      if (queueId && queueId !== "manual") {
        customerId = localStorage.getItem(`queue_cust_${queueId}`);
        if (!customerId) {
          const qCust = queueCustomers.find(q => q.id === queueId);
          if (qCust && (qCust as any).notes) {
            const match = (qCust as any).notes.match(/\[cust_id:([^\]]+)\]/);
            if (match) customerId = match[1];
          }
        }
      }

      if (!customerId) {
        const cleanPhone = invoiceData.customerPhone?.trim();
        let existingCust: any = null;
        if (cleanPhone && cleanPhone.length >= 7) {
          const { data } = await supabase
            .from("customers")
            .select("id")
            .eq("user_id", targetUserId!)
            .eq("season_id", activeSeason!.id)
            .eq("name", invoiceData.customerName.trim())
            .eq("phone", cleanPhone)
            .maybeSingle();
          existingCust = data;
        }

        if (existingCust) {
          customerId = existingCust.id;
        } else {
          const { data: newCust } = await supabase
            .from("customers")
            .insert({
              user_id: targetUserId!,
              season_id: activeSeason!.id,
              name: invoiceData.customerName.trim(),
              phone: cleanPhone || null,
            })
            .select("id")
            .single();
          if (newCust) customerId = newCust.id;
        }
      }

      const containerSummary = getContainerSummary() || "بدون تنكات";

      const { error } = await supabase.rpc("create_invoice_and_settle", {
        p_season_id: activeSeason!.id,
        p_customer_id: customerId,
        p_customer_name: invoiceData.customerName.trim(),
        p_oil_produced: invoiceData.oilProduced,
        p_container_count: getTotalContainerCount(),
        p_container_type: containerSummary,
        p_payment_type: selectedPayment.type,
        p_oil_amount: selectedPayment.oilAmount,
        p_cash_amount: selectedPayment.cashAmount,
        p_total_display: selectedPayment.total,
        p_queue_id: queueId && queueId !== "manual" ? queueId : null,
      });

      if (error) {
        console.error("create_invoice_and_settle error", error);
        toast({ title: "خطأ", description: error.message || "حدث خطأ أثناء حفظ الفاتورة", variant: "destructive" });
        return;
      }

      if (shouldPrint) {
        printThermalReceipt({
          customer_name: invoiceData.customerName.trim(),
          customer_phone: invoiceData.customerPhone || null,
          oil_produced: invoiceData.oilProduced,
          container_count: getTotalContainerCount(),
          container_type: containerSummary,
          payment_type: selectedPayment.type,
          oil_amount: selectedPayment.oilAmount,
          cash_amount: selectedPayment.cashAmount,
          total_display: selectedPayment.total,
          notes: invoiceData.notes || undefined,
          season_name: activeSeason?.name,
        }, millName);
      }

      if (queueId && queueId !== "manual") {
        const { error: qErr } = await supabase.from("queue").update({ status: "done" }).eq("id", queueId);
        if (qErr) {
          await supabase.from("queue").delete().eq("id", queueId);
        }
        setQueueId(null);
      }

      toast({ 
        title: shouldPrint ? "تم تأكيد الفاتورة وإرسال أمر الطباعة" : "تم تأكيد الفاتورة بنجاح", 
        description: `تم حفظ فاتورة لـ ${invoiceData.customerName}` 
      });

      // Reset form
      setInvoiceData({ customerName: "", customerPhone: "", oilProduced: 0, notes: "" });
      const resetCounts: Record<string, number> = {};
      containerTypes.forEach(ct => { resetCounts[ct.id] = 0; });
      setContainerCounts(resetCounts);
      setPaymentMethods([]);
      setSelectedPayment(null);
      setCustomMixedOil(null);
      setIsCustomizingMixed(false);
      setShowPreviewModal(false);
      fetchQueueCustomers();
      refetchInventory();
    } catch (err: any) {
      console.error("Invoice submit error:", err);
      toast({ title: "خطأ غير متوقع", description: err?.message || "حدث خطأ أثناء حفظ الفاتورة", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Prepare live preview data object for the modal
  const livePreviewData: InvoicePreviewData | null = useMemo(() => {
    if (!invoiceData.customerName && !invoiceData.oilProduced) return null;
    return {
      customer_name: invoiceData.customerName.trim() || "زبون جديد",
      customer_phone: invoiceData.customerPhone || null,
      oil_produced: invoiceData.oilProduced || 0,
      container_count: getTotalContainerCount(),
      container_type: getContainerSummary() || "بدون تنكات",
      payment_type: selectedPayment?.type || "oil",
      oil_amount: selectedPayment?.oilAmount || 0,
      cash_amount: selectedPayment?.cashAmount || 0,
      total_display: selectedPayment?.total || "0",
      notes: invoiceData.notes || undefined,
      season_name: activeSeason?.name,
    };
  }, [invoiceData, selectedPayment, containerCounts, containerTypes, activeSeason]);

  const netOilForCustomer = Math.max(0, (invoiceData.oilProduced || 0) - (selectedPayment?.oilAmount || 0));

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">حساب الرد والأجرة</h1>
            <p className="text-sm text-muted-foreground">حساب الرد العيني والنقدي وإصدار الفواتير الفورية</p>
          </div>
        </div>

        {/* Quick link to Invoices History */}
        <Button
          variant="outline"
          onClick={() => navigate("/invoices-history")}
          className="gap-2 border-primary/30 hover:bg-primary/5 text-primary font-semibold"
        >
          <FileText className="h-4 w-4" />
          <span>سجل الفواتير</span>
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Grid: Right = Invoice Form (7 cols), Left = Calculator (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* RIGHT: Invoice Input Form (col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-4 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span>بيانات الفاتورة والإنتاج</span>
                </CardTitle>
                <Badge variant="outline" className="font-mono text-xs">
                  {new Date().toLocaleDateString("ar-SA")}
                </Badge>
              </div>
              <CardDescription>
                أدخل كمية الزيت المنتج والتنكات لاحتساب الرد والأجرة تلقائياً
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
              {/* Customer Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center justify-between">
                  <span>اسم الزبون</span>
                  {queueCustomers.length > 0 && (
                    <span className="text-xs text-primary font-normal">
                      {queueCustomers.length} زبائن في الطابور
                    </span>
                  )}
                </Label>
                <Select
                  value={queueId || "manual"}
                  onValueChange={(val) => {
                    if (val === "manual") {
                      setQueueId(null);
                      setInvoiceData(p => ({ ...p, customerName: "", customerPhone: "" }));
                    } else {
                      const c = queueCustomers.find(q => q.id === val);
                      if (c) {
                        setQueueId(c.id);
                        setInvoiceData(p => ({ ...p, customerName: c.name, customerPhone: c.phone || "" }));
                      }
                    }
                  }}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="اختر زبوناً من الطابور" />
                  </SelectTrigger>
                  <SelectContent>
                    {queueCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        دور #{c.position} — {c.name} {c.phone ? `(${c.phone})` : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value="manual">إدخال زبون يدوي (خارج الطابور)</SelectItem>
                  </SelectContent>
                </Select>

                {(!queueId || queueId === "manual") && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <Input
                      className="h-11"
                      value={invoiceData.customerName}
                      onChange={(e) => setInvoiceData(p => ({ ...p, customerName: e.target.value }))}
                      placeholder="أدخل اسم الزبون..."
                    />
                    <Input
                      className="h-11"
                      value={invoiceData.customerPhone}
                      onChange={(e) => setInvoiceData(p => ({ ...p, customerPhone: e.target.value }))}
                      placeholder="رقم الهاتف (اختياري)..."
                      dir="ltr"
                    />
                  </div>
                )}
              </div>

              {/* Oil Quantity with Quick Increments */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="oilProduced" className="text-sm font-semibold">
                    كمية الزيت المنتج (كغم)
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    يمكنك استخدام الآلة الحاسبة على اليسار لنقل الناتج فوراً
                  </span>
                </div>

                <div className="relative">
                  <Input
                    id="oilProduced"
                    type="number"
                    value={invoiceData.oilProduced || ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setInvoiceData(p => ({ ...p, oilProduced: isNaN(val) ? 0 : val }));
                    }}
                    placeholder="0.0"
                    min="0"
                    step="0.1"
                    className="text-xl font-bold font-mono h-12 pe-16"
                  />
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground font-semibold text-sm">
                    كغم زيت
                  </div>
                </div>

                {/* Quick Add Buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {[10, 20, 50, 100].map((inc) => (
                    <Button
                      key={inc}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-mono"
                      onClick={() => setInvoiceData(p => ({ ...p, oilProduced: Math.round(((p.oilProduced || 0) + inc) * 10) / 10 }))}
                    >
                      +{inc} كغم
                    </Button>
                  ))}
                  {invoiceData.oilProduced > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => setInvoiceData(p => ({ ...p, oilProduced: 0 }))}
                    >
                      تصفير
                    </Button>
                  )}
                </div>
              </div>

              {/* Containers */}
              {containerTypes.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">عدد التنكات والعبوات</Label>
                    <span className="text-xs text-muted-foreground font-mono">
                      إجمالي التنكات: {getTotalContainerCount()} | {getTotalContainerCost()} ₪
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {containerTypes.map((ct) => (
                      <div
                        key={ct.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border bg-muted/20"
                      >
                        <div className="overflow-hidden">
                          <p className="text-sm font-medium truncate">{ct.name}</p>
                          <p className="text-xs text-muted-foreground">{ct.price} ₪ للواحدة</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => {
                              const curr = containerCounts[ct.id] || 0;
                              if (curr > 0) setContainerCounts(p => ({ ...p, [ct.id]: curr - 1 }));
                            }}
                          >
                            -
                          </Button>
                          <Input
                            type="number"
                            className="w-14 h-8 text-center font-mono font-bold text-sm p-1"
                            value={containerCounts[ct.id] ?? 0}
                            onChange={(e) => {
                              const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                              setContainerCounts(p => ({ ...p, [ct.id]: isNaN(val) ? 0 : Math.max(0, val) }));
                            }}
                            min="0"
                            onFocus={(e) => e.target.select()}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                            onClick={() => {
                              const curr = containerCounts[ct.id] || 0;
                              setContainerCounts(p => ({ ...p, [ct.id]: curr + 1 }));
                            }}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs text-muted-foreground">
                  ملاحظات إضافية (اختياري)
                </Label>
                <Textarea
                  id="notes"
                  value={invoiceData.notes}
                  onChange={(e) => setInvoiceData(p => ({ ...p, notes: e.target.value }))}
                  placeholder="أي ملاحظات حول الجودة، الدفع، أو تسليم الزيت..."
                  rows={2}
                  className="resize-none"
                />
              </div>

              {/* Payment Methods Selection */}
              {paymentMethods.length > 0 && (
                <div className="space-y-3 pt-3">
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-bold text-foreground">طريقة دفع الأجرة</Label>
                    <span className="text-xs text-primary font-semibold">
                      نسبة الرد: {settings.return_percent}% | سعر الكاش: {settings.cash_return_cost} ₪
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {paymentMethods.map((method) => {
                      const isSelected = selectedPayment?.type === method.type;
                      return (
                        <div
                          key={method.type}
                          onClick={() => {
                            setSelectedPayment(method);
                            if (method.type !== "mixed") {
                              setIsCustomizingMixed(false);
                            }
                          }}
                          className={`cursor-pointer rounded-xl p-3 border-2 transition-all flex flex-col justify-between gap-2 ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                              : "border-border hover:border-primary/40 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">{paymentLabel(method.type)}</span>
                            {isSelected && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                          </div>
                          <div className="font-mono font-bold text-sm text-primary">
                            {method.total}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mixed Payment Customization if Mixed is selected */}
                  {selectedPayment?.type === "mixed" && (
                    <div className="mt-3 p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sliders className="h-4 w-4 text-primary" />
                          <span className="text-xs font-bold text-foreground">تخصيص الدفع المختلط (زيت / كاش)</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-primary"
                          onClick={() => {
                            setIsCustomizingMixed(!isCustomizingMixed);
                            if (!isCustomizingMixed) {
                              const std = paymentMethods.find(m => m.type === "mixed");
                              setCustomMixedOil(std ? std.oilAmount : 0);
                            }
                          }}
                        >
                          {isCustomizingMixed ? "استعادة التلقائي" : "تخصيص كمية الزيت"}
                        </Button>
                      </div>

                      {isCustomizingMixed && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <Label className="text-xs font-medium">كمية الزيت المدفوعة (كغم):</Label>
                            <Input
                              type="number"
                              className="h-9 mt-1 font-mono font-bold"
                              value={customMixedOil ?? selectedPayment.oilAmount}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                handleCustomMixedOilChange(val);
                              }}
                              step="0.1"
                              min="0"
                            />
                          </div>
                          <div>
                            <Label className="text-xs font-medium">المبلغ النقدي المحسوب:</Label>
                            <div className="h-9 mt-1 px-3 flex items-center bg-background border rounded-md font-mono font-bold text-primary">
                              {selectedPayment.cashAmount.toFixed(2)} شيكل
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>
                          صافي الزيت المتبقي للزبون بعد خصم الأجرة: <strong>{netOilForCustomer.toFixed(2)} كغم</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Summary & Primary Action Buttons on the RIGHT */}
              <div className="pt-3 space-y-3">
                <Separator />
                
                {/* Live quick summary bar */}
                {selectedPayment && invoiceData.oilProduced > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-muted/40 border text-xs">
                    <div>
                      <span className="text-muted-foreground">الزبون: </span>
                      <span className="font-bold">{invoiceData.customerName || "غير محدد"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">الإنتاج: </span>
                      <span className="font-bold font-mono">{invoiceData.oilProduced} كغم</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">الأجرة: </span>
                      <span className="font-bold font-mono text-primary">{selectedPayment.total}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">صافي الزبون: </span>
                      <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {netOilForCustomer.toFixed(2)} كغم
                      </span>
                    </div>
                  </div>
                )}

                {/* Buttons Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  {/* Preview Invoice Button - requested to be on the right */}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowPreviewModal(true)}
                    disabled={!invoiceData.oilProduced || !selectedPayment}
                    className="sm:col-span-4 h-12 text-sm font-semibold border-primary/30 text-primary hover:bg-primary/5 gap-2"
                  >
                    <Eye className="h-4 w-4" />
                    <span>معاينة الفاتورة</span>
                  </Button>

                  {/* Confirm Only */}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => confirmInvoice(false)}
                    disabled={!selectedPayment || !invoiceData.customerName || isSubmitting}
                    className="sm:col-span-3 h-12 text-sm font-semibold gap-1.5"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span>تأكيد فقط</span>
                  </Button>

                  {/* Confirm & Print Receipt */}
                  <Button
                    type="button"
                    onClick={() => confirmInvoice(true)}
                    disabled={!selectedPayment || !invoiceData.customerName || isSubmitting}
                    className="sm:col-span-5 h-12 text-sm font-bold shadow-md hover:shadow-lg transition-all gap-2 bg-primary text-primary-foreground"
                  >
                    <Printer className="h-4 w-4" />
                    <span>تأكيد وطباعة (80mm)</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* LEFT: Open Simple Calculator (col-span-5) */}
        <div className="lg:col-span-5 sticky top-4">
          <SimpleCalculator
            onUseValue={(val) => {
              setInvoiceData(p => ({ ...p, oilProduced: val }));
              toast({
                title: "تم نقل الناتج",
                description: `تم تعيين كمية الزيت إلى ${val} كغم`,
              });
            }}
          />
        </div>
      </div>

      {/* Live Preview Modal Dialog */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent dir="rtl" className="max-w-md p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5 text-primary" />
              <span>معاينة الفاتورة قبل الطباعة</span>
            </DialogTitle>
          </DialogHeader>

          {livePreviewData && (
            <div className="space-y-4">
              <InvoicePreview
                millName={millName}
                data={livePreviewData}
              />

              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowPreviewModal(false)}
                >
                  إغلاق المعاينة
                </Button>
                <Button
                  className="flex-1 gap-2 font-bold"
                  onClick={() => {
                    confirmInvoice(true);
                  }}
                  disabled={!selectedPayment || !invoiceData.customerName || isSubmitting}
                >
                  <Printer className="h-4 w-4" />
                  <span>تأكيد وطباعة</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
