import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Warehouse, Droplets, Wallet, ArrowUp, ArrowDown,
  Receipt, ShoppingCart, Sprout, UserCheck, Calendar, Eye,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";
import { useRole } from "@/contexts/RoleContext";
import { Navigate } from "react-router-dom";
import { InvoicePreview, InvoicePreviewData } from "@/components/invoices/InvoicePreview";
import { formatDate } from "@/lib/formatters";

type MovementKind = "invoice" | "oil_buy" | "oil_sell" | "expense" | "worker_payment";

interface Movement {
  id: string;
  kind: MovementKind;
  date: string;
  label: string;
  detail: string;
  oil_delta: number; // + means oil added to mill
  cash_delta: number; // + means cash added to mill
  invoice?: InvoicePreviewData;
}

const kindMeta: Record<MovementKind, { label: string; icon: any; color: string }> = {
  invoice: { label: "فاتورة عصر", icon: Receipt, color: "text-primary" },
  oil_buy: { label: "شراء زيت", icon: ShoppingCart, color: "text-blue-600" },
  oil_sell: { label: "بيع زيت", icon: ShoppingCart, color: "text-emerald-600" },
  expense: { label: "مصروف", icon: Sprout, color: "text-destructive" },
  worker_payment: { label: "دفع للعامل", icon: UserCheck, color: "text-amber-600" },
};

const Inventory = () => {
  const { isEmployee } = useRole();
  if (isEmployee) return <Navigate to="/queue" replace />;
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const { inventory, loading: invLoading } = useInventory();

  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | MovementKind>("all");
  const [preview, setPreview] = useState<InvoicePreviewData | null>(null);

  useEffect(() => {
    if (activeSeason) fetchAll();
  }, [activeSeason?.id]);

  const fetchAll = async () => {
    if (!activeSeason) return;
    setLoading(true);

    const [invoicesRes, oilTxRes, expensesRes, workerPayRes] = await Promise.all([
      supabase.from("invoices").select("*").eq("season_id", activeSeason.id),
      supabase.from("oil_transactions").select("*").eq("season_id", activeSeason.id),
      supabase.from("expenses").select("*").eq("season_id", activeSeason.id),
      supabase
        .from("worker_payments")
        .select("*, workers(name)")
        .eq("season_id", activeSeason.id),
    ]);

    const list: Movement[] = [];

    (invoicesRes.data || []).forEach((inv: any) => {
      const oilDelta = Number(inv.oil_produced) - Number(inv.oil_amount); // mill keeps oil_amount; but inventory tracks oil added by oil produced minus paid back. Actually per useInventory logic: oilChange = oil_produced - oil_amount → represents oil added to mill stock.
      list.push({
        id: `inv-${inv.id}`,
        kind: "invoice",
        date: inv.created_at,
        label: `فاتورة ${inv.customer_name}`,
        detail: `${inv.oil_produced} كغم منتج • ${inv.total_display}`,
        oil_delta: oilDelta,
        cash_delta: Number(inv.cash_amount),
        invoice: inv as InvoicePreviewData,
      });
    });

    (oilTxRes.data || []).forEach((tx: any) => {
      const isBuy = tx.type === "buy";
      list.push({
        id: `tx-${tx.id}`,
        kind: isBuy ? "oil_buy" : "oil_sell",
        date: tx.created_at,
        label: isBuy ? `شراء زيت من ${tx.party_name || "—"}` : `بيع زيت إلى ${tx.party_name || "—"}`,
        detail: `${tx.amount} كغم بسعر ${tx.price} ₪/كغم`,
        oil_delta: isBuy ? Number(tx.amount) : -Number(tx.amount),
        cash_delta: isBuy ? -Number(tx.total_price) : Number(tx.total_price),
      });
    });

    (expensesRes.data || []).forEach((ex: any) => {
      list.push({
        id: `ex-${ex.id}`,
        kind: "expense",
        date: ex.created_at,
        label: ex.category,
        detail: ex.description || "—",
        oil_delta: 0,
        cash_delta: -Number(ex.amount),
      });
    });

    (workerPayRes.data || []).forEach((wp: any) => {
      list.push({
        id: `wp-${wp.id}`,
        kind: "worker_payment",
        date: wp.created_at,
        label: `دفع للعامل ${wp.workers?.name || "—"}`,
        detail: wp.notes || "—",
        oil_delta: 0,
        cash_delta: -Number(wp.amount),
      });
    });

    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setMovements(list);
    setLoading(false);
  };

  const filtered = useMemo(
    () => (filter === "all" ? movements : movements.filter((m) => m.kind === filter)),
    [movements, filter]
  );

  const totals = useMemo(() => {
    return movements.reduce(
      (acc, m) => {
        if (m.oil_delta > 0) acc.oilIn += m.oil_delta;
        else acc.oilOut += -m.oil_delta;
        if (m.cash_delta > 0) acc.cashIn += m.cash_delta;
        else acc.cashOut += -m.cash_delta;
        return acc;
      },
      { oilIn: 0, oilOut: 0, cashIn: 0, cashOut: 0 }
    );
  }, [movements]);

  // Today's movements — auto-calculated from the main movements list
  const todayStr = new Date().toISOString().split("T")[0];
  const todayMovements = useMemo(
    () => movements.filter((m) => m.date.startsWith(todayStr)),
    [movements, todayStr]
  );
  const todayTotals = useMemo(() => {
    return todayMovements.reduce(
      (acc, m) => {
        acc.oilDelta += m.oil_delta;
        acc.cashDelta += m.cash_delta;
        acc.count += 1;
        return acc;
      },
      { oilDelta: 0, cashDelta: 0, count: 0 }
    );
  }, [todayMovements]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Warehouse className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold text-foreground">المخزن</h1>
          <p className="text-sm text-muted-foreground">رصيد الزيت والكاش وكل الحركات في الموسم</p>
        </div>
      </div>

      {/* Today's Movement — auto-calculated from today's transactions */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            حركة اليوم
          </CardTitle>
          <CardDescription>
            محسوبة تلقائياً من العمليات المسجلة اليوم — {todayStr}
            {todayTotals.count > 0
              ? ` • ${todayTotals.count} عملية`
              : " • لا توجد حركات اليوم"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              className={`rounded-xl p-4 border flex items-center gap-4 ${
                todayTotals.oilDelta > 0
                  ? "bg-primary/10 border-primary/20"
                  : todayTotals.oilDelta < 0
                  ? "bg-destructive/10 border-destructive/20"
                  : "bg-background/50 border-border"
              }`}
            >
              <div className="h-10 w-10 rounded-lg bg-background/60 flex items-center justify-center shrink-0">
                <Droplets className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">صافي زيت اليوم</p>
                <p
                  className={`text-2xl font-bold ${
                    todayTotals.oilDelta > 0
                      ? "text-primary"
                      : todayTotals.oilDelta < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {todayTotals.oilDelta > 0 ? "+" : ""}
                  {todayTotals.oilDelta.toFixed(2)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">كغم</span>
                </p>
              </div>
            </div>

            <div
              className={`rounded-xl p-4 border flex items-center gap-4 ${
                todayTotals.cashDelta > 0
                  ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                  : todayTotals.cashDelta < 0
                  ? "bg-destructive/10 border-destructive/20"
                  : "bg-background/50 border-border"
              }`}
            >
              <div className="h-10 w-10 rounded-lg bg-background/60 flex items-center justify-center shrink-0">
                <Wallet className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">صافي كاش اليوم</p>
                <p
                  className={`text-2xl font-bold ${
                    todayTotals.cashDelta > 0
                      ? "text-emerald-600"
                      : todayTotals.cashDelta < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {todayTotals.cashDelta > 0 ? "+" : ""}
                  {todayTotals.cashDelta.toFixed(2)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">₪</span>
                </p>
              </div>
            </div>
          </div>

          {todayMovements.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium">تفاصيل حركات اليوم:</p>
              {todayMovements.map((m) => {
                const meta = kindMeta[m.kind];
                const Icon = meta.icon;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between bg-background/60 rounded-lg px-3 py-2 text-sm border border-border/50"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                      <span className="font-medium">{m.label}</span>
                      <span className="text-muted-foreground text-xs hidden sm:inline">— {m.detail}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold shrink-0">
                      {m.oil_delta !== 0 && (
                        <span className={m.oil_delta > 0 ? "text-primary" : "text-destructive"}>
                          {m.oil_delta > 0 ? "+" : ""}{m.oil_delta.toFixed(1)} كغم
                        </span>
                      )}
                      {m.cash_delta !== 0 && (
                        <span className={m.cash_delta > 0 ? "text-emerald-600" : "text-destructive"}>
                          {m.cash_delta > 0 ? "+" : ""}{m.cash_delta.toFixed(0)} ₪
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-primary/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Droplets className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">رصيد الزيت الحالي</p>
                <p className="text-3xl font-bold text-primary">
                  {invLoading ? "—" : Number(inventory.total_oil).toFixed(2)}{" "}
                  <span className="text-base font-normal text-muted-foreground">كغم</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Wallet className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">رصيد الكاش الحالي</p>
                <p className="text-3xl font-bold text-primary">
                  {invLoading ? "—" : Number(inventory.total_cash).toFixed(2)}{" "}
                  <span className="text-base font-normal text-muted-foreground">₪</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aggregated season flows */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={ArrowDown} title="زيت داخل (الموسم)" value={`${totals.oilIn.toFixed(2)} كغم`} />
        <StatTile icon={ArrowUp} title="زيت خارج (الموسم)" value={`${totals.oilOut.toFixed(2)} كغم`} />
        <StatTile icon={ArrowDown} title="كاش داخل (الموسم)" value={`${totals.cashIn.toFixed(2)} ₪`} />
        <StatTile icon={ArrowUp} title="كاش خارج (الموسم)" value={`${totals.cashOut.toFixed(2)} ₪`} />
      </div>

      {/* Movements log */}
      <Card>
        <CardHeader>
          <CardTitle>سجل الحركات</CardTitle>
          <CardDescription>كل ما يؤثر على المخزون: فواتير، بيع/شراء، مصاريف، وأجور</CardDescription>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="pt-2">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="all">الكل</TabsTrigger>
              <TabsTrigger value="invoice">فواتير</TabsTrigger>
              <TabsTrigger value="oil_buy">شراء</TabsTrigger>
              <TabsTrigger value="oil_sell">بيع</TabsTrigger>
              <TabsTrigger value="expense">مصاريف</TabsTrigger>
              <TabsTrigger value="worker_payment">أجور</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">جارٍ التحميل...</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Warehouse className="h-14 w-14 mx-auto mb-3 opacity-50" />
              <p>لا توجد حركات</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">التفاصيل</TableHead>
                  <TableHead className="text-right">الزيت</TableHead>
                  <TableHead className="text-right">الكاش</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => {
                  const meta = kindMeta[m.kind];
                  const Icon = meta.icon;
                  const isToday = m.date.startsWith(todayStr);
                  return (
                    <TableRow key={m.id} className={isToday ? "bg-primary/[0.03]" : ""}>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center gap-1 text-xs font-mono">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(m.date)}
                          {isToday && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/40 text-primary ml-1">
                              اليوم
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="gap-1.5">
                          <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium text-sm">{m.label}</div>
                        <div className="text-xs text-muted-foreground">{m.detail}</div>
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold text-sm ${
                          m.oil_delta > 0 ? "text-primary" : m.oil_delta < 0 ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {m.oil_delta === 0 ? "—" : `${m.oil_delta > 0 ? "+" : ""}${m.oil_delta.toFixed(2)} كغم`}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold text-sm ${
                          m.cash_delta > 0 ? "text-primary" : m.cash_delta < 0 ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {m.cash_delta === 0 ? "—" : `${m.cash_delta > 0 ? "+" : ""}${m.cash_delta.toFixed(2)} ₪`}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.invoice && (
                          <Button size="sm" variant="ghost" onClick={() => setPreview(m.invoice!)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>الفاتورة</DialogTitle>
          </DialogHeader>
          {preview && <InvoicePreview data={preview} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatTile = ({ icon: Icon, title, value }: { icon: any; title: string; value: string }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="text-lg font-bold text-foreground">{value}</div>
    </CardContent>
  </Card>
);

export default Inventory;
