import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sprout, Plus, Calendar, DollarSign, Trash2, Tag, Edit3 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";

interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  created_at: string;
}

interface ExpenseCategory {
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
  const { user, effectiveUserId } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const { activeSeason } = useSeason();
  const { toast } = useToast();
  const { inventory, updateInventory, refetch: refetchInventory } = useInventory();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // New Expense state
  const [newExpense, setNewExpense] = useState({ category: "", amount: "", description: "" });
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  // Filter state
  const [filter, setFilter] = useState({ category: "", dateFrom: "", dateTo: "" });
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  useEffect(() => {
    if (targetUserId && activeSeason) {
      fetchExpenses();
      fetchCategories();
    }
  }, [targetUserId, activeSeason]);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("expense_categories")
      .select("*")
      .eq("user_id", targetUserId!)
      .eq("season_id", activeSeason!.id)
      .order("name", { ascending: true });
    const list = (data as ExpenseCategory[]) || [];
    setCategories(list);
    // If no categories exist yet, default to custom mode so the user can type freely right away
    if (list.length === 0) {
      setIsCustomMode(true);
    }
  };

  const fetchExpenses = async () => {
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .eq("user_id", targetUserId!)
      .eq("season_id", activeSeason!.id)
      .order("created_at", { ascending: false });
    setExpenses((data as Expense[]) || []);
    setLoading(false);
  };

  const addExpense = async () => {
    const finalCategory = (isCustomMode ? customCategory : newExpense.category).trim();

    if (!finalCategory) {
      toast({ title: "تنبيه", description: "يرجى تحديد أو كتابة نوع المصروف", variant: "destructive" });
      return;
    }
    if (!newExpense.amount || isNaN(parseFloat(newExpense.amount)) || parseFloat(newExpense.amount) <= 0) {
      toast({ title: "تنبيه", description: "يرجى إدخال مبلغ صحيح للمصروف", variant: "destructive" });
      return;
    }

    const amount = parseFloat(newExpense.amount);
    setSavingExpense(true);

    try {
      // 1. Insert into expenses table
      const { error } = await supabase.from("expenses").insert({
        user_id: targetUserId!,
        season_id: activeSeason!.id,
        category: finalCategory,
        amount,
        description: newExpense.description.trim() || null,
      });

      if (error) throw error;

      // 2. If this category isn't already registered in expense_categories, register it now
      const alreadyExists = categories.some(
        (c) => c.name.trim().toLowerCase() === finalCategory.toLowerCase()
      );
      if (!alreadyExists && activeSeason && targetUserId) {
        try {
          await supabase.from("expense_categories").insert({
            user_id: targetUserId,
            season_id: activeSeason.id,
            name: finalCategory,
          });
          await fetchCategories();
        } catch {}
      }

      // 3. Update inventory cash
      await updateInventory({ total_cash: inventory.total_cash - amount });

      toast({
        title: "تمت إضافة المصروف بنجاح",
        description: `تم تسجيل مصروف "${finalCategory}" بقيمة ${amount} شيكل`,
      });

      // Reset form
      setNewExpense({ category: "", amount: "", description: "" });
      setCustomCategory("");
      if (categories.length > 0) {
        setIsCustomMode(false);
      }

      await fetchExpenses();
      await refetchInventory();
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message || "تعذر حفظ المصروف",
        variant: "destructive",
      });
    } finally {
      setSavingExpense(false);
    }
  };

  const deleteExpense = async () => {
    if (!deleteTarget) return;
    const { id, amount } = deleteTarget;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (!error) {
      await updateInventory({ total_cash: inventory.total_cash + amount });
      toast({ title: "تم الحذف", description: "تم حذف المصروف بنجاح" });
      setDeleteTarget(null);
      fetchExpenses();
      refetchInventory();
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

  // Quick select a suggestion
  const handleSelectQuickTag = (tag: string) => {
    if (isCustomMode) {
      setCustomCategory(tag);
    } else {
      setNewExpense((p) => ({ ...p, category: tag }));
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <Sprout className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">إدارة المصاريف</h1>
          <p className="text-xs text-muted-foreground mt-0.5">تسجيل ومتابعة مصاريف المعصرة اليومية والتشغيلية</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border border-border shadow-xs rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-destructive font-mono">
                {getTotalExpenses().toLocaleString()} ₪
              </div>
              <p className="text-xs text-muted-foreground">إجمالي المصاريف (حسب الفلترة الحالية)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-border shadow-xs rounded-2xl">
          <CardContent className="p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Sprout className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground font-mono">
                {expenses.length}
              </div>
              <p className="text-xs text-muted-foreground">إجمالي عدد المصاريف المسجلة بالموسم</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Add Form (1 col) + Expense Records (2 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Add Expense Form Card */}
        <Card className="lg:col-span-1 border border-border shadow-xs rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/80 bg-card/60 pb-3.5">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              <span>إضافة مصروف جديد</span>
            </CardTitle>
            <CardDescription className="text-xs">تسجيل نفقة جديدة للمعصرة</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            {/* Category Field: Toggle between Select & Input + Quick Tags */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">نوع المصروف</Label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomMode(!isCustomMode);
                    if (!isCustomMode) {
                      setCustomCategory(newExpense.category || "");
                    }
                  }}
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                >
                  <Edit3 className="h-3 w-3" />
                  <span>{isCustomMode ? "اختر من القائمة" : "+ كتابة نوع مخصص"}</span>
                </button>
              </div>

              {isCustomMode ? (
                <div className="space-y-1">
                  <Input
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="اكتب نوع المصروف (مثل: طعام، ديزل، صيانة...)"
                    className="h-10 text-sm rounded-lg"
                    autoFocus
                  />
                </div>
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
                  className="w-full h-10 px-3 border border-input rounded-lg text-sm bg-background text-foreground focus:ring-1 focus:ring-primary"
                >
                  <option value="">اختر نوع المصروف...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {/* Default suggestions that haven't been added yet */}
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
              <div className="space-y-1 pt-1">
                <span className="text-[11px] text-muted-foreground block">اختيار سريع:</span>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_SUGGESTIONS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleSelectQuickTag(tag)}
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted/60 hover:bg-primary/15 hover:text-primary transition-colors text-muted-foreground border border-border/50"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Amount Field */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">المبلغ (شيكل) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={newExpense.amount}
                onChange={(e) => setNewExpense((p) => ({ ...p, amount: e.target.value }))}
                placeholder="أدخل المبلغ بالشيكل"
                min="0"
                step="0.5"
                className="h-10 text-sm rounded-lg"
              />
            </div>

            {/* Description Field */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">الوصف والتفاصيل (اختياري)</Label>
              <Textarea
                value={newExpense.description}
                onChange={(e) => setNewExpense((p) => ({ ...p, description: e.target.value }))}
                placeholder="تفاصيل إضافية عن هذا المصروف..."
                rows={3}
                className="text-sm rounded-lg resize-none"
              />
            </div>

            <Button
              onClick={addExpense}
              disabled={savingExpense}
              className="w-full h-10 font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs rounded-lg gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>{savingExpense ? "جارٍ الإضافة..." : "تسجيل المصروف"}</span>
            </Button>
          </CardContent>
        </Card>

        {/* Expenses List & Filter Card */}
        <Card className="lg:col-span-2 border border-border shadow-xs rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-border/80 bg-card/60 pb-3.5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base font-bold">سجل المصاريف</CardTitle>
                <CardDescription className="text-xs">عرض ومراجعة المصاريف المسجلة</CardDescription>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">فلترة حسب النوع</Label>
                <select
                  value={filter.category}
                  onChange={(e) => setFilter((p) => ({ ...p, category: e.target.value }))}
                  className="w-full h-9 px-3 border border-input rounded-lg text-xs bg-background text-foreground"
                >
                  <option value="">جميع الأنواع</option>
                  {allFilterCategories.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">من تاريخ</Label>
                <Input
                  type="date"
                  dir="ltr"
                  value={filter.dateFrom}
                  onChange={(e) => setFilter((p) => ({ ...p, dateFrom: e.target.value }))}
                  className="h-9 text-xs rounded-lg text-right"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">إلى تاريخ</Label>
                <Input
                  type="date"
                  dir="ltr"
                  value={filter.dateTo}
                  onChange={(e) => setFilter((p) => ({ ...p, dateTo: e.target.value }))}
                  className="h-9 text-xs rounded-lg text-right"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <p className="text-center py-12 text-muted-foreground text-sm">جارٍ التحميل...</p>
            ) : filteredExpenses.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Sprout className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-base font-medium">لا توجد مصاريف مسجلة</p>
                <p className="text-xs text-muted-foreground mt-1">المصاريف المضافة ستظهر هنا تلقائياً</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">الوصف</TableHead>
                    <TableHead className="text-left">الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((exp) => (
                    <TableRow key={exp.id} className="hover:bg-accent/30 transition-colors">
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{new Date(exp.created_at).toLocaleDateString("ar-SA")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-xs font-medium">
                          {exp.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm text-destructive font-mono">
                        {exp.amount.toLocaleString()} ₪
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground max-w-xs truncate">
                        {exp.description || "-"}
                      </TableCell>
                      <TableCell className="text-left">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md"
                          onClick={() => setDeleteTarget(exp)}
                          title="حذف المصروف"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl" className="rounded-2xl max-w-md p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right text-base font-bold">تأكيد حذف المصروف</AlertDialogTitle>
            <AlertDialogDescription className="text-right text-xs text-muted-foreground mt-2">
              هل تريد حذف مصروف <strong>"{deleteTarget?.category}"</strong> بقيمة{" "}
              <strong>{deleteTarget?.amount} شيكل</strong>؟ سيتم إعادة المبلغ إلى رصيد الصندوق تلقائياً.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-3">
            <AlertDialogCancel className="text-xs">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteExpense}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-bold"
            >
              تأكيد الحذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Expenses;
