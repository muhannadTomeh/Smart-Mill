import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, DollarSign, Users, Package, TrendingUp, TrendingDown,
  Droplets, Banknote, Lock, Eye, EyeOff, Scale, Wallet, ArrowDownLeft,
  ArrowUpLeft, ShieldAlert, CheckCircle2, UserCheck, RefreshCw, ShoppingCart
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";
import { useRole } from "@/contexts/RoleContext";
import { useCurrency } from "@/hooks/useCurrency";
import { Navigate } from "react-router-dom";
import { 
  calculateAccurateFinancialReport, 
  type AccurateFinancialSummary 
} from "@/lib/financialCore";

type Period = "daily" | "weekly" | "monthly" | "yearly" | "all";

function getDateRange(period: Period): string | null {
  const now = new Date();
  switch (period) {
    case "daily": {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today.toISOString();
    }
    case "weekly": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case "monthly": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString();
    }
    case "yearly": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString();
    }
    case "all":
      return null;
  }
}

const periodLabels: Record<Period, string> = {
  daily: "اليوم",
  weekly: "آخر 7 أيام",
  monthly: "آخر 30 يوم",
  yearly: "هذا العام",
  all: "كامل الموسم",
};

export default function Reports() {
  const { user, currentMillId, effectiveUserId } = useAuth();
  const targetMillId = currentMillId || effectiveUserId || user?.id;
  const targetUserId = targetMillId;
  const { isEmployee } = useRole();
  if (isEmployee) return <Navigate to="/queue" replace />;

  const { activeSeason } = useSeason();
  const { inventory } = useInventory();
  const { currency } = useCurrency();

  const [period, setPeriod] = useState<Period>("daily");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Financial Core Report Summary
  const [financialSummary, setFinancialSummary] = useState<AccurateFinancialSummary>({
    pressingRevenue: 0,
    oilSalesRevenue: 0,
    totalOperatingRevenue: 0,
    operationalExpenses: 0,
    workerWagesPaid: 0,
    totalOperatingExpenses: 0,
    operatingProfit: 0,
    cashInflows: 0,
    cashOutflows: 0,
    netCashFlow: 0,
    stockPurchasesCash: 0,
    customerDebtsCollected: 0,
    invoicesCount: 0,
    expensesCount: 0,
    tradesCount: 0,
  });

  // Additional Operational Stats
  const [operationalStats, setOperationalStats] = useState({
    totalOilProduced: 0,
    totalOilReturn: 0,
    totalOilSalesKg: 0,
    totalOilPurchasesKg: 0,
    workerTotalEarned: 0,
    workerTotalPaid: 0,
    workerRemainingDue: 0,
    completedCustomersCount: 0,
  });

  const fetchReportData = async () => {
    if (!targetMillId || !activeSeason) return;
    setLoading(true);

    const dateFrom = getDateRange(period);

    try {
      // 1. Fetch Accurate Financial Summary from Financial Core
      const finSummary = await calculateAccurateFinancialReport({
        millId: targetMillId,
        seasonId: activeSeason.id,
        dateFrom,
      });

      // 2. Fetch Operational details (Oil produced, workers due, etc.)
      let invQuery = supabase
        .from("invoices")
        .select("oil_produced, oil_amount, cash_amount, customer_name")
        .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
        .eq("season_id", activeSeason.id);

      let oilSalesQuery = supabase
        .from("oil_transactions")
        .select("amount, total_price")
        .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
        .eq("season_id", activeSeason.id)
        .eq("type", "sell");

      let oilPurchasesQuery = supabase
        .from("oil_transactions")
        .select("amount, total_price")
        .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
        .eq("season_id", activeSeason.id)
        .eq("type", "buy");

      let workersQuery = supabase
        .from("workers")
        .select("total_earned, total_paid")
        .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
        .eq("season_id", activeSeason.id);

      if (dateFrom) {
        invQuery = invQuery.gte("created_at", dateFrom);
        oilSalesQuery = oilSalesQuery.gte("created_at", dateFrom);
        oilPurchasesQuery = oilPurchasesQuery.gte("created_at", dateFrom);
      }

      const [invRes, salesRes, purchasesRes, workersRes] = await Promise.all([
        invQuery,
        oilSalesQuery,
        oilPurchasesQuery,
        workersQuery,
      ]);

      const invoices = invRes.data || [];
      const totalOilProduced = invoices.reduce((s, i: any) => s + (Number(i.oil_produced) || 0), 0);
      const totalOilReturn = invoices.reduce((s, i: any) => s + (Number(i.oil_amount) || 0), 0);
      const completedCustomersCount = invoices.length;

      const totalOilSalesKg = (salesRes.data || []).reduce((s, t: any) => s + (Number(t.amount) || 0), 0);
      const totalOilPurchasesKg = (purchasesRes.data || []).reduce((s, t: any) => s + (Number(t.amount) || 0), 0);

      const workers = workersRes.data || [];
      const workerTotalEarned = workers.reduce((s, w: any) => s + (Number(w.total_earned) || 0), 0);
      const workerTotalPaid = workers.reduce((s, w: any) => s + (Number(w.total_paid) || 0), 0);
      const workerRemainingDue = Math.max(0, workerTotalEarned - workerTotalPaid);

      // Fallback if financial_transactions was not populated yet
      if (finSummary.invoicesCount === 0 && invoices.length > 0) {
        const legacyCash = invoices.reduce((s, i: any) => s + (Number(i.cash_amount) || 0), 0);
        const legacySales = (salesRes.data || []).reduce((s, t: any) => s + (Number(t.total_price) || 0), 0);
        const legacyPurchases = (purchasesRes.data || []).reduce((s, t: any) => s + (Number(t.total_price) || 0), 0);

        finSummary.pressingRevenue = legacyCash;
        finSummary.oilSalesRevenue = legacySales;
        finSummary.totalOperatingRevenue = legacyCash + legacySales;
        finSummary.stockPurchasesCash = legacyPurchases;
        finSummary.operatingProfit = finSummary.totalOperatingRevenue - finSummary.totalOperatingExpenses;
        finSummary.cashInflows = legacyCash + legacySales;
        finSummary.cashOutflows = finSummary.operationalExpenses + finSummary.workerWagesPaid + legacyPurchases;
        finSummary.netCashFlow = finSummary.cashInflows - finSummary.cashOutflows;
        finSummary.invoicesCount = completedCustomersCount;
      }

      setFinancialSummary(finSummary);
      setOperationalStats({
        totalOilProduced,
        totalOilReturn,
        totalOilSalesKg,
        totalOilPurchasesKg,
        workerTotalEarned,
        workerTotalPaid,
        workerRemainingDue,
        completedCustomersCount,
      });
    } catch (e) {
      console.error("Error loading reports", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (targetUserId && activeSeason && isUnlocked) {
      fetchReportData();
    }
  }, [targetUserId, activeSeason, period, isUnlocked]);

  const handleUnlock = async () => {
    try {
      const { data, error } = await supabase.rpc("verify_report_pin", {
        input_pin: password,
      });

      if (error) throw error;

      if (data === true) {
        setIsUnlocked(true);
        setPasswordError(false);
      } else {
        setPasswordError(true);
      }
    } catch (error) {
      console.error("Error verifying PIN:", error);
      setPasswordError(true);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="flex items-center justify-center min-h-[65vh]" dir="rtl">
        <Card className="w-full max-w-sm border shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
              <Lock className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl font-bold">صفحة التقارير محمية</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              التقارير المالية والتحليلات مخصصة للإدارة فقط. أدخل رمز الحماية للمتابعة:
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="رمز الحماية (PIN)"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                className={`text-center font-mono text-lg font-bold h-11 ${passwordError ? "border-destructive" : ""}`}
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs text-destructive text-center font-semibold">
                رمز الحماية غير صحيح. حاول مجدداً.
              </p>
            )}
            <Button onClick={handleUnlock} className="w-full h-11 font-bold text-base">
              دخول للتقارير
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-foreground">التقارير والتحليلات المالية</h1>
              <Badge variant="outline" className="text-xs font-semibold">
                Financial Core
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              موسم: {activeSeason?.name || "الموسم الحالي"} — فصل الأرباح التشغيلية عن حركة الصندوق والمخزون
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReportData}
            disabled={loading}
            className="gap-1.5 h-10 text-xs font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-44 h-10 font-bold text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="daily">اليوم</SelectItem>
              <SelectItem value="weekly">آخر 7 أيام</SelectItem>
              <SelectItem value="monthly">آخر 30 يوم</SelectItem>
              <SelectItem value="yearly">هذا العام</SelectItem>
              <SelectItem value="all">كامل الموسم</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 4 Core Financial KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Operating Profit */}
        <Card className="border-2 border-primary/40 bg-gradient-to-br from-primary/5 to-primary/15 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-foreground">الربح التشغيلي الحقيقي</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
              <Scale className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl sm:text-3xl font-black font-mono ${financialSummary.operatingProfit >= 0 ? "text-primary" : "text-destructive"}`} dir="ltr">
              {financialSummary.operatingProfit >= 0 ? `+${financialSummary.operatingProfit.toFixed(0)}` : financialSummary.operatingProfit.toFixed(0)} {currency}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 pt-1.5 border-t border-primary/20">
              الإيرادات ({financialSummary.totalOperatingRevenue.toFixed(0)}) - المصاريف ({financialSummary.totalOperatingExpenses.toFixed(0)})
            </p>
          </CardContent>
        </Card>

        {/* 2. Total Operating Revenue */}
        <Card className="border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-emerald-800 dark:text-emerald-300">إجمالي الإيرادات التشغيلية</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-400 font-mono" dir="ltr">
              +{financialSummary.totalOperatingRevenue.toFixed(0)} {currency}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 pt-1.5 border-t border-emerald-500/10">
              عصر: {financialSummary.pressingRevenue.toFixed(0)} {currency} | بيع زيت: {financialSummary.oilSalesRevenue.toFixed(0)} {currency}
            </p>
          </CardContent>
        </Card>

        {/* 3. Operating Expenses */}
        <Card className="border-rose-500/20 bg-rose-50/40 dark:bg-rose-950/20 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-rose-800 dark:text-rose-300">المصاريف التشغيلية والأجور</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-600 flex items-center justify-center">
              <TrendingDown className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-black text-rose-700 dark:text-rose-400 font-mono" dir="ltr">
              -{financialSummary.totalOperatingExpenses.toFixed(0)} {currency}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 pt-1.5 border-t border-rose-500/10">
              تشغيل: {financialSummary.operationalExpenses.toFixed(0)} {currency} | عمال: {financialSummary.workerWagesPaid.toFixed(0)} {currency}
            </p>
          </CardContent>
        </Card>

        {/* 4. Cash Flow */}
        <Card className="border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-foreground">صافي حركة الصندوق (Cash Flow)</CardTitle>
            <div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
              <Wallet className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl sm:text-3xl font-black font-mono ${financialSummary.netCashFlow >= 0 ? "text-foreground" : "text-amber-600"}`} dir="ltr">
              {financialSummary.netCashFlow >= 0 ? `+${financialSummary.netCashFlow.toFixed(0)}` : financialSummary.netCashFlow.toFixed(0)} {currency}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 pt-1.5 border-t">
              وارد: +{financialSummary.cashInflows.toFixed(0)} | صادر: -{financialSummary.cashOutflows.toFixed(0)} {currency}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tables & Deep Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. Income Statement Summary (قائمة الدخل والربح التشغيلي) */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <span>بيان الأرباح والخسائر التشغيلية (P&L Summary)</span>
            </CardTitle>
            <CardDescription className="text-xs">
              حساب دقيق للأرباح: الإيرادات ناقص المصاريف والأجور (مشتريات الزيت لا تُخصم كخسارة لأنها أصل مخزني)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table dir="rtl">
              <TableBody>
                {/* Revenue Section */}
                <TableRow className="bg-muted/30">
                  <TableCell className="font-bold text-xs text-foreground" colSpan={2}>
                    1. الإيرادات التشغيلية المكتسبة (+)
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-right text-xs">
                    <div>إيرادات فواتير العصر والتنكات (نقد)</div>
                    <div className="text-[11px] text-muted-foreground">عدد الفواتير: {operationalStats.completedCustomersCount}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-emerald-600" dir="ltr">
                    +{financialSummary.pressingRevenue.toFixed(2)} {currency}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-right text-xs">
                    <div>مبيعات الزيت النقدية</div>
                    <div className="text-[11px] text-muted-foreground">الكمية المباعة: {operationalStats.totalOilSalesKg.toFixed(1)} كغم</div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-emerald-600" dir="ltr">
                    +{financialSummary.oilSalesRevenue.toFixed(2)} {currency}
                  </TableCell>
                </TableRow>
                <TableRow className="border-t font-semibold bg-emerald-500/5">
                  <TableCell className="text-right text-xs text-emerald-800 dark:text-emerald-300">إجمالي الإيرادات التشغيلية</TableCell>
                  <TableCell className="text-right font-mono font-black text-emerald-700 dark:text-emerald-400" dir="ltr">
                    +{financialSummary.totalOperatingRevenue.toFixed(2)} {currency}
                  </TableCell>
                </TableRow>

                {/* Expenses Section */}
                <TableRow className="bg-muted/30">
                  <TableCell className="font-bold text-xs text-foreground" colSpan={2}>
                    2. المصاريف التشغيلية والأجور (-)
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-right text-xs">المصاريف التشغيلية العامة (محروقات، صيانة، تنظيف...)</TableCell>
                  <TableCell className="text-right font-mono font-bold text-rose-600" dir="ltr">
                    -{financialSummary.operationalExpenses.toFixed(2)} {currency}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-right text-xs">أجور ودفعات العمال المسددة</TableCell>
                  <TableCell className="text-right font-mono font-bold text-rose-600" dir="ltr">
                    -{financialSummary.workerWagesPaid.toFixed(2)} {currency}
                  </TableCell>
                </TableRow>
                <TableRow className="border-t font-semibold bg-rose-500/5">
                  <TableCell className="text-right text-xs text-rose-800 dark:text-rose-300">إجمالي المصاريف التشغيلية</TableCell>
                  <TableCell className="text-right font-mono font-black text-rose-700 dark:text-rose-400" dir="ltr">
                    -{financialSummary.totalOperatingExpenses.toFixed(2)} {currency}
                  </TableCell>
                </TableRow>

                {/* Net Operating Profit Row */}
                <TableRow className="border-t-2 bg-primary/10 font-bold">
                  <TableCell className="text-right text-sm font-black">صافي الربح التشغيلي للمدة</TableCell>
                  <TableCell className={`text-right font-mono font-black text-base ${financialSummary.operatingProfit >= 0 ? "text-primary" : "text-destructive"}`} dir="ltr">
                    {financialSummary.operatingProfit >= 0 ? `+${financialSummary.operatingProfit.toFixed(2)}` : financialSummary.operatingProfit.toFixed(2)} {currency}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 2. Cash Flow & Inventory Snapshot */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              <span>الصندوق والمخزون الفعلي (Cash & Stock Ledger)</span>
            </CardTitle>
            <CardDescription className="text-xs">
              متابعة حركة النقد الفعلي بالدرج وحركة مخزون الزيت في المعصرة
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            {/* Live Snapshots */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-card border flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">رصيد الصندوق الحالي</p>
                  <p className="text-xl font-black font-mono" dir="ltr">{inventory.total_cash.toFixed(2)} {currency}</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-card border flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Droplets className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">مخزون الزيت الحالي</p>
                  <p className="text-xl font-black font-mono" dir="ltr">{inventory.total_oil.toFixed(1)} كغم</p>
                </div>
              </div>
            </div>

            {/* Cash Flow Summary */}
            <div className="p-4 rounded-xl bg-muted/30 border space-y-2.5 text-xs">
              <p className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-primary" />
                <span>حركة تدفقات الصندوق (Cash Flow Breakdown)</span>
              </p>
              <div className="flex justify-between items-center py-1 border-b">
                <span className="text-muted-foreground">إجمالي النقد المقبوض في الصندوق (+)</span>
                <span className="font-bold font-mono text-emerald-600" dir="ltr">+{financialSummary.cashInflows.toFixed(2)} {currency}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b">
                <span className="text-muted-foreground">إجمالي النقد المدفوع من الصندوق (-)</span>
                <span className="font-bold font-mono text-rose-600" dir="ltr">-{financialSummary.cashOutflows.toFixed(2)} {currency}</span>
              </div>
              {financialSummary.stockPurchasesCash > 0 && (
                <div className="flex justify-between items-center py-1 border-b text-muted-foreground">
                  <span>منها مشتريات زيت كأصل مخزني (ليست خسارة):</span>
                  <span className="font-mono font-semibold" dir="ltr">{financialSummary.stockPurchasesCash.toFixed(2)} {currency}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1 font-bold text-sm">
                <span>صافي حركة النقدية:</span>
                <span className="font-mono font-black" dir="ltr">
                  {financialSummary.netCashFlow >= 0 ? `+${financialSummary.netCashFlow.toFixed(2)}` : financialSummary.netCashFlow.toFixed(2)} {currency}
                </span>
              </div>
            </div>

            {/* Oil Movement Summary */}
            <div className="p-4 rounded-xl bg-muted/30 border space-y-2.5 text-xs">
              <p className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <Droplets className="h-4 w-4 text-primary" />
                <span>حركة الزيت خلال المدة ({periodLabels[period]})</span>
              </p>
              <div className="flex justify-between items-center py-1 border-b">
                <span className="text-muted-foreground">إجمالي الزيت المعصور المنتج:</span>
                <span className="font-mono font-bold">{operationalStats.totalOilProduced.toFixed(1)} كغم</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b">
                <span className="text-muted-foreground">زيت الرد المحصل للمعصرة:</span>
                <span className="font-mono font-bold text-emerald-600">+{operationalStats.totalOilReturn.toFixed(1)} كغم</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b">
                <span className="text-muted-foreground">مشتريات الزيت من المزارعين:</span>
                <span className="font-mono font-bold text-primary">+{operationalStats.totalOilPurchasesKg.toFixed(1)} كغم</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-muted-foreground">مبيعات الزيت المباعة:</span>
                <span className="font-mono font-bold text-rose-600">-{operationalStats.totalOilSalesKg.toFixed(1)} كغم</span>
              </div>
            </div>

            {/* Payables & Receivables (الذمم والمستحقات) */}
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 text-xs">
              <p className="font-bold text-sm text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-amber-600" />
                <span>المستحقات والذمم المعلقة</span>
              </p>
              <div className="flex justify-between items-center">
                <span className="text-amber-800 dark:text-amber-300">مستحقات العمال المتبقية (أجور لم تسدد بعد):</span>
                <span className="font-mono font-bold text-amber-900 dark:text-amber-200" dir="ltr">
                  {operationalStats.workerRemainingDue.toFixed(2)} {currency}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
