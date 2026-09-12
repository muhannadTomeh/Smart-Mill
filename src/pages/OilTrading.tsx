import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  ShoppingCart, TrendingUp, TrendingDown, Package, DollarSign, 
  Calendar, RefreshCw, Plus, Filter, X
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useInventory } from "@/hooks/useInventory";
import { useCurrency } from "@/hooks/useCurrency";
import { formatDate } from "@/lib/formatters";
import { CashSessionGuard } from "@/components/CashSessionGuard";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  price: number;
  total_price: number;
  party_name: string | null;
  notes: string | null;
  created_at: string;
}

const OilTrading = () => {
  const { user, millId } = useAuth();
  const { activeSeason } = useSeason();
  const { toast } = useToast();
  const { currency } = useCurrency();
  const selectedCurrency = currency || "₪";
  const { inventory, refetch: refetchInventory } = useInventory();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const [newTransaction, setNewTransaction] = useState({
    type: 'buy' as 'buy' | 'sell',
    amount: "",
    price: "",
    partyName: "",
    notes: ""
  });

  useEffect(() => {
    if (activeSeason) {
      fetchTransactions();
    } else {
      setTransactions([]);
      setLoading(false);
    }
  }, [activeSeason?.id]);

  const fetchTransactions = async () => {
    if (!activeSeason) return;
    setLoading(true);
    try {
      let query = supabase
        .from("oil_transactions")
        .select("*")
        .eq("season_id", activeSeason.id);

      const effectiveMillId = millId || activeSeason.mill_id;
      if (effectiveMillId) {
        query = (query as any).eq("mill_id", effectiveMillId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) {
        console.error("fetchTransactions error:", error);
      }
      setTransactions((data as Transaction[]) || []);
    } catch (err) {
      console.error("Error fetching transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewTransaction({ type: 'buy', amount: "", price: "", partyName: "", notes: "" });
  };

  const addTransaction = async () => {
    if (!activeSeason) {
      toast({
        title: "تنبيه",
        description: "يرجى اختيار وتفعيل موسم أولاً لإجراء المعاملات",
        variant: "destructive"
      });
      return;
    }

    if (!user) {
      toast({
        title: "تنبيه",
        description: "يجب تسجيل الدخول أولاً",
        variant: "destructive"
      });
      return;
    }

    if (!newTransaction.amount || !newTransaction.price) {
      toast({
        title: "بيانات غير مكتملة",
        description: "يرجى إدخال الكمية والسعر بشكل صحيح",
        variant: "destructive"
      });
      return;
    }

    const amount = parseFloat(newTransaction.amount);
    const price = parseFloat(newTransaction.price);

    if (isNaN(amount) || amount <= 0 || isNaN(price) || price <= 0) {
      toast({
        title: "قيم غير صحيحة",
        description: "يرجى إدخال أرقام صحيحة وموجبة للكمية والسعر",
        variant: "destructive"
      });
      return;
    }

    const totalPrice = amount * price;

    if (newTransaction.type === 'sell' && amount > inventory.total_oil) {
      toast({
        title: "الكمية غير متوفرة",
        description: `الكمية المتوفرة في المخزون: ${inventory.total_oil.toFixed(1)} كغم فقط`,
        variant: "destructive"
      });
      return;
    }

    if (newTransaction.type === 'buy' && totalPrice > inventory.total_cash) {
      toast({
        title: "الرصيد النقدي لا يكفي",
        description: `الكاش المتوفر بالصندوق: ${inventory.total_cash.toLocaleString()} ${selectedCurrency} فقط`,
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await (supabase.rpc as any)("record_oil_transaction_atomic", {
        p_season_id: activeSeason.id,
        p_type: newTransaction.type,
        p_amount: amount,
        p_price: price,
        p_party_name: newTransaction.partyName.trim() || null,
        p_notes: newTransaction.notes.trim() || null,
      });

      if (error) {
        console.error("record_oil_transaction_atomic error:", error);
        toast({
          title: "خطأ في تسجيل العملية",
          description: error.message || "تعذر حفظ المعاملة في قاعدة البيانات",
          variant: "destructive"
        });
        return;
      }

      resetForm();
      setAddDialogOpen(false);

      toast({
        title: "تمت العملية بنجاح",
        description: `تم تسجيل عملية ${newTransaction.type === 'buy' ? 'الشراء' : 'البيع'} بنجاح`
      });

      await fetchTransactions();
      await refetchInventory();
    } catch (err: any) {
      console.error("addTransaction error:", err);
      toast({
        title: "خطأ غير متوقع",
        description: err.message || "حدث خطأ أثناء تنفيذ العملية",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculatedTotal = (parseFloat(newTransaction.amount) || 0) * (parseFloat(newTransaction.price) || 0);

  const filteredTransactions = transactions.filter((tx) => {
    if (typeFilter === "all") return true;
    return tx.type === typeFilter;
  });

  return (
    <CashSessionGuard>
    <div className="space-y-6 text-right" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">بيع وشراء الزيت</h1>
            <p className="text-xs text-muted-foreground mt-0.5">تسجيل ومتابعة عمليات بيع وشراء الزيت وتحديث المخزون المالي</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchTransactions();
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
            <span>تسجيل عملية جديدة</span>
          </Button>
        </div>
      </div>

      {/* Inventory & Cash Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border-border/60 shadow-xs bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">الزيت المتوفر بالمعصرة</p>
              <h3 className="text-2xl font-bold text-foreground mt-1">
                {inventory.total_oil.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">كغم</span>
              </h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Package className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-xs bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">الكاش المتوفر بالصندوق</p>
              <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {inventory.total_cash.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{selectedCurrency}</span>
              </h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <DollarSign className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 shadow-xs bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">إجمالي العمليات المسجلة</p>
              <h3 className="text-2xl font-bold text-foreground mt-1">
                {transactions.length} <span className="text-sm font-normal text-muted-foreground">عملية</span>
              </h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Transactions History Table (Full Width - 100%) */}
      <Card className="rounded-2xl border-border/60 shadow-xs overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-card/60 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <span>سجل عمليات البيع والشراء</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                سجل تاريخي كامل لجميع العمليات المنفذة في الموسم الحالي
              </CardDescription>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-muted/30 border border-border/60 rounded-xl px-2.5 py-1 text-xs">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-7 text-xs bg-transparent border-0 text-foreground cursor-pointer"
                >
                  <option value="all">جميع العمليات</option>
                  <option value="buy">عمليات الشراء (📥)</option>
                  <option value="sell">عمليات البيع (📤)</option>
                </select>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs">جارٍ تحميل سجل العمليات...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground px-4">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-base font-semibold text-foreground">لا توجد عمليات مسجلة</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {typeFilter !== "all" 
                  ? "لا توجد عمليات تطابق نوع الفلترة المحدد."
                  : "لم يتم تسجيل أي عملية بيع أو شراء في هذا الموسم حتى الآن."}
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
                  <span>تسجيل أول عملية الآن</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-right font-bold text-xs">التاريخ</TableHead>
                    <TableHead className="text-right font-bold text-xs">نوع العملية</TableHead>
                    <TableHead className="text-right font-bold text-xs">الكمية</TableHead>
                    <TableHead className="text-right font-bold text-xs">السعر / كغم</TableHead>
                    <TableHead className="text-right font-bold text-xs">الإجمالي</TableHead>
                    <TableHead className="text-right font-bold text-xs">الطرف المعني</TableHead>
                    <TableHead className="text-right font-bold text-xs">ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-right text-xs font-mono">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{formatDate(tx.created_at)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={`text-xs font-bold gap-1 ${
                            tx.type === 'buy'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300'
                          }`}
                        >
                          {tx.type === 'buy' ? '📥 شراء زيت' : '📤 بيع زيت'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm">
                        {tx.amount} <span className="text-xs font-normal text-muted-foreground">كغم</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {tx.price} {selectedCurrency}
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm text-primary font-mono">
                        {Number(tx.total_price).toLocaleString()} {selectedCurrency}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {tx.party_name || <span className="text-muted-foreground italic">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground max-w-[200px] truncate">
                        {tx.notes || <span className="text-muted-foreground/50 italic">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          ADD TRANSACTION MODAL (DIALOG) — Like Settings Hub Pattern
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px] text-right rounded-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="text-right sm:text-right pb-2 border-b border-border/60">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <span>إضافة عملية بيع أو شراء زيت</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              تسجيل تفاصيل العملية وتحديث أرصدة الزيت والكاش تلقائياً
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type Selection */}
            <div>
              <Label className="text-xs font-semibold">نوع العملية *</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setNewTransaction((p) => ({ ...p, type: 'buy' }))}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-xs sm:text-sm transition-all ${
                    newTransaction.type === 'buy'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-border/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <TrendingDown className="h-4 w-4 text-emerald-600" />
                  <span>📥 شراء زيت (إضافة)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewTransaction((p) => ({ ...p, type: 'sell' }))}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-xs sm:text-sm transition-all ${
                    newTransaction.type === 'sell'
                      ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 ring-2 ring-blue-500/20'
                      : 'border-border/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <span>📤 بيع زيت (خصم)</span>
                </button>
              </div>
            </div>

            {/* Amount and Price */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">الكمية (كغم) *</Label>
                <Input
                  type="number"
                  value={newTransaction.amount}
                  onChange={(e) => setNewTransaction((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="الكمية بالكيلوغرام..."
                  min="0"
                  step="0.1"
                  className="rounded-xl h-10 font-mono"
                />
                {newTransaction.type === 'sell' && (
                  <p className="text-[11px] text-muted-foreground">
                    المتوفر للبيع: <strong>{inventory.total_oil.toFixed(1)} كغم</strong>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">سعر الكيلوغرام ({selectedCurrency}) *</Label>
                <Input
                  type="number"
                  value={newTransaction.price}
                  onChange={(e) => setNewTransaction((p) => ({ ...p, price: e.target.value }))}
                  placeholder="سعر الكيلو..."
                  min="0"
                  step="0.1"
                  className="rounded-xl h-10 font-mono"
                />
                {newTransaction.type === 'buy' && (
                  <p className="text-[11px] text-muted-foreground">
                    الكاش المتوفر: <strong>{inventory.total_cash.toLocaleString()} {selectedCurrency}</strong>
                  </p>
                )}
              </div>
            </div>

            {/* Calculated Total Display */}
            {calculatedTotal > 0 && (
              <div className="p-3.5 bg-primary/5 border border-primary/15 rounded-xl flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">إجمالي قيمة العملية:</span>
                <span className="text-lg font-bold text-primary font-mono">
                  {calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {selectedCurrency}
                </span>
              </div>
            )}

            {/* Party Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {newTransaction.type === 'buy' ? 'اسم المورّد / المزارع' : 'اسم المشتري / الزبون'} (اختياري)
              </Label>
              <Input
                value={newTransaction.partyName}
                onChange={(e) => setNewTransaction((p) => ({ ...p, partyName: e.target.value }))}
                placeholder={newTransaction.type === 'buy' ? 'أدخل اسم المورّد...' : 'أدخل اسم المشتري...'}
                className="rounded-xl h-10"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">ملاحظات إضافية (اختياري)</Label>
              <Input
                value={newTransaction.notes}
                onChange={(e) => setNewTransaction((p) => ({ ...p, notes: e.target.value }))}
                placeholder="ملاحظات توضيحية حول العملية..."
                className="rounded-xl h-10"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={isSubmitting}
              className="rounded-xl text-xs font-semibold"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={addTransaction}
              disabled={isSubmitting || !newTransaction.amount || !newTransaction.price}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl gap-2 text-xs"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>جارٍ التسجيل...</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>تسجيل عملية {newTransaction.type === 'buy' ? 'الشراء' : 'البيع'}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </CashSessionGuard>
  );
};

export default OilTrading;