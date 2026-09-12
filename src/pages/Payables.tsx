import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  FileText
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSeason } from "@/contexts/SeasonContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCashSession } from "@/contexts/CashSessionContext";
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
  status: "unpaid" | "partially_paid" | "paid";
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

export default function Payables() {
  const { millId } = useAuth();
  const { activeSeason } = useSeason();
  const { toast } = useToast();
  const { isOpen: isCashOpen, refresh: refreshCash } = useCashSession();

  const [payables, setPayables] = useState<Payable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Settle Dialog State
  const [settleTarget, setSettleTarget] = useState<Payable | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMethod, setSettleMethod] = useState<"cash" | "other">("cash");
  const [settleNotes, setSettleNotes] = useState("");
  const [settleLoading, setSettleLoading] = useState(false);

  // Add Supplier Dialog State
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", address: "", notes: "" });
  const [savingSupplier, setSavingSupplier] = useState(false);

  useEffect(() => {
    if (activeSeason) {
      fetchData();
    }
  }, [activeSeason?.id]);

  const fetchData = async () => {
    if (!activeSeason) return;
    setLoading(true);
    try {
      const [payRes, supRes] = await Promise.all([
        supabase
          .from("payables" as any)
          .select("*")
          .eq("season_id", activeSeason.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("suppliers" as any)
          .select("*")
          .order("name", { ascending: true })
      ]);

      if (payRes.data) setPayables(payRes.data as any);
      if (supRes.data) setSuppliers(supRes.data as any);
    } catch (err: any) {
      console.error("Error fetching payables/suppliers:", err);
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

    if (settleMethod === "cash" && !isCashOpen) {
      toast({
        title: "الصندوق مغلق",
        description: "يجب فتح الصندوق أولاً قبل سداد الالتزامات نقداً",
        variant: "destructive",
      });
      return;
    }

    setSettleLoading(true);
    try {
      const { data, error } = await supabase.rpc("settle_payable_command" as any, {
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
      await refreshCash();
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
            الموردين والالتزامات المالية
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            إدارة ديون الموردين ومستحقات الشركاء وجدولة سداد الالتزامات بدون ازدواجية
          </p>
        </div>
        <Button onClick={() => setAddSupplierOpen(true)} className="gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          إضافة مورد جديد
        </Button>
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

      <Tabs defaultValue="payables" className="w-full">
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="payables">سجل الالتزامات والديون</TabsTrigger>
          <TabsTrigger value="suppliers">دليل الموردين المعتمدين</TabsTrigger>
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
                            {p.status !== "paid" ? (
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
                            ) : (
                              <span className="text-xs text-emerald-600 flex items-center justify-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> مسدد
                              </span>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                      كاش من صندوق المعصرة (يخصم من الكاش والصندوق)
                    </SelectItem>
                    <SelectItem value="other">
                      مصدر آخر / تحويل بنكي خارجي (لا يمس الكاش)
                    </SelectItem>
                  </SelectContent>
                </Select>
                {settleMethod === "cash" && !isCashOpen && (
                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> الصندوق مغلق؛ يتطلب السداد النقدي فتح الصندوق أولاً.
                  </p>
                )}
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
              disabled={settleLoading || (settleMethod === "cash" && !isCashOpen)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {settleLoading ? "جاري المعالجة..." : "تأكيد السداد"}
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
    </div>
  );
}
