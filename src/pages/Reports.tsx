import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, DollarSign, Users, Package, TrendingUp, Droplets, Banknote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSeason } from "@/contexts/SeasonContext";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { useInventory } from "@/hooks/useInventory";
import { useCashBalance } from "@/hooks/useCashBalance";
import { Navigate } from "react-router-dom";



type Period = "daily" | "weekly" | "monthly" | "yearly";

function getDateRange(period: Period): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  switch (period) {
    case "daily": return d.toISOString();
    case "weekly": d.setDate(d.getDate() - 7); return d.toISOString();
    case "monthly": d.setMonth(d.getMonth() - 1); return d.toISOString();
    case "yearly": d.setFullYear(d.getFullYear() - 1); return d.toISOString();
  }
}


const periodLabels: Record<Period, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
  yearly: "سنوي",
};

export default function Reports() {
  const { user, millId } = useAuth();
  const { isEmployee } = useRole();
  const { activeSeason } = useSeason();
  const {
    inventory,
    loading: invLoading,
    refetch: refetchInventory,
  } = useInventory();
  const { cashBalance } = useCashBalance();
  const [period, setPeriod] = useState<Period>("daily");

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
    oilFromMilling: 0,
    oilPurchasedKg: 0,
    oilSoldKg: 0,
    oilAdjustments: 0,
    cashIn: 0,
    cashOut: 0,
    cashNetChange: 0, totalProductSales: 0,

  });

  useEffect(() => {
    if (activeSeason) fetchReports();
  }, [activeSeason?.id, period]);

  const fetchReports = async () => {
    if (!activeSeason) return;
    const dateFrom = getDateRange(period);

    const [invoicesRes, expensesRes, salesRes, purchasesRes, workerPaymentsRes, oilMovementsRes, financialRes] = await Promise.all([
      supabase.from("invoices").select("*").eq("season_id", activeSeason.id).is("voided_at", null).gte("created_at", dateFrom),
      supabase.from("expenses").select("amount").eq("season_id", activeSeason.id).is("voided_at", null).gte("created_at", dateFrom),
      supabase.from("oil_transactions").select("total_price,amount").eq("season_id", activeSeason.id).eq("type", "sell").eq("status", "active").gte("created_at", dateFrom),
      supabase.from("oil_transactions").select("total_price,amount").eq("season_id", activeSeason.id).eq("type", "buy").eq("status", "active").gte("created_at", dateFrom),
      supabase.from("worker_payments").select("amount").eq("season_id", activeSeason.id).eq("status", "active").gte("created_at", dateFrom), (supabase.from("oil_movements" as any) as any).select("source_type,movement_type,quantity").eq("season_id", activeSeason.id).gte("created_at", dateFrom),
      (supabase.from("financial_transactions" as any) as any).select("id,amount,direction,payment_method,status,created_at,reference_type").eq("season_id", activeSeason.id).eq("status", "active").gte("created_at", dateFrom),
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
    const movements = (oilMovementsRes.data || []) as any[];
    const oilFromMilling = movements.filter((m) => m.source_type === "milling_settlement" && m.movement_type === "IN").reduce((s, m) => s + Number(m.quantity), 0);
    const oilPurchasedKg = movements.filter((m) => m.source_type === "oil_purchase" && m.movement_type === "IN").reduce((s, m) => s + Number(m.quantity), 0);
    const oilSoldKg = movements.filter((m) => m.source_type === "oil_sale" && m.movement_type === "OUT").reduce((s, m) => s + Number(m.quantity), 0);
    const oilAdjustments = movements.filter((m) => m.source_type === "adjustment").reduce((s, m) => s + (m.movement_type === "IN" ? Number(m.quantity) : -Number(m.quantity)), 0);
    const financial = (financialRes.data || []) as any[];

    const totalProductSales = financial
      .filter(
        (e) =>
          e.reference_type === "product_sale" &&
          e.direction === "in"
      )
      .reduce((sum, e) => sum + Number(e.amount), 0)
      -
      financial
        .filter(
          (e) =>
            e.reference_type === "product_sale_cancellation" &&
            e.direction === "out"
        )
        .reduce((sum, e) => sum + Number(e.amount), 0);

    // Period cash flow is historical: reversals are real cash movements at their
    // own timestamps, so retain every active cash IN/OUT ledger event.
    const cashIn = financial.filter((e) => e.payment_method === "cash" && e.direction === "in").reduce((sum, e) => sum + Number(e.amount), 0);
    const cashOut = financial.filter((e) => e.payment_method === "cash" && e.direction === "out").reduce((sum, e) => sum + Number(e.amount), 0);

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
      oilFromMilling,
      oilPurchasedKg,
      oilSoldKg,
      oilAdjustments,
      cashIn,
      cashOut,
      cashNetChange: cashIn - cashOut, totalProductSales,
    });
  };

  const netOperatingMovement =
    stats.totalCashEarned +
    stats.totalOilSales +
    stats.totalProductSales -
    stats.totalExpenses -
    stats.totalWorkerPayments -
    stats.totalOilPurchases;

  if (isEmployee) {
    return <Navigate to="/queue" replace />;
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
            <CardTitle className="text-sm font-medium">النقد المسجل في فواتير العصر</CardTitle>
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
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> التدفق النقدي</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="text-right font-medium text-green-600">الكاش الداخل خلال الفترة</TableCell>
                  <TableCell className="text-right text-green-600">+{stats.cashIn.toFixed(0)} ش</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-right font-medium text-destructive">الكاش الخارج خلال الفترة</TableCell>
                  <TableCell className="text-right text-destructive">-{stats.cashOut.toFixed(0)} ش</TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="text-right font-medium">صافي تغير الكاش خلال الفترة</TableCell>
                  <TableCell className="text-right">{stats.cashNetChange >= 0 ? "+" : ""}{stats.cashNetChange.toFixed(0)} ش</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-right font-bold">الرصيد النقدي الحالي</TableCell>
                  <TableCell className="text-right font-bold text-lg">{cashBalance.toFixed(0)} ش</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> ملخص التشغيل</CardTitle></CardHeader>
          <CardContent><Table><TableBody>
            <TableRow><TableCell>النقد المسجل في فواتير العصر</TableCell><TableCell>{stats.totalCashEarned.toFixed(0)} ش</TableCell></TableRow>
            <TableRow><TableCell>المصاريف التشغيلية</TableCell><TableCell>{stats.totalExpenses.toFixed(0)} ش</TableCell></TableRow>
            <TableRow><TableCell>أجور العمال</TableCell><TableCell>{stats.totalWorkerPayments.toFixed(0)} ش</TableCell></TableRow>
            <TableRow><TableCell>مبيعات الزيت</TableCell><TableCell>{stats.totalOilSales.toFixed(0)} ش</TableCell></TableRow>
            <TableRow><TableCell>مشتريات الزيت</TableCell><TableCell>{stats.totalOilPurchases.toFixed(0)} ش</TableCell></TableRow>
            <TableRow>
              <TableCell>مبيعات البضائع</TableCell>
              <TableCell>{stats.totalProductSales.toFixed(0)} ش</TableCell>
            </TableRow>
            <TableRow className="border-t-2"><TableCell className="font-bold">صافي البنود المعروضة</TableCell><TableCell className="font-bold">{netOperatingMovement.toFixed(0)} ش</TableCell></TableRow>
          </TableBody></Table>
            <p className="text-xs text-muted-foreground mt-3">ليس صافي ربح محاسبيًا: لا يتضمن هذا التقرير تكلفة مخزون/COGS كاملة.</p></CardContent>
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
                  {invLoading ? (
                    <div className="h-7 w-24 bg-muted rounded animate-pulse" />
                  ) : (
                    <span className="text-2xl font-bold">
                      {inventory.total_oil} كغم
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border space-y-2 text-sm">
              <p className="font-medium">مصادر حركة الزيت خلال الفترة</p>
              <div className="flex justify-between"><span className="text-muted-foreground">ردّ تسويات العصر</span><strong>+{stats.oilFromMilling.toFixed(1)} كغم</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">زيت مُشترى</span><strong>+{stats.oilPurchasedKg.toFixed(1)} كغم</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">زيت مباع</span><strong>-{stats.oilSoldKg.toFixed(1)} كغم</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">تسويات وعكس حركات الزيت</span><strong>{stats.oilAdjustments >= 0 ? "+" : ""}{stats.oilAdjustments.toFixed(1)} كغم</strong></div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-green-500/5 border">
              <div className="flex items-center gap-3">
                <Banknote className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">الرصيد النقدي للمعصرة</p>
                  <p className="text-2xl font-bold">{cashBalance} ش</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
