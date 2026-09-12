import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Sprout, Plus, Calendar, DollarSign, Trash2, Tag, Edit3, 
  RefreshCw, X, Receipt, Wallet, Filter
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";
import { useCurrency } from "@/hooks/useCurrency";
import { formatDate, formatNumber } from "@/lib/formatters";
import { CashSessionGuard } from "@/components/CashSessionGuard";

interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  payment_method?: "cash" | "credit" | "partner";
  partner_id?: string | null;
  supplier_id?: string | null;
  partners?: { name: string } | null;
  suppliers?: { name: string } | null;
  created_at: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
}

interface PartnerOption {
  id: string;
  name: string;
}

interface SupplierOption {
  id: string;
  name: string;
}

// Common default suggestions for olive mills
const DEFAULT_SUGGESTIONS = [
  "طعام وضيافة",
  "ديزل ووقود",
  "صيانة وقطع غيار",
  "أجور ونثريات",
  "كهرباء ومياه",
  "أدوات ونظافة",
];

const Expenses = () => {
  const { user, millId } = useAuth();
  const { isEmployee } = useRole();
  const { activeSeason } = useSeason();
  const { toast } = useToast();
  const { inventory, refetch: refetchInventory } = useInventory();
  const { currency } = useCurrency();
  const activeCurrency = currency || "₪";

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog State
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // New Expense form state
  const [newExpense, setNewExpense] = useState({ 
    category: "", 
    amount: "", 
    description: "",
    payment_method: "cash" as "cash" | "credit" | "partner",
    partner_id: "",
    supplier_id: "",
  });
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  // Filter state
  const [filter, setFilter] = useState({ category: "", dateFrom: "", dateTo: "" });
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  useEffect(() => {
    if (activeSeason) {
      fetchExpenses();
      fetchCategories();
      fetchPartnersAndSuppliers();
    } else {
      setExpenses([]);
      setCategories([]);
      setPartners([]);
      setSuppliers([]);
      setLoading(false);
    }
  }, [activeSeason?.id]);

  const fetchPartnersAndSuppliers = async () => {
    try {
      const [ptRes, supRes] = await Promise.all([
        supabase.from("partners" as any).select("id, name").eq("active", true).order("name"),
        supabase.from("suppliers" as any).select("id, name").eq("active", true).order("name")
      ]);
      if (ptRes.data) setPartners(ptRes.data as any);
      if (supRes.data) setSuppliers(supRes.data as any);
    } catch (e) {
      console.error("fetchPartnersAndSuppliers error:", e);
    }
  };

  const fetchCategories = async () => {
    if (!activeSeason) return;
    const effectiveMillId = millId || activeSeason.mill_id;
    let query = supabase
      .from("expense_categories")
      .select("*")
      .eq("season_id", activeSeason.id);

    if (effectiveMillId) {
      query = (query as any).eq("mill_id", effectiveMillId);
    }

    const { data } = await query.order("name", { ascending: true });
    const list = (data as ExpenseCategory[]) || [];
    setCategories(list);
    if (list.length === 0) {
      setIsCustomMode(true);
    }
  };

  const fetchExpenses = async () => {
    if (!activeSeason) return;
    setLoading(true);
    try {
      let query = supabase
        .from("expenses")
        .select("*, partners(name), suppliers(name)")
        .eq("season_id", activeSeason.id);

      const effectiveMillId = millId || activeSeason.mill_id;
      if (effectiveMillId) {
        query = (query as any).eq("mill_id", effectiveMillId);
      } else if (user?.id) {
        query = query.eq("user_id", user.id);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) {
        console.error("fetchExpenses error:", error);
      }
      setExpenses((data as Expense[]) || []);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewExpense({
      category: "",
      amount: "",
      description: "",
      payment_method: "cash",
      partner_id: "",
      supplier_id: "",
    });
    setCustomCategory("");
    if (categories.length > 0) {
      setIsCustomMode(false);
    }
  };

  const addExpense = async () => {
    if (!activeSeason) {
      toast({ title: "تنبيه", description: "يرجى تحديد وتفعيل موسم أولاً", variant: "destructive" });
      return;
    }

    const finalCategory = (isCustomMode ? customCategory : newExpense.category).trim();

    if (!finalCategory) {
      toast({ title: "تنبيه", description: "يرجى تحديد أو كتابة نوع المصروف", variant: "destructive" });
      return;
    }
    if (!newExpense.amount || isNaN(parseFloat(newExpense.amount)) || parseFloat(newExpense.amount) <= 0) {
      toast({ title: "تنبيه", description: "يرجى إدخال مبلغ صحيح للمصروف", variant: "destructive" });
      return;
    }

    if (newExpense.payment_method === "partner" && !newExpense.partner_id) {
      toast({ title: "تنبيه", description: "يرجى اختيار الشريك الذي دفع المصروف", variant: "destructive" });
      return;
    }

    const amount = parseFloat(newExpense.amount);
    setSavingExpense(true);

    try {
      // 1. Call Atomic RPC: record_expense_v2
      const { data, error } = await supabase.rpc("record_expense_v2" as any, {
        p_season_id: activeSeason.id,
        p_category: finalCategory,
        p_amount: amount,
        p_description: newExpense.description.trim() || null,
        p_payment_method: newExpense.payment_method,
        p_partner_id: newExpense.payment_method === "partner" ? newExpense.partner_id : null,
        p_supplier_id: newExpense.payment_method === "credit" && newExpense.supplier_id ? newExpense.supplier_id : null,
      });

      if (error) throw error;

      // 2. If category not registered, save to expense_categories
      const alreadyExists = categories.some(
        (c) => c.name.trim().toLowerCase() === finalCategory.toLowerCase()
      );
      if (!alreadyExists && user?.id) {
        try {
          const effectiveMillId = millId || activeSeason?.mill_id || null;
          await supabase.from("expense_categories").insert({
            user_id: user.id,
            mill_id: effectiveMillId,
            season_id: activeSeason.id,
            name: finalCategory,
          } as any);
          await fetchCategories();
        } catch {}
      }

      toast({
        title: "تمت إضافة المصروف بنجاح",
        description: `تم تسجيل مصروف "${finalCategory}" بقيمة ${amount} ${activeCurrency} (${
          newExpense.payment_method === "cash"
            ? "نقداً من الصندوق"
            : newExpense.payment_method === "credit"
            ? "دين مؤجل"
            : "مدفوع من الشريك"
        })`,
      });

      // Close modal & reset form
      resetForm();
      setAddDialogOpen(false);

      await fetchExpenses();
      await refetchInventory();
    } catch (err: any) {
      toast({
        title: "خطأ في تسجيل المصروف",
        description: err.message || "تعذر حفظ المصروف",
        variant: "destructive",
      });
    } finally {
      setSavingExpense(false);
    }
  };

  const deleteExpense = async () => {
    if (isEmployee) {
      toast({ title: "غير مصرح", description: "ليس لديك صلاحية حذف المصاريف", variant: "destructive" });
      return;
    }
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (!error) {
      toast({ title: "تم الحذف", description: "تم حذف سجل المصروف بنجاح" });
      setDeleteTarget(null);
      await fetchExpenses();
      await refetchInventory();
    } else {
      toast({ title: "خطأ", description: error.message || "تعذر حذف المصروف", variant: "destructive" });
    }
  };

  // Build a distinct list of all available categories for the filter
  const allFilterCategories = Array.from(
    new Set([
      ...categories.map((c) => c.name),
      ...expenses.map((e) => e.category).filter(Boolean),
    ])
  );

  const filteredExpenses = expenses.filter((exp) => {
    if (filter.category && exp.category !== filter.category) return false;
    if (filter.dateFrom && new Date(exp.created_at) < new Date(filter.dateFrom)) return false;
    if (filter.dateTo && new Date(exp.created_at) > new Date(filter.dateTo + "T23:59:59")) return false;
    return true;
  });

  const getTotalExpenses = () => filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  const handleSelectQuickTag = (tag: string) => {
    if (isCustomMode) {
      setCustomCategory(tag);
    } else {
      setNewExpense((p) => ({ ...p, category: tag }));
    }
  };

  const hasActiveFilters = Boolean(filter.category || filter.dateFrom || filter.dateTo);

  const clearFilters = () => {
    setFilter({ category: "", dateFrom: "", dateTo: "" });
  };

  return (
    <CashSessionGuard>
    <div className="space-y-6 text-right" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">إدارة المصاريف</h1>
            <p className="text-xs text-muted-foreground mt-0.5">تسجيل ومتابعة مصاريف المعصرة اليومية والتشغيلية والالتزامات</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchExpenses();
              fetchCategories();
              fetchPartnersAndSuppliers();
              refetchInventory();
            }}
            className="gap-2 rounded-xl text-xs h-9"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>تحديث</span>
          </Button>

          <Button
            onClick={() => {
              resetForm();
              setAddDialogOpen(true);
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl gap-2 h-9 px-4 text-xs sm:text-sm shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة مصروف جديد</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border-border/60 shadow-xs bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">إجمالي المصاريف المعروضة</p>
              <h3 className="text-2xl font-bold text-destructive font-mono mt-1">
                {formatNumber(getTotalExpenses())} <span className="text-xs font-normal text-muted-foreground">{activeCurrency}</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
              <DollarSign className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-xs bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">إجمالي عدد المصاريف</p>
              <h3 className="text-2xl font-bold text-foreground font-mono mt-1">
                {expenses.length} <span className="text-xs font-normal text-muted-foreground">مصروف</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Receipt className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-xs bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">رصيد الكاش بالصندوق</p>
              <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                {inventory.total_cash.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{activeCurrency}</span>
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Expenses Table Card */}
      <Card className="border border-border/60 shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-card/60 p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <span>سجل المصاريف</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                عرض ومراجعة كافة المصاريف التشغيلية ومصادر تمويلها خلال الموسم
              </CardDescription>
            </div>

            {/* Filter Controls Bar */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 bg-muted/30 border border-border/60 rounded-xl px-2.5 py-1">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={filter.category}
                  onChange={(e) => setFilter((p) => ({ ...p, category: e.target.value }))}
                  className="h-7 text-xs bg-transparent border-0 focus:ring-0 text-foreground cursor-pointer"
                >
                  <option value="">جميع الأنواع</option>
                  {allFilterCategories.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-muted/30 border border-border/60 rounded-xl px-2.5 py-1">
                <span className="text-[11px] text-muted-foreground">من:</span>
                <input
                  type="date"
                  dir="ltr"
                  value={filter.dateFrom}
                  onChange={(e) => setFilter((p) => ({ ...p, dateFrom: e.target.value }))}
                  className="h-7 text-xs bg-transparent border-0 text-foreground"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-muted/30 border border-border/60 rounded-xl px-2.5 py-1">
                <span className="text-[11px] text-muted-foreground">إلى:</span>
                <input
                  type="date"
                  dir="ltr"
                  value={filter.dateTo}
                  onChange={(e) => setFilter((p) => ({ ...p, dateTo: e.target.value }))}
                  className="h-7 text-xs bg-transparent border-0 text-foreground"
                />
              </div>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>إلغاء الفلاتر</span>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs">جارٍ تحميل سجل المصاريف...</p>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground px-4">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-base font-semibold text-foreground">لا توجد مصاريف مسجلة</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {hasActiveFilters 
                  ? "لا توجد نتائج تطابق خيارات الفلترة المحددة. جرب تغيير الفلتر."
                  : "لم يتم تسجيل أي مصاريف في هذا الموسم حتى الآن."}
              </p>
              <div className="mt-4">
                <Button
                  onClick={() => {
                    resetForm();
                    setAddDialogOpen(true);
                  }}
                  className="rounded-xl font-bold gap-2 text-xs h-9 bg-primary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>إضافة أول مصروف الآن</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-right font-bold text-xs">التاريخ</TableHead>
                    <TableHead className="text-right font-bold text-xs">نوع المصروف</TableHead>
                    <TableHead className="text-right font-bold text-xs">طريقة التمويل</TableHead>
                    <TableHead className="text-right font-bold text-xs">المبلغ</TableHead>
                    <TableHead className="text-right font-bold text-xs">الوصف والتفاصيل</TableHead>
                    {!isEmployee && <TableHead className="text-left font-bold text-xs">الإجراءات</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((exp) => (
                    <TableRow key={exp.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-right text-xs font-mono">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{formatDate(exp.created_at)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-xs font-semibold bg-muted/40 border-border/60">
                          {exp.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {exp.payment_method === "partner" ? (
                          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[11px]">
                            شريك: {exp.partners?.name || "شريك مساهم"}
                          </Badge>
                        ) : exp.payment_method === "credit" ? (
                          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px]">
                            دين مؤجل {exp.suppliers?.name ? `(${exp.suppliers.name})` : ""}
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px]">
                            كاش الصندوق
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm text-destructive font-mono">
                        {formatNumber(exp.amount)} {activeCurrency}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground max-w-md truncate">
                        {exp.description || <span className="text-muted-foreground/50 italic">—</span>}
                      </TableCell>
                      {!isEmployee && (
                        <TableCell className="text-left">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                            onClick={() => setDeleteTarget(exp)}
                            title="حذف المصروف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          ADD EXPENSE MODAL (DIALOG)
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[520px] text-right rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right sm:text-right pb-2 border-b border-border/60">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              <span>إضافة مصروف جديد</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              تسجيل نفقة تشغيلية وتحديد مصدر التمويل (كاش، دين مؤجل، أو دفع من شريك)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Category Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">نوع المصروف *</Label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomMode(!isCustomMode);
                    if (!isCustomMode) {
                      setCustomCategory(newExpense.category || "");
                    }
                  }}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  <Edit3 className="h-3 w-3" />
                  <span>{isCustomMode ? "اختر من القائمة" : "+ كتابة نوع مخصص"}</span>
                </button>
              </div>

              {isCustomMode ? (
                <Input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="اكتب نوع المصروف (مثل: طعام وضيافة، صيانة، وقود...)"
                  className="h-10 text-sm rounded-xl"
                  autoFocus
                />
              ) : (
                <select
                  value={newExpense.category}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setIsCustomMode(true);
                      setCustomCategory("");
                    } else {
                      setNewExpense((p) => ({ ...p, category: e.target.value }));
                    }
                  }}
                  className="w-full h-10 px-3 border border-input rounded-xl text-sm bg-background text-foreground focus:ring-1 focus:ring-primary"
                >
                  <option value="">اختر نوع المصروف من القائمة...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {DEFAULT_SUGGESTIONS.filter(
                    (s) => !categories.some((c) => c.name === s)
                  ).map((s) => (
                    <option key={s} value={s}>
                      {s} (مقترح)
                    </option>
                  ))}
                  <option value="__custom__">✏️ كتابة نوع جديد مخصص...</option>
                </select>
              )}

              {/* Quick suggestion tags */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] text-muted-foreground font-medium block">اختيار سريع:</span>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_SUGGESTIONS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleSelectQuickTag(tag)}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-primary/15 hover:text-primary transition-colors text-muted-foreground border border-border/50"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Amount Field */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                المبلغ ({activeCurrency}) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                value={newExpense.amount}
                onChange={(e) => setNewExpense((p) => ({ ...p, amount: e.target.value }))}
                placeholder="أدخل مبلغ المصروف..."
                min="0"
                step="0.5"
                className="h-10 text-sm rounded-xl font-mono"
              />
              {newExpense.payment_method === "cash" && (
                <p className="text-[11px] text-muted-foreground">
                  رصيد الصندوق المتوفر: <strong>{inventory.total_cash.toLocaleString()} {activeCurrency}</strong> (يشترط جلسة صندوق مفتوحة)
                </p>
              )}
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-semibold text-foreground">مصدر التمويل وطريقة السداد *</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setNewExpense((p) => ({ ...p, payment_method: "cash" }))}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 transition-all ${
                    newExpense.payment_method === "cash"
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <Wallet className="h-4 w-4" />
                  <span>كاش الصندوق</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewExpense((p) => ({ ...p, payment_method: "credit" }))}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 transition-all ${
                    newExpense.payment_method === "credit"
                      ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold shadow-xs"
                      : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <Tag className="h-4 w-4" />
                  <span>دين مؤجل</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewExpense((p) => ({ ...p, payment_method: "partner" }))}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1.5 transition-all ${
                    newExpense.payment_method === "partner"
                      ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold shadow-xs"
                      : "border-border/60 hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <DollarSign className="h-4 w-4" />
                  <span>دفع من شريك</span>
                </button>
              </div>
            </div>

            {/* Conditional Sub-selectors */}
            {newExpense.payment_method === "partner" && (
              <div className="space-y-1.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <Label className="text-xs font-bold text-blue-600 dark:text-blue-400">
                  اختر الشريك الذي دفع المصروف *
                </Label>
                <select
                  value={newExpense.partner_id}
                  onChange={(e) => setNewExpense((p) => ({ ...p, partner_id: e.target.value }))}
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
                  سيتم اعتبار المصروف مدفوعاً، وتسجيل التزام مستحق للشريك بقيمة {newExpense.amount || 0} {activeCurrency} دون لمس كاش المعصرة.
                </p>
              </div>
            )}

            {newExpense.payment_method === "credit" && (
              <div className="space-y-1.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <Label className="text-xs font-bold text-amber-600 dark:text-amber-400">
                  اختر المورد أو الجهة الدائنة (اختياري)
                </Label>
                <select
                  value={newExpense.supplier_id}
                  onChange={(e) => setNewExpense((p) => ({ ...p, supplier_id: e.target.value }))}
                  className="w-full h-10 px-3 border border-input rounded-xl text-sm bg-background text-foreground"
                >
                  <option value="">-- جهة دائنة أخرى / بدون تحديد مورد --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  سيتم قيد المصروف وتسجيل ذمة مستحقة الدفع (Payable) على المعصرة دون خصم كاش الصندوق الآن.
                </p>
              </div>
            )}

            {/* Description Field */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">الوصف والتفاصيل (اختياري)</Label>
              <Textarea
                value={newExpense.description}
                onChange={(e) => setNewExpense((p) => ({ ...p, description: e.target.value }))}
                placeholder="أي ملاحظات أو تفاصيل إضافية حول المصروف..."
                rows={2}
                className="text-sm rounded-xl resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={savingExpense}
              className="rounded-xl text-xs font-semibold"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={addExpense}
              disabled={savingExpense}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl gap-2 text-xs"
            >
              {savingExpense ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>جارٍ الحفظ...</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>تسجيل المصروف</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="rounded-2xl max-w-md p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right text-base font-bold">تأكيد حذف المصروف</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-xs text-muted-foreground mt-2">
              هل تريد بالتأكيد حذف مصروف <strong>"{deleteTarget?.category}"</strong> بقيمة{" "}
              <strong>{deleteTarget?.amount} {activeCurrency}</strong>؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-3">
            <AlertDialogCancel className="text-xs rounded-xl">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteExpense}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-bold rounded-xl"
            >
              تأكيد الحذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </CashSessionGuard>
  );
};

export default Expenses;
