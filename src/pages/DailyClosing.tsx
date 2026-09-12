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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Calculator, 
  Receipt, 
  Wallet, 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  History, 
  ArrowDownLeft, 
  ArrowUpLeft, 
  Scale, 
  RefreshCw,
  Clock,
  Lock,
  LockOpen,
  Info,
  Calendar
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useRole } from "@/contexts/RoleContext";
import { useCurrency } from "@/hooks/useCurrency";
import { useCashSession, formatSessionDuration } from "@/contexts/CashSessionContext";
import { printThermalZReport, type ThermalZReportData } from "@/lib/thermalReceiptPrinter";
import { formatDate, formatTime } from "@/lib/formatters";

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
  opened_at?: string;
}

export default function DailyClosing() {
  const { user, millId, profile } = useAuth();
  const { activeSeason } = useSeason();
  const { isEmployee } = useRole();
  const { currency } = useCurrency();
  const { session, isOpen, openSession, closeSession } = useCashSession();
  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";
  const cashierName = profile?.display_name || user?.email?.split("@")[0] || "مسؤول الصندوق";

  const [loading, setLoading] = useState(true);
  const openingCash = session ? Number(session.opening_balance) : 0;
  const [actualCashStr, setActualCashStr] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [closing, setClosing] = useState(false);

  // Dialog for opening session from this page
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [openBalanceInput, setOpenBalanceInput] = useState("0");
  const [openLoading, setOpenLoading] = useState(false);

  // Current session records
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [oilSales, setOilSales] = useState<any[]>([]);
  const [oilPurchases, setOilPurchases] = useState<any[]>([]);
  const [workerPayments, setWorkerPayments] = useState<any[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);

  // Today-only statistical records (midnight to now, informational only)
  const [todayInvoices, setTodayInvoices] = useState<any[]>([]);
  const [todayExpenses, setTodayExpenses] = useState<any[]>([]);
  const [todayOilSales, setTodayOilSales] = useState<any[]>([]);
  const [todayOilPurchases, setTodayOilPurchases] = useState<any[]>([]);
  const [todayWorkerPayments, setTodayWorkerPayments] = useState<any[]>([]);

  // Past closings
  const [closingsHistory, setClosingsHistory] = useState<DailyClosingRecord[]>([]);

  // Load history from cash_sessions and daily_closings tables
  const loadHistory = async () => {
    if (!millId && !activeSeason?.mill_id) return;
    const effectiveMillId = millId || activeSeason?.mill_id;
    try {
      // 1. Fetch from cash_sessions in DB
      const { data: dbSessions } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("mill_id", effectiveMillId)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(50);

      if (dbSessions && dbSessions.length > 0) {
        const mapped: DailyClosingRecord[] = dbSessions.map((s: any) => ({
          id: s.id,
          closing_date: s.closed_at || s.created_at,
          season_id: s.season_id,
          cashier_name: s.opener_name || cashierName,
          opening_cash: Number(s.opening_balance) || 0,
          invoices_cash: 0,
          invoices_count: 0,
          oil_sales_cash: 0,
          total_inflows: Number(s.total_cash_in) || 0,
          expenses_cash: 0,
          oil_purchases_cash: 0,
          worker_payments_cash: 0,
          total_outflows: Number(s.total_cash_out) || 0,
          net_movement: (Number(s.total_cash_in) || 0) - (Number(s.total_cash_out) || 0),
          expected_cash: Number(s.expected_balance) || 0,
          actual_cash: Number(s.actual_balance) || 0,
          difference: Number(s.difference) || 0,
          notes: s.closing_note || undefined,
          opened_at: s.opened_at,
        }));
        setClosingsHistory(mapped);
        return;
      }

      // 2. Fallback to daily_closings table
      const { data: dbClosings } = await supabase
        .from("daily_closings")
        .select("*")
        .eq("mill_id", effectiveMillId)
        .order("closing_date", { ascending: false })
        .limit(50);

      if (dbClosings && dbClosings.length > 0) {
        setClosingsHistory(dbClosings as any);
      }
    } catch (e) {
      console.error("Error loading closing history", e);
    }
  };

  // Fetch session data (strictly by cash_session_id)
  const fetchSessionData = async () => {
    if (!activeSeason || !session) return;
    setLoading(true);

    try {
      // Primary query: filter strictly by cash_session_id
      const [invRes, expRes, salesRes, purRes, wpRes, cpRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .eq("cash_session_id", session.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("expenses")
          .select("*")
          .eq("cash_session_id", session.id)
          .is("voided_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("oil_transactions")
          .select("*")
          .eq("cash_session_id", session.id)
          .eq("type", "sell")
          .order("created_at", { ascending: false }),
        supabase
          .from("oil_transactions")
          .select("*")
          .eq("cash_session_id", session.id)
          .eq("type", "buy")
          .order("created_at", { ascending: false }),
        supabase
          .from("worker_payments")
          .select("*")
          .eq("cash_session_id", session.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_payments")
          .select("*")
          .eq("cash_session_id", session.id)
          .eq("payment_method", "cash")
          .order("created_at", { ascending: false }),
      ]);

      // If records were created before cash_session_id was stamped, fallback to opened_at
      let finalInvoices = invRes.data || [];
      let finalExpenses = expRes.data || [];
      let finalOilSales = salesRes.data || [];
      let finalOilPurchases = purRes.data || [];
      let finalWorkerPayments = wpRes.data || [];
      let finalCustomerPayments = cpRes.data || [];

      if (finalInvoices.length === 0 && session.opened_at) {
        const fallback = await supabase
          .from("invoices")
          .select("*")
          .eq("season_id", activeSeason.id)
          .gte("created_at", session.opened_at)
          .order("created_at", { ascending: false });
        if (fallback.data && fallback.data.length > 0) finalInvoices = fallback.data;
      }

      if (finalExpenses.length === 0 && session.opened_at) {
        const fallback = await supabase
          .from("expenses")
          .select("*")
          .eq("season_id", activeSeason.id)
          .is("voided_at", null)
          .gte("created_at", session.opened_at)
          .order("created_at", { ascending: false });
        if (fallback.data && fallback.data.length > 0) finalExpenses = fallback.data;
      }

      setInvoices(finalInvoices);
      setExpenses(finalExpenses);
      setOilSales(finalOilSales);
      setOilPurchases(finalOilPurchases);
      setWorkerPayments(finalWorkerPayments);
      setCustomerPayments(finalCustomerPayments);
    } catch (e) {
      console.error("Failed to load session records", e);
      toast.error("حدث خطأ أثناء تحميل بيانات الصندوق");
    } finally {
      setLoading(false);
    }
  };

  // Fetch today-only statistics (strictly informative, from midnight 00:00:00)
  const fetchTodayStats = async () => {
    if (!activeSeason) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMidnight = today.toISOString();

    try {
      const [invRes, expRes, salesRes, purRes, wpRes] = await Promise.all([
        supabase.from("invoices").select("*").eq("season_id", activeSeason.id).gte("created_at", todayMidnight),
        supabase.from("expenses").select("*").eq("season_id", activeSeason.id).is("voided_at", null).gte("created_at", todayMidnight),
        supabase.from("oil_transactions").select("*").eq("season_id", activeSeason.id).eq("type", "sell").gte("created_at", todayMidnight),
        supabase.from("oil_transactions").select("*").eq("season_id", activeSeason.id).eq("type", "buy").gte("created_at", todayMidnight),
        supabase.from("worker_payments").select("*").eq("season_id", activeSeason.id).gte("created_at", todayMidnight),
      ]);
      setTodayInvoices(invRes.data || []);
      setTodayExpenses(expRes.data || []);
      setTodayOilSales(salesRes.data || []);
      setTodayOilPurchases(purRes.data || []);
      setTodayWorkerPayments(wpRes.data || []);
    } catch {
      // Non-critical stats
    }
  };

  useEffect(() => {
    if (activeSeason) {
      loadHistory();
      fetchTodayStats();
      if (session) {
        fetchSessionData();
      } else {
        setLoading(false);
      }
    }
  }, [activeSeason?.id, session?.id, session?.opened_at]);

  const handleOpenFromPage = async () => {
    if (!activeSeason) return;
    setOpenLoading(true);
    const ok = await openSession(parseFloat(openBalanceInput) || 0);
    setOpenLoading(false);
    if (ok) {
      setShowOpenDialog(false);
      setOpenBalanceInput("0");
    }
  };
  // Totals calculations for the active session
  const invoicesCash = useMemo(() => {
    return invoices.reduce((sum, i) => sum + (Number(i.cash_amount) || 0), 0);
  }, [invoices]);

  const invoicesCount = invoices.length;

  const oilSalesCash = useMemo(() => {
    return oilSales.reduce((sum, s) => sum + (Number(s.total_price) || 0), 0);
  }, [oilSales]);

  const customerPaymentsCash = useMemo(() => {
    return customerPayments.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }, [customerPayments]);

  const totalInflows = invoicesCash + oilSalesCash + customerPaymentsCash;

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

    if (difference !== null && Math.abs(difference) >= 0.01 && !notes.trim()) {
      toast.error("يوجد فرق في الصندوق. يجب توضيح سبب الفرق في حقل الملاحظات لإتمام الإغلاق.");
      return;
    }

    setClosing(true);

    if (!isOpen || !session) {
      toast.error("لا يوجد صندوق مفتوح لإغلاقه. افتح جلسة صندوق رسمية أولاً.");
      setClosing(false);
      return;
    }

    const result = await closeSession(actualCash, notes.trim() || undefined);
    if (!result.success) {
      setClosing(false);
      return;
    }

    // Print Z-Report only after the official cash-session RPC succeeds.
    if (shouldPrint) {
      printThermalZReport({
        report_number: "Z-" + Date.now().toString().slice(-6),
        closing_date: new Date().toISOString(),
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
        expected_cash: result.expected ?? expectedCash,
        actual_cash: actualCash,
        difference: result.difference ?? (difference || 0),
        notes: notes.trim() || undefined,
      }, millName, currency);
    }

    toast.success(shouldPrint ? "تم إغلاق الصندوق وطباعة تقرير Z بنجاح" : "تم اعتماد إغلاق الصندوق بنجاح");
    setActualCashStr("");
    setNotes("");
    setClosing(false);
    await loadHistory();
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
    }, millName, currency);
    toast.success("تم إرسال أمر إعادة طباعة تقرير Z");
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">إغلاق الصندوق اليومي ومطابقة الوردية</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                مطابقة النقد الفعلي في الدرج مع مقبوضات ومدفوعات الجلسة الحالية واستخراج تقرير Z
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { if (session) fetchSessionData(); fetchTodayStats(); loadHistory(); }} 
            disabled={loading} 
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث البيانات
          </Button>
          <Badge variant="secondary" className="px-3 py-1.5 gap-1.5 text-xs font-mono">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>{formatDate(new Date())}</span>
          </Badge>
        </div>
      </div>

      {/* Session Status Banner */}
      {isOpen && session ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <LockOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-800 dark:text-emerald-300">جلسة الصندوق مفتوحة</span>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs">
                  نشطة ومستمرة
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>تاريخ الفتح: <strong className="font-medium text-foreground">{formatDate(session.opened_at)} {formatTime(session.opened_at)}</strong></span>
                <span>مدة الجلسة: <strong className="font-medium text-emerald-700 dark:text-emerald-400 font-mono">{formatSessionDuration(session.opened_at)}</strong></span>
                <span>مسؤول الفتح: <strong className="font-medium text-foreground">{session.opener_name || cashierName}</strong></span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <div className="text-left sm:text-right px-3.5 py-2 rounded-xl bg-background border text-xs shadow-sm">
              <span className="text-muted-foreground block text-[10px]">الرصيد الافتتاحي</span>
              <span className="font-bold font-mono text-sm text-foreground" dir="ltr">{openingCash.toFixed(2)} {currency}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-rose-800 dark:text-rose-300 text-base">الصندوق مغلق حالياً</h3>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-0.5">
                العمليات النقدية متوقفة. يجب فتح جلسة صندوق جديدة لبدء العمل واستقبال أو صرف الأموال.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowOpenDialog(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 px-5 h-11 shrink-0 shadow-sm"
          >
            <LockOpen className="h-4 w-4" />
            فتح الصندوق الآن
          </Button>
        </div>
      )}

      <Tabs defaultValue="reconcile" className="w-full" dir="rtl">
        <div className="flex justify-start">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="reconcile" className="gap-2">
              <Scale className="h-4 w-4" />
              <span>تسوية الجلسة</span>
            </TabsTrigger>
            <TabsTrigger value="breakdown" className="gap-2">
              <Receipt className="h-4 w-4" />
              <span>حركات الجلسة ({invoicesCount + expenses.length + oilSales.length + oilPurchases.length + workerPayments.length})</span>
            </TabsTrigger>
            <TabsTrigger value="today-stats" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span>إحصائيات اليوم</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              <span>سجل الجلسات ({closingsHistory.length})</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: Main Reconciliation Tab */}
        <TabsContent value="reconcile" className="space-y-6 mt-4" dir="rtl">
          {/* 3 Quick KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" dir="rtl">
            {/* Inflows */}
            <Card className="border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20 text-right">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">إجمالي المقبوضات النقدية (+)</span>
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                    <ArrowDownLeft className="h-5 w-5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2">
                  <span className="font-mono" dir="ltr">+{totalInflows.toFixed(2)} {currency}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-emerald-500/10">
                  <span>فواتير كاش: <span className="font-mono font-medium">{invoicesCash.toFixed(2)} {currency}</span></span>
                  <span>مبيعات زيت: <span className="font-mono font-medium">{oilSalesCash.toFixed(2)} {currency}</span></span>
                </div>
              </CardContent>
            </Card>

            {/* Outflows */}
            <Card className="border-rose-500/20 bg-rose-50/40 dark:bg-rose-950/20 text-right">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-800 dark:text-rose-300">إجمالي المدفوعات والمصاريف (-)</span>
                  <div className="w-8 h-8 rounded-full bg-rose-500/15 text-rose-600 flex items-center justify-center shrink-0">
                    <ArrowUpLeft className="h-5 w-5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-rose-700 dark:text-rose-400 mt-2">
                  <span className="font-mono" dir="ltr">-{totalOutflows.toFixed(2)} {currency}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-rose-500/10">
                  <span>مصاريف: <span className="font-mono font-medium">{expensesCash.toFixed(2)} {currency}</span></span>
                  <span>مشتريات/عمال: <span className="font-mono font-medium">{(oilPurchasesCash + workerPaymentsCash).toFixed(2)} {currency}</span></span>
                </div>
              </CardContent>
            </Card>

            {/* Net Expected */}
            <Card className="border-primary/20 bg-primary/5 text-right">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">النقد المفترض بالدرج</span>
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Wallet className="h-5 w-5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-primary mt-2">
                  <span className="font-mono" dir="ltr">{expectedCash.toFixed(2)} {currency}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-primary/10">
                  <span>عهدة البداية: <span className="font-mono font-medium">{openingCash.toFixed(2)} {currency}</span> | صافي الحركة: <span className="font-mono font-medium">{netMovement >= 0 ? `+${netMovement.toFixed(2)}` : netMovement.toFixed(2)} {currency}</span></span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Reconciliation Form and Shift Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" dir="rtl">
            {/* Reconciliation Form on the Right */}
            <Card className="lg:col-span-7 text-right">
              <CardHeader className="text-right">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Scale className="h-5 w-5 text-primary" />
                  <span>حاسبة مطابقة الدرج والصندوق</span>
                </CardTitle>
                <CardDescription>
                  أدخل العهدة الافتتاحية والمبلغ المعدود يدوياً لحساب الفارق
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Opening Cash Display */}
                <div className="space-y-1.5 p-3.5 rounded-2xl bg-muted/40 border text-right">
                  <div className="flex justify-between items-center">
                    <Label className="font-semibold text-sm">الرصيد الافتتاحي للجلسة (عهدة البداية)</Label>
                    <Badge variant="outline" className="text-[10px] font-mono">عهدة البداية للجلسة</Badge>
                  </div>
                  <div className="text-2xl font-black font-mono text-primary" dir="ltr">
                    {openingCash.toFixed(2)} {currency}
                  </div>
                </div>

                {/* Actual Counted Cash Input */}
                <div className="space-y-2 p-4 rounded-2xl bg-muted/30 border">
                  <div className="flex justify-between items-center">
                    <Label className="text-base font-bold text-foreground flex items-center gap-1.5">
                      <Wallet className="h-4 w-4 text-primary" />
                      <span>النقد الفعلي المعدود في الدرج الآن ({currency})</span>
                    </Label>
                    <span className="text-xs font-semibold text-primary">المبلغ الفعلي الممسوك باليد</span>
                  </div>
                  <Input
                    type="number"
                    value={actualCashStr}
                    onChange={(e) => setActualCashStr(e.target.value)}
                    placeholder="أدخل المبلغ بعد عد النقود..."
                    className="text-3xl font-black text-center h-16 border-2 border-primary/40 focus:border-primary font-mono"
                    min="0"
                    step="0.5"
                    dir="ltr"
                    lang="en-US"
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
                            <span>الصندوق متطابق تماماً بنجاح</span>
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
                      <div className="text-xl font-black font-mono" dir="ltr">
                        {Math.abs(difference) < 0.01 
                          ? "متوازن ✅" 
                          : difference > 0 
                          ? `+${difference.toFixed(2)} ${currency}` 
                          : `${difference.toFixed(2)} ${currency}`}
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes Input */}
                <div className="space-y-1.5 text-right">
                  <Label className={difference !== null && Math.abs(difference) >= 0.01 ? "text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5" : "text-xs text-muted-foreground"}>
                    {difference !== null && Math.abs(difference) >= 0.01 ? (
                      <>
                        <AlertTriangle className="h-4 w-4" />
                        <span>سبب الفرق وملاحظات الإغلاق (إجباري لوجود فرق بالصندوق) *</span>
                      </>
                    ) : (
                      <span>ملاحظات الإغلاق (اختياري)</span>
                    )}
                  </Label>
                  <Textarea
                    placeholder={
                      difference !== null && Math.abs(difference) >= 0.01
                        ? `يوجد فرق مقداره ${Math.abs(difference).toFixed(2)} ${currency}. يرجى توضيح سبب الفرق بالتفصيل هنا قبل الإغلاق...`
                        : "أي ملاحظات إضافية حول الجلسة أو تسليم الصندوق..."
                    }
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className={`resize-none text-sm text-right ${
                      difference !== null && Math.abs(difference) >= 0.01 && !notes.trim()
                        ? "border-rose-500 focus:border-rose-600"
                        : ""
                    }`}
                    dir="rtl"
                  />
                </div>

                {/* Action Buttons: Primary on Right, Secondary on Left in RTL */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    size="lg"
                    className="flex-1 h-12 text-base font-bold shadow-md hover:shadow-lg transition-all gap-2"
                    disabled={
                      actualCash === null || 
                      closing || 
                      !isOpen ||
                      (difference !== null && Math.abs(difference) >= 0.01 && !notes.trim())
                    }
                    onClick={() => handleCloseRegister(true)}
                  >
                    <Printer className="h-5 w-5" />
                    <span>اعتماد وطباعة تقرير Z (80mm)</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="sm:w-auto h-12 text-base font-semibold gap-2"
                    disabled={
                      actualCash === null || 
                      closing || 
                      !isOpen ||
                      (difference !== null && Math.abs(difference) >= 0.01 && !notes.trim())
                    }
                    onClick={() => handleCloseRegister(false)}
                  >
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <span>اعتماد الإغلاق فقط</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Shift Breakdown Card on the Left */}
            <Card className="lg:col-span-5 text-right">
              <CardHeader className="text-right">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  <span>ملخص بنود الصندوق اليومي</span>
                </CardTitle>
                <CardDescription>تفصيل حركة المقبوضات والمدفوعات</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2.5 text-sm">
                  {/* Opening */}
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">الرصيد الافتتاحي (العهدة)</span>
                    <span className="font-bold font-mono" dir="ltr">{openingCash.toFixed(2)} {currency}</span>
                  </div>

                  <div className="border-t border-dashed my-2" />

                  {/* Inflows */}
                  <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                    <span>مقبوضات الفواتير ({invoicesCount} فاتورة)</span>
                    <span className="font-bold font-mono" dir="ltr">+{invoicesCash.toFixed(2)} {currency}</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                    <span>مبيعات الزيت النقدية</span>
                    <span className="font-bold font-mono" dir="ltr">+{oilSalesCash.toFixed(2)} {currency}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-emerald-800 dark:text-emerald-300 pt-1">
                    <span>إجمالي المقبوضات</span>
                    <span className="font-mono font-bold" dir="ltr">+{totalInflows.toFixed(2)} {currency}</span>
                  </div>

                  <div className="border-t border-dashed my-2" />

                  {/* Outflows */}
                  <div className="flex justify-between items-center text-rose-700 dark:text-rose-400">
                    <span>المصاريف التشغيلية</span>
                    <span className="font-bold font-mono" dir="ltr">-{expensesCash.toFixed(2)} {currency}</span>
                  </div>
                  <div className="flex justify-between items-center text-rose-700 dark:text-rose-400">
                    <span>مشتريات الزيت النقدية</span>
                    <span className="font-bold font-mono" dir="ltr">-{oilPurchasesCash.toFixed(2)} {currency}</span>
                  </div>
                  <div className="flex justify-between items-center text-rose-700 dark:text-rose-400">
                    <span>دفعات وسلف العمال</span>
                    <span className="font-bold font-mono" dir="ltr">-{workerPaymentsCash.toFixed(2)} {currency}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-rose-800 dark:text-rose-300 pt-1">
                    <span>إجمالي المدفوعات</span>
                    <span className="font-mono font-bold" dir="ltr">-{totalOutflows.toFixed(2)} {currency}</span>
                  </div>

                  <div className="border-t-2 border-foreground/20 my-3" />

                  <div className="flex justify-between items-center text-base font-black">
                    <span>المفترض بالدرج</span>
                    <span className="text-primary text-lg font-mono" dir="ltr">{expectedCash.toFixed(2)} {currency}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: Detailed Breakdown */}
        <TabsContent value="breakdown" className="space-y-6 mt-4" dir="rtl">
          <Card className="text-right">
            <CardHeader className="text-right">
              <CardTitle className="text-lg">فواتير ومقبوضات اليوم</CardTitle>
              <CardDescription>جميع الفواتير النقدية المسجلة منذ بداية اليوم</CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">لا توجد فواتير مسجلة اليوم</p>
              ) : (
                <Table dir="rtl">
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
                        <TableCell className="text-right text-xs text-muted-foreground font-mono" dir="ltr">
                          {formatTime(inv.created_at)}
                        </TableCell>
                        <TableCell className="text-right font-medium">{inv.customer_name}</TableCell>
                        <TableCell className="text-right text-xs">
                          <Badge variant="outline">{inv.payment_type}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600">
                          <span className="font-mono" dir="ltr">
                            {Number(inv.cash_amount) > 0 ? `${Number(inv.cash_amount).toFixed(2)} ${currency}` : `0 ${currency}`}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6" dir="rtl">
            <Card className="text-right">
              <CardHeader className="text-right">
                <CardTitle className="text-base">مصاريف اليوم ({expenses.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {expenses.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-xs">لا توجد مصاريف مسجلة اليوم</p>
                ) : (
                  <div className="space-y-2">
                    {expenses.map((e) => (
                      <div key={e.id} className="flex justify-between items-center p-2.5 rounded-lg bg-muted/40 text-sm">
                        <div className="text-right">
                          <p className="font-semibold">{e.category}</p>
                          {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                        </div>
                        <span className="font-bold text-rose-600 font-mono" dir="ltr">-{Number(e.amount).toFixed(2)} {currency}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="text-right">
              <CardHeader className="text-right">
                <CardTitle className="text-base">مبيعات ومشتريات الزيت</CardTitle>
              </CardHeader>
              <CardContent>
                {oilSales.length === 0 && oilPurchases.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-xs">لا توجد عمليات زيت اليوم</p>
                ) : (
                  <div className="space-y-2">
                    {oilSales.map((s) => (
                      <div key={s.id} className="flex justify-between items-center p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-sm">
                        <div className="text-right">
                          <p className="font-semibold text-emerald-800 dark:text-emerald-300">بيع زيت ({s.amount} كغم)</p>
                          {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                        </div>
                        <span className="font-bold text-emerald-600 font-mono" dir="ltr">+{Number(s.total_price).toFixed(2)} {currency}</span>
                      </div>
                    ))}
                    {oilPurchases.map((p) => (
                      <div key={p.id} className="flex justify-between items-center p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-sm">
                        <div className="text-right">
                          <p className="font-semibold text-rose-800 dark:text-rose-300">شراء زيت ({p.amount} كغم)</p>
                          {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                        </div>
                        <span className="font-bold text-rose-600 font-mono" dir="ltr">-{Number(p.total_price).toFixed(2)} {currency}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: Today-only Statistics (Informational only) */}
        <TabsContent value="today-stats" className="space-y-6 mt-4" dir="rtl">
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 dark:text-blue-200">
              <p className="font-bold text-sm mb-0.5">إحصائيات اليوم الاسترشادية (منذ منتصف الليل 00:00)</p>
              <p>هذا القسم مخصص للمتابعة الإحصائية لليوم الحالي فقط، ولا يؤثر على تسوية الصندوق، حيث أن جلسة الصندوق تستمر عبر الأيام حتى يقوم المستخدم بإغلاقها يدوياً.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 text-right bg-muted/30">
              <span className="text-xs text-muted-foreground">فواتير اليوم ({todayInvoices.length})</span>
              <p className="text-xl font-bold font-mono text-emerald-600 mt-1" dir="ltr">
                +{todayInvoices.reduce((sum, i) => sum + (Number(i.cash_amount) || 0), 0).toFixed(2)} {currency}
              </p>
            </Card>
            <Card className="p-4 text-right bg-muted/30">
              <span className="text-xs text-muted-foreground">مصاريف اليوم ({todayExpenses.length})</span>
              <p className="text-xl font-bold font-mono text-rose-600 mt-1" dir="ltr">
                -{todayExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0).toFixed(2)} {currency}
              </p>
            </Card>
            <Card className="p-4 text-right bg-muted/30">
              <span className="text-xs text-muted-foreground">عمليات زيت اليوم ({todayOilSales.length + todayOilPurchases.length})</span>
              <p className="text-xl font-bold font-mono text-primary mt-1" dir="ltr">
                {(todayOilSales.reduce((s, o) => s + Number(o.total_price || 0), 0) - todayOilPurchases.reduce((s, o) => s + Number(o.total_price || 0), 0)).toFixed(2)} {currency}
              </p>
            </Card>
          </div>

          <Card className="text-right">
            <CardHeader className="text-right">
              <CardTitle className="text-base">فواتير اليوم النقدية ({todayInvoices.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {todayInvoices.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground text-xs">لا توجد فواتير مسجلة اليوم</p>
              ) : (
                <Table dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الوقت</TableHead>
                      <TableHead className="text-right">اسم المزارع</TableHead>
                      <TableHead className="text-right">المقبوض النقدي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todayInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-right text-xs font-mono" dir="ltr">{formatTime(inv.created_at)}</TableCell>
                        <TableCell className="text-right font-medium">{inv.customer_name}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-600 font-mono" dir="ltr">
                          +{Number(inv.cash_amount || 0).toFixed(2)} {currency}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: Past Closings History */}
        <TabsContent value="history" className="space-y-4 mt-4" dir="rtl">
          <Card className="text-right">
            <CardHeader className="text-right">
              <CardTitle className="text-lg">سجل الإغلاقات وتقارير Z السابقة</CardTitle>
              <CardDescription>استعراض الإغلاقات المعتمدة وإعادة طباعة تقرير Z</CardDescription>
            </CardHeader>
            <CardContent>
              {closingsHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="text-base">لم يتم اعتماد أي إغلاق صندوق حتى الآن</p>
                  <p className="text-xs mt-1">عند إغلاق الجلسة سيتم حفظ التقرير هنا تلقائياً</p>
                </div>
              ) : (
                <Table dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">تاريخ ووقت الإغلاق</TableHead>
                      <TableHead className="text-right">مدة الجلسة</TableHead>
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
                          <TableCell className="text-right text-xs font-medium font-mono" dir="ltr">
                            {formatDate(rec.closing_date)} - {formatTime(rec.closing_date)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {rec.opened_at ? formatSessionDuration(rec.opened_at, rec.closing_date) : "-"}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold">{rec.cashier_name}</TableCell>
                          <TableCell className="text-right text-xs font-mono" dir="ltr">{rec.opening_cash} {currency}</TableCell>
                          <TableCell className="text-right text-xs text-emerald-600 font-bold font-mono" dir="ltr">+{rec.total_inflows.toFixed(2)} {currency}</TableCell>
                          <TableCell className="text-right text-xs text-rose-600 font-bold font-mono" dir="ltr">-{rec.total_outflows.toFixed(2)} {currency}</TableCell>
                          <TableCell className="text-right text-xs font-bold font-mono" dir="ltr">{rec.expected_cash.toFixed(2)} {currency}</TableCell>
                          <TableCell className="text-right text-xs font-bold text-primary font-mono" dir="ltr">{rec.actual_cash.toFixed(2)} {currency}</TableCell>
                          <TableCell className="text-right text-xs">
                            <Badge 
                              variant={Math.abs(diff) < 0.01 ? "secondary" : diff > 0 ? "outline" : "destructive"}
                              className="text-[11px] font-mono"
                              dir="ltr"
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

      {/* Open Session Dialog */}
      <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="h-5 w-5 text-emerald-500" />
              فتح الصندوق
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              أدخل الرصيد الافتتاحي (المبلغ الموجود في الدرج لحظة الفتح):
            </p>
            <div className="space-y-1.5">
              <Label>الرصيد الافتتاحي ({currency})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={openBalanceInput}
                onChange={(e) => setOpenBalanceInput(e.target.value)}
                placeholder="0"
                className="text-right"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleOpenFromPage()}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowOpenDialog(false)} disabled={openLoading}>
              إلغاء
            </Button>
            <Button
              onClick={handleOpenFromPage}
              disabled={openLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {openLoading ? "جاري الفتح..." : "فتح الصندوق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
