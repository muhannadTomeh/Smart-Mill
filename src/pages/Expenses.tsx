import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sprout, Plus, Calendar, DollarSign, Trash2 } from "lucide-react";
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

const Expenses = () => {
  const { user } = useAuth();
  const { activeSeason } = useSeason();
  const { toast } = useToast();
  const { inventory, updateInventory, refetch: refetchInventory } = useInventory();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newExpense, setNewExpense] = useState({ category: "", amount: "", description: "" });
  const [filter, setFilter] = useState({ category: "", dateFrom: "", dateTo: "" });
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  useEffect(() => {
    if (user && activeSeason) {
      fetchExpenses();
      fetchCategories();
    }
  }, [user, activeSeason]);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("expense_categories")
      .select("*")
      .eq("user_id", user!.id)
      .eq("season_id", activeSeason!.id)
      .order("name", { ascending: true });
    setCategories((data as ExpenseCategory[]) || []);
  };

  const fetchExpenses = async () => {
    const { data } = await supabase.from("expenses").select("*").eq("user_id", user!.id).eq("season_id", activeSeason!.id).order("created_at", { ascending: false });
    setExpenses((data as Expense[]) || []);
    setLoading(false);
  };

  const addExpense = async () => {
    if (!newExpense.category || !newExpense.amount) {
      toast({ title: "خطأ", description: "يرجى إدخال نوع المصروف والمبلغ", variant: "destructive" });
      return;
    }
    const amount = parseFloat(newExpense.amount);

    const { error } = await supabase.from("expenses").insert({
      user_id: user!.id, season_id: activeSeason!.id, category: newExpense.category, amount,
      description: newExpense.description || null,
    });

    if (!error) {
      await updateInventory({ total_cash: inventory.total_cash - amount });
      setNewExpense({ category: "", amount: "", description: "" });
      toast({ title: "تمت الإضافة", description: `تم إضافة مصروف بقيمة ${amount} شيكل` });
      fetchExpenses();
      refetchInventory();
    }
  };

  const deleteExpense = async () => {
    if (!deleteTarget) return;
    const { id, amount } = deleteTarget;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (!error) {
      await updateInventory({ total_cash: inventory.total_cash + amount });
      toast({ title: "تم الحذف", description: "تم حذف المصروف" });
      setDeleteTarget(null);
      fetchExpenses();
      refetchInventory();
    }
  };

  const filteredExpenses = expenses.filter(exp => {
    if (filter.category && exp.category !== filter.category) return false;
    if (filter.dateFrom && new Date(exp.created_at) < new Date(filter.dateFrom)) return false;
    if (filter.dateTo && new Date(exp.created_at) > new Date(filter.dateTo + 'T23:59:59')) return false;
    return true;
  });

  const getTotalExpenses = () => filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Sprout className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">إدارة المصاريف</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-destructive" />
              <div>
                <div className="text-2xl font-bold text-destructive">{getTotalExpenses()} ش</div>
                <p className="text-sm text-muted-foreground">إجمالي المصاريف</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Sprout className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold text-primary">{expenses.length}</div>
                <p className="text-sm text-muted-foreground">عدد المصاريف</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />إضافة مصروف جديد</CardTitle>
            <CardDescription>سجل مصروف جديد للمعصرة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>نوع المصروف</Label>
              <select value={newExpense.category} onChange={(e) => setNewExpense(p => ({ ...p, category: e.target.value }))} className="w-full p-2 border rounded-md bg-background text-foreground">
                <option value="">اختر نوع المصروف</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <Label>المبلغ (شيكل)</Label>
              <Input type="number" value={newExpense.amount} onChange={(e) => setNewExpense(p => ({ ...p, amount: e.target.value }))} placeholder="المبلغ" min="0" step="0.1" />
            </div>
            <div>
              <Label>الوصف (اختياري)</Label>
              <Textarea value={newExpense.description} onChange={(e) => setNewExpense(p => ({ ...p, description: e.target.value }))} placeholder="وصف المصروف..." rows={3} />
            </div>
            <Button onClick={addExpense} className="w-full"><Plus className="h-4 w-4 me-2" />إضافة المصروف</Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>سجل المصاريف</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div>
                <Label>فلترة حسب النوع</Label>
                <select value={filter.category} onChange={(e) => setFilter(p => ({ ...p, category: e.target.value }))} className="w-full p-2 border rounded-md text-sm bg-background text-foreground">
                  <option value="">جميع الأنواع</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label>من تاريخ</Label>
                <Input type="date" value={filter.dateFrom} onChange={(e) => setFilter(p => ({ ...p, dateFrom: e.target.value }))} />
              </div>
              <div>
                <Label>إلى تاريخ</Label>
                <Input type="date" value={filter.dateTo} onChange={(e) => setFilter(p => ({ ...p, dateTo: e.target.value }))} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Sprout className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">لا توجد مصاريف</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">الوصف</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1"><Calendar className="h-4 w-4" />{new Date(exp.created_at).toLocaleDateString('ar-SA')}</div>
                      </TableCell>
                      <TableCell className="text-right"><Badge variant="outline">{exp.category}</Badge></TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{exp.amount} ش</TableCell>
                      <TableCell className="text-right">{exp.description || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setDeleteTarget(exp)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف مصروف <strong>{deleteTarget?.category}</strong> بقيمة <strong>{deleteTarget?.amount} شيكل</strong>؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={deleteExpense} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف المصروف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Expenses;
