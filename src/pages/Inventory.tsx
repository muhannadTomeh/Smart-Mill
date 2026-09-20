import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Warehouse, Droplets, Wallet, ArrowUp, ArrowDown,
  ShoppingCart, Calendar,
  Package, Plus, RefreshCw, Layers, Tag,
  Handshake, Users, ArrowUpRight, ArrowDownLeft, Archive,
  ChevronRight, ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";
import { useCashBalance } from "@/hooks/useCashBalance";
import { useRole } from "@/contexts/RoleContext";
import { useToast } from "@/hooks/use-toast";
import { Link, Navigate } from "react-router-dom";
import { formatDate, formatNumber } from "@/lib/formatters";

interface CashMovement {
  id: string;
  created_at: string;
  type: string;
  category: string;
  description: string | null;
  party_name: string | null;
  amount: number;
  direction: "in" | "out" | "none";
  reversal_of: string | null;
  reversal_reason: string | null;
  reference_type: string | null;
}

interface OilMovement {
  id: string;
  created_at: string;
  source_type: "milling_settlement" | "oil_purchase" | "oil_sale" | "adjustment" | string;
  direction: "in" | "out";
  quantity: number;
  party_name: string | null;
  notes: string | null;
  reference_type: string | null;
}

interface Product {
  id: string;
  name: string;
  unit: string;
  product_type: "container" | "goods";
  description?: string | null;
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
  reference_type?: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface PartnerOption {
  id: string;
  name: string;
}

const oilSourceLabel: Record<string, string> = {
  milling_settlement: "ردّ العصر",
  oil_purchase: "شراء زيت",
  oil_sale: "بيع زيت",
  adjustment: "تسوية / عكس",
};

const getOilMovementDescription = (movement: OilMovement) => {
  if (movement.reference_type === "invoice_reversal") {
    return "إلغاء رد زيت من فاتورة عصر";
  }

  switch (movement.source_type) {
    case "milling_settlement":
      return "رد زيت من فاتورة عصر";
    case "oil_purchase":
      return movement.notes || "شراء زيت";
    case "oil_sale":
      return movement.notes || "بيع زيت";
    case "adjustment":
      return "تسوية / عكس حركة زيت";
    default:
      return movement.notes || "—";
  }
};

const getCashMovementDescription = (movement: CashMovement) => {
  if (movement.reversal_of) {
    switch (movement.category) {
      case "expense_reversal":
        return "إلغاء مصروف";
      case "invoice_reversal":
        return "إلغاء فاتورة عصر";
      case "product_sale_cancellation":
        return "إلغاء بيع بضاعة";
      case "product_purchase_reversal":
        return "إلغاء شراء بضاعة";
      default:
        return "حركة عكسية / تصحيح";
    }
  }

  switch (movement.reference_type) {
    case "invoice":
      return "فاتورة عصر";
    case "expense":
      return "مصروف";
    case "worker_payment":
      return "دفعة عامل";
    case "product_purchase":
      return "شراء بضاعة";
    case "product_sale":
      return "بيع بضاعة";
    case "customer_payment":
      return "تحصيل ذمة";
    case "payable_settlement":
      return "سداد التزام";
    case "cash_opening_balance":
      return "الرصيد النقدي الافتتاحي";
    default:
      return movement.description || "حركة مالية";
  }
};

const Inventory = () => {
  const { isEmployee } = useRole();
  const { millId, isOwner } = useAuth();
  const { activeSeason } = useSeason();
  const { inventory, loading: invLoading, refetch: refetchInventory } = useInventory();
  const { cashBalance, loading: cashBalanceLoading, refetch: refetchCashBalance } = useCashBalance();
  const { toast } = useToast();

  const [activeMainTab, setActiveMainTab] = useState<"oil" | "products" | "definitions">("products");
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [purchaseDate, setPurchaseDate] = useState(getLocalDateString());
  const [expandedSection, setExpandedSection] = useState<
    "oil" | "cash" | "purchases" | "supply" | null
  >(null);
  // Canonical read models only: financial_effective_events and oil_movements.
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [oilMovements, setOilMovements] = useState<OilMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Operational Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [stockMovements, setStockMovements] = useState<ProductMovement[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [cashOpeningBalanceExists, setCashOpeningBalanceExists] = useState<boolean | null>(null);
  // Modals state
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);
  const [savingNewProduct, setSavingNewProduct] = useState(false);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [submittingSale, setSubmittingSale] = useState(false);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [stockPage, setStockPage] = useState(0);
  const STOCK_PAGE_SIZE = 7;
  const [saleForm, setSaleForm] = useState({
    product_id: "",
    quantity: "",
    sale_price: "",
    customer_name: "",
    notes: "",
  });
  // Form: Purchase
  const [purchaseForm, setPurchaseForm] = useState({
    product_id: "",
    supplier_id: "",
    quantity: "",
    purchase_price: "",
    sale_price: "",
    payment_method: "cash" as "cash" | "credit" | "partner",
    partner_id: "",
    partner_name: "",
    notes: "",
  });

  // Form: New Product
  const [newProductForm, setNewProductForm] = useState({
    name: "",
    product_type: "goods" as "container" | "goods",
    description: "",
    unit: "قطعة",
    purchase_price: "0",
    sale_price: "0",
  });

  useEffect(() => {
    if (!activeSeason) return;
    void fetchReadModels();
  }, [activeSeason?.id, selectedDate]);

  useEffect(() => {
    if (!activeSeason) return;
    void fetchProductsData();
  }, [activeSeason?.id, purchaseDate]);

  useEffect(() => {
    setCashOpeningBalanceExists(null);

    if (!activeSeason) return;

    void supabase
      .from("financial_transactions")
      .select("id")
      .eq("season_id", activeSeason.id)
      .eq("reference_type", "cash_opening_balance")
      .eq("status", "active")
      .limit(1)
      .then(({ data }) => {
        setCashOpeningBalanceExists(Boolean(data?.length));
      });
  }, [activeSeason?.id]);

  useEffect(() => {
    const effectiveMillId = millId || activeSeason?.mill_id;
    if (!activeSeason || !effectiveMillId) return;
    const channel = supabase
      .channel(`inventory-read-models-${effectiveMillId}-${activeSeason.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_transactions", filter: `season_id=eq.${activeSeason.id}` }, () => {
        void fetchReadModels();
        void refetchCashBalance();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "oil_movements", filter: `season_id=eq.${activeSeason.id}` }, () => {
        void fetchReadModels();
        void refetchInventory();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_stock_movements", filter: `season_id=eq.${activeSeason.id}` }, () => {
        void fetchProductsData();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeSeason?.id, activeSeason?.mill_id, millId, selectedDate, purchaseDate, refetchCashBalance, refetchInventory]);

  const fetchReadModels = async () => {
    const effectiveMillId = millId || activeSeason?.mill_id;
    if (!activeSeason || !effectiveMillId) return;
    setLoading(true);

    const startDate = new Date(`${selectedDate}T00:00:00`);
    const endDate = new Date(`${selectedDate}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1);

    const [cashRes, oilRes] = await Promise.all([
      supabase
        .from("financial_effective_events" as any)
        .select("id, created_at, type, category, description, party_name, amount, direction, reversal_of, reversal_reason, reference_type")
        .eq("season_id", activeSeason.id)
        .eq("mill_id", effectiveMillId)
        .gte("created_at", startDate.toISOString())
        .lt("created_at", endDate.toISOString())
        .order("created_at", { ascending: false }),

      supabase
        .from("oil_movements")
        .select("id, created_at, source_type, direction, quantity, party_name, notes, reference_type")
        .eq("season_id", activeSeason.id)
        .eq("mill_id", effectiveMillId)
        .gte("created_at", startDate.toISOString())
        .lt("created_at", endDate.toISOString())
        .order("created_at", { ascending: false }),

    ]);

    setCashMovements(((cashRes.data || []) as CashMovement[]).map((movement) => ({
      ...movement,
      amount: Number(movement.amount),
    })));
    setOilMovements(((oilRes.data || []) as OilMovement[]).map((movement) => ({
      ...movement,
      quantity: Number(movement.quantity),
    })));
    setLoading(false);
  };

  const fetchProductsData = async () => {
    setLoadingProducts(true);
    const purchaseStartDate = new Date(`${purchaseDate}T00:00:00`);
    const purchaseEndDate = new Date(`${purchaseDate}T00:00:00`);
    purchaseEndDate.setDate(purchaseEndDate.getDate() + 1);
    try {
      const [prodsRes, supsRes, partsRes, movesRes, purchasesRes, salesRes] = await Promise.all([
        supabase.from("products" as any).select("*").eq("active", true).order("name"),
        supabase.from("suppliers" as any).select("id, name").eq("active", true).order("name"),
        supabase.from("partners" as any).select("id, name").eq("active", true).order("name"),
        supabase.from("product_stock_movements" as any)
          .select("*, products(name, unit)")
          .eq("season_id", activeSeason?.id ?? "00000000-0000-0000-0000-000000000000")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("product_purchases" as any)
          .select("*, products(name, unit), suppliers(name), partners(name)")
          .eq("season_id", activeSeason?.id ?? "00000000-0000-0000-0000-000000000000")
          .gte("created_at", purchaseStartDate.toISOString())
          .lt("created_at", purchaseEndDate.toISOString())
          .order("created_at", { ascending: false }),

        (supabase.from("product_sales" as any) as any)
          .select("*, products(name, unit)")
          .eq("season_id", activeSeason?.id ?? "00000000-0000-0000-0000-000000000000")
          .order("created_at", { ascending: false })
          .limit(50),



      ]);


      if (prodsRes.data) setProducts(prodsRes.data as any);
      if (supsRes.data) setSuppliers(supsRes.data as any);
      if (partsRes.data) setPartners(partsRes.data as any);
      if (movesRes.data) setStockMovements(movesRes.data as any);
      if (purchasesRes.data) setPurchaseHistory(purchasesRes.data as any[]);
      if (salesRes.data) setSalesHistory(salesRes.data as any[]);

    } catch (e) {
      console.error("fetchProductsData error:", e);
    } finally {
      setLoadingProducts(false);
    }
  };

  const archiveMasterData = async (entity: "supplier" | "product", id: string, name: string) => {
    if (!window.confirm(`أرشفة ${name}؟ سيبقى تاريخه محفوظاً ولن يظهر في العمليات الجديدة.`)) return;
    const { error } = await supabase.rpc("archive_master_data_command", { p_entity: entity, p_id: id });
    if (error) {
      toast({ title: "تعذرت الأرشفة", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تمت الأرشفة", description: `تمت أرشفة ${name} مع الاحتفاظ بالسجل التاريخي.` });
    await fetchProductsData();
  };

  const cancelPurchase = async (purchase: any) => {
    const reason = window.prompt("سبب إلغاء عملية الشراء:");
    if (reason === null) return;
    if (!reason.trim()) {
      toast({ title: "سبب الإلغاء مطلوب", variant: "destructive" });
      return;
    }
    const { error } = await supabase.rpc("cancel_product_purchase_command" as any, {
      p_purchase_id: purchase.id,
      p_reason: reason.trim(),
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) {
      const message = error.message.includes("DEPENDENT_SETTLEMENT_EXISTS")
        ? "اعكس دفعات الالتزام المرتبطة أولاً."
        : error.message.includes("INSUFFICIENT_STOCK_FOR_CANCELLATION")
          ? "لا يمكن الإلغاء لأن المخزون الحالي لا يكفي لعكس الشراء."
          : error.message.includes("PRODUCT_PURCHASE_ALREADY_CANCELLED")
            ? "هذه العملية ملغاة بالفعل."
            : "تعذر إلغاء عملية الشراء.";
      toast({ title: "تعذر الإلغاء", description: message, variant: "destructive" });
      return;
    }
    toast({ title: "تم إلغاء عملية الشراء", description: "سُجلت حركات عكسية للكاش والمخزون دون حذف التاريخ." });
    await Promise.all([fetchProductsData(), refetchInventory(), refetchCashBalance(), fetchReadModels()]);
  };

  const adjustProductStock = async (product: Product) => {
    if (!activeSeason) return;
    const rawQuantity = window.prompt(`تعديل رصيد ${product.name}: أدخل رقمًا موجبًا للإضافة أو سالبًا للخصم.`);
    if (rawQuantity === null) return;
    const quantity = Number(rawQuantity);
    if (!Number.isInteger(quantity) || quantity === 0) {
      toast({ title: "كمية غير صالحة", description: "أدخل عددًا صحيحًا غير صفر.", variant: "destructive" });
      return;
    }
    const notes = window.prompt("سبب التعديل (اختياري):") ?? null;
    const { error } = await supabase.rpc("adjust_product_stock_command" as any, {
      p_season_id: activeSeason.id,
      p_product_id: product.id,
      p_quantity: quantity,
      p_notes: notes,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) {
      toast({ title: "تعذر تعديل الرصيد", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم تسجيل حركة المخزون" });
    await fetchProductsData();
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

  const handleProductSelectForSale = (productId: string) => {
    const selected = products.find((p) => p.id === productId);

    setSaleForm((p) => ({
      ...p,
      product_id: productId,
      sale_price: selected
        ? String(selected.default_sale_price ?? selected.sale_price ?? 0)
        : "",
    }));
  };

  const submitProductSale = async () => {
    if (!activeSeason) return;

    const product = products.find((p) => p.id === saleForm.product_id);
    const quantity = Number(saleForm.quantity);
    const salePrice = Number(saleForm.sale_price);

    if (!product) {
      toast({
        title: "اختر الصنف",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast({
        title: "الكمية غير صحيحة",
        description: "يجب أن تكون الكمية عددًا صحيحًا أكبر من صفر.",
        variant: "destructive",
      });
      return;
    }

    if (quantity > product.current_stock) {
      toast({
        title: "المخزون غير كافٍ",
        description: `المتوفر حاليًا ${product.current_stock} ${product.unit}`,
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(salePrice) || salePrice <= 0) {
      toast({
        title: "سعر البيع غير صحيح",
        variant: "destructive",
      });
      return;
    }

    setSubmittingSale(true);

    try {
      const { error } = await supabase.rpc(
        "record_product_sale_command" as any,
        {
          p_season_id: activeSeason.id,
          p_product_id: product.id,
          p_quantity: quantity,
          p_unit_price: salePrice,
          p_customer_name: saleForm.customer_name.trim() || null,
          p_notes: saleForm.notes.trim() || null,
          p_idempotency_key: crypto.randomUUID(),
        },
      );

      if (error) throw error;

      toast({
        title: "تم بيع البضاعة",
        description: `${quantity} ${product.unit} × ${salePrice} ₪ = ${quantity * salePrice} ₪`,
      });

      setSaleForm({
        product_id: "",
        quantity: "",
        sale_price: "",
        customer_name: "",
        notes: "",
      });

      setSaleModalOpen(false);

      await Promise.all([
        fetchProductsData(),
        fetchReadModels(),
        refetchCashBalance(),
      ]);
    } catch (err: any) {
      console.error("PRODUCT SALE ERROR:", err);

      toast({
        title: "فشل بيع البضاعة",
        description: err?.message || "تعذر تسجيل عملية البيع.",
        variant: "destructive",
      });

    } finally {
      setSubmittingSale(false);
    }
  }

  const cancelProductSale = async (sale: any) => {
    const reason = window.prompt("سبب إلغاء عملية البيع:");
    if (reason === null) return;

    if (!reason.trim()) {
      toast({
        title: "سبب الإلغاء مطلوب",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase.rpc(
      "cancel_product_sale_command" as any,
      {
        p_sale_id: sale.id,
        p_reason: reason.trim(),
        p_idempotency_key: crypto.randomUUID(),
      },
    );

    if (error) {
      toast({
        title: "تعذر إلغاء البيع",
        description: error.message?.includes("PRODUCT_SALE_ALREADY_CANCELLED")
          ? "عملية البيع ملغاة بالفعل."
          : "تعذر عكس عملية البيع.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "تم إلغاء البيع",
      description: "تمت إعادة الكمية للمخزون وعكس الحركة النقدية.",
    });

    await Promise.all([
      fetchProductsData(),
      fetchReadModels(),
      refetchCashBalance(),
    ]);
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
    if (!purchaseForm.supplier_id) {
      toast({ title: "تنبيه", description: "يرجى اختيار المورد", variant: "destructive" });
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      toast({ title: "تنبيه", description: "يرجى إدخال كمية صحيحة", variant: "destructive" });
      return;
    }
    if (isNaN(buyPrice) || buyPrice <= 0) {
      toast({ title: "تنبيه", description: "سعر شراء الوحدة يجب أن يكون أكبر من صفر", variant: "destructive" });
      return;
    }
    if (purchaseForm.payment_method === "partner" && !purchaseForm.partner_name.trim() && !purchaseForm.partner_id) {
      toast({ title: "تنبيه", description: "يرجى تدوين أو اختيار اسم الشريك الذي دفع قيمة الشراء", variant: "destructive" });
      return;
    }

    setSubmittingPurchase(true);
    try {
      const { error } = await supabase.rpc("record_product_purchase_atomic" as any, {
        p_season_id: activeSeason.id,
        p_product_id: purchaseForm.product_id,
        p_quantity: qty,
        p_unit_price: buyPrice,
        p_payment_method: purchaseForm.payment_method,
        p_supplier_id: purchaseForm.supplier_id || null,
        p_partner_id: purchaseForm.payment_method === "partner" ? (purchaseForm.partner_id || null) : null,
        p_notes: purchaseForm.notes.trim() || null,
        p_sale_price: sellPrice > 0 ? sellPrice : null,
        p_partner_name: purchaseForm.payment_method === "partner" ? (purchaseForm.partner_name.trim() || null) : null,
        p_idempotency_key: crypto.randomUUID(),
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
        partner_name: "",
        notes: "",
      });

      await Promise.all([
        fetchProductsData(),
        refetchInventory(),
        refetchCashBalance(),
        fetchReadModels(),
      ]);
    } catch (err: any) {
      const errorMessage = String(err?.message || "");
      const purchaseErrorMessage = errorMessage.includes("PRODUCT_PURCHASE_INVALID")
        ? "تأكد من أن الكمية وسعر شراء الوحدة أكبر من صفر."
        : errorMessage.includes("SUPPLIER_NOT_FOUND")
          ? "يرجى اختيار مورد فعّال تابع لهذه المعصرة."
          : errorMessage.includes("PARTNER_REQUIRED")
            ? "يرجى اختيار شريك مسجل لعملية الدفع من شريك."
            : errorMessage.includes("PARTNER_NOT_FOUND")
              ? "الشريك المختار غير موجود في هذه المعصرة."
              : errorMessage.includes("PRODUCT_PURCHASE_FORBIDDEN")
                ? "هذه العملية متاحة لمالك المعصرة فقط."
                : errorMessage || "تعذر إتمام الشراء";
      toast({
        title: "خطأ في تسجيل الشراء",
        description: purchaseErrorMessage,
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
        product_type: newProductForm.product_type,
        description: newProductForm.description.trim() || null,
        default_purchase_price: parseFloat(newProductForm.purchase_price) || 0,
        default_sale_price: parseFloat(newProductForm.sale_price) || 0,
        current_stock: 0,
        active: true,
      });

      if (error) throw error;

      toast({ title: "تمت الإضافة", description: `تمت إضافة الصنف "${newProductForm.name}" بنجاح.` });
      setAddProductModalOpen(false);
      setNewProductForm({ name: "", product_type: "goods", description: "", unit: "قطعة", purchase_price: "0", sale_price: "0" });
      await fetchProductsData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "تعذر حفظ الصنف", variant: "destructive" });
    } finally {
      setSavingNewProduct(false);
    }
  };

  const setOpeningCashBalance = async () => {
    if (!activeSeason) return;
    const raw = window.prompt("الرصيد النقدي الافتتاحي للمعصرة");
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const { error } = await supabase.rpc("record_cash_opening_balance_command" as any, { p_season_id: activeSeason.id, p_amount: amount, p_notes: null, p_idempotency_key: crypto.randomUUID() });
    if (error) {
      toast({ title: "تعذر تسجيل الرصيد الافتتاحي", description: error.message === "DUPLICATE_OPENING_BALANCE" ? "تم تسجيل الرصيد الافتتاحي مسبقاً" : error.message, variant: "destructive" });
      return;
    }
    setCashOpeningBalanceExists(true);
    toast({ title: "تم تسجيل الرصيد النقدي الافتتاحي" });
    await Promise.all([fetchReadModels(), refetchCashBalance()]);
  };

  const cashTotals = useMemo(() => cashMovements.reduce((totals, movement) => {
    if (movement.direction === "in") totals.in += movement.amount;
    if (movement.direction === "out") totals.out += movement.amount;
    return totals;
  }, { in: 0, out: 0 }), [cashMovements]);

  const oilTotals = useMemo(() => oilMovements.reduce((totals, movement) => {
    if (movement.direction === "in") totals.in += movement.quantity;
    if (movement.direction === "out") totals.out += movement.quantity;
    return totals;
  }, { in: 0, out: 0 }), [oilMovements]);

  const stockTotalPages = Math.max(
    1,
    Math.ceil(stockMovements.length / STOCK_PAGE_SIZE)
  );

  const paginatedStockMovements = useMemo(() => {
    const start = stockPage * STOCK_PAGE_SIZE;

    return stockMovements.slice(
      start,
      start + STOCK_PAGE_SIZE
    );
  }, [stockMovements, stockPage]);

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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">المخزون والبضائع</h1>
            <p className="text-xs text-muted-foreground mt-0.5">رصيد الزيت والكاش، البضائع، والتعريف والتوريد</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchReadModels();
              fetchProductsData();
              refetchInventory();
            }}
            className="gap-2 rounded-xl text-xs h-9"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>تحديث</span>
          </Button>

          {(activeMainTab === "products" || activeMainTab === "definitions") && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewProductForm((p) => ({ ...p, product_type: "goods" }));
                  setAddProductModalOpen(true);
                }}
                className="gap-1.5 rounded-xl text-xs h-9 font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة صنف</span>
              </Button>

            </>
          )}
        </div>
      </div>

      {/* Main Tabs Selection */}
      <div className="flex border-b border-border/70 gap-2">


        <button
          type="button"
          onClick={() => setActiveMainTab("products")}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeMainTab === "products"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          <Package className="h-4 w-4" />
          <span>مخزون البضائع</span>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            {products.length}
          </Badge>
        </button>
        <button
          type="button"
          onClick={() => setActiveMainTab("definitions")}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeMainTab === "definitions" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Tag className="h-4 w-4" />
          <span>التعريف والتوريد</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab("oil")}
          className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeMainTab === "oil"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          <Droplets className="h-4 w-4" />
          <span>الزيت والكاش</span>
        </button>

      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: OIL & CASH MOVEMENTS
      ───────────────────────────────────────────────────────────── */}
      {activeMainTab === "oil" && (
        <div className="space-y-6">
          {isOwner && cashOpeningBalanceExists === false && (
            <Card className="border-amber-300 bg-amber-50/50 rounded-2xl">
              <CardContent className="py-4 grid gap-4 md:grid-cols-2">

                {cashOpeningBalanceExists === false && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold">الرصيد النقدي الافتتاحي</p>
                      <p className="text-sm text-muted-foreground">
                        يُسجّل مرة واحدة كبداية للرصيد وليس كإيراد أو ربح.
                      </p>
                    </div>

                    <Button onClick={setOpeningCashBalance}>
                      تسجيل الرصيد النقدي الافتتاحي
                    </Button>
                  </div>
                )}

              </CardContent>
            </Card>
          )}

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">حركات المخزون والكاش</h2>
              <p className="text-xs text-muted-foreground mt-1">
                يتم عرض العمليات الخاصة باليوم المحدد فقط
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">التاريخ</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-[180px]"
              />
            </div>
          </div>


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
                    <div className="text-3xl font-bold text-primary font-mono mt-1">
                      {invLoading || inventory.total_oil == null ? (
                        <div className="h-8 w-28 bg-muted rounded animate-pulse" />
                      ) : (
                        <>
                          {Number(inventory.total_oil).toFixed(2)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">كغم</span>
                        </>
                      )}
                    </div>

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
                      {cashBalanceLoading ? "—" : cashBalance.toFixed(2)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">₪</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Aggregated flows for the selected day */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile icon={ArrowDown} title="زيت داخل" value={`${oilTotals.in.toFixed(2)} كغم`} />
            <StatTile icon={ArrowUp} title="زيت خارج" value={`${oilTotals.out.toFixed(2)} كغم`} />
            <StatTile icon={ArrowDown} title="كاش داخل" value={`${cashTotals.in.toFixed(2)} ₪`} />
            <StatTile icon={ArrowUp} title="كاش خارج" value={`${cashTotals.out.toFixed(2)} ₪`} />
          </div>


          {/* Collapsible movement logs */}
          <div className="space-y-3">

            {/* Oil movements */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between rounded-xl h-11"
                onClick={() =>
                  setExpandedSection((current) =>
                    current === "oil" ? null : "oil"
                  )
                }
              >
                <div className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-primary" />
                  <span className="font-bold">حركة الزيت</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{oilMovements.length} حركة</span>
                  <span>{expandedSection === "oil" ? "▲" : "▼"}</span>
                </div>
              </Button>

              {expandedSection === "oil" && (
                <Card className="border-border/60 rounded-2xl shadow-xs overflow-hidden">
                  <CardHeader className="border-b border-border/70 bg-card/60 p-4 sm:p-5">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Droplets className="h-4 w-4 text-primary" />
                      <span>حركة الزيت</span>
                    </CardTitle>

                    <CardDescription className="text-xs">
                      حركات الزيت الخاصة باليوم المحدد
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-0">
                    {loading ? (
                      <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
                        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                        <p className="text-xs">جارٍ تحميل حركة الزيت...</p>
                      </div>
                    ) : oilMovements.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Droplets className="h-12 w-12 mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-semibold">
                          لا توجد حركات زيت في هذا اليوم
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-muted/40">
                            <TableRow>
                              <TableHead className="text-right text-xs font-bold">
                                التاريخ
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                المصدر
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                الطرف / البيان
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                الاتجاه
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                الكمية
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                الحالة
                              </TableHead>
                            </TableRow>
                          </TableHeader>

                          <TableBody>
                            {oilMovements.map((movement) => {
                              const isReversal = Boolean(
                                movement.reference_type?.includes("reversal")
                              );

                              return (
                                <TableRow
                                  key={movement.id}
                                  className="hover:bg-muted/30"
                                >
                                  <TableCell className="text-right whitespace-nowrap text-xs font-mono">
                                    <div className="flex items-center gap-1">
                                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                      {formatDate(movement.created_at)}
                                    </div>
                                  </TableCell>

                                  <TableCell className="text-right">
                                    <Badge
                                      variant="outline"
                                      className="text-xs font-semibold"
                                    >
                                      {oilSourceLabel[movement.source_type] ||
                                        movement.source_type}
                                    </Badge>
                                  </TableCell>

                                  <TableCell className="text-right">
                                    <div className="font-semibold text-xs text-foreground">
                                      {movement.party_name || "—"}
                                    </div>

                                    <div className="text-[11px] text-muted-foreground">
                                      {getOilMovementDescription(movement)}
                                    </div>
                                  </TableCell>

                                  <TableCell
                                    className={
                                      movement.direction === "in"
                                        ? "text-right text-xs font-bold text-emerald-600"
                                        : "text-right text-xs font-bold text-destructive"
                                    }
                                  >
                                    {movement.direction === "in" ? "IN" : "OUT"}
                                  </TableCell>

                                  <TableCell
                                    className={
                                      movement.direction === "in"
                                        ? "text-right font-bold text-xs font-mono text-emerald-600"
                                        : "text-right font-bold text-xs font-mono text-destructive"
                                    }
                                  >
                                    {movement.direction === "in" ? "+" : "-"}
                                    {movement.quantity.toFixed(2)} كغم
                                  </TableCell>

                                  <TableCell className="text-right">
                                    {isReversal ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[11px]"
                                      >
                                        عكس
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="secondary"
                                        className="text-[11px]"
                                      >
                                        فعال
                                      </Badge>
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
              )}
            </div>

            {/* Cash movements */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between rounded-xl h-11"
                onClick={() =>
                  setExpandedSection((current) =>
                    current === "cash" ? null : "cash"
                  )
                }
              >
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-emerald-600" />
                  <span className="font-bold">حركة الكاش</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{cashMovements.length} حركة</span>
                  <span>{expandedSection === "cash" ? "▲" : "▼"}</span>
                </div>
              </Button>

              {expandedSection === "cash" && (
                <Card className="border-border/60 rounded-2xl shadow-xs overflow-hidden">
                  <CardHeader className="border-b border-border/70 bg-card/60 p-4 sm:p-5">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-emerald-600" />
                      <span>حركة الكاش</span>
                    </CardTitle>

                    <CardDescription className="text-xs">
                      الحركات المالية الخاصة باليوم المحدد
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-0">
                    {loading ? (
                      <div className="text-center py-12 text-muted-foreground">
                        جارٍ تحميل حركة الكاش...
                      </div>
                    ) : cashMovements.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        لا توجد حركات كاش في هذا اليوم
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="bg-muted/40">
                            <TableRow>
                              <TableHead className="text-right text-xs font-bold">
                                التاريخ
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                النوع
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                الوصف
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                الطرف
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                الاتجاه
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                المبلغ
                              </TableHead>
                              <TableHead className="text-right text-xs font-bold">
                                الحالة
                              </TableHead>
                            </TableRow>
                          </TableHeader>

                          <TableBody>
                            {cashMovements.map((movement) => {
                              const directionLabel =
                                movement.direction === "in"
                                  ? "IN"
                                  : movement.direction === "out"
                                    ? "OUT"
                                    : "لا أثر نقدي";

                              const directionClass =
                                movement.direction === "in"
                                  ? "text-emerald-600"
                                  : movement.direction === "out"
                                    ? "text-destructive"
                                    : "text-muted-foreground";

                              const sign =
                                movement.direction === "in"
                                  ? "+"
                                  : movement.direction === "out"
                                    ? "-"
                                    : "";

                              return (
                                <TableRow
                                  key={movement.id}
                                  className="hover:bg-muted/30"
                                >
                                  <TableCell className="text-right text-xs font-mono">
                                    {formatDate(movement.created_at)}
                                  </TableCell>

                                  <TableCell className="text-right">
                                    <Badge
                                      variant="outline"
                                      className="text-[11px]"
                                    >
                                      {movement.category || movement.type}
                                    </Badge>
                                  </TableCell>

                                  <TableCell className="text-right text-xs">
                                    {getCashMovementDescription(movement)}
                                  </TableCell>

                                  <TableCell className="text-right text-xs">
                                    {movement.party_name || "—"}
                                  </TableCell>

                                  <TableCell
                                    className={`text-right text-xs font-bold ${directionClass}`}
                                  >
                                    {directionLabel}
                                  </TableCell>

                                  <TableCell
                                    className={`text-right text-xs font-bold font-mono ${directionClass}`}
                                  >
                                    {sign}
                                    {movement.amount.toFixed(2)} ₪
                                  </TableCell>

                                  <TableCell className="text-right">
                                    {movement.reversal_of ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[11px]"
                                      >
                                        عكس
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="secondary"
                                        className="text-[11px]"
                                      >
                                        فعال
                                      </Badge>
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
              )}
            </div>

          </div>
        </div>
      )}

      {activeMainTab === "products" && (
        <div className="space-y-6">
          {/* Products Stock Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <span>أصناف المنتجات والتنك التشغيلي</span>
                <Button
                  size="sm"
                  onClick={() => setSaleModalOpen(true)}
                  className="gap-1.5"
                >
                  <ArrowUpRight className="h-4 w-4" />
                  بيع بضاعة
                </Button>
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
                            className={`text-[10px] ${isLow
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

                        <Button variant="ghost" size="sm" className="w-full text-xs text-destructive" onClick={() => void archiveMasterData("product", p.id, p.name)}>
                          <Archive className="h-3.5 w-3.5 me-1" /> أرشفة الصنف
                        </Button>
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
                      {paginatedStockMovements.map((sm) => {
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
                                  <span>
                                    {sm.reference_type === "product_sale"
                                      ? "بيع بضاعة"
                                      : "بيع في فاتورة عصر"}
                                  </span>
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[11px]">
                                  {sm.type || sm.movement_type}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell
                              className={`text-right font-bold text-xs font-mono ${isPositive ? "text-emerald-600" : "text-destructive"
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

                {stockMovements.length > STOCK_PAGE_SIZE && (
                <div className="flex items-center justify-center gap-3 border-t border-border/60 p-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    disabled={stockPage === 0}
                    onClick={() =>
                      setStockPage((page) => Math.max(0, page - 1))
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>

                  <span className="text-xs text-muted-foreground font-medium">
                    {stockPage + 1} / {stockTotalPages}
                  </span>

                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    disabled={stockPage >= stockTotalPages - 1}
                    onClick={() =>
                      setStockPage((page) =>
                        Math.min(stockTotalPages - 1, page + 1)
                      )
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              )}



            </CardContent>
          </Card>

          {/* Purchase History - filtered by one selected day */}
          <Card className="border-border/60 rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-4 sm:p-5 border-b border-border/70">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    <span>سجل عمليات الشراء</span>
                  </CardTitle>

                  <CardDescription className="text-xs mt-1">
                    عمليات شراء وتوريد البضائع في اليوم المحدد
                  </CardDescription>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">تاريخ الشراء</Label>

                  <Input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-[180px]"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loadingProducts ? (
                <div className="text-center py-10 text-muted-foreground">
                  جارٍ تحميل عمليات الشراء...
                </div>
              ) : purchaseHistory.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">لا توجد عمليات شراء في هذا اليوم</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">الصنف</TableHead>
                        <TableHead className="text-right">المورد</TableHead>
                        <TableHead className="text-right">التمويل</TableHead>
                        <TableHead className="text-right">المبلغ</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">إجراء</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {purchaseHistory.map((purchase) => (
                        <TableRow key={purchase.id}>
                          <TableCell className="text-xs">
                            {formatDate(purchase.created_at)}
                          </TableCell>

                          <TableCell>
                            {purchase.products?.name || "صنف"}
                          </TableCell>

                          <TableCell>
                            {purchase.suppliers?.name ||
                              purchase.partners?.name ||
                              "—"}
                          </TableCell>

                          <TableCell>
                            {purchase.payment_method === "cash"
                              ? "نقدي"
                              : purchase.payment_method === "credit"
                                ? "آجل"
                                : "دفع شريك"}
                          </TableCell>

                          <TableCell>
                            {Number(purchase.total_price).toLocaleString()} ₪
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                purchase.status === "cancelled"
                                  ? "text-rose-700 border-rose-300"
                                  : "text-emerald-700 border-emerald-300"
                              }
                            >
                              {purchase.status === "cancelled"
                                ? "ملغاة"
                                : "فعالة"}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            {purchase.status !== "cancelled" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-rose-700 border-rose-300"
                                onClick={() => void cancelPurchase(purchase)}
                              >
                                إلغاء
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
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
              <Label className="text-xs font-semibold">المورد *</Label>
              <select
                value={purchaseForm.supplier_id}
                onChange={(e) => setPurchaseForm((p) => ({ ...p, supplier_id: e.target.value }))}
                className="w-full h-10 px-3 border border-input rounded-xl text-sm bg-background text-foreground"
              >
                <option value="">-- اختر المورد --</option>
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
                  className="h-10 text-sm rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">سعر الشراء للوحدة *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={purchaseForm.purchase_price}
                  onChange={(e) => setPurchaseForm((p) => ({ ...p, purchase_price: e.target.value }))}
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
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${purchaseForm.payment_method === "cash"
                    ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                    : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                    }`}
                >
                  <Wallet className="h-4 w-4" />
                  <span>نقدي المعصرة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPurchaseForm((p) => ({ ...p, payment_method: "credit" }))}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${purchaseForm.payment_method === "credit"
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
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${purchaseForm.payment_method === "partner"
                    ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold shadow-xs"
                    : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                    }`}
                >
                  <Users className="h-4 w-4" />
                  <span>دفع من شريك</span>
                </button>



              </div>
            </div>

            {/* Conditional Partner Input (Free-text + quick pick badges) */}
            {purchaseForm.payment_method === "partner" && (
              <div className="space-y-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <Label className="text-xs font-bold text-blue-600 dark:text-blue-400">
                  اسم الشريك المموّل *
                </Label>
                <Input
                  value={purchaseForm.partner_name}
                  onChange={(e) => {
                    const typed = e.target.value;
                    const matched = partners.find((pt) => pt.name.trim().toLowerCase() === typed.trim().toLowerCase());
                    setPurchaseForm((p) => ({
                      ...p,
                      partner_name: typed,
                      partner_id: matched ? matched.id : "",
                    }));
                  }}
                  className="h-10 text-sm rounded-xl"
                />
                {partners.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">أو اختر شريكاً مسجلاً:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {partners.map((pt) => (
                        <button
                          key={pt.id}
                          type="button"
                          onClick={() => {
                            setPurchaseForm((p) => ({
                              ...p,
                              partner_id: pt.id,
                              partner_name: pt.name,
                            }));
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${purchaseForm.partner_id === pt.id || purchaseForm.partner_name === pt.name
                            ? "bg-blue-600 text-white border-blue-600 font-semibold shadow-xs"
                            : "bg-background hover:bg-muted border-border/70 text-foreground"
                            }`}
                        >
                          {pt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  سيتم تسجيل البضاعة بالمخزن وإثبات ذمة مستحقة للشريك دون خصم نقدي المعصرة.
                </p>
              </div>
            )}

            {purchaseForm.payment_method === "credit" && (
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                سيتم إثبات التزام مستحق الدفع (Payable) لصالح المورد بقيمة إجمالي الفاتورة دون خصم نقدي المعصرة الآن.
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">ملاحظات الشراء (اختياري)</Label>
              <Textarea
                value={purchaseForm.notes}
                onChange={(e) => setPurchaseForm((p) => ({ ...p, notes: e.target.value }))}
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

      {activeMainTab === "definitions" && (
        <div className="space-y-5">
          <Card className="rounded-2xl border-border/70">
            <CardHeader>
              <CardTitle>التعريف والتوريد</CardTitle>
              <CardDescription>تعريف الصنف لا يغيّر المخزون. الشراء وحده ينشئ حركة توريد ومخزوناً.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Button variant="outline" className="h-auto min-h-20 flex-col gap-2" onClick={() => { setNewProductForm((p) => ({ ...p, product_type: "container", unit: "قطعة" })); setAddProductModalOpen(true); }}>
                <Package className="h-5 w-5" /> + تعريف نوع تنك
              </Button>
              <Button variant="outline" className="h-auto min-h-20 flex-col gap-2" onClick={() => { setNewProductForm((p) => ({ ...p, product_type: "goods", unit: "قطعة" })); setAddProductModalOpen(true); }}>
                <Tag className="h-5 w-5" /> + تعريف بضاعة أخرى
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-20 flex-col gap-2"
                asChild
              >
                <Link to="/payables?tab=suppliers">
                  <Users className="h-5 w-5" />
                  إدارة الموردين
                </Link>
              </Button>

              <Button className="h-auto min-h-20 flex-col gap-2" onClick={() => setPurchaseModalOpen(true)}>
                <ShoppingCart className="h-5 w-5" /> + شراء بضاعة
              </Button>
            </CardContent>

          </Card>
          <Card className="rounded-2xl border-border/70">
            <CardHeader><CardTitle className="text-base">آخر عمليات التوريد</CardTitle></CardHeader>

            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {stockMovements
                .filter((m) => m.type === "purchase" || m.movement_type === "purchase_in")
                .slice(0, 8)
                .map((movement) => (
                  <div key={movement.id} className="flex justify-between border-b pb-2">
                    <span>{movement.products?.name || "بضاعة"}</span>
                    <span>+{movement.quantity}</span>
                  </div>
                ))}
              {!stockMovements.some(
                (m) => m.type === "purchase" || m.movement_type === "purchase_in",
              ) && <p>لا توجد عمليات توريد بعد.</p>}
            </CardContent>
          </Card>
        </div>
      )}



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
              <Label className="text-xs font-semibold">{newProductForm.product_type === "container" ? "اسم نوع التنك *" : "اسم البضاعة *"}</Label>
              <Input
                value={newProductForm.name}
                onChange={(e) => setNewProductForm((p) => ({ ...p, name: e.target.value }))}
                className="h-10 text-sm rounded-xl"
              />
            </div>
            {newProductForm.product_type === "goods" && <div className="space-y-1.5">
              <Label className="text-xs font-semibold">الوصف (اختياري)</Label>
              <Textarea value={newProductForm.description} onChange={(e) => setNewProductForm((p) => ({ ...p, description: e.target.value }))} className="rounded-xl" />
            </div>}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">الوحدة</Label>
              <Input
                value={newProductForm.unit}
                onChange={(e) => setNewProductForm((p) => ({ ...p, unit: e.target.value }))}
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


      <Dialog open={saleModalOpen} onOpenChange={setSaleModalOpen}>
        <DialogContent className="sm:max-w-[520px] text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle>بيع بضاعة</DialogTitle>
            <DialogDescription>
              تسجيل بيع نقدي وخصم الكمية مباشرة من المخزون
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>الصنف *</Label>

              <select
  value={saleForm.product_id}
  onChange={(e) => handleProductSelectForSale(e.target.value)}
  className="w-full h-10 px-3 border border-input rounded-xl bg-background"
>
  <option value="">-- اختر البضاعة --</option>

  {products
    .filter((p) => p.current_stock > 0)
    .map((p) => (
      <option key={p.id} value={p.id}>
        {p.name} — المتوفر {p.current_stock} {p.unit}
      </option>
    ))}
</select>

            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الكمية *</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={saleForm.quantity}
                  onChange={(e) =>
                    setSaleForm((p) => ({
                      ...p,
                      quantity: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>سعر البيع للوحدة *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={saleForm.sale_price}
                  onChange={(e) =>
                    setSaleForm((p) => ({
                      ...p,
                      sale_price: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="rounded-xl border bg-muted/40 p-3 flex justify-between">
              <span className="text-sm text-muted-foreground">
                إجمالي البيع
              </span>

              <strong className="font-mono">
                {formatNumber(
                  (Number(saleForm.quantity) || 0) *
                  (Number(saleForm.sale_price) || 0),
                )} ₪
              </strong>
            </div>

            <div className="space-y-1.5">
              <Label>اسم الزبون (اختياري)</Label>
              <Input
                value={saleForm.customer_name}
                onChange={(e) =>
                  setSaleForm((p) => ({
                    ...p,
                    customer_name: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Textarea
                value={saleForm.notes}
                onChange={(e) =>
                  setSaleForm((p) => ({
                    ...p,
                    notes: e.target.value,
                  }))
                }
              />
            </div>

            <div className="rounded-xl bg-primary/5 border p-3 text-sm">
              طريقة الدفع: <strong>نقدي المعصرة</strong>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setSaleModalOpen(false)}
              disabled={submittingSale}
            >
              إلغاء
            </Button>

            <Button
              onClick={submitProductSale}
              disabled={submittingSale}
            >
              {submittingSale ? "جاري التسجيل..." : "تأكيد البيع"}
            </Button>
          </DialogFooter>
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
