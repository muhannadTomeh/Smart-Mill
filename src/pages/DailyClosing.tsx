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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Calculator, 
  Receipt, 
  Wallet, 
  CheckCircle2, 
  AlertTriangle, 
  Printer, 
  History, 
  ArrowDownLeft, 
  ArrowUpLeft, 
  Scale, 
  RefreshCw,
  Clock,
  Coins,
  ShieldCheck,
  Eye,
  EyeOff,
  UserCheck,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useRole } from "@/contexts/RoleContext";
import { useCurrency } from "@/hooks/useCurrency";
import { 
  printThermalZReport, 
  printThermalShiftReceipt,
  type ThermalZReportData, 
  type ThermalShiftReceiptData 
} from "@/lib/thermalReceiptPrinter";
import { formatDate, formatTime } from "@/lib/formatters";

// Record for official end-of-day Z-Report closing
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

// Record for Cashier Shift Handover (Blind Drop)
export interface ShiftHandoverRecord {
  id: string;
  shift_date: string;
  season_id: string;
  cashier_name: string;
  cashier_id?: string;
  opening_cash: number;
  actual_cash: number;
  expected_cash: number;
  difference: number;
  invoices_cash: number;
  invoices_count: number;
  oil_sales_cash: number;
  expenses_cash: number;
  oil_purchases_cash: number;
  worker_payments_cash: number;
  total_inflows: number;
  total_outflows: number;
  notes?: string;
  denominations?: { [denom: string]: number };
}

const COMMON_DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1, 0.5];

export default function DailyClosing() {
  const { user, currentMillId, effectiveUserId, profile } = useAuth();
  const { activeSeason } = useSeason();
  const { isEmployee } = useRole();
  const { currency } = useCurrency();
  const targetMillId = currentMillId || effectiveUserId || user?.id;
  const targetUserId = targetMillId;
  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";
  const cashierName = profile?.display_name || user?.email?.split("@")[0] || "مسؤول الصندوق";

  // Mode toggles
  const [adminPreviewCashierMode, setAdminPreviewCashierMode] = useState(false);
  const isBlindMode = isEmployee || adminPreviewCashierMode;

  const [loading, setLoading] = useState(true);
  const [openingCash, setOpeningCash] = useState<number>(0);
  const [actualCashStr, setActualCashStr] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [closing, setClosing] = useState(false);

  // Cash Denomination counter state
  const [showDenomCounter, setShowDenomCounter] = useState(false);
  const [denominations, setDenominations] = useState<{ [denom: string]: number }>({});

  // Handover confirmation modal
  const [confirmHandoverOpen, setConfirmHandoverOpen] = useState(false);
  const [submittedShift, setSubmittedShift] = useState<ShiftHandoverRecord | null>(null);

  // Inflow / Outflow raw records
  const [invoices, setInvoices] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [oilSales, setOilSales] = useState<any[]>([]);
  const [oilPurchases, setOilPurchases] = useState<any[]>([]);
  const [workerPayments, setWorkerPayments] = useState<any[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);

  // Stored Closings & Shift Handovers
  const [closingsHistory, setClosingsHistory] = useState<DailyClosingRecord[]>([]);
  const [shiftHandovers, setShiftHandovers] = useState<ShiftHandoverRecord[]>([]);

  const closingStorageKey = useMemo(() => {
    return activeSeason ? `mill_daily_closings_${activeSeason.id}` : "mill_daily_closings";
  }, [activeSeason]);

  const shiftStorageKey = useMemo(() => {
    return activeSeason ? `mill_shift_handovers_${activeSeason.id}` : "mill_shift_handovers";
  }, [activeSeason]);

  // Load history Database-first from Supabase daily_closings
  const loadHistory = async () => {
    if (!targetUserId || !activeSeason) return;

    try {
      const { data, error } = await supabase
        .from("daily_closings")
        .select("*")
        .eq("season_id", activeSeason.id)
        .order("closing_date", { ascending: false });

      if (!error && data && data.length > 0) {
        const parsed: DailyClosingRecord[] = data.map((d: any) => ({
          id: d.id,
          closing_date: d.closing_date,
          season_id: d.season_id,
          cashier_name: d.cashier_name,
          opening_cash: Number(d.opening_cash) || 0,
          invoices_cash: Number(d.invoices_cash) || 0,
          invoices_count: Number(d.invoices_count) || 0,
          oil_sales_cash: Number(d.oil_sales_cash) || 0,
          total_inflows: Number(d.total_cash_in) || 0,
          expenses_cash: Number(d.expenses_cash) || 0,
          oil_purchases_cash: Number(d.oil_purchases_cash) || 0,
          worker_payments_cash: Number(d.worker_payments_cash) || 0,
          total_outflows: Number(d.total_cash_out) || 0,
          net_movement: (Number(d.total_cash_in) || 0) - (Number(d.total_cash_out) || 0),
          expected_cash: Number(d.expected_cash) || 0,
          actual_cash: Number(d.actual_cash) || 0,
          difference: Number(d.difference) || 0,
          notes: d.notes || undefined,
        }));
        setClosingsHistory(parsed);
        if (parsed[0]?.actual_cash !== undefined) {
          setOpeningCash(Number(parsed[0].actual_cash) || 0);
        }
        localStorage.setItem(closingStorageKey, JSON.stringify(parsed));
      } else {
        // Fallback to localStorage cache
        const storedClosings = localStorage.getItem(closingStorageKey);
        if (storedClosings) {
          const parsed = JSON.parse(storedClosings);
          if (Array.isArray(parsed)) {
            setClosingsHistory(parsed);
            if (parsed.length > 0 && parsed[0]?.actual_cash !== undefined) {
              setOpeningCash(Number(parsed[0].actual_cash) || 0);
            }
          }
        }
      }
    } catch (e) {
      console.warn("DB daily_closings load fallback to localStorage", e);
      const storedClosings = localStorage.getItem(closingStorageKey);
      if (storedClosings) {
        const parsed = JSON.parse(storedClosings);
        if (Array.isArray(parsed)) {
          setClosingsHistory(parsed);
          if (parsed.length > 0 && parsed[0]?.actual_cash !== undefined) {
            setOpeningCash(Number(parsed[0].actual_cash) || 0);
          }
        }
      }
    }

    // Load Shift Handovers cache
    try {
      const storedShifts = localStorage.getItem(shiftStorageKey);
      if (storedShifts) {
        const parsedShifts = JSON.parse(storedShifts);
        if (Array.isArray(parsedShifts)) {
          setShiftHandovers(parsedShifts);
        }
      }
    } catch (e) {
      console.error("Error loading shift history", e);
    }
  };

  const fetchTodayData = async () => {
    if (!targetUserId || !activeSeason) return;
    setLoading(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfTodayIso = today.toISOString();

    try {
      const [invRes, expRes, salesRes, purRes, wpRes, cpRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
          .eq("season_id", activeSeason.id)
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("expenses")
          .select("*")
          .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
          .eq("season_id", activeSeason.id)
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("oil_transactions")
          .select("*")
          .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
          .eq("season_id", activeSeason.id)
          .eq("type", "sell")
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("oil_transactions")
          .select("*")
          .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
          .eq("season_id", activeSeason.id)
          .eq("type", "buy")
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("worker_payments")
          .select("*")
          .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
          .eq("season_id", activeSeason.id)
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_payments")
          .select("*")
          .or(`mill_id.eq.${targetMillId},season_id.eq.${activeSeason.id}`)
          .gte("created_at", startOfTodayIso)
          .order("created_at", { ascending: false }),
      ]);

      setInvoices(invRes.data || []);
      setExpenses(expRes.data || []);
      setOilSales(salesRes.data || []);
      setOilPurchases(purRes.data || []);
      setWorkerPayments(wpRes.data || []);
      setCustomerPayments(cpRes.data || []);
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

  // Handle denomination count change
  const handleDenomChange = (denom: number, count: number) => {
    const updated = { ...denominations, [denom.toString()]: Math.max(0, count) };
    setDenominations(updated);

    // Sum all denominations
    let total = 0;
    Object.entries(updated).forEach(([d, c]) => {
      total += parseFloat(d) * (Number(c) || 0);
    });

    setActualCashStr(total > 0 ? total.toFixed(2) : "");
  };

  // Reset shift form for new entry
  const handleStartNewShift = () => {
    setSubmittedShift(null);
    setActualCashStr("");
    setDenominations({});
    setNotes("");
    fetchTodayData();
    toast.info("تم بدء جلسة عد جديدة");
  };

  // ==================== CASHIER BLIND SHIFT HANDOVER ====================
  const handleConfirmShiftHandover = async () => {
    if (actualCash === null || isNaN(actualCash)) {
      toast.error("يرجى إدخال المبلغ الفعلي المعدود أولاً");
      return;
    }

    setClosing(true);

    const shiftRecord: ShiftHandoverRecord = {
      id: "SH-" + Date.now().toString().slice(-6),
      shift_date: new Date().toISOString(),
      season_id: activeSeason?.id || "",
      cashier_name: cashierName,
      cashier_id: user?.id,
      opening_cash: openingCash,
      actual_cash: actualCash,
      expected_cash: expectedCash,
      difference: difference || 0,
      invoices_cash: invoicesCash,
      invoices_count: invoicesCount,
      oil_sales_cash: oilSalesCash,
      expenses_cash: expensesCash,
      oil_purchases_cash: oilPurchasesCash,
      worker_payments_cash: workerPaymentsCash,
      total_inflows: totalInflows,
      total_outflows: totalOutflows,
      notes: notes.trim() || undefined,
      denominations: Object.keys(denominations).length > 0 ? denominations : undefined,
    };

    try {
      // 1. Save to local storage shifts
      const existingShifts = [shiftRecord, ...shiftHandovers];
      localStorage.setItem(shiftStorageKey, JSON.stringify(existingShifts));
      setShiftHandovers(existingShifts);

      // 2. Also record in closings history so the day's record updates
      const existingClosings = [
        {
          id: "Z-" + shiftRecord.id.replace("SH-", ""),
          closing_date: shiftRecord.shift_date,
          season_id: shiftRecord.season_id,
          cashier_name: shiftRecord.cashier_name,
          opening_cash: shiftRecord.opening_cash,
          invoices_cash: shiftRecord.invoices_cash,
          invoices_count: shiftRecord.invoices_count,
          oil_sales_cash: shiftRecord.oil_sales_cash,
          total_inflows: shiftRecord.total_inflows,
          expenses_cash: shiftRecord.expenses_cash,
          oil_purchases_cash: shiftRecord.oil_purchases_cash,
          worker_payments_cash: shiftRecord.worker_payments_cash,
          total_outflows: shiftRecord.total_outflows,
          net_movement: netMovement,
          expected_cash: shiftRecord.expected_cash,
          actual_cash: shiftRecord.actual_cash,
          difference: shiftRecord.difference,
          notes: shiftRecord.notes,
        },
        ...closingsHistory,
      ];
      localStorage.setItem(closingStorageKey, JSON.stringify(existingClosings));
      setClosingsHistory(existingClosings);

      // 3. Database-first: Save to Supabase daily_closings table
      try {
        const { data: dbData } = await supabase.from("daily_closings").insert({
          mill_id: targetUserId!,
          season_id: activeSeason!.id,
          closing_date: shiftRecord.shift_date,
          cashier_name: cashierName,
          opening_cash: openingCash,
          total_cash_in: totalInflows,
          total_cash_out: totalOutflows,
          expected_cash: expectedCash,
          actual_cash: actualCash,
          difference: difference || 0,
          invoices_cash: invoicesCash,
          invoices_count: invoicesCount,
          oil_sales_cash: oilSalesCash,
          expenses_cash: expensesCash,
          oil_purchases_cash: oilPurchasesCash,
          worker_payments_cash: workerPaymentsCash,
          notes: notes.trim() || null,
          created_by: user?.id,
        }).select().single();

        // If cash discrepancy exists, record audit adjustment in financial_transactions
        if (difference && Math.abs(difference) > 0.01) {
          await supabase.from("financial_transactions").insert({
            mill_id: targetUserId!,
            season_id: activeSeason!.id,
            type: "adjustment",
            category: "cash_reconciliation",
            amount: Math.abs(difference),
            direction: difference > 0 ? "in" : "out",
            payment_method: "cash",
            reference_type: "daily_closing",
            reference_id: dbData?.id,
            description: `تسوية فارق عد الكاشير (${difference > 0 ? "فائض نقد" : "عجز نقد"}: ${Math.abs(difference)} ${currency})`,
            created_by: user?.id,
          });
        }
      } catch (err) {
        console.warn("Could not save daily_closings to DB, cached locally", err);
      }

      setSubmittedShift(shiftRecord);
      setConfirmHandoverOpen(false);
      toast.success("تم تسليم الوردية واعتماد الإغلاق بنجاح!");
    } catch (e) {
      console.error("Failed to submit shift handover", e);
      toast.error("حدث خطأ أثناء حفظ تسليم الوردية");
    } finally {
      setClosing(false);
    }
  };

  // Print thermal slip for shift
  const handlePrintShiftReceipt = (shift: ShiftHandoverRecord, showFinancialDetails = false) => {
    printThermalShiftReceipt(
      {
        shift_id: shift.id,
        handover_date: shift.shift_date,
        season_name: activeSeason?.name,
        cashier_name: shift.cashier_name,
        opening_cash: shift.opening_cash,
        actual_cash: shift.actual_cash,
        expected_cash: shift.expected_cash,
        difference: shift.difference,
        show_financial_details: showFinancialDetails,
        invoices_count: shift.invoices_count,
        notes: shift.notes,
        denominations: shift.denominations,
      },
      millName,
      currency
    );
  };

  // ==================== MANAGER OFFICIAL FULL DAY CLOSING ====================
  const handleManagerCloseRegister = async (shouldPrint = false) => {
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

    try {
      const existing = [record, ...closingsHistory];
      localStorage.setItem(closingStorageKey, JSON.stringify(existing));
      setClosingsHistory(existing);

      // Database-first: Save to Supabase daily_closings table
      try {
        const { data: dbData } = await supabase.from("daily_closings").insert({
          mill_id: targetUserId!,
          season_id: activeSeason!.id,
          closing_date: record.closing_date,
          cashier_name: cashierName,
          opening_cash: openingCash,
          total_cash_in: totalInflows,
          total_cash_out: totalOutflows,
          expected_cash: expectedCash,
          actual_cash: actualCash,
          difference: difference || 0,
          invoices_cash: invoicesCash,
          invoices_count: invoicesCount,
          oil_sales_cash: oilSalesCash,
          expenses_cash: expensesCash,
          oil_purchases_cash: oilPurchasesCash,
          worker_payments_cash: workerPaymentsCash,
          notes: notes.trim() || null,
          created_by: user?.id,
        }).select().single();

        // If cash discrepancy exists, record audit adjustment in financial_transactions
        if (difference && Math.abs(difference) > 0.01) {
          await supabase.from("financial_transactions").insert({
            mill_id: targetUserId!,
            season_id: activeSeason!.id,
            type: "adjustment",
            category: "cash_reconciliation",
            amount: Math.abs(difference),
            direction: difference > 0 ? "in" : "out",
            payment_method: "cash",
            reference_type: "daily_closing",
            reference_id: dbData?.id,
            description: `تسوية فارق إغلاق الصندوق الرسمي (${difference > 0 ? "فائض نقد" : "عجز نقد"}: ${Math.abs(difference)} ${currency})`,
            created_by: user?.id,
          });
        }
      } catch (err) {
        console.warn("Could not save daily_closings to DB, cached locally", err);
      }

      if (shouldPrint) {
        printThermalZReport(
          {
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
          },
          millName,
          currency
        );
      }

      toast.success(shouldPrint ? "تم إغلاق الصندوق وطباعة تقرير Z بنجاح" : "تم اعتماد إغلاق الصندوق بنجاح");
    } catch (e) {
      console.error("Failed to close register", e);
      toast.error("حدث خطأ أثناء حفظ الإغلاق");
    } finally {
      setClosing(false);
    }
  };

  const reprintPastZReport = (record: DailyClosingRecord) => {
    printThermalZReport(
      {
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
      },
      millName,
      currency
    );
    toast.success("تم إرسال أمر إعادة طباعة تقرير Z");
  };

  // =========================================================================
  // VIEW 1: CASHIER BLIND SHIFT HANDOVER (For Employee or Admin Testing)
  // =========================================================================
  if (isBlindMode) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-card to-muted/40 border shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
              <Coins className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-foreground">تسليم وردية الصندوق (الكاشير)</h1>
                <Badge variant="outline" className="text-[11px] font-semibold bg-primary/5 text-primary border-primary/20">
                  نظام الإدخال الأعمى (Blind Drop)
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                عد النقدية الفعلية الموجودة بالدرج وتسليمها للإدارة بدون الاطلاع على إحصائيات المعصرة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Owner toggle preview back */}
            {!isEmployee && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAdminPreviewCashierMode(false)}
                className="gap-1.5 text-xs font-semibold bg-background hover:bg-muted"
              >
                <Eye className="h-3.5 w-3.5 text-primary" />
                العودة للوحة الإدارة
              </Button>
            )}

            <Badge variant="secondary" className="px-3 py-1.5 gap-1.5 text-xs font-mono">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>{formatDate(new Date())}</span>
            </Badge>
          </div>
        </div>

        {/* Cashier Info Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-xl bg-card border flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
              <UserCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">الكاشير المسلّم</p>
              <p className="text-sm font-bold text-foreground">{cashierName}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-card border flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">توقيت الوردية</p>
              <p className="text-sm font-bold text-foreground font-mono">{formatTime(new Date())}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-card border flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">حالة الحماية</p>
              <p className="text-xs font-bold text-emerald-600">تسليم موثق ومطابق محاسبياً</p>
            </div>
          </div>
        </div>

        {/* SUBMITTED STATE: When shift is already handed over */}
        {submittedShift ? (
          <Card className="border-2 border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10 overflow-hidden shadow-lg">
            <div className="h-2 bg-emerald-500 w-full" />
            <CardHeader className="text-center pb-3 pt-6">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-600 mx-auto flex items-center justify-center mb-3">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <CardTitle className="text-2xl font-black text-emerald-800 dark:text-emerald-300">
                تم تسليم الوردية بنجاح!
              </CardTitle>
              <CardDescription className="text-sm">
                رقم تسليم الوردية: <span className="font-mono font-bold text-foreground">#{submittedShift.id}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-2">
              {/* Handover Details Summary */}
              <div className="p-5 rounded-2xl bg-card border space-y-3 max-w-lg mx-auto">
                <div className="flex justify-between items-center text-sm py-1 border-b">
                  <span className="text-muted-foreground">الكاشير المسلّم:</span>
                  <span className="font-bold">{submittedShift.cashier_name}</span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 border-b">
                  <span className="text-muted-foreground">تاريخ ووقت التسليم:</span>
                  <span className="font-mono font-semibold" dir="ltr">
                    {formatDate(submittedShift.shift_date)} {formatTime(submittedShift.shift_date)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm py-1 border-b">
                  <span className="text-muted-foreground">عهدة البداية:</span>
                  <span className="font-mono font-bold">{submittedShift.opening_cash.toFixed(2)} {currency}</span>
                </div>
                <div className="flex justify-between items-center text-base py-2 bg-primary/5 rounded-xl px-3 border border-primary/20">
                  <span className="font-bold text-foreground">إجمالي النقد المسلّم:</span>
                  <span className="font-mono font-black text-xl text-primary" dir="ltr">
                    {submittedShift.actual_cash.toFixed(2)} {currency}
                  </span>
                </div>

                {/* Verification result */}
                <div
                  className={`p-3.5 rounded-xl border text-center font-bold text-sm ${
                    Math.abs(submittedShift.difference) < 0.01
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                      : submittedShift.difference > 0
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
                  }`}
                >
                  {Math.abs(submittedShift.difference) < 0.01 ? (
                    <span>✅ الصندوق متطابق تماماً بنجاح (الفارق: 0 {currency})</span>
                  ) : submittedShift.difference > 0 ? (
                    <span>ℹ️ يوجد فائض نقدي تم تسجيله للتدقيق: +{submittedShift.difference.toFixed(2)} {currency}</span>
                  ) : (
                    <span>⚠️ يوجد عجز نقدي تم تسجيله للتدقيق: {submittedShift.difference.toFixed(2)} {currency}</span>
                  )}
                </div>

                {submittedShift.notes && (
                  <div className="text-xs text-muted-foreground p-2 rounded-lg bg-muted/40">
                    <span className="font-semibold">الملاحظات: </span>
                    {submittedShift.notes}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row justify-center gap-3 max-w-lg mx-auto">
                <Button
                  size="lg"
                  className="flex-1 h-12 text-base font-bold gap-2 shadow-md hover:shadow-lg"
                  onClick={() => handlePrintShiftReceipt(submittedShift, false)}
                >
                  <Printer className="h-5 w-5" />
                  <span>طباعة إيصال تسليم الوردية (80mm)</span>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 text-sm font-semibold gap-1.5"
                  onClick={handleStartNewShift}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>بدء وردية جديدة</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* ACTIVE BLIND DROP FORM */
          <Card className="border shadow-md">
            <CardHeader className="border-b bg-card">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                <span>استمارة تسليم وردية الكاشير</span>
              </CardTitle>
              <CardDescription>
                أدخل الرصيد الافتتاحي والنقد الفعلي المعدود بدقة. لن تظهر أرقام مبيعات النظام قبل الاعتماد.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* 1. Opening Cash Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="font-bold text-sm">عهدة البداية (الرصيد الافتتاحي بالدرج)</Label>
                  <span className="text-xs text-muted-foreground">المبلغ المستلم عند بدء الوردية</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={openingCash || ""}
                    onChange={(e) => setOpeningCash(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="text-lg font-bold text-center h-12 flex-1 font-mono"
                    min="0"
                    dir="ltr"
                    lang="en-US"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    {[0, 50, 100, 200, 500].map((val) => (
                      <Button
                        key={val}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOpeningCash(val)}
                        className="text-xs font-semibold px-2.5 h-12"
                      >
                        {val === 0 ? "صفر" : `${val} ${currency}`}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. Optional Denomination Counter Accordion */}
              <div className="rounded-2xl border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-primary" />
                    <span className="font-bold text-sm">حاسبة عد الفئات النقدية (ورقة وقطعة)</span>
                    <Badge variant="secondary" className="text-[10px]">اختياري ومساعد</Badge>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDenomCounter(!showDenomCounter)}
                    className="gap-1 text-xs text-primary font-semibold h-8"
                  >
                    {showDenomCounter ? (
                      <>
                        <span>إخفاء الحاسبة</span>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </>
                    ) : (
                      <>
                        <span>فتح الحاسبة للعد الدقيق</span>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>

                {showDenomCounter && (
                  <div className="pt-3 border-t border-border/60 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      أدخل عدد الأوراق أو القطع لكل فئة، وسيتم حساب الإجمالي تلقائياً في حقل النقد الفعلي:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {COMMON_DENOMINATIONS.map((denom) => {
                        const count = denominations[denom.toString()] || 0;
                        const subtotal = denom * count;
                        return (
                          <div key={denom} className="p-2.5 rounded-xl bg-card border space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-primary">فئة {denom}</span>
                              <span className="font-mono text-muted-foreground">{subtotal.toFixed(1)} {currency}</span>
                            </div>
                            <Input
                              type="number"
                              min="0"
                              placeholder="عدد"
                              value={count || ""}
                              onChange={(e) => handleDenomChange(denom, parseInt(e.target.value) || 0)}
                              className="text-center font-mono font-bold h-9 text-sm"
                              dir="ltr"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Actual Cash Counted - Prominent Large Field */}
              <div className="space-y-2 p-5 rounded-2xl bg-primary/5 border-2 border-primary/30">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-black text-foreground flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" />
                    <span>إجمالي النقد الفعلي الموجود في الدرج الآن ({currency}) *</span>
                  </Label>
                  <Badge variant="outline" className="bg-background text-primary font-bold">
                    المبلغ الممسوك باليد
                  </Badge>
                </div>
                <Input
                  type="number"
                  value={actualCashStr}
                  onChange={(e) => setActualCashStr(e.target.value)}
                  placeholder="أدخل المبلغ بعد عد النقود يدوياً..."
                  className="text-3xl sm:text-4xl font-black text-center h-18 sm:h-20 border-2 border-primary/50 focus:border-primary font-mono shadow-inner bg-background"
                  min="0"
                  step="0.5"
                  dir="ltr"
                  lang="en-US"
                />
                <p className="text-xs text-muted-foreground text-center">
                  قم بعد كافة الأوراق والقطع النقدية في الدرج وأدخل المجموع النهائي هنا
                </p>
              </div>

              {/* 4. Shift Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">ملاحظات الوردية للكاشير (اختياري)</Label>
                <Textarea
                  placeholder="أي ملاحظات حول الوردية، فواتير معلقة، أوراق تالفة، أو تنبيه للإدارة..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="resize-none text-sm text-right"
                  dir="rtl"
                />
              </div>

              {/* 5. Submit Button */}
              <div className="pt-2">
                <Button
                  size="lg"
                  className="w-full h-14 text-lg font-black gap-2.5 shadow-lg hover:shadow-xl transition-all"
                  disabled={actualCash === null || closing}
                  onClick={() => setConfirmHandoverOpen(true)}
                >
                  <CheckCircle2 className="h-6 w-6" />
                  <span>تسليم الوردية واعتماد الإغلاق</span>
                </Button>
                <p className="text-[11px] text-muted-foreground text-center mt-2">
                  عند النقر ستظهر نافذة تأكيد لتثبيت المبلغ، ولن يمكن التعديل عليه بعد الاعتماد
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confirmation Modal */}
        <AlertDialog open={confirmHandoverOpen} onOpenChange={setConfirmHandoverOpen}>
          <AlertDialogContent dir="rtl" className="text-right">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-xl font-bold">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <span>تأكيد تسليم وردية الصندوق</span>
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3 pt-2 text-sm">
                <p>أنت على وشك اعتماد تسليم الوردية وإغلاق جلسة الكاشير الحالية.</p>
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-1">
                  <span className="text-xs text-muted-foreground">إجمالي المبلغ الفعلي المعدود المسلّم:</span>
                  <div className="text-3xl font-black text-primary font-mono" dir="ltr">
                    {actualCash !== null ? actualCash.toFixed(2) : "0.00"} {currency}
                  </div>
                </div>
                <p className="text-xs text-rose-600 font-semibold">
                  ⚠️ يرجى التأكد من عد النقود بدقة تامة، حيث سيتم توثيق هذا المبلغ فوراً في النظام ولن يمكن التعديل عليه بعد الاعتماد.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2 justify-end sm:justify-end">
              <AlertDialogCancel disabled={closing}>مراجعة المبلغ</AlertDialogCancel>
              <AlertDialogAction
                disabled={closing}
                onClick={handleConfirmShiftHandover}
                className="font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {closing ? "جاري الاعتماد..." : "نعم، أؤكد تسليم الوردية"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: FULL MANAGER / OWNER DASHBOARD (Reconciliation, Shifts Log, Reports)
  // =========================================================================
  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
            <Calculator className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-foreground">إغلاق الصندوق ومطابقة الورديات</h1>
              <Badge variant="default" className="text-[11px] font-semibold bg-emerald-600">
                لوحة الإدارة
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              مراجعة تسليمات الكاشير، مطابقة النقدية مع المقبوضات والمصروفات واستخراج تقارير Z
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Toggle Cashier Preview */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdminPreviewCashierMode(true)}
            className="gap-1.5 text-xs font-semibold hover:border-primary"
            title="تجربة الشاشة التي يراها موظف الكاشير عند تسليم الوردية"
          >
            <Eye className="h-3.5 w-3.5 text-primary" />
            معاينة شاشة الكاشير (Blind Drop)
          </Button>

          <Button variant="outline" size="sm" onClick={fetchTodayData} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>

          <Badge variant="secondary" className="px-3 py-1.5 gap-1.5 text-xs font-mono">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>{formatDate(new Date())}</span>
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="reconcile" className="w-full" dir="rtl">
        <div className="flex justify-start">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="reconcile" className="gap-2 text-xs sm:text-sm">
              <Scale className="h-4 w-4" />
              <span>مطابقة الصندوق</span>
            </TabsTrigger>
            <TabsTrigger value="shifts" className="gap-2 text-xs sm:text-sm">
              <Coins className="h-4 w-4" />
              <span>تسليمات الورديات ({shiftHandovers.length})</span>
            </TabsTrigger>
            <TabsTrigger value="breakdown" className="gap-2 text-xs sm:text-sm">
              <Receipt className="h-4 w-4" />
              <span>حركة اليوم ({invoicesCount + expenses.length + oilSales.length + oilPurchases.length + workerPayments.length})</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 text-xs sm:text-sm">
              <History className="h-4 w-4" />
              <span>تقارير Z ({closingsHistory.length})</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ================= TAB 1: LIVE RECONCILIATION ================= */}
        <TabsContent value="reconcile" className="space-y-6 mt-4" dir="rtl">
          {/* 3 Quick KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" dir="rtl">
            {/* Inflows */}
            <Card className="border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20 text-right shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">إجمالي المقبوضات النقدية (+)</span>
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
            <Card className="border-rose-500/20 bg-rose-50/40 dark:bg-rose-950/20 text-right shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-800 dark:text-rose-300">إجمالي المدفوعات والمصاريف (-)</span>
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
            <Card className="border-primary/20 bg-primary/5 text-right shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">النقد المفترض بالدرج (=)</span>
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
                  أدخل العهدة الافتتاحية والمبلغ المعدود يدوياً لحساب الفارق واعتماد التقرير
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Opening Cash Input */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="font-semibold text-sm">الرصيد الافتتاحي للصندوق (عهدة البداية)</Label>
                    <span className="text-xs text-muted-foreground">الرصيد المنقول من بداية اليوم</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={openingCash || ""}
                      onChange={(e) => setOpeningCash(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="text-lg font-bold text-center h-12 flex-1 font-mono"
                      min="0"
                      dir="ltr"
                      lang="en-US"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      {[0, 100, 200, 500].map((val) => (
                        <Button
                          key={val}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setOpeningCash(val)}
                          className="text-xs font-semibold px-2.5 h-12"
                        >
                          {val === 0 ? "صفر" : `${val} ${currency}`}
                        </Button>
                      ))}
                    </div>
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
                  <Label className="text-xs text-muted-foreground">ملاحظات الإغلاق (اختياري)</Label>
                  <Textarea
                    placeholder="أي ملاحظات حول الوردية، سبب العجز أو الفائض، اسم مستلم الوردية..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="resize-none text-sm text-right"
                    dir="rtl"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    size="lg"
                    className="flex-1 h-12 text-base font-bold shadow-md hover:shadow-lg transition-all gap-2"
                    disabled={actualCash === null || closing}
                    onClick={() => handleManagerCloseRegister(true)}
                  >
                    <Printer className="h-5 w-5" />
                    <span>اعتماد وطباعة تقرير Z (80mm)</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="sm:w-auto h-12 text-base font-semibold gap-2"
                    disabled={actualCash === null || closing}
                    onClick={() => handleManagerCloseRegister(false)}
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

        {/* ================= TAB 2: SHIFT HANDOVERS LOG ================= */}
        <TabsContent value="shifts" className="space-y-4 mt-4" dir="rtl">
          <Card className="text-right">
            <CardHeader className="text-right">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Coins className="h-5 w-5 text-primary" />
                    <span>سجل تسليمات الورديات (Shift Handovers)</span>
                  </CardTitle>
                  <CardDescription>
                    توثيق استلام المبالغ النقدية من موظفي الكاشير بنظام الإدخال الأعمى وتدقيق الفوارق
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="font-mono">
                  {shiftHandovers.length} وردية مسجلة
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {shiftHandovers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Coins className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="text-base font-semibold">لا توجد تسليمات ورديات مسجلة حتى الآن</p>
                  <p className="text-xs mt-1">عندما يقوم الكاشير بتسليم ورديته، سيظهر سجله وتدقيق مبلغه هنا تلقائياً</p>
                </div>
              ) : (
                <Table dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الوردية والتوقيت</TableHead>
                      <TableHead className="text-right">الكاشير</TableHead>
                      <TableHead className="text-right">عهدة البداية</TableHead>
                      <TableHead className="text-right">المسلّم الفعلي (أعمى)</TableHead>
                      <TableHead className="text-right">المفترض بالنظام</TableHead>
                      <TableHead className="text-right">نتيجة التدقيق (الفارق)</TableHead>
                      <TableHead className="text-right">الملاحظات</TableHead>
                      <TableHead className="text-right">طباعة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shiftHandovers.map((shift) => {
                      const diff = Number(shift.difference) || 0;
                      return (
                        <TableRow key={shift.id}>
                          <TableCell className="text-right text-xs">
                            <div className="font-mono font-bold text-foreground">#{shift.id}</div>
                            <div className="text-[11px] text-muted-foreground font-mono" dir="ltr">
                              {formatDate(shift.shift_date)} {formatTime(shift.shift_date)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold">
                            <div className="flex items-center gap-1.5">
                              <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{shift.cashier_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono" dir="ltr">
                            {shift.opening_cash.toFixed(2)} {currency}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono font-black text-primary" dir="ltr">
                            {shift.actual_cash.toFixed(2)} {currency}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono font-medium text-muted-foreground" dir="ltr">
                            {shift.expected_cash.toFixed(2)} {currency}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <Badge
                              variant={Math.abs(diff) < 0.01 ? "secondary" : diff > 0 ? "outline" : "destructive"}
                              className="text-[11px] font-mono"
                              dir="ltr"
                            >
                              {Math.abs(diff) < 0.01 ? "متطابق ✅" : diff > 0 ? `+${diff.toFixed(2)} (فائض)` : `${diff.toFixed(2)} (عجز)`}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground max-w-xs truncate">
                            {shift.notes || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 text-xs"
                              onClick={() => handlePrintShiftReceipt(shift, true)}
                              title="طباعة إيصال تسليم الوردية للمدير"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              إيصال
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

        {/* ================= TAB 3: DETAILED BREAKDOWN ================= */}
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

        {/* ================= TAB 4: Z-REPORTS HISTORY ================= */}
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
                  <p className="text-xs mt-1">عند إغلاق اليومية سيتم حفظ التقرير هنا تلقائياً</p>
                </div>
              ) : (
                <Table dir="rtl">
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
                          <TableCell className="text-right text-xs font-medium font-mono" dir="ltr">
                            {formatDate(rec.closing_date)} - {formatTime(rec.closing_date)}
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
    </div>
  );
}
