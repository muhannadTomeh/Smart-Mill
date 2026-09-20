import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HandCoins,
  Building2,
  Users2,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  ArrowDownLeft,
  AlertCircle,
  Phone,
  MapPin,
  FileText,
  RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSeason } from "@/contexts/SeasonContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate } from "@/lib/formatters";

interface Payable {
  id: string;
  mill_id: string;
  season_id: string;
  type: "due_to_partner" | "due_to_supplier" | "other";
  partner_id?: string | null;
  supplier_id?: string | null;
  creditor_name: string;
  original_amount: number;
  paid_amount: number;
  remaining_amount: number;
  source_type: string;
  source_id?: string | null;
  status: "unpaid" | "partially_paid" | "paid" | "cancelled";
  notes?: string | null;
  created_at: string;
}

interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  active: boolean;
  created_at: string;
}

interface Partner {
  id: string;
  name: string;
  active: boolean;
}

interface SettlementHistoryItem {
  id: string;
  payable_id: string;
  amount: number;
  payment_method: string | null;
  created_at: string;
  reversed: boolean;
}

interface Receivable {
  id: string;
  mill_id: string;
  season_id: string;
  type: "due_from_partner" | "other";
  partner_id?: string | null;
  debtor_name: string;
  original_amount: number;
  collected_amount: number;
  remaining_amount: number;
  source_type: "manual" | "oil_sale";
  source_id?: string | null;
  status: "unpaid" | "partially_paid" | "paid" | "cancelled";
  reference_number?: string | null;
  notes?: string | null;
  created_at: string;
}

export default function Payables() {
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const { toast } = useToast();

  const [payables, setPayables] = useState<Payable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);

  const [receivables, setReceivables] = useState<Receivable[]>([]);

  const [addReceivableOpen, setAddReceivableOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab =
    searchParams.get("tab") === "suppliers"
      ? "suppliers"
      : "payables";

  const [newReceivable, setNewReceivable] = useState({
    type: "due_from_partner" as "due_from_partner" | "other",
    partnerId: "",
    debtorName: "",
    amount: "",
    referenceNumber: "",
    notes: "",
  });

  const [savingReceivable, setSavingReceivable] = useState(false);

  const [collectTarget, setCollectTarget] = useState<Receivable | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<"cash" | "other">("cash");
  const [collectNotes, setCollectNotes] = useState("");
  const [collectLoading, setCollectLoading] = useState(false);

  const [addManualPayableOpen, setAddManualPayableOpen] = useState(false);

  const [manualPayable, setManualPayable] = useState({
    type: "due_to_partner" as "due_to_partner" | "due_to_supplier" | "other",
    partnerId: "",
    supplierId: "",
    creditorName: "",
    amount: "",
    referenceNumber: "",
    notes: "",
  });

  const [savingManualPayable, setSavingManualPayable] = useState(false);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Settle Dialog State
  const [settleTarget, setSettleTarget] = useState<Payable | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMethod, setSettleMethod] = useState<"cash" | "other">("cash");
  const [settleNotes, setSettleNotes] = useState("");
  const [settleLoading, setSettleLoading] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<Payable | null>(null);
  const [settlements, setSettlements] = useState<SettlementHistoryItem[]>([]);
  const [reversingSettlement, setReversingSettlement] = useState<string | null>(null);

  // Add Supplier Dialog State
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", address: "", notes: "" });
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [editSupplierOpen, setEditSupplierOpen] = useState(false);

  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [editSupplierForm, setEditSupplierForm] = useState({
    name: "",
    phone: "",
  });

  const [savingSupplierEdit, setSavingSupplierEdit] = useState(false);

  useEffect(() => {
    if (activeSeason) {
      fetchData();
    }
  }, [activeSeason?.id]);

  const fetchData = async () => {
    if (!activeSeason) return;

    setLoading(true);

    try {
      const effectiveMillId = millId || activeSeason.mill_id;

      const [payRes, recRes, supRes, partnerRes] = await Promise.all([
        supabase
          .from("payables" as any)
          .select("*")
          .eq("season_id", activeSeason.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("receivables" as any)
          .select("*")
          .eq("mill_id", effectiveMillId)
          .order("created_at", { ascending: false }),

        supabase
          .from("suppliers" as any)
          .select("*")
          .eq("active", true)
          .order("name", { ascending: true }),

        supabase
          .from("partners" as any)
          .select("id, name, active")
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      if (payRes.error) console.error("payables:", payRes.error);
      if (recRes.error) console.error("receivables:", recRes.error);
      if (supRes.error) console.error("suppliers:", supRes.error);
      if (partnerRes.error) console.error("partners:", partnerRes.error);

      setPayables((payRes.data || []) as any);
      setReceivables((recRes.data || []) as any);
      setSuppliers((supRes.data || []) as any);
      setPartners((partnerRes.data || []) as any);

    } catch (err) {
      console.error("Error fetching debts data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSettle = async () => {
    if (!settleTarget) return;
    const amount = parseFloat(settleAmount);
    if (!amount || isNaN(amount) || amount <= 0) {
      toast({ title: "خطأ", description: "يرجى إدخال مبلغ سداد صحيح", variant: "destructive" });
      return;
    }

    if (amount > settleTarget.remaining_amount) {
      toast({
        title: "خطأ",
        description: `المبلغ المدخل أكبر من الرصيد المتبقي (${settleTarget.remaining_amount} ₪)`,
        variant: "destructive",
      });
      return;
    }

    setSettleLoading(true);
    try {
      const { data, error } = await supabase.rpc("settle_payable_lifecycle_command" as any, {
        p_payable_id: settleTarget.id,
        p_amount: amount,
        p_payment_method: settleMethod,
        p_notes: settleNotes.trim() || null,
        p_idempotency_key: crypto.randomUUID(),
      });

      if (error) throw error;

      toast({
        title: "تم السداد بنجاح",
        description: `تم تسديد ${amount} ₪ لصالح ${settleTarget.creditor_name}`,
      });

      setSettleTarget(null);
      setSettleAmount("");
      setSettleNotes("");
      await fetchData();
    } catch (err: any) {
      toast({
        title: "فشل السداد",
        description: err.message || "تعذر إتمام عملية السداد",
        variant: "destructive",
      });
    } finally {
      setSettleLoading(false);
    }
  };

  const openSettlementHistory = async (payable: Payable) => {
    setHistoryTarget(payable);
    const { data, error } = await supabase
      .from("payable_settlement_history" as any)
      .select("id, payable_id, amount, payment_method, created_at, reversed")
      .eq("payable_id", payable.id)
      .eq("movement_type", "settlement")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "تعذّر تحميل سجل السداد", description: error.message, variant: "destructive" });
      return;
    }
    setSettlements((data || []) as SettlementHistoryItem[]);
  };

  const reverseSettlement = async (settlement: SettlementHistoryItem) => {
    const reason = window.prompt("سبب عكس السداد:");
    if (!reason?.trim()) return;
    setReversingSettlement(settlement.id);
    try {
      const { error } = await supabase.rpc("reverse_payable_settlement_lifecycle_command" as any, {
        p_movement_id: settlement.id,
        p_reason: reason.trim(),
        p_idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;
      toast({ title: "تم عكس السداد", description: "عادت الذمة ورصيد الكاش — إن وُجد — إلى حالتهما الصحيحة." });
      if (historyTarget) await openSettlementHistory(historyTarget);
      await fetchData();
    } catch (err: any) {
      toast({ title: "تعذّر عكس السداد", description: err.message || "تعذرت العملية", variant: "destructive" });
    } finally {
      setReversingSettlement(null);
    }
  };

  const handleAddReceivable = async () => {
    if (!activeSeason) return;

    const amount = parseFloat(newReceivable.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "مبلغ غير صحيح",
        description: "أدخل مبلغًا أكبر من صفر.",
        variant: "destructive",
      });
      return;
    }

    if (
      newReceivable.type === "due_from_partner" &&
      !newReceivable.partnerId
    ) {
      toast({
        title: "اختر الشريك",
        description: "يجب تحديد الشريك المدين للمعصرة.",
        variant: "destructive",
      });
      return;
    }

    if (
      newReceivable.type === "other" &&
      !newReceivable.debtorName.trim()
    ) {
      toast({
        title: "اسم المدين مطلوب",
        description: "اكتب اسم الشخص أو الجهة.",
        variant: "destructive",
      });
      return;
    }

    setSavingReceivable(true);

    try {
      const { error } = await (supabase.rpc as any)(
        "create_manual_receivable_command",
        {
          p_season_id: activeSeason.id,
          p_type: newReceivable.type,

          p_debtor_name:
            newReceivable.type === "other"
              ? newReceivable.debtorName.trim()
              : "",

          p_amount: amount,

          p_partner_id:
            newReceivable.type === "due_from_partner"
              ? newReceivable.partnerId
              : null,

          p_reference_number:
            newReceivable.referenceNumber.trim() || null,

          p_notes:
            newReceivable.notes.trim() || null,

          p_idempotency_key: crypto.randomUUID(),
        }
      );

      if (error) throw error;

      toast({
        title: "تم تسجيل المستحق",
        description: "تمت إضافة المبلغ المستحق للمعصرة.",
      });

      setNewReceivable({
        type: "due_from_partner",
        partnerId: "",
        debtorName: "",
        amount: "",
        referenceNumber: "",
        notes: "",
      });

      setAddReceivableOpen(false);

      await fetchData();
    } catch (err: any) {
      console.error(err);

      toast({
        title: "تعذر تسجيل المستحق",
        description: err?.message || "حدث خطأ أثناء التسجيل.",
        variant: "destructive",
      });
    } finally {
      setSavingReceivable(false);
    }
  };


  const handleCollectReceivable = async () => {
    if (!activeSeason || !collectTarget) return;

    const amount = parseFloat(collectAmount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > collectTarget.remaining_amount
    ) {
      toast({
        title: "مبلغ غير صحيح",
        description: "تحقق من مبلغ التحصيل.",
        variant: "destructive",
      });
      return;
    }

    setCollectLoading(true);

    try {
      const { error } = await (supabase.rpc as any)(
        "collect_receivable_lifecycle_command",
        {
          p_receivable_id: collectTarget.id,

          // الكاش يدخل في الموسم الحالي حتى لو الدين قديم
          p_settlement_season_id: activeSeason.id,

          p_amount: amount,
          p_payment_method: collectMethod,
          p_notes: collectNotes.trim() || null,
          p_idempotency_key: crypto.randomUUID(),
        }
      );

      if (error) throw error;

      toast({
        title: "تم التحصيل",
        description:
          collectMethod === "cash"
            ? "تم تحصيل المبلغ وإضافته إلى كاش المعصرة."
            : "تم تسجيل التحصيل بدون التأثير على الكاش.",
      });

      setCollectTarget(null);
      setCollectAmount("");
      setCollectNotes("");

      await fetchData();
    } catch (err: any) {
      toast({
        title: "تعذر التحصيل",
        description: err?.message || "حدث خطأ أثناء التحصيل.",
        variant: "destructive",
      });
    } finally {
      setCollectLoading(false);
    }
  };



  const handleAddManualPayable = async () => {
    if (!activeSeason) return;

    const amount = parseFloat(manualPayable.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "مبلغ غير صحيح",
        description: "أدخل مبلغ دين أكبر من صفر.",
        variant: "destructive",
      });
      return;
    }

    if (
      manualPayable.type === "due_to_partner" &&
      !manualPayable.partnerId
    ) {
      toast({
        title: "اختر الشريك",
        description: "يجب تحديد الشريك صاحب المستحق.",
        variant: "destructive",
      });
      return;
    }

    if (
      manualPayable.type === "due_to_supplier" &&
      !manualPayable.supplierId
    ) {
      toast({
        title: "اختر المورد",
        description: "يجب تحديد المورد صاحب الدين.",
        variant: "destructive",
      });
      return;
    }

    if (
      manualPayable.type === "other" &&
      !manualPayable.creditorName.trim()
    ) {
      toast({
        title: "اسم الدائن مطلوب",
        description: "اكتب اسم الشخص أو الجهة صاحبة الدين.",
        variant: "destructive",
      });
      return;
    }

    setSavingManualPayable(true);

    try {
      const { error } = await (supabase.rpc as any)(
        "create_manual_payable_command",
        {
          p_season_id: activeSeason.id,
          p_type: manualPayable.type,

          p_creditor_name:
            manualPayable.type === "other"
              ? manualPayable.creditorName.trim()
              : "",

          p_amount: amount,

          p_partner_id:
            manualPayable.type === "due_to_partner"
              ? manualPayable.partnerId
              : null,

          p_supplier_id:
            manualPayable.type === "due_to_supplier"
              ? manualPayable.supplierId
              : null,

          p_reference_number:
            manualPayable.referenceNumber.trim() || null,

          p_notes:
            manualPayable.notes.trim() || null,

          p_idempotency_key: crypto.randomUUID(),
        }
      );

      if (error) throw error;

      toast({
        title: "تمت إضافة الدين",
        description: "تم تسجيل الالتزام اليدوي بنجاح.",
      });

      setManualPayable({
        type: "due_to_partner",
        partnerId: "",
        supplierId: "",
        creditorName: "",
        amount: "",
        referenceNumber: "",
        notes: "",
      });

      setAddManualPayableOpen(false);

      await fetchData();
    } catch (err: any) {
      console.error("create_manual_payable_command error:", err);

      toast({
        title: "تعذر إضافة الدين",
        description: err?.message || "حدث خطأ أثناء تسجيل الدين.",
        variant: "destructive",
      });
    } finally {
      setSavingManualPayable(false);
    }
  };

  const openEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);

    setEditSupplierForm({
      name: supplier.name || "",
      phone: supplier.phone || "",
    });

    setEditSupplierOpen(true);
  };

  const handleUpdateSupplier = async () => {
    if (!editingSupplier) return;

    if (!editSupplierForm.name.trim()) {
      toast({
        title: "اسم المورد مطلوب",
        variant: "destructive",
      });
      return;
    }

    setSavingSupplierEdit(true);

    try {
      const { error } = await supabase
        .from("suppliers" as any)
        .update({
          name: editSupplierForm.name.trim(),
          phone: editSupplierForm.phone.trim() || null,
        })
        .eq("id", editingSupplier.id);

      if (error) throw error;

      toast({
        title: "تم تحديث المورد",
      });

      setEditSupplierOpen(false);
      setEditingSupplier(null);

      await fetchData();
    } catch (err: any) {
      toast({
        title: "تعذر تعديل المورد",
        description: err.message || "حدث خطأ أثناء التعديل",
        variant: "destructive",
      });
    } finally {
      setSavingSupplierEdit(false);
    }
  };

  const handleAddSupplier = async () => {
    if (!newSupplier.name.trim()) {
      toast({ title: "تنبيه", description: "يرجى كتابة اسم المورد", variant: "destructive" });
      return;
    }

    const effectiveMillId = millId || activeSeason?.mill_id;
    if (!effectiveMillId) return;

    setSavingSupplier(true);
    try {
      const { error } = await supabase.from("suppliers" as any).insert({
        mill_id: effectiveMillId,
        name: newSupplier.name.trim(),
        phone: newSupplier.phone.trim() || null,
        address: newSupplier.address.trim() || null,
        notes: newSupplier.notes.trim() || null,
        active: true,
      });

      if (error) throw error;

      toast({ title: "تمت الإضافة", description: `تمت إضافة المورد ${newSupplier.name} بنجاح` });
      setNewSupplier({ name: "", phone: "", address: "", notes: "" });
      setAddSupplierOpen(false);
      await fetchData();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "تعذر إضافة المورد", variant: "destructive" });
    } finally {
      setSavingSupplier(false);
    }
  };

  // Metrics
  const totalPayables = payables.reduce((s, p) => s + Number(p.remaining_amount || 0), 0);
  const supplierPayables = payables
    .filter((p) => p.type === "due_to_supplier")
    .reduce((s, p) => s + Number(p.remaining_amount || 0), 0);
  const partnerPayables = payables
    .filter((p) => p.type === "due_to_partner")
    .reduce((s, p) => s + Number(p.remaining_amount || 0), 0);

  const filteredPayables = payables.filter((p) => {
    const matchesSearch =
      p.creditor_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.notes && p.notes.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <HandCoins className="h-6 w-6 text-primary" />
            الديون والذمم المالية           </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            إدارة المبالغ المستحقة على المعصرة والمبالغ المستحقة لها          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">

          <Button
            onClick={() => setAddManualPayableOpen(true)}
            className="gap-1.5 shadow-sm"
          >
            <HandCoins className="h-4 w-4" />
            إضافة دين علينا
          </Button>

          <Button
            variant="outline"
            onClick={() => setAddReceivableOpen(true)}
            className="gap-1.5 shadow-sm"
          >
            <ArrowDownLeft className="h-4 w-4" />
            إضافة مستحق لنا
          </Button>

          <Button
            variant="outline"
            onClick={() => setAddSupplierOpen(true)}
            className="gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            إضافة مورد جديد
          </Button>

        </div>


      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-amber-800 dark:text-amber-300 font-medium">إجمالي الالتزامات المستحقة</CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">
              {totalPayables.toLocaleString()} ₪
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">كافة الديون غير المسددة على المعصرة</p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-blue-800 dark:text-blue-300 font-medium flex items-center gap-1.5">
              <Building2 className="h-4 w-4" /> ديون الموردين (بضائع ومصاريف)
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-blue-700 dark:text-blue-400">
              {supplierPayables.toLocaleString()} ₪
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">مستحقات موردي المواد والمشتريات الآجلة</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardDescription className="text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-1.5">
              <Users2 className="h-4 w-4" /> مستحقات الشركاء (أموال مدفوعة)
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
              {partnerPayables.toLocaleString()} ₪
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">مصاريف ومشتريات دفعها الشركاء من أموالهم الخاصة</p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setSearchParams(value === "suppliers" ? { tab: "suppliers" } : {});
        }}
        className="w-full"
      >
        <TabsList className="grid grid-cols-3 max-w-xl">

          <TabsTrigger value="payables">
            علينا
          </TabsTrigger>

          <TabsTrigger value="receivables">
            لنا
          </TabsTrigger>

          <TabsTrigger value="suppliers">
            الموردون
          </TabsTrigger>

        </TabsList>

        {/* Tab 1: Payables List */}
        <TabsContent value="payables" className="space-y-4 pt-2">
          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-lg font-bold">الالتزامات المالية</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative w-48 sm:w-64">
                    <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pr-8 h-9 text-xs"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32 h-9 text-xs">
                      <SelectValue placeholder="الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      <SelectItem value="unpaid">غير مسددة</SelectItem>
                      <SelectItem value="partially_paid">مسددة جزئياً</SelectItem>
                      <SelectItem value="paid">مسددة بالكامل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 pt-0">
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-right">الجهة الدائنة</TableHead>
                      <TableHead className="text-right">نوع الالتزام</TableHead>
                      <TableHead className="text-right">المبلغ الأصلي</TableHead>
                      <TableHead className="text-right">المسدد</TableHead>
                      <TableHead className="text-right">المتبقي</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-center">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          جارٍ التحميل...
                        </TableCell>
                      </TableRow>
                    ) : filteredPayables.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          لا توجد التزامات مسجلة تطابق البحث
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPayables.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-semibold text-foreground">
                            {p.creditor_name}
                            {p.notes && (
                              <p className="text-[11px] text-muted-foreground font-normal line-clamp-1">
                                {p.notes}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.type === "due_to_partner" ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[11px]">
                                مستحق لشريك
                              </Badge>
                            ) : p.type === "due_to_supplier" ? (
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 text-[11px]">
                                مستحق لمورد
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[11px]">التزام آخر</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm" dir="ltr">
                            {Number(p.original_amount).toLocaleString()} ₪
                          </TableCell>
                          <TableCell className="font-mono text-sm text-emerald-600 dark:text-emerald-400" dir="ltr">
                            {Number(p.paid_amount).toLocaleString()} ₪
                          </TableCell>
                          <TableCell className="font-mono font-bold text-sm text-rose-600 dark:text-rose-400" dir="ltr">
                            {Number(p.remaining_amount).toLocaleString()} ₪
                          </TableCell>
                          <TableCell>
                            {p.status === "paid" ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px]">
                                مسدد بالكامل
                              </Badge>
                            ) : p.status === "partially_paid" ? (
                              <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px]">
                                مسدد جزئياً
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">
                                غير مسدد
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(p.created_at)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-1">
                              {p.status !== "paid" && p.status !== "cancelled" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSettleTarget(p);
                                    setSettleAmount(String(p.remaining_amount));
                                  }}
                                  className="h-7 text-xs gap-1 border-primary/40 hover:bg-primary/10 hover:text-primary"
                                >
                                  <ArrowDownLeft className="h-3 w-3" />
                                  سداد دفعة
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => openSettlementHistory(p)} className="h-7 text-xs gap-1">
                                <RotateCcw className="h-3 w-3" /> سجل السداد
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="receivables" className="space-y-4 pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                المبالغ المستحقة للمعصرة
              </CardTitle>

              <CardDescription>
                ذمم على الشركاء أو أشخاص وجهات أخرى
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">
                        المدين
                      </TableHead>

                      <TableHead className="text-right">
                        النوع
                      </TableHead>

                      <TableHead className="text-right">
                        الأصلي
                      </TableHead>

                      <TableHead className="text-right">
                        المحصل
                      </TableHead>

                      <TableHead className="text-right">
                        المتبقي
                      </TableHead>

                      <TableHead className="text-right">
                        الحالة
                      </TableHead>

                      <TableHead className="text-right">
                        التاريخ
                      </TableHead>

                      <TableHead className="text-center">
                        إجراء
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {receivables.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center py-8 text-muted-foreground"
                        >
                          لا توجد مبالغ مستحقة للمعصرة
                        </TableCell>
                      </TableRow>
                    ) : (
                      receivables.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-semibold">
                              {r.debtor_name}
                            </div>

                            {r.notes && (
                              <div className="text-xs text-muted-foreground">
                                {r.notes}
                              </div>
                            )}
                          </TableCell>

                          <TableCell>
                            <Badge variant="outline">
                              {r.type === "due_from_partner"
                                ? "على شريك"
                                : "ذمة أخرى"}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            {Number(r.original_amount).toLocaleString()} ₪
                          </TableCell>

                          <TableCell className="text-emerald-600">
                            {Number(r.collected_amount).toLocaleString()} ₪
                          </TableCell>

                          <TableCell className="font-bold text-rose-600">
                            {Number(r.remaining_amount).toLocaleString()} ₪
                          </TableCell>

                          <TableCell>
                            {r.status === "paid" ? (
                              <Badge>محصل بالكامل</Badge>
                            ) : r.status === "partially_paid" ? (
                              <Badge variant="secondary">
                                محصل جزئياً
                              </Badge>
                            ) : r.status === "cancelled" ? (
                              <Badge variant="outline">
                                ملغى
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                غير محصل
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="text-xs">
                            {formatDate(r.created_at)}
                          </TableCell>

                          <TableCell className="text-center">
                            {r.status !== "paid" &&
                              r.status !== "cancelled" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setCollectTarget(r);
                                    setCollectAmount(
                                      String(r.remaining_amount)
                                    );
                                  }}
                                >
                                  تحصيل
                                </Button>
                              )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>


        {/* Tab 2: Suppliers Directory */}
        <TabsContent value="suppliers" className="space-y-4 pt-2">
          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">دليل الموردين</CardTitle>
                <CardDescription className="text-xs">الموردين المسجلين لمعصرتك فقط</CardDescription>
              </div>
              <Button size="sm" onClick={() => setAddSupplierOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> مورد جديد
              </Button>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 pt-0">
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-right">اسم المورد</TableHead>
                      <TableHead className="text-right">رقم الهاتف</TableHead>
                      <TableHead className="text-right">العنوان / المنطقة</TableHead>
                      <TableHead className="text-right">ملاحظات</TableHead>
                      <TableHead className="text-right">تاريخ الإضافة</TableHead>
                      <TableHead className="text-center">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          لم يتم تسجيل أي موردين حتى الآن
                        </TableCell>
                      </TableRow>
                    ) : (
                      suppliers.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-semibold text-foreground">{s.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground flex items-center gap-1 pt-3.5">
                            {s.phone ? (
                              <>
                                <Phone className="h-3 w-3" />
                                <span dir="ltr">{s.phone}</span>
                              </>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.address ? (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {s.address}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditSupplier(s)}
                            >
                              تعديل
                            </Button>
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground">{s.notes || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(s.created_at)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Settle Modal */}
      <Dialog open={Boolean(settleTarget)} onOpenChange={(o) => !o && setSettleTarget(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
              سداد دفعة من الالتزام
            </DialogTitle>
            <DialogDescription>
              سداد مستحقات: <strong className="text-foreground">{settleTarget?.creditor_name}</strong>
            </DialogDescription>
          </DialogHeader>

          {settleTarget && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-xl bg-muted/60 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المبلغ الأصلي:</span>
                  <span className="font-bold">{Number(settleTarget.original_amount).toLocaleString()} ₪</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المبلغ المسدد سابقاً:</span>
                  <span className="font-medium text-emerald-600">{Number(settleTarget.paid_amount).toLocaleString()} ₪</span>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-1 text-sm font-bold">
                  <span>الرصيد المتبقي للدفع:</span>
                  <span className="text-rose-600">{Number(settleTarget.remaining_amount).toLocaleString()} ₪</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>مبلغ السداد الحالي (شيكل)</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={settleTarget.remaining_amount}
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="text-right font-bold text-base"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label>مصدر التمويل وطريقة السداد</Label>
                <Select value={settleMethod} onValueChange={(v: any) => setSettleMethod(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">
                      نقدي المعصرة (يخصم من الرصيد النقدي للمعصرة)
                    </SelectItem>
                    <SelectItem value="other">
                      مصدر آخر / تحويل بنكي خارجي (لا يمس الكاش)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>ملاحظات السداد (اختياري)</Label>
                <Input
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSettleTarget(null)} disabled={settleLoading}>
              إلغاء
            </Button>
            <Button
              onClick={handleSettle}
              disabled={settleLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {settleLoading ? "جاري المعالجة..." : "تأكيد السداد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyTarget)} onOpenChange={(open) => !open && setHistoryTarget(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>سجل سداد الالتزام</DialogTitle>
            <DialogDescription>{historyTarget?.creditor_name} — اعكس السداد من هنا فقط عند الحاجة.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {settlements.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">لا توجد دفعات مسجلة عبر المسار الجديد.</p> : settlements.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div><div className="font-medium">{Math.abs(Number(s.amount)).toLocaleString()} ₪</div><div className="text-xs text-muted-foreground">{formatDate(s.created_at)} · {s.payment_method === "cash" ? "كاش" : "مصدر خارجي"}</div></div>
                {s.reversed ? <Badge variant="secondary">معكوس</Badge> : <Button size="sm" variant="outline" disabled={reversingSettlement === s.id} onClick={() => reverseSettlement(s)} className="gap-1"><RotateCcw className="h-3 w-3" /> عكس</Button>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>


      {/* Add Manual Payable Modal */}
      <Dialog
        open={addManualPayableOpen}
        onOpenChange={setAddManualPayableOpen}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-primary" />
              إضافة دين يدوي
            </DialogTitle>

            <DialogDescription>
              تسجيل التزام مالي لا ينتج عن عملية أخرى داخل النظام.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">

            <div className="space-y-1.5">
              <Label>نوع الدين *</Label>

              <Select
                value={manualPayable.type}
                onValueChange={(value) =>
                  setManualPayable((p) => ({
                    ...p,
                    type: value as "due_to_partner" | "due_to_supplier" | "other",
                    partnerId: "",
                    supplierId: "",
                    creditorName: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="due_to_partner">
                    مستحق لشريك
                  </SelectItem>

                  <SelectItem value="due_to_supplier">
                    مستحق لمورد
                  </SelectItem>

                  <SelectItem value="other">
                    دين / التزام آخر
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {manualPayable.type === "due_to_partner" && (
              <div className="space-y-1.5">
                <Label>الشريك *</Label>

                <Select
                  value={manualPayable.partnerId}
                  onValueChange={(value) =>
                    setManualPayable((p) => ({
                      ...p,
                      partnerId: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الشريك" />
                  </SelectTrigger>

                  <SelectContent>
                    {partners.map((partner) => (
                      <SelectItem
                        key={partner.id}
                        value={partner.id}
                      >
                        {partner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {manualPayable.type === "due_to_supplier" && (
              <div className="space-y-1.5">
                <Label>المورد *</Label>

                <Select
                  value={manualPayable.supplierId}
                  onValueChange={(value) =>
                    setManualPayable((p) => ({
                      ...p,
                      supplierId: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المورد" />
                  </SelectTrigger>

                  <SelectContent>
                    {suppliers
                      .filter((supplier) => supplier.active)
                      .map((supplier) => (
                        <SelectItem
                          key={supplier.id}
                          value={supplier.id}
                        >
                          {supplier.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {manualPayable.type === "other" && (
              <div className="space-y-1.5">
                <Label>اسم الدائن *</Label>

                <Input
                  value={manualPayable.creditorName}
                  onChange={(e) =>
                    setManualPayable((p) => ({
                      ...p,
                      creditorName: e.target.value,
                    }))
                  }
                  placeholder="اسم الشخص أو الجهة"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>المبلغ *</Label>

              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={manualPayable.amount}
                onChange={(e) =>
                  setManualPayable((p) => ({
                    ...p,
                    amount: e.target.value,
                  }))
                }
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1.5">
              <Label>رقم المرجع / الفاتورة</Label>

              <Input
                value={manualPayable.referenceNumber}
                onChange={(e) =>
                  setManualPayable((p) => ({
                    ...p,
                    referenceNumber: e.target.value,
                  }))
                }
                placeholder="مثال: INV-1052"
              />
            </div>

            <div className="space-y-1.5">
              <Label>ملاحظات</Label>

              <Textarea
                value={manualPayable.notes}
                onChange={(e) =>
                  setManualPayable((p) => ({
                    ...p,
                    notes: e.target.value,
                  }))
                }
                rows={3}
                placeholder="سبب الدين أو تفاصيل إضافية..."
              />
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              هذه العملية لا تغيّر رصيد الكاش ولا المخزون؛
              فقط تضيف التزامًا ماليًا.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setAddManualPayableOpen(false)}
              disabled={savingManualPayable}
            >
              إلغاء
            </Button>

            <Button
              onClick={handleAddManualPayable}
              disabled={savingManualPayable}
            >
              {savingManualPayable
                ? "جاري الحفظ..."
                : "حفظ الدين"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addReceivableOpen}
        onOpenChange={setAddReceivableOpen}
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              إضافة مستحق لنا
            </DialogTitle>

            <DialogDescription>
              تسجيل مبلغ مستحق للمعصرة على شريك أو جهة أخرى.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>نوع المدين</Label>

              <Select
                value={newReceivable.type}
                onValueChange={(value) =>
                  setNewReceivable((p) => ({
                    ...p,
                    type: value as
                      | "due_from_partner"
                      | "other",
                    partnerId: "",
                    debtorName: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="due_from_partner">
                    شريك
                  </SelectItem>

                  <SelectItem value="other">
                    شخص / جهة أخرى
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newReceivable.type === "due_from_partner" ? (
              <div className="space-y-1.5">
                <Label>الشريك *</Label>

                <Select
                  value={newReceivable.partnerId}
                  onValueChange={(value) =>
                    setNewReceivable((p) => ({
                      ...p,
                      partnerId: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الشريك" />
                  </SelectTrigger>

                  <SelectContent>
                    {partners.map((partner) => (
                      <SelectItem
                        key={partner.id}
                        value={partner.id}
                      >
                        {partner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>اسم المدين *</Label>

                <Input
                  value={newReceivable.debtorName}
                  onChange={(e) =>
                    setNewReceivable((p) => ({
                      ...p,
                      debtorName: e.target.value,
                    }))
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>المبلغ *</Label>

              <Input
                type="number"
                min="0.01"
                value={newReceivable.amount}
                onChange={(e) =>
                  setNewReceivable((p) => ({
                    ...p,
                    amount: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>رقم المرجع</Label>

              <Input
                value={newReceivable.referenceNumber}
                onChange={(e) =>
                  setNewReceivable((p) => ({
                    ...p,
                    referenceNumber: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>ملاحظات</Label>

              <Textarea
                value={newReceivable.notes}
                onChange={(e) =>
                  setNewReceivable((p) => ({
                    ...p,
                    notes: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setAddReceivableOpen(false)
              }
            >
              إلغاء
            </Button>

            <Button
              onClick={handleAddReceivable}
              disabled={savingReceivable}
            >
              {savingReceivable
                ? "جاري الحفظ..."
                : "حفظ المستحق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المورد</DialogTitle>
            <DialogDescription>
              تعديل اسم المورد أو رقم الهاتف
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>اسم المورد</Label>
              <Input
                value={editSupplierForm.name}
                onChange={(e) =>
                  setEditSupplierForm((p) => ({
                    ...p,
                    name: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>رقم الهاتف</Label>
              <Input
                value={editSupplierForm.phone}
                onChange={(e) =>
                  setEditSupplierForm((p) => ({
                    ...p,
                    phone: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditSupplierOpen(false)}
              disabled={savingSupplierEdit}
            >
              إلغاء
            </Button>

            <Button
              onClick={handleUpdateSupplier}
              disabled={savingSupplierEdit}
            >
              {savingSupplierEdit ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Add Supplier Modal */}
      <Dialog open={addSupplierOpen} onOpenChange={setAddSupplierOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              إضافة مورد جديد
            </DialogTitle>
            <DialogDescription>
              تسجيل مورد معتمد للمعصرة لتنظيم الفواتير والمشتريات الآجلة
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label>اسم المورد أو الشركة <span className="text-rose-500">*</span></Label>
              <Input
                value={newSupplier.name}
                onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>رقم الهاتف</Label>
              <Input
                value={newSupplier.phone}
                onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>العنوان أو المنطقة</Label>
              <Input
                value={newSupplier.address}
                onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>ملاحظات إضافية</Label>
              <Textarea
                value={newSupplier.notes}
                onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddSupplierOpen(false)} disabled={savingSupplier}>
              إلغاء
            </Button>
            <Button onClick={handleAddSupplier} disabled={savingSupplier}>
              {savingSupplier ? "جاري الحفظ..." : "حفظ المورد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(collectTarget)}
        onOpenChange={(open) =>
          !open && setCollectTarget(null)
        }
      >
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              تحصيل مستحق
            </DialogTitle>

            <DialogDescription>
              المدين:{" "}
              <strong>
                {collectTarget?.debtor_name}
              </strong>
            </DialogDescription>
          </DialogHeader>

          {collectTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-muted p-3">
                <div className="flex justify-between">
                  <span>المتبقي</span>

                  <strong>
                    {Number(
                      collectTarget.remaining_amount
                    ).toLocaleString()}{" "}
                    ₪
                  </strong>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>المبلغ المحصل</Label>

                <Input
                  type="number"
                  value={collectAmount}
                  onChange={(e) =>
                    setCollectAmount(e.target.value)
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>طريقة التحصيل</Label>

                <Select
                  value={collectMethod}
                  onValueChange={(value) =>
                    setCollectMethod(
                      value as "cash" | "other"
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="cash">
                      كاش المعصرة
                    </SelectItem>

                    <SelectItem value="other">
                      تحويل / مصدر خارجي
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>ملاحظات</Label>

                <Input
                  value={collectNotes}
                  onChange={(e) =>
                    setCollectNotes(e.target.value)
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCollectTarget(null)}
            >
              إلغاء
            </Button>

            <Button
              onClick={handleCollectReceivable}
              disabled={collectLoading}
            >
              {collectLoading
                ? "جاري التحصيل..."
                : "تأكيد التحصيل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
