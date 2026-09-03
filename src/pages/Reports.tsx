import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileText, DollarSign, Users, Package, TrendingUp, Droplets, Banknote, Lock, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";
import { useRole } from "@/contexts/RoleContext";
import { Navigate } from "react-router-dom";



type Period = "daily" | "weekly" | "monthly" | "yearly";

function getDateRange(period: Period): string {
  const now = new Date();
  switch (period) {
    case "daily":
      return now.toISOString().split("T")[0];
    case "weekly": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString().split("T")[0];
    }
    case "monthly": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().split("T")[0];
    }
    case "yearly": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().split("T")[0];
    }
  }
}

const periodLabels: Record<Period, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
  yearly: "سنوي",
};

export default function Reports() {
  const { user, effectiveUserId } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { isEmployee } = useRole();
  if (isEmployee) return <Navigate to="/queue" replace />;
  const { activeSeason } = useSeason();
  const { inventory } = useInventory();
  const [period, setPeriod] = useState<Period>("daily");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [stats, setStats] = useState({
    totalOilProduced: 0,
    totalOilReturn: 0,
    totalCashEarned: 0,
    completedCustomers: 0,
    totalExpenses: 0,
    totalWorkerPayments: 0,
    totalOilSales: 0,
    totalOilSalesAmount: 0,
    totalOilPurchases: 0,
    totalOilPurchasesAmount: 0,
  });

  useEffect(() => {
    if (targetUserId && activeSeason && isUnlocked) fetchReports();
  }, [targetUserId, activeSeason, period, isUnlocked]);

  const fetchReports = async () => {
    if (!targetUserId || !activeSeason) return;
    const dateFrom = getDateRange(period);

    const [invoicesRes, expensesRes, salesRes, purchasesRes, workerPaymentsRes] = await Promise.all([
      supabase.from("invoices").select("*").eq("user_id", targetUserId).eq("season_id", activeSeason.id).gte("created_at", dateFrom),
      supabase.from("expenses").select("amount").eq("user_id", targetUserId).eq("season_id", activeSeason.id).gte("created_at", dateFrom),
      supabase.from("oil_transactions").select("total_price,amount").eq("user_id", targetUserId).eq("season_id", activeSeason.id).eq("type", "sell").gte("created_at", dateFrom),
      supabase.from("oil_transactions").select("total_price,amount").eq("user_id", targetUserId).eq("season_id", activeSeason.id).eq("type", "buy").gte("created_at", dateFrom),
      supabase.from("worker_payments").select("amount").eq("user_id", targetUserId).eq("season_id", activeSeason.id).gte("created_at", dateFrom),
    ]);

    const invoices = invoicesRes.data || [];
    const totalOilProduced = invoices.reduce((s, i: any) => s + Number(i.oil_produced), 0);
    const totalOilReturn = invoices.reduce((s, i: any) => s + Number(i.oil_amount), 0);
    const totalCashEarned = invoices.reduce((s, i: any) => s + Number(i.cash_amount), 0);
    const completedCustomers = invoices.length;
    const totalExpenses = (expensesRes.data || []).reduce((s, e: any) => s + Number(e.amount), 0);
    const totalWorkerPayments = (workerPaymentsRes.data || []).reduce((s, w: any) => s + Number(w.amount), 0);
    const totalOilSales = (salesRes.data || []).reduce((s, t: any) => s + Number(t.total_price), 0);
    const totalOilSalesAmount = (salesRes.data || []).reduce((s, t: any) => s + Number(t.amount), 0);
    const totalOilPurchases = (purchasesRes.data || []).reduce((s, t: any) => s + Number(t.total_price), 0);
    const totalOilPurchasesAmount = (purchasesRes.data || []).reduce((s, t: any) => s + Number(t.amount), 0);

    setStats({
      totalOilProduced,
      totalOilReturn,
      totalCashEarned,
      completedCustomers,
      totalExpenses,
      totalWorkerPayments,
      totalOilSales,
      totalOilSalesAmount,
      totalOilPurchases,
      totalOilPurchasesAmount,
    });
  };

  const totalOutgoing = stats.totalExpenses + stats.totalWorkerPayments + stats.totalOilPurchases;
  const totalIncoming = stats.totalCashEarned + stats.totalOilSales;
  const netProfit = totalIncoming - totalOutgoing;

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
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl">صفحة التقارير محمية</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">أدخل كلمة السر للوصول</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="كلمة السر"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                className={passwordError ? "border-destructive" : ""}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordError && <p className="text-sm text-destructive">كلمة السر غير صحيحة</p>}
            <Button onClick={handleUnlock} className="w-full">دخول</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">التقارير</h1>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">يومي</SelectItem>
            <SelectItem value="weekly">أسبوعي</SelectItem>
            <SelectItem value="monthly">شهري</SelectItem>
            <SelectItem value="yearly">سنوي</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-muted-foreground text-sm">تقرير {periodLabels[period]} — {activeSeason?.name || ""}</p>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الزيت المنتج</CardTitle>
            <Droplets className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.totalOilProduced.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">كغم</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">كمية الرد (زيت)</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.totalOilReturn.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">كغم</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">كمية الكاش</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.totalCashEarned.toFixed(0)} <span className="text-sm font-normal text-muted-foreground">ش</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">زبائن بنجاح</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.completedCustomers}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Financial Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> ملخص مالي شامل</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-right font-medium text-green-600">إيرادات الفواتير (كاش)</TableCell>
                  <TableCell className="text-right text-green-600">+{stats.totalCashEarned.toFixed(0)} ش</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-right font-medium text-green-600">إيرادات الفواتير (زيت)</TableCell>
                  <TableCell className="text-right text-green-600">+{stats.totalOilReturn.toFixed(2)} كغم</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-right font-medium text-green-600">مبيعات زيت ({stats.totalOilSalesAmount.toFixed(1)} كغم)</TableCell>
                  <TableCell className="text-right text-green-600">+{stats.totalOilSales.toFixed(0)} ش</TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="text-right font-medium text-destructive">مشتريات زيت ({stats.totalOilPurchasesAmount.toFixed(1)} كغم)</TableCell>
                  <TableCell className="text-right text-destructive">-{stats.totalOilPurchases.toFixed(0)} ش</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-right font-medium text-destructive">مصاريف عامة</TableCell>
                  <TableCell className="text-right text-destructive">-{stats.totalExpenses.toFixed(0)} ش</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-right font-medium text-destructive">أجور العمال</TableCell>
                  <TableCell className="text-right text-destructive">-{stats.totalWorkerPayments.toFixed(0)} ش</TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="text-right font-bold">صافي الربح</TableCell>
                  <TableCell className={`text-right font-bold text-lg ${netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>{netProfit >= 0 ? "+" : ""}{netProfit.toFixed(0)} ش</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Current Inventory */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> المخزون الحالي</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border">
              <div className="flex items-center gap-3">
                <Droplets className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">مخزون الزيت</p>
                  <p className="text-2xl font-bold">{inventory.total_oil} كغم</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-green-500/5 border">
              <div className="flex items-center gap-3">
                <Banknote className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">مخزون الكاش</p>
                  <p className="text-2xl font-bold">{inventory.total_cash} ش</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
              <p className="text-sm font-medium">ملخص سريع</p>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">إجمالي الوارد</span>
                <span className="text-green-600 font-medium">+{totalIncoming.toFixed(0)} ش</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">إجمالي الصادر</span>
                <span className="text-destructive font-medium">-{totalOutgoing.toFixed(0)} ش</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
