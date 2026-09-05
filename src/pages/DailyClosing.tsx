import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Calculator, 
  Receipt, 
  Wallet, 
  Droplets, 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  History, 
  ArrowDownRight, 
  ArrowUpRight, 
  Scale, 
  RefreshCw,
  Clock
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useRole } from "@/contexts/RoleContext";
import { printThermalZReport, type ThermalZReportData } from "@/lib/thermalReceiptPrinter";

interface DailyClosingRecord {
  id: string;
  closing_date: string;
  season_id: string;
  cashier_name: string;
  opening_cash: number;
  invoices_cash: number;
  invoices_count: number;
  oil_sales_cash: number;
  total_inflows: number;
  expenses_cash: number;
  oil_purchases_cash: number;
  worker_payments_cash: number;
  total_outflows: number;
  net_movement: number;
  expected_cash: number;
  actual_cash: number;
  difference: number;
  notes?: string;
}

export default function DailyClosing() {
  const { user, effectiveUserId, profile } = useAuth();
  const { activeSeason } = useSeason();
  const { isEmployee } = useRole();
  const targetUserId = effectiveUserId || user?.id;
  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";
  const cashierName = profile?.display_name || user?.email?.split("@")[0] || "مسؤول الصندوق";

  const [loading, setLoading] = useState(true);
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [actualCashStr, setActualCashStr] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [closing, setClosing] = useState(false);

  // Inflow / Outflow raw records
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [oilSales, setOilSales] = useState<any[]>([]);
  const [oilPurchases, setOilPurchases] = useState<any[]>([]);
  const [workerPayments, setWorkerPayments] = useState<any[]>([]);

  // Past closings
  const [closingsHistory, setClosingsHistory] = useState<DailyClosingRecord[]>([]);

  const storageKey = useMemo(() => {
    return activeSeason ? `mill_daily_closings_${activeSeason.id}` : "mill_daily_closings";
  }, [activeSeason]);

  // Load history from storage
  const loadHistory = () => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setClosingsHistory(parsed);
          // Auto-suggest opening cash from the last closing's actual cash if closed today
          if (parsed.length > 0 && parsed[0]?.actual_cash !== undefined) {
            setOpeningCash(Number(parsed[0].actual_cash) || 0);
          }
        }
      }
    } catch (e) {
      console.error("Error loading closing history", e);
    }
  };

  const fetchTodayData = async () => {
    if (!targetUserId || !activeSeason) return;
    setLoading(true);

    // Get today's start at local midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfTodayIso = today.toISOString();

    try {
      const [invRes, expRes, salesRes, purRes, wpRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("season_id", activeSeason.id)
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("expenses")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("season_id", activeSeason.id)
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("oil_transactions")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("season_id", activeSeason.id)
          .eq("type", "sell")
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("oil_transactions")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("season_id", activeSeason.id)
          .eq("type", "buy")
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("worker_payments")
          .select("*")
          .eq("user_id", targetUserId)
          .eq("season_id", activeSeason.id)
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
      ]);

      setInvoices(invRes.data || []);
      setExpenses(expRes.data || []);
      setOilSales(salesRes.data || []);
      setOilPurchases(purRes.data || []);
      setWorkerPayments(wpRes.data || []);
    } catch (e) {
      console.error("Failed to load shift records", e);
      toast.error("حدث خطأ أثناء تحميل بيانات الصندوق");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (targetUserId && activeSeason) {
      loadHistory();
      fetchTodayData();
    }
  }, [targetUserId, activeSeason]);

  // Totals calculations
  const invoicesCash = useMemo(() => {
    return invoices.reduce((sum, i) => sum + (Number(i.cash_amount) || 0), 0);
  }, [invoices]);

  const invoicesCount = invoices.length;

  const oilSalesCash = useMemo(() => {
    return oilSales.reduce((sum, s) => sum + (Number(s.total_price) || 0), 0);
  }, [oilSales]);

  const totalInflows = invoicesCash + oilSalesCash;

  const expensesCash = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses]);

  const oilPurchasesCash = useMemo(() => {
    return oilPurchases.reduce((sum, p) => sum + (Number(p.total_price) || 0), 0);
  }, [oilPurchases]);

  const workerPaymentsCash = useMemo(() => {
    return workerPayments.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
  }, [workerPayments]);

  const totalOutflows = expensesCash + oilPurchasesCash + workerPaymentsCash;

  const netMovement = totalInflows - totalOutflows;
  const expectedCash = openingCash + netMovement;

  const actualCash = actualCashStr === "" ? null : parseFloat(actualCashStr) || 0;
  const difference = actualCash !== null ? actualCash - expectedCash : null;

  const handleCloseRegister = async (shouldPrint = false) => {
    if (actualCash === null) {
      toast.error("يرجى إدخال مبلغ النقد الفعلي الموجود في الدرج");
      return;
    }

    setClosing(true);

    const record: DailyClosingRecord = {
      id: "Z-" + Date.now().toString().slice(-6),
      closing_date: new Date().toISOString(),
      season_id: activeSeason?.id || "",
      cashier_name: cashierName,
      opening_cash: openingCash,
      invoices_cash: invoicesCash,
      invoices_count: invoicesCount,
      oil_sales_cash: oilSalesCash,
      total_inflows: totalInflows,
      expenses_cash: expensesCash,
      oil_purchases_cash: oilPurchasesCash,
      worker_payments_cash: workerPaymentsCash,
      total_outflows: totalOutflows,
      net_movement: netMovement,
      expected_cash: expectedCash,
      actual_cash: actualCash,
      difference: difference || 0,
      notes: notes.trim() || undefined,
    };

    // 1. Save to localStorage
    try {
      const existing = [record, ...closingsHistory];
      localStorage.setItem(storageKey, JSON.stringify(existing));
      setClosingsHistory(existing);
    } catch (e) {
      console.error("Failed to save to local storage", e);
    }

    // 2. Attempt saving to Supabase if table exists
    try {
      await supabase.from("daily_closings" as any).insert({
        user_id: targetUserId,
        season_id: activeSeason?.id,
        cashier_name: cashierName,
        opening_cash: openingCash,
        invoices_cash: invoicesCash,
        invoices_count: invoicesCount,
        oil_sales_cash: oilSalesCash,
        total_inflows: totalInflows,
        expenses_cash: expensesCash,
        oil_purchases_cash: oilPurchasesCash,
        worker_payments_cash: workerPaymentsCash,
        total_outflows: totalOutflows,
        net_movement: netMovement,
        expected_cash: expectedCash,
        actual_cash: actualCash,
        difference: difference || 0,
        notes: notes.trim() || null,
      } as any);
    } catch {
      // Graceful fallback: table might not be in DB schema, local storage holds it securely
    }

    // 3. Print Z-Report if requested
    if (shouldPrint) {
      printThermalZReport({
        report_number: record.id,
        closing_date: record.closing_date,
        season_name: activeSeason?.name,
        cashier_name: cashierName,
        opening_cash: openingCash,
        invoices_cash: invoicesCash,
        invoices_count: invoicesCount,
        oil_sales_cash: oilSalesCash,
        total_inflows: totalInflows,
        expenses_cash: expensesCash,
        oil_purchases_cash: oilPurchasesCash,
        worker_payments_cash: workerPaymentsCash,
        total_outflows: totalOutflows,
        net_movement: netMovement,
        expected_cash: expectedCash,
        actual_cash: actualCash,
        difference: difference || 0,
        notes: record.notes,
      }, millName);
    }

    toast.success(shouldPrint ? "تم إغلاق الصندوق وطباعة تقرير Z بنجاح" : "تم اعتماد إغلاق الصندوق بنجاح");
    setClosing(false);
  };

  const reprintPastZReport = (record: DailyClosingRecord) => {
    printThermalZReport({
      report_number: record.id,
      closing_date: record.closing_date,
      season_name: activeSeason?.name,
      cashier_name: record.cashier_name,
      opening_cash: record.opening_cash,
      invoices_cash: record.invoices_cash,
      invoices_count: record.invoices_count,
      oil_sales_cash: record.oil_sales_cash,
      total_inflows: record.total_inflows,
      expenses_cash: record.expenses_cash,
      oil_purchases_cash: record.oil_purchases_cash,
      worker_payments_cash: record.worker_payments_cash,
      total_outflows: record.total_outflows,
      net_movement: record.net_movement,
      expected_cash: record.expected_cash,
      actual_cash: record.actual_cash,
      difference: record.difference,
      notes: record.notes,
    }, millName);
    toast.success("تم إرسال أمر إعادة طباعة تقرير Z");
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">إغلاق الصندوق اليومي ومطابقة الوردية</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                مطابقة النقد الفعلي في الدرج مع المقبوضات والمصروفات اليومية واستخراج تقرير Z
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchTodayData} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث البيانات
          </Button>
          <Badge variant="secondary" className="px-3 py-1.5 gap-1.5 text-xs">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>{new Date().toLocaleDateString("ar-EG")}</span>
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="reconcile" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="reconcile" className="gap-2">
            <Scale className="h-4 w-4" />
            مطابقة الصندوق
          </TabsTrigger>
          <TabsTrigger value="breakdown" className="gap-2">
            <Receipt className="h-4 w-4" />
            حركة اليوم ({invoicesCount + expenses.length + oilSales.length + oilPurchases.length + workerPayments.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            سجل الإغلاقات ({closingsHistory.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Main Reconciliation Tab */}
        <TabsContent value="reconcile" className="space-y-6 mt-4">
          {/* 3 Quick KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Inflows */}
            <Card className="border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">إجمالي المقبوضات النقدية (+)</span>
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                    <ArrowDownRight className="h-5 w-5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2">
                  +{totalInflows.toFixed(2)} ₪
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-emerald-500/10">
                  <span>فواتير كاش: {invoicesCash.toFixed(2)} ₪</span>
                  <span>مبيعات زيت: {oilSalesCash.toFixed(2)} ₪</span>
                </div>
              </CardContent>
            </Card>

            {/* Outflows */}
            <Card className="border-rose-500/20 bg-rose-50/40 dark:bg-rose-950/20">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-800 dark:text-rose-300">إجمالي المدفوعات والمصاريف (-)</span>
                  <div className="w-8 h-8 rounded-full bg-rose-500/15 text-rose-600 flex items-center justify-center">
                    <ArrowUpRight className="h-5 w-5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-rose-700 dark:text-rose-400 mt-2">
                  -{totalOutflows.toFixed(2)} ₪
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-rose-500/10">
                  <span>مصاريف: {expensesCash.toFixed(2)} ₪</span>
                  <span>مشتريات/عمال: {(oilPurchasesCash + workerPaymentsCash).toFixed(2)} ₪</span>
                </div>
              </CardContent>
            </Card>

            {/* Net Expected */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">النقد المفترض بالدرج</span>
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Wallet className="h-5 w-5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-primary mt-2">
                  {expectedCash.toFixed(2)} ₪
                </div>
                <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-primary/10">
                  <span>عهد البداية: {openingCash.toFixed(2)} ₪ | صافي الحركة: {netMovement >= 0 ? `+${netMovement.toFixed(2)}` : netMovement.toFixed(2)} ₪</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Reconciliation Form */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-7">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Scale className="h-5 w-5 text-primary" />
                  حاسبة مطابقة الدرج والصندوق
                </CardTitle>
                <CardDescription>
                  أدخل العهدة الافتتاحية والمبلغ المعدود يدوياً لحساب الفارق
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Opening Cash Input */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="font-semibold text-sm">الرصيد الافتتاحي للصندوق (عهدة البداية)</Label>
                    <span className="text-xs text-muted-foreground">الرصيد المنقول من بداية الوردية</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={openingCash || ""}
                      onChange={(e) => setOpeningCash(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="text-lg font-bold text-center h-12"
                      min="0"
                    />
                    {[0, 100, 200, 500].map((val) => (
                      <Button
                        key={val}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOpeningCash(val)}
                        className="text-xs font-semibold px-2.5"
                      >
                        {val === 0 ? "صفر" : `${val} ₪`}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Actual Counted Cash Input */}
                <div className="space-y-2 p-4 rounded-2xl bg-muted/30 border">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-bold text-foreground flex items-center gap-1.5">
                      <Wallet className="h-4 w-4 text-primary" />
                      النقد الفعلي المعدود في الدرج الآن (₪)
                    </Label>
                    <span className="text-xs font-semibold text-primary">المبلغ الفعلي الممسوك باليد</span>
                  </div>
                  <Input
                    type="number"
                    value={actualCashStr}
                    onChange={(e) => setActualCashStr(e.target.value)}
                    placeholder="أدخل المبلغ بعد عد النقود..."
                    className="text-3xl font-black text-center h-16 border-2 border-primary/40 focus:border-primary"
                    min="0"
                    step="0.5"
                  />
                </div>

                {/* Status Box: Balanced / Shortage / Surplus */}
                {actualCash !== null && difference !== null && (
                  <div 
                    className={`p-4 rounded-2xl border transition-all ${
                      Math.abs(difference) < 0.01 
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                        : difference > 0
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                        : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-base">
                        {Math.abs(difference) < 0.01 ? (
                          <>
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            <span>الصندوق متطابق تماماً بنجاح (0 ₪)</span>
                          </>
                        ) : difference > 0 ? (
                          <>
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                            <span>يوجد فائض في الصندوق:</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-5 w-5 text-rose-600" />
                            <span>يوجد عجز في الصندوق:</span>
                          </>
                        )}
                      </div>
                      <div className="text-xl font-black">
                        {Math.abs(difference) < 0.01 
                          ? "متوازن ✅" 
                          : difference > 0 
                          ? `+${difference.toFixed(2)} ₪` 
                          : `${difference.toFixed(2)} ₪`}
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes Input */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">ملاحظات الإغلاق (اختياري)</Label>
                  <Textarea
                    placeholder="أي ملاحظات حول الوردية، سبب العجز أو الفائض، اسم مستلم الوردية..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="lg"
                    className="sm:w-auto h-12 text-base font-semibold"
                    disabled={actualCash === null || closing}
                    onClick={() => handleCloseRegister(false)}
                  >
                    <CheckCircle2 className="h-5 w-5 me-2 text-primary" />
                    اعتماد الإغلاق فقط
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1 h-12 text-base font-bold shadow-md hover:shadow-lg transition-all gap-2"
                    disabled={actualCash === null || closing}
                    onClick={() => handleCloseRegister(true)}
                  >
                    <Printer className="h-5 w-5" />
                    اعتماد وطباعة تقرير Z (80mm)
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Shift Breakdown Card */}
            <Card className="lg:col-span-5">
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  ملخص بنود الصندوق اليومي
                </CardTitle>
                <CardDescription>تفصيل حركة المقبوضات والمدفوعات</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2.5 text-sm">
                  {/* Opening */}
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">الرصيد الافتتاحي (العهدة):</span>
                    <span className="font-bold">{openingCash.toFixed(2)} ₪</span>
                  </div>

                  <div className="border-t border-dashed my-2" />

                  {/* Inflows */}
                  <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                    <span>مقبوضات الفواتير ({invoicesCount} فاتورة):</span>
                    <span className="font-bold">+{invoicesCash.toFixed(2)} ₪</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                    <span>مبيعات الزيت النقدية:</span>
                    <span className="font-bold">+{oilSalesCash.toFixed(2)} ₪</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-emerald-800 dark:text-emerald-300 pt-1">
                    <span>إجمالي المقبوضات:</span>
                    <span>+{totalInflows.toFixed(2)} ₪</span>
                  </div>

                  <div className="border-t border-dashed my-2" />

                  {/* Outflows */}
                  <div className="flex justify-between items-center text-rose-700 dark:text-rose-400">
                    <span>المصاريف التشغيلية:</span>
                    <span className="font-bold">-{expensesCash.toFixed(2)} ₪</span>
                  </div>
                  <div className="flex justify-between items-center text-rose-700 dark:text-rose-400">
                    <span>مشتريات الزيت النقدية:</span>
                    <span className="font-bold">-{oilPurchasesCash.toFixed(2)} ₪</span>
                  </div>
                  <div className="flex justify-between items-center text-rose-700 dark:text-rose-400">
                    <span>دفعات وسلف العمال:</span>
                    <span className="font-bold">-{workerPaymentsCash.toFixed(2)} ₪</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-rose-800 dark:text-rose-300 pt-1">
                    <span>إجمالي المدفوعات:</span>
                    <span>-{totalOutflows.toFixed(2)} ₪</span>
                  </div>

                  <div className="border-t-2 border-foreground/20 my-3" />

                  <div className="flex justify-between items-center text-base font-black">
                    <span>المفترض بالدرج:</span>
                    <span className="text-primary text-lg">{expectedCash.toFixed(2)} ₪</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: Detailed Breakdown */}
        <TabsContent value="breakdown" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">فواتير ومقبوضات اليوم</CardTitle>
              <CardDescription>جميع الفواتير النقدية المسجلة منذ بداية اليوم</CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">لا توجد فواتير مسجلة اليوم</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الوقت</TableHead>
                      <TableHead className="text-right">اسم المزارع</TableHead>
                      <TableHead className="text-right">طريقة الدفع</TableHead>
                      <TableHead className="text-right">المقبوض النقدي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {new Date(inv.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell className="text-right font-medium">{inv.customer_name}</TableCell>
                        <TableCell className="text-right text-xs">
                          <Badge variant="outline">{inv.payment_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600">
                          {Number(inv.cash_amount) > 0 ? `${Number(inv.cash_amount).toFixed(2)} ₪` : "0 ₪"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">مصاريف اليوم ({expenses.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {expenses.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-xs">لا توجد مصاريف مسجلة اليوم</p>
                ) : (
                  <div className="space-y-2">
                    {expenses.map((e) => (
                      <div key={e.id} className="flex justify-between items-center p-2 rounded-lg bg-muted/40 text-sm">
                        <div>
                          <p className="font-semibold">{e.category}</p>
                          {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                        </div>
                        <span className="font-bold text-rose-600">-{Number(e.amount).toFixed(2)} ₪</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">مبيعات ومشتريات الزيت</CardTitle>
              </CardHeader>
              <CardContent>
                {oilSales.length === 0 && oilPurchases.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-xs">لا توجد عمليات زيت اليوم</p>
                ) : (
                  <div className="space-y-2">
                    {oilSales.map((s) => (
                      <div key={s.id} className="flex justify-between items-center p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-sm">
                        <div>
                          <p className="font-semibold text-emerald-800 dark:text-emerald-300">بيع زيت ({s.amount} كغم)</p>
                          {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                        </div>
                        <span className="font-bold text-emerald-600">+{Number(s.total_price).toFixed(2)} ₪</span>
                      </div>
                    ))}
                    {oilPurchases.map((p) => (
                      <div key={p.id} className="flex justify-between items-center p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-sm">
                        <div>
                          <p className="font-semibold text-rose-800 dark:text-rose-300">شراء زيت ({p.amount} كغم)</p>
                          {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                        </div>
                        <span className="font-bold text-rose-600">-{Number(p.total_price).toFixed(2)} ₪</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: Past Closings History */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">سجل الإغلاقات وتقارير Z السابقة</CardTitle>
              <CardDescription>استعراض الإغلاقات المعتمدة وإعادة طباعة تقرير Z</CardDescription>
            </CardHeader>
            <CardContent>
              {closingsHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="text-base">لم يتم اعتماد أي إغلاق صندوق حتى الآن</p>
                  <p className="text-xs mt-1">عند إغلاق اليومية سيتم حفظ التقرير هنا تلقائياً</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ والوقت</TableHead>
                      <TableHead className="text-right">المسؤول</TableHead>
                      <TableHead className="text-right">العهدة</TableHead>
                      <TableHead className="text-right">المقبوضات</TableHead>
                      <TableHead className="text-right">المدفوعات</TableHead>
                      <TableHead className="text-right">المفترض</TableHead>
                      <TableHead className="text-right">الفعلي</TableHead>
                      <TableHead className="text-right">الفارق</TableHead>
                      <TableHead className="text-right">تقرير Z</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closingsHistory.map((rec) => {
                      const diff = Number(rec.difference) || 0;
                      return (
                        <TableRow key={rec.id}>
                          <TableCell className="text-right text-xs font-medium">
                            {new Date(rec.closing_date).toLocaleDateString("ar-EG")} -{" "}
                            {new Date(rec.closing_date).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold">{rec.cashier_name}</TableCell>
                          <TableCell className="text-right text-xs">{rec.opening_cash} ₪</TableCell>
                          <TableCell className="text-right text-xs text-emerald-600 font-bold">+{rec.total_inflows.toFixed(2)} ₪</TableCell>
                          <TableCell className="text-right text-xs text-rose-600 font-bold">-{rec.total_outflows.toFixed(2)} ₪</TableCell>
                          <TableCell className="text-right text-xs font-bold">{rec.expected_cash.toFixed(2)} ₪</TableCell>
                          <TableCell className="text-right text-xs font-bold text-primary">{rec.actual_cash.toFixed(2)} ₪</TableCell>
                          <TableCell className="text-right text-xs">
                            <Badge 
                              variant={Math.abs(diff) < 0.01 ? "secondary" : diff > 0 ? "outline" : "destructive"}
                              className="text-[11px]"
                            >
                              {Math.abs(diff) < 0.01 ? "متطابق" : diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 text-xs"
                              onClick={() => reprintPastZReport(rec)}
                              title="طباعة تقرير Z"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              طباعة
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
