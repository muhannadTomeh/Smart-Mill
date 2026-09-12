import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Warehouse, Droplets, Wallet, ArrowUp, ArrowDown,
  Receipt, ShoppingCart, Sprout, UserCheck, Calendar, Eye,
  Activity, Package, Plus, RefreshCw, Layers, Tag,
  CheckCircle2, Handshake, Users, ArrowUpRight, ArrowDownLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";
import { useRole } from "@/contexts/RoleContext";
import { useToast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import { InvoicePreview, InvoicePreviewData } from "@/components/invoices/InvoicePreview";
import { formatDate, formatNumber } from "@/lib/formatters";

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

interface Product {
  id: string;
  name: string;
  unit: string;
  default_purchase_price?: number;
  default_sale_price?: number;
  purchase_price?: number;
  sale_price?: number;
  current_stock: number;
  active: boolean;
}

interface ProductMovement {
  id: string;
  product_id: string;
  type?: string;
  movement_type?: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  products?: { name: string; unit: string } | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface PartnerOption {
  id: string;
  name: string;
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
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const { inventory, loading: invLoading, refetch: refetchInventory } = useInventory();
  const { toast } = useToast();

  const [activeMainTab, setActiveMainTab] = useState<"oil" | "products">("oil");

  // Oil & Cash movements state
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | MovementKind>("all");
  const [preview, setPreview] = useState<InvoicePreviewData | null>(null);

  // Operational Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [stockMovements, setStockMovements] = useState<ProductMovement[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Modals state
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);
  const [savingNewProduct, setSavingNewProduct] = useState(false);

  // Form: Purchase
  const [purchaseForm, setPurchaseForm] = useState({
    product_id: "",
    supplier_id: "",
    quantity: "",
    purchase_price: "",
    sale_price: "",
    payment_method: "cash" as "cash" | "credit" | "partner",
    partner_id: "",
    notes: "",
  });

  // Form: New Product
  const [newProductForm, setNewProductForm] = useState({
    name: "",
    unit: "قطعة",
    purchase_price: "0",
    sale_price: "0",
  });

  useEffect(() => {
    if (activeSeason) {
      fetchAll();
      fetchProductsData();
    }
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
      const oilDelta = Number(inv.oil_produced) - Number(inv.oil_amount);
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

  const fetchProductsData = async () => {
    setLoadingProducts(true);
    try {
      const [prodsRes, supsRes, partsRes, movesRes] = await Promise.all([
        supabase.from("products" as any).select("*").order("name"),
        supabase.from("suppliers" as any).select("id, name").eq("active", true).order("name"),
        supabase.from("partners" as any).select("id, name").eq("active", true).order("name"),
        supabase.from("product_stock_movements" as any)
          .select("*, products(name, unit)")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (prodsRes.data) setProducts(prodsRes.data as any);
      if (supsRes.data) setSuppliers(supsRes.data as any);
      if (partsRes.data) setPartners(partsRes.data as any);
      if (movesRes.data) setStockMovements(movesRes.data as any);
    } catch (e) {
      console.error("fetchProductsData error:", e);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleProductSelectForPurchase = (productId: string) => {
    const selected = products.find((p) => p.id === productId);
    setPurchaseForm((p) => ({
      ...p,
      product_id: productId,
      purchase_price: selected ? String(selected.default_purchase_price ?? selected.purchase_price ?? 0) : p.purchase_price,
      sale_price: selected ? String(selected.default_sale_price ?? selected.sale_price ?? 0) : p.sale_price,
    }));
  };

  const submitPurchase = async () => {
    if (!activeSeason) return;
    const qty = parseFloat(purchaseForm.quantity);
    const buyPrice = parseFloat(purchaseForm.purchase_price);
    const sellPrice = parseFloat(purchaseForm.sale_price || "0");

    if (!purchaseForm.product_id) {
      toast({ title: "تنبيه", description: "يرجى اختيار المنتج المطلوب شراؤه", variant: "destructive" });
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "تنبيه", description: "يرجى إدخال كمية صحيحة", variant: "destructive" });
      return;
    }
    if (isNaN(buyPrice) || buyPrice < 0) {
      toast({ title: "تنبيه", description: "يرجى إدخال سعر شراء صحيح", variant: "destructive" });
      return;
    }
    if (purchaseForm.payment_method === "partner" && !purchaseForm.partner_id) {
      toast({ title: "تنبيه", description: "يرجى اختيار الشريك الذي دفع قيمة الشراء", variant: "destructive" });
      return;
    }

    setSubmittingPurchase(true);
    try {
      const { data, error } = await supabase.rpc("record_product_purchase_atomic" as any, {
        p_season_id: activeSeason.id,
        p_product_id: purchaseForm.product_id,
        p_quantity: qty,
        p_unit_price: buyPrice,
        p_sale_price: sellPrice,
        p_payment_method: purchaseForm.payment_method,
        p_supplier_id: purchaseForm.supplier_id || null,
        p_partner_id: purchaseForm.payment_method === "partner" ? purchaseForm.partner_id : null,
        p_notes: purchaseForm.notes.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "تم تسجيل عملية الشراء بنجاح",
        description: `تمت إضافة ${qty} وحدة للمخزون وتسجيل الحركة المالية تلقائياً.`,
      });

      setPurchaseModalOpen(false);
      setPurchaseForm({
        product_id: "",
        supplier_id: "",
        quantity: "",
        purchase_price: "",
        sale_price: "",
        payment_method: "cash",
        partner_id: "",
        notes: "",
      });

      await fetchProductsData();
      await refetchInventory();
      await fetchAll();
    } catch (err: any) {
      toast({
        title: "خطأ في تسجيل الشراء",
        description: err.message || "تعذر إتمام الشراء",
        variant: "destructive",
      });
    } finally {
      setSubmittingPurchase(false);
    }
  };

  const submitAddProduct = async () => {
    if (!newProductForm.name.trim()) {
      toast({ title: "تنبيه", description: "يرجى كتابة اسم المنتج", variant: "destructive" });
      return;
    }

    setSavingNewProduct(true);
    try {
      const effectiveMillId = millId || activeSeason?.mill_id;
      const { error } = await supabase.from("products" as any).insert({
        mill_id: effectiveMillId,
        name: newProductForm.name.trim(),
        unit: newProductForm.unit.trim() || "قطعة",
        purchase_price: parseFloat(newProductForm.purchase_price) || 0,
        sale_price: parseFloat(newProductForm.sale_price) || 0,
        current_stock: 0,
        active: true,
      });

      if (error) throw error;

      toast({ title: "تمت الإضافة", description: `تمت إضافة الصنف "${newProductForm.name}" بنجاح.` });
      setAddProductModalOpen(false);
      setNewProductForm({ name: "", unit: "قطعة", purchase_price: "0", sale_price: "0" });
      await fetchProductsData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "تعذر حفظ الصنف", variant: "destructive" });
    } finally {
      setSavingNewProduct(false);
    }
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

  if (isEmployee) {
    return <Navigate to="/queue" replace />;
  }

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Warehouse className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">إدارة المخزون والمستودع</h1>
            <p className="text-xs text-muted-foreground mt-0.5">متابعة أرصدة الزيت والكاش والمنتجات التشغيلية وحركات التوريد</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchAll();
              fetchProductsData();
              refetchInventory();
            }}
            className="gap-2 rounded-xl text-xs h-9"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>تحديث</span>
          </Button>

          {activeMainTab === "products" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddProductModalOpen(true)}
                className="gap-1.5 rounded-xl text-xs h-9 font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة صنف</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setPurchaseModalOpen(true)}
                className="gap-1.5 rounded-xl text-xs h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>شراء بضاعة جديدة</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Tabs Selection */}
      <div className="flex border-b border-border/70 gap-2">
        <button
          type="button"
          onClick={() => setActiveMainTab("oil")}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeMainTab === "oil"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Droplets className="h-4 w-4" />
          <span>مخزون الزيت وحركات الصندوق</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab("products")}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeMainTab === "products"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="h-4 w-4" />
          <span>المنتجات التشغيلية والتنك والمشتريات</span>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            {products.length}
          </Badge>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: OIL & CASH MOVEMENTS
      ───────────────────────────────────────────────────────────── */}
      {activeMainTab === "oil" && (
        <div className="space-y-6">
          {/* Today's Movement — auto-calculated from today's transactions */}
          <Card className="border-primary/20 bg-primary/5 rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <span>حركة اليوم</span>
              </CardTitle>
              <CardDescription className="text-xs">
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
                      className={`text-2xl font-bold font-mono ${
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
                      className={`text-2xl font-bold font-mono ${
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
                        className="flex items-center justify-between bg-background/60 rounded-xl px-3 py-2 text-sm border border-border/50"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                          <span className="font-medium text-xs">{m.label}</span>
                          <span className="text-muted-foreground text-xs hidden sm:inline">— {m.detail}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-semibold shrink-0 font-mono">
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
            <Card className="border-border/60 rounded-2xl shadow-xs">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Droplets className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground font-medium">رصيد الزيت الحالي بالمستودع</p>
                    <p className="text-3xl font-bold text-primary font-mono mt-1">
                      {invLoading ? "—" : Number(inventory.total_oil).toFixed(2)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">كغم</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 rounded-2xl shadow-xs">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <Wallet className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground font-medium">رصيد كاش المعصرة الكلي</p>
                    <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                      {invLoading ? "—" : Number(inventory.total_cash).toFixed(2)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">₪</span>
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
          <Card className="border-border/60 rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card/60 p-4 sm:p-5">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <span>سجل الحركات الشامل للزيت والكاش</span>
              </CardTitle>
              <CardDescription className="text-xs">
                كل ما يؤثر على مخزون الزيت وكاش المعصرة: فواتير، بيع/شراء، مصاريف، وأجور
              </CardDescription>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="pt-2">
                <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/40 p-1 rounded-xl">
                  <TabsTrigger value="all" className="text-xs rounded-lg">الكل</TabsTrigger>
                  <TabsTrigger value="invoice" className="text-xs rounded-lg">فواتير العصر</TabsTrigger>
                  <TabsTrigger value="oil_buy" className="text-xs rounded-lg">شراء زيت</TabsTrigger>
                  <TabsTrigger value="oil_sell" className="text-xs rounded-lg">بيع زيت</TabsTrigger>
                  <TabsTrigger value="expense" className="text-xs rounded-lg">مصاريف</TabsTrigger>
                  <TabsTrigger value="worker_payment" className="text-xs rounded-lg">أجور عمال</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-xs">جارٍ تحميل سجل الحركات...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Warehouse className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-semibold">لا توجد حركات مسجلة</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="text-right text-xs font-bold">التاريخ</TableHead>
                        <TableHead className="text-right text-xs font-bold">نوع الحركة</TableHead>
                        <TableHead className="text-right text-xs font-bold">البيان والتفاصيل</TableHead>
                        <TableHead className="text-right text-xs font-bold">حركة الزيت</TableHead>
                        <TableHead className="text-right text-xs font-bold">حركة الكاش</TableHead>
                        <TableHead className="text-left text-xs font-bold"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((m) => {
                        const meta = kindMeta[m.kind];
                        const Icon = meta.icon;
                        const isToday = m.date.startsWith(todayStr);
                        return (
                          <TableRow key={m.id} className={isToday ? "bg-primary/[0.03] hover:bg-muted/40" : "hover:bg-muted/30"}>
                            <TableCell className="text-right whitespace-nowrap text-xs font-mono">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                {formatDate(m.date)}
                                {isToday && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/40 text-primary ml-1">
                                    اليوم
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="gap-1 text-xs font-semibold">
                                <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                                {meta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="font-semibold text-xs text-foreground">{m.label}</div>
                              <div className="text-[11px] text-muted-foreground">{m.detail}</div>
                            </TableCell>
                            <TableCell
                              className={`text-right font-bold text-xs font-mono ${
                                m.oil_delta > 0 ? "text-primary" : m.oil_delta < 0 ? "text-destructive" : "text-muted-foreground"
                              }`}
                            >
                              {m.oil_delta === 0 ? "—" : `${m.oil_delta > 0 ? "+" : ""}${m.oil_delta.toFixed(2)} كغم`}
                            </TableCell>
                            <TableCell
                              className={`text-right font-bold text-xs font-mono ${
                                m.cash_delta > 0 ? "text-emerald-600" : m.cash_delta < 0 ? "text-destructive" : "text-muted-foreground"
                              }`}
                            >
                              {m.cash_delta === 0 ? "—" : `${m.cash_delta > 0 ? "+" : ""}${m.cash_delta.toFixed(2)} ₪`}
                            </TableCell>
                            <TableCell className="text-left">
                              {m.invoice && (
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setPreview(m.invoice!)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: OPERATIONAL PRODUCTS & PURCHASES
      ───────────────────────────────────────────────────────────── */}
      {activeMainTab === "products" && (
        <div className="space-y-6">
          {/* Products Stock Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <span>أصناف المنتجات والتنك التشغيلي</span>
              </h2>
              <span className="text-xs text-muted-foreground">
                إجمالي المخزون يتم تحديثه تلقائياً مع كل عملية شراء أو بيع في الفواتير
              </span>
            </div>

            {loadingProducts ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                <p className="text-xs">جارٍ تحميل بيانات المنتجات...</p>
              </div>
            ) : products.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-border p-8 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground opacity-40 mb-2" />
                <p className="text-sm font-semibold">لم يتم تعريف أي منتجات تشغيلية بعد</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">
                  يمكنك إضافة عبوات التنك (حديد، بلاستيك) أو مستلزمات التعبئة للمتابعة التلقائية
                </p>
                <Button size="sm" onClick={() => setAddProductModalOpen(true)} className="rounded-xl gap-2 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  <span>إضافة أول صنف</span>
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {products.map((p) => {
                  const isLow = p.current_stock <= 5;
                  return (
                    <Card key={p.id} className="rounded-2xl border-border/60 shadow-xs hover:border-primary/40 transition-colors">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-sm font-bold text-foreground">{p.name}</h3>
                            <span className="text-[11px] text-muted-foreground">الوحدة: {p.unit}</span>
                          </div>
                          <Badge
                            className={`text-[10px] ${
                              isLow
                                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                            }`}
                          >
                            {isLow ? "مخزون منخفض" : "متوفر"}
                          </Badge>
                        </div>

                        <div className="flex items-baseline justify-between pt-1 border-t border-border/40">
                          <span className="text-xs text-muted-foreground">الرصيد بالمستودع:</span>
                          <span className="text-2xl font-bold font-mono text-primary">
                            {formatNumber(p.current_stock)}{" "}
                            <span className="text-xs font-normal text-muted-foreground">{p.unit}</span>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-muted/40 p-2 rounded-xl">
                          <div>
                            <span className="text-muted-foreground block">سعر الشراء:</span>
                            <span className="font-semibold font-mono text-foreground">
                              {p.default_purchase_price ?? p.purchase_price ?? 0} ₪
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">سعر البيع:</span>
                            <span className="font-semibold font-mono text-emerald-600">
                              {p.default_sale_price ?? p.sale_price ?? 0} ₪
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Product Stock Movements Table */}
          <Card className="border-border/60 rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card/60 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span>سجل حركات المخزون التشغيلي (Stock Ledger)</span>
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    سجل موحد لجميع إدخالات الشراء ومبيعات التنك في فواتير العصر
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setPurchaseModalOpen(true)}
                  className="rounded-xl text-xs gap-1.5 font-bold bg-primary text-primary-foreground h-8"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span>شراء بضاعة</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {stockMovements.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">لم يتم تسجيل أي حركات مخزنية تشغيلية حتى الآن</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="text-right text-xs font-bold">التاريخ</TableHead>
                        <TableHead className="text-right text-xs font-bold">المنتج</TableHead>
                        <TableHead className="text-right text-xs font-bold">نوع الحركة</TableHead>
                        <TableHead className="text-right text-xs font-bold">الكمية</TableHead>
                        <TableHead className="text-right text-xs font-bold">ملاحظات وبيان الحركة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockMovements.map((sm) => {
                        const isPositive = sm.quantity > 0;
                        return (
                          <TableRow key={sm.id} className="hover:bg-muted/30">
                            <TableCell className="text-right text-xs font-mono">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>{formatDate(sm.created_at)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-xs">
                              {sm.products?.name || "منتج"}
                            </TableCell>
                            <TableCell className="text-right">
                              {(sm.type === "purchase" || sm.movement_type === "purchase_in") ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[11px] gap-1">
                                  <ArrowDownLeft className="h-3 w-3" />
                                  <span>شراء وتوريد للمستودع</span>
                                </Badge>
                              ) : (sm.type === "sale" || sm.movement_type === "sale_out") ? (
                                <Badge className="bg-blue-500/10 text-blue-600 border border-blue-500/20 text-[11px] gap-1">
                                  <ArrowUpRight className="h-3 w-3" />
                                  <span>بيع في فاتورة عصر</span>
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[11px]">
                                  {sm.type || sm.movement_type}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell
                              className={`text-right font-bold text-xs font-mono ${
                                isPositive ? "text-emerald-600" : "text-destructive"
                              }`}
                            >
                              {isPositive ? `+${sm.quantity}` : sm.quantity} {sm.products?.unit || "قطعة"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground max-w-sm truncate">
                              {sm.notes || "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          PURCHASE PRODUCT MODAL (ATOMIC BACKEND RPC)
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={purchaseModalOpen} onOpenChange={setPurchaseModalOpen}>
        <DialogContent className="sm:max-w-[540px] text-right rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right pb-2 border-b border-border/60">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <span>تسجيل شراء منتجات تشغيلية / تنك</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              إدخال الكمية للمستودع وتسجيل الأثر المالي والالتزامات بحركة ذرية واحدة
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Product Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">الصنف / المنتج *</Label>
              <select
                value={purchaseForm.product_id}
                onChange={(e) => handleProductSelectForPurchase(e.target.value)}
                className="w-full h-10 px-3 border border-input rounded-xl text-sm bg-background text-foreground"
              >
                <option value="">-- اضغط لاختيار الصنف المراد شراؤه --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (المتوفر حالياً: {p.current_stock} {p.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Supplier Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">المورد (اختياري)</Label>
              <select
                value={purchaseForm.supplier_id}
                onChange={(e) => setPurchaseForm((p) => ({ ...p, supplier_id: e.target.value }))}
                className="w-full h-10 px-3 border border-input rounded-xl text-sm bg-background text-foreground"
              >
                <option value="">-- بدون تحديد مورد محدد --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity and Prices */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الكمية المشتراة *</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={purchaseForm.quantity}
                  onChange={(e) => setPurchaseForm((p) => ({ ...p, quantity: e.target.value }))}
                  placeholder="مثال: 50"
                  className="h-10 text-sm rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">سعر الشراء للوحدة *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={purchaseForm.purchase_price}
                  onChange={(e) => setPurchaseForm((p) => ({ ...p, purchase_price: e.target.value }))}
                  placeholder="0"
                  className="h-10 text-sm rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">سعر البيع المقترح</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={purchaseForm.sale_price}
                  onChange={(e) => setPurchaseForm((p) => ({ ...p, sale_price: e.target.value }))}
                  placeholder="0"
                  className="h-10 text-sm rounded-xl font-mono"
                />
              </div>
            </div>

            {/* Cost Summary Box */}
            <div className="p-3 bg-muted/40 rounded-xl flex items-center justify-between border border-border/50">
              <span className="text-xs text-muted-foreground font-medium">إجمالي تكلفة الشراء:</span>
              <span className="text-base font-bold font-mono text-foreground">
                {formatNumber((parseFloat(purchaseForm.quantity) || 0) * (parseFloat(purchaseForm.purchase_price) || 0))} ₪
              </span>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-semibold">مصدر تمويل الشراء *</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPurchaseForm((p) => ({ ...p, payment_method: "cash" }))}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                    purchaseForm.payment_method === "cash"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <Wallet className="h-4 w-4" />
                  <span>كاش الصندوق</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPurchaseForm((p) => ({ ...p, payment_method: "credit" }))}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                    purchaseForm.payment_method === "credit"
                      ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold shadow-xs"
                      : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <Handshake className="h-4 w-4" />
                  <span>دين للمورد</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPurchaseForm((p) => ({ ...p, payment_method: "partner" }))}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                    purchaseForm.payment_method === "partner"
                      ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold shadow-xs"
                      : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <Users className="h-4 w-4" />
                  <span>دفع من شريك</span>
                </button>
              </div>
            </div>

            {/* Conditional Partner Selector */}
            {purchaseForm.payment_method === "partner" && (
              <div className="space-y-1.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <Label className="text-xs font-bold text-blue-600 dark:text-blue-400">
                  اختر الشريك المموّل *
                </Label>
                <select
                  value={purchaseForm.partner_id}
                  onChange={(e) => setPurchaseForm((p) => ({ ...p, partner_id: e.target.value }))}
                  className="w-full h-10 px-3 border border-input rounded-xl text-sm bg-background text-foreground"
                >
                  <option value="">-- اضغط لاختيار الشريك --</option>
                  {partners.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  سيتم تسجيل البضاعة بالمخزن وإثبات ذمة مستحقة للشريك دون خصم كاش الصندوق.
                </p>
              </div>
            )}

            {purchaseForm.payment_method === "credit" && (
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                سيتم إثبات التزام مستحق الدفع (Payable) لصالح المورد بقيمة إجمالي الفاتورة دون خصم كاش الصندوق الآن.
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">ملاحظات الشراء (اختياري)</Label>
              <Textarea
                value={purchaseForm.notes}
                onChange={(e) => setPurchaseForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="رقم فاتورة الشراء أو تفاصيل الإرسالية..."
                rows={2}
                className="text-sm rounded-xl resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPurchaseModalOpen(false)}
              disabled={submittingPurchase}
              className="rounded-xl text-xs font-semibold"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={submitPurchase}
              disabled={submittingPurchase}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl gap-2 text-xs"
            >
              {submittingPurchase ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>جارٍ الحفظ الذري...</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span>تأكيد الشراء وإضافة للمخزون</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          ADD NEW PRODUCT MODAL
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={addProductModalOpen} onOpenChange={setAddProductModalOpen}>
        <DialogContent className="sm:max-w-[440px] text-right rounded-2xl" dir="rtl">
          <DialogHeader className="text-right pb-2 border-b border-border/60">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <span>إضافة صنف تشغيلي جديد</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              تعريف منتج تشغيلي جديد في النظام (مثل تنك، أكياس، فلاتر)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">اسم الصنف *</Label>
              <Input
                value={newProductForm.name}
                onChange={(e) => setNewProductForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="مثال: تنك حديد 16 لتر، أكياس خيش كبيرة..."
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">الوحدة</Label>
              <Input
                value={newProductForm.unit}
                onChange={(e) => setNewProductForm((p) => ({ ...p, unit: e.target.value }))}
                placeholder="قطعة، تنك، كيس..."
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">سعر الشراء الافتراضي (₪)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={newProductForm.purchase_price}
                  onChange={(e) => setNewProductForm((p) => ({ ...p, purchase_price: e.target.value }))}
                  className="h-10 text-sm rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">سعر البيع الافتراضي (₪)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={newProductForm.sale_price}
                  onChange={(e) => setNewProductForm((p) => ({ ...p, sale_price: e.target.value }))}
                  className="h-10 text-sm rounded-xl font-mono"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddProductModalOpen(false)}
              disabled={savingNewProduct}
              className="rounded-xl text-xs font-semibold"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={submitAddProduct}
              disabled={savingNewProduct}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl gap-1.5 text-xs"
            >
              {savingNewProduct ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span>حفظ الصنف</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice preview modal */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent dir="rtl" className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>معاينة الفاتورة</DialogTitle>
          </DialogHeader>
          {preview && <InvoicePreview data={preview} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatTile = ({ icon: Icon, title, value }: { icon: any; title: string; value: string }) => (
  <Card className="rounded-2xl border-border/60 shadow-xs">
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      <div className="text-lg font-bold text-foreground font-mono">{value}</div>
    </CardContent>
  </Card>
);

export default Inventory;
