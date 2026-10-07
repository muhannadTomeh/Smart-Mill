import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  Plus,
  ReceiptText,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ClickableDateInput } from "@/components/history/ClickableDateInput";
import { supabase } from "@/integrations/supabase/client";
import { getArabicErrorMessage } from "@/lib/errorMessages";
import { cn } from "@/lib/utils";

interface PlatformFinanceSummary {
  cash_balance: number;
  total_in: number;
  total_out: number;
  subscription_collected: number;
  charge_collected: number;
  outstanding_dues: number;
  open_dues_count: number;
}

interface PlatformTransaction {
  id: string;
  direction: "in" | "out";
  category: "subscription_payment" | "admin_charge_payment" | "manual_income" | "manual_expense" | "reversal";
  amount: number;
  mill_id: string | null;
  mill_name: string | null;
  description: string;
  transaction_date: string;
  created_at: string;
  reversal_of: string | null;
  reversal_reason: string | null;
  is_reversed: boolean;
}

interface AdminChargeBalance {
  id: string;
  mill_id: string;
  mill_name: string | null;
  title: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date: string | null;
  notes: string | null;
  effective_status: "outstanding" | "partially_paid" | "paid" | "cancelled";
  created_at: string;
}

const emptySummary: PlatformFinanceSummary = {
  cash_balance: 0,
  total_in: 0,
  total_out: 0,
  subscription_collected: 0,
  charge_collected: 0,
  outstanding_dues: 0,
  open_dues_count: 0,
};

const money = (value: number | string | null | undefined) =>
  `${Number(value || 0).toLocaleString("ar-u-nu-latn", { maximumFractionDigits: 2 })} ₪`;

const formatDate = (value: string | null) => {
  if (!value) return "غير محدد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ar-u-nu-latn");
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ar-u-nu-latn", { hour: "2-digit", minute: "2-digit" });
};

const categoryLabel: Record<PlatformTransaction["category"], string> = {
  subscription_payment: "دفعة اشتراك",
  admin_charge_payment: "سداد دين إداري",
  manual_income: "إيداع إداري",
  manual_expense: "مصروف إداري",
  reversal: "حركة عكس",
};

export function PlatformFinancePanel({ onUpdated }: { onUpdated?: () => void }) {
  const [summary, setSummary] = useState<PlatformFinanceSummary>(emptySummary);
  const [transactions, setTransactions] = useState<PlatformTransaction[]>([]);
  const [charges, setCharges] = useState<AdminChargeBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movement, setMovement] = useState({
    direction: "in" as "in" | "out",
    amount: "",
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [paymentCharge, setPaymentCharge] = useState<AdminChargeBalance | null>(null);
  const [payment, setPayment] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), notes: "" });
  const [reversalTransaction, setReversalTransaction] = useState<PlatformTransaction | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const movementKey = useRef(crypto.randomUUID());
  const paymentKey = useRef(crypto.randomUUID());
  const reversalKey = useRef(crypto.randomUUID());

  const loadFinance = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResult, transactionsResult, chargesResult] = await Promise.all([
        supabase.rpc("get_platform_finance_summary"),
        supabase
          .from("platform_financial_effective_events")
          .select("id, direction, category, amount, mill_id, mill_name, description, transaction_date, created_at, reversal_of, reversal_reason, is_reversed")
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("mill_admin_charge_balances")
          .select("id, mill_id, mill_name, title, amount, paid_amount, remaining_amount, due_date, notes, effective_status, created_at")
          .order("created_at", { ascending: false }),
      ]);

      if (summaryResult.error) throw summaryResult.error;
      if (transactionsResult.error) throw transactionsResult.error;
      if (chargesResult.error) throw chargesResult.error;

      setSummary({ ...emptySummary, ...(summaryResult.data as unknown as PlatformFinanceSummary) });
      setTransactions((transactionsResult.data || []) as PlatformTransaction[]);
      setCharges((chargesResult.data || []) as AdminChargeBalance[]);
    } catch (error) {
      console.error("Failed to load platform finance:", error);
      toast.error(getArabicErrorMessage(error, "تعذر تحميل صندوق إدارة المنصة."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  const openCharges = useMemo(
    () => charges.filter((charge) => charge.effective_status === "outstanding" || charge.effective_status === "partially_paid"),
    [charges],
  );

  const refreshAfterWrite = async () => {
    await loadFinance();
    onUpdated?.();
  };

  const saveMovement = async () => {
    const amount = Number(movement.amount);
    if (!Number.isFinite(amount) || amount <= 0 || movement.description.trim().length < 3) {
      toast.error("أدخل مبلغًا صحيحًا ووصفًا واضحًا للحركة.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("record_platform_cash_movement_command", {
        p_direction: movement.direction,
        p_amount: amount,
        p_description: movement.description.trim(),
        p_transaction_date: movement.date,
        p_idempotency_key: movementKey.current,
      });
      if (error) throw error;
      toast.success(movement.direction === "in" ? "تم تسجيل الإيداع الإداري" : "تم تسجيل المصروف الإداري");
      setMovementOpen(false);
      setMovement({ direction: "in", amount: "", description: "", date: new Date().toISOString().slice(0, 10) });
      movementKey.current = crypto.randomUUID();
      await refreshAfterWrite();
    } catch (error) {
      console.error("Failed to record platform movement:", error);
      toast.error(getArabicErrorMessage(error, "تعذر تسجيل الحركة المالية."));
    } finally {
      setSaving(false);
    }
  };

  const openChargePayment = (charge: AdminChargeBalance) => {
    paymentKey.current = crypto.randomUUID();
    setPaymentCharge(charge);
    setPayment({
      amount: String(Number(charge.remaining_amount || 0)),
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
  };

  const saveChargePayment = async () => {
    if (!paymentCharge) return;
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(paymentCharge.remaining_amount)) {
      toast.error("مبلغ الدفعة يجب أن يكون أكبر من صفر وألا يتجاوز الرصيد المتبقي.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("record_mill_admin_charge_payment_command", {
        p_charge_id: paymentCharge.id,
        p_amount: amount,
        p_payment_date: payment.date,
        p_notes: payment.notes.trim() || null,
        p_idempotency_key: paymentKey.current,
      });
      if (error) throw error;
      toast.success("تم تسجيل دفعة الدين وإضافتها إلى صندوق الإدارة");
      setPaymentCharge(null);
      await refreshAfterWrite();
    } catch (error) {
      console.error("Failed to record charge payment:", error);
      toast.error(getArabicErrorMessage(error, "تعذر تسجيل دفعة الدين."));
    } finally {
      setSaving(false);
    }
  };

  const saveReversal = async () => {
    if (!reversalTransaction || reversalReason.trim().length < 3) {
      toast.error("اكتب سببًا واضحًا لعكس الحركة.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("reverse_platform_financial_transaction_command", {
        p_transaction_id: reversalTransaction.id,
        p_reason: reversalReason.trim(),
        p_idempotency_key: reversalKey.current,
      });
      if (error) throw error;
      toast.success("تم عكس الحركة وتصحيح رصيد صندوق الإدارة");
      setReversalTransaction(null);
      setReversalReason("");
      await refreshAfterWrite();
    } catch (error) {
      console.error("Failed to reverse platform transaction:", error);
      toast.error(getArabicErrorMessage(error, "تعذر عكس الحركة المالية."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <section className="overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-900 p-5 text-white shadow-lg sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-200">
              <WalletCards className="h-5 w-5" />
              <span className="text-sm font-semibold">صندوق إدارة المنصة</span>
            </div>
            <p className="mt-3 text-4xl font-black tracking-tight">{money(summary.cash_balance)}</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-100/80">
              رصيد مستقل عن صناديق المعاصر، مبني فقط على دفعات الاشتراكات والديون والحركات الإدارية المسجلة.
            </p>
          </div>
          <Button
            className="gap-2 bg-white text-emerald-950 hover:bg-emerald-50"
            onClick={() => {
              movementKey.current = crypto.randomUUID();
              setMovementOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            تسجيل حركة مالية
          </Button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceMetric icon={ArrowDownLeft} label="إجمالي الكاش الداخل" value={money(summary.total_in)} tone="green" />
        <FinanceMetric icon={ArrowUpRight} label="إجمالي الكاش الخارج" value={money(summary.total_out)} tone="red" />
        <FinanceMetric icon={ReceiptText} label="المستحقات المفتوحة" value={money(summary.outstanding_dues)} hint={`${summary.open_dues_count} دين مفتوح`} tone="amber" />
        <FinanceMetric icon={CircleDollarSign} label="دفعات الاشتراك" value={money(summary.subscription_collected)} hint={`ديون محصلة: ${money(summary.charge_collected)}`} tone="blue" />
      </div>

      <Tabs defaultValue="ledger" className="space-y-4">
        <TabsList className="grid h-auto w-full max-w-md grid-cols-2 rounded-xl p-1">
          <TabsTrigger value="ledger" className="gap-2 py-2.5"><Banknote className="h-4 w-4" /> سجل الصندوق</TabsTrigger>
          <TabsTrigger value="dues" className="gap-2 py-2.5"><CalendarClock className="h-4 w-4" /> الديون والمستحقات</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">سجل الحركات المالية</CardTitle>
              <CardDescription>كل حركة محفوظة تاريخيًا، والتصحيح يتم بحركة عكس مستقلة.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="p-10 text-center text-muted-foreground">جارٍ تحميل السجل...</div>
              ) : transactions.length === 0 ? (
                <EmptyState icon={Banknote} text="لا توجد حركات مالية في صندوق الإدارة بعد" />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">النوع</TableHead>
                        <TableHead className="text-right">البيان</TableHead>
                        <TableHead className="text-right">المعصرة</TableHead>
                        <TableHead className="text-right">المبلغ</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((transaction) => (
                        <TableRow key={transaction.id} className={cn(transaction.is_reversed && "opacity-60")}>
                          <TableCell>
                            <p className="text-sm font-medium">{formatDate(transaction.transaction_date)}</p>
                            <p className="text-[11px] text-muted-foreground">{formatTime(transaction.created_at)}</p>
                          </TableCell>
                          <TableCell><Badge variant="outline">{categoryLabel[transaction.category]}</Badge></TableCell>
                          <TableCell className="max-w-xs"><p className="truncate font-medium">{transaction.description}</p></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{transaction.mill_name || "إدارة المنصة"}</TableCell>
                          <TableCell className={cn("font-black", transaction.direction === "in" ? "text-emerald-700" : "text-rose-700")}>
                            {transaction.direction === "in" ? "+" : "-"}{money(transaction.amount)}
                          </TableCell>
                          <TableCell>
                            {transaction.is_reversed ? <Badge variant="secondary">تم عكسها</Badge> : transaction.category === "reversal" ? <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">تصحيح</Badge> : <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">فعالة</Badge>}
                          </TableCell>
                          <TableCell>
                            {!transaction.is_reversed && transaction.category !== "reversal" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1.5 text-rose-700"
                                onClick={() => {
                                  reversalKey.current = crypto.randomUUID();
                                  setReversalReason("");
                                  setReversalTransaction(transaction);
                                }}
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> عكس
                              </Button>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dues">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">الديون والمستحقات على المعاصر</CardTitle>
              <CardDescription>السداد الجزئي مدعوم، ولا يدخل المبلغ إلى الصندوق إلا عند تسجيل دفعة فعلية.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="p-10 text-center text-muted-foreground">جارٍ تحميل المستحقات...</div>
              ) : charges.length === 0 ? (
                <EmptyState icon={ReceiptText} text="لا توجد ديون إدارية مسجلة" />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المعصرة</TableHead>
                        <TableHead className="text-right">الدين</TableHead>
                        <TableHead className="text-right">الأصلي</TableHead>
                        <TableHead className="text-right">المدفوع</TableHead>
                        <TableHead className="text-right">المتبقي</TableHead>
                        <TableHead className="text-right">الاستحقاق</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {charges.map((charge) => (
                        <TableRow key={charge.id}>
                          <TableCell className="font-bold">{charge.mill_name || "معصرة غير معروفة"}</TableCell>
                          <TableCell><p className="font-medium">{charge.title}</p>{charge.notes && <p className="max-w-xs truncate text-xs text-muted-foreground">{charge.notes}</p>}</TableCell>
                          <TableCell>{money(charge.amount)}</TableCell>
                          <TableCell className="text-emerald-700">{money(charge.paid_amount)}</TableCell>
                          <TableCell className="font-black text-amber-700">{money(charge.remaining_amount)}</TableCell>
                          <TableCell>{formatDate(charge.due_date)}</TableCell>
                          <TableCell><ChargeStatus status={charge.effective_status} /></TableCell>
                          <TableCell>
                            {(charge.effective_status === "outstanding" || charge.effective_status === "partially_paid") ? (
                              <Button size="sm" className="gap-1.5" onClick={() => openChargePayment(charge)}>
                                <Banknote className="h-3.5 w-3.5" /> تسجيل دفعة
                              </Button>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {openCharges.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">يوجد {openCharges.length.toLocaleString("ar-u-nu-latn")} استحقاق يحتاج متابعة.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent dir="rtl" className="text-right sm:max-w-lg">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>تسجيل حركة في صندوق الإدارة</DialogTitle>
            <DialogDescription>استخدم الإيداع للكاش الداخل والمصروف للكاش الخارج. لا يؤثر ذلك على أي معصرة.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>نوع الحركة</Label>
              <Select value={movement.direction} onValueChange={(value) => setMovement((current) => ({ ...current, direction: value as "in" | "out" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">إيداع إداري — كاش داخل</SelectItem>
                  <SelectItem value="out">مصروف إداري — كاش خارج</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>المبلغ *</Label>
                <Input type="number" min="0.01" step="0.01" value={movement.amount} onChange={(event) => setMovement((current) => ({ ...current, amount: event.target.value }))} dir="ltr" className="text-left font-mono font-bold" autoFocus />
              </div>
              <ClickableDateInput label="تاريخ الحركة *" value={movement.date} onChange={(date) => setMovement((current) => ({ ...current, date }))} />
            </div>
            <div className="space-y-2">
              <Label>البيان *</Label>
              <Textarea value={movement.description} onChange={(event) => setMovement((current) => ({ ...current, description: event.target.value }))} placeholder="مثال: مصروف استضافة النظام" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setMovementOpen(false)} disabled={saving}>إلغاء</Button>
            <Button onClick={saveMovement} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الحركة"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(paymentCharge)} onOpenChange={(open) => !open && setPaymentCharge(null)}>
        <DialogContent dir="rtl" className="text-right sm:max-w-lg">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>تسجيل دفعة من دين إداري</DialogTitle>
            <DialogDescription>{paymentCharge?.mill_name} — {paymentCharge?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-3 text-center text-sm">
              <div><p className="text-xs text-muted-foreground">الأصلي</p><p className="font-bold">{money(paymentCharge?.amount)}</p></div>
              <div><p className="text-xs text-muted-foreground">المدفوع</p><p className="font-bold text-emerald-700">{money(paymentCharge?.paid_amount)}</p></div>
              <div><p className="text-xs text-muted-foreground">المتبقي</p><p className="font-bold text-amber-700">{money(paymentCharge?.remaining_amount)}</p></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>مبلغ الدفعة *</Label>
                <Input type="number" min="0.01" max={paymentCharge?.remaining_amount} step="0.01" value={payment.amount} onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))} dir="ltr" className="text-left font-mono font-bold" autoFocus />
              </div>
              <ClickableDateInput label="تاريخ الدفع *" value={payment.date} onChange={(date) => setPayment((current) => ({ ...current, date }))} />
            </div>
            <div className="space-y-2">
              <Label>ملاحظة (اختياري)</Label>
              <Textarea value={payment.notes} onChange={(event) => setPayment((current) => ({ ...current, notes: event.target.value }))} placeholder="طريقة الاستلام أو رقم الحوالة" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPaymentCharge(null)} disabled={saving}>إلغاء</Button>
            <Button onClick={saveChargePayment} disabled={saving}>{saving ? "جارٍ التسجيل..." : "تسجيل الدفعة"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reversalTransaction)} onOpenChange={(open) => !open && setReversalTransaction(null)}>
        <DialogContent dir="rtl" className="text-right sm:max-w-lg">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>عكس حركة مالية</DialogTitle>
            <DialogDescription>ستُنشأ حركة معاكسة ولن تُحذف الحركة الأصلية.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="font-bold">{reversalTransaction?.description}</p>
              <p className="mt-1 text-sm text-muted-foreground">{money(reversalTransaction?.amount)}</p>
            </div>
            <div className="space-y-2">
              <Label>سبب العكس *</Label>
              <Textarea value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="اكتب سبب التصحيح بوضوح" autoFocus />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setReversalTransaction(null)} disabled={saving}>إلغاء</Button>
            <Button variant="destructive" onClick={saveReversal} disabled={saving}>{saving ? "جارٍ العكس..." : "تأكيد العكس"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FinanceMetric({ icon: Icon, label, value, hint, tone }: {
  icon: typeof Banknote;
  label: string;
  value: string;
  hint?: string;
  tone: "green" | "red" | "amber" | "blue";
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <span className={cn("rounded-xl p-2.5", tones[tone])}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-black">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ChargeStatus({ status }: { status: AdminChargeBalance["effective_status"] }) {
  if (status === "paid") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">مسدد</Badge>;
  if (status === "partially_paid") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">مسدد جزئيًا</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">ملغى</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">مستحق</Badge>;
}

function EmptyState({ icon: Icon, text }: { icon: typeof Banknote; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-muted-foreground">
      <Icon className="h-9 w-9 opacity-40" />
      <p className="text-sm font-medium">{text}</p>
    </div>
  );
}
