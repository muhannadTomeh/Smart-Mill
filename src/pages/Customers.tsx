import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, Search, FileText, Phone, Calendar, UserPlus, Plus,
  Printer, Eye, Pencil, Star, CheckCircle, Receipt,
  HandCoins, Wallet, CreditCard, ArrowDownLeft, ShieldCheck,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoicePreview } from "@/components/invoices/InvoicePreview";
import { printThermalReceipt } from "@/lib/thermalReceiptPrinter";
import { formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { recordCustomerPaymentAtomic } from "@/lib/financialCore";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  created_at: string;
}

interface InvoiceRecord {
  id: string;
  customer_id?: string | null;
  customer_name: string;
  oil_produced: number;
  container_count?: number;
  container_type?: string;
  payment_type: string;
  oil_amount?: number;
  cash_amount?: number;
  unpaid_amount?: number;
  total_display: string;
  created_at: string;
  notes?: string | null;
}

interface CustomerPaymentRecord {
  id: string;
  customer_id: string;
  amount: number;
  payment_method: string;
  notes?: string | null;
  created_at: string;
}

const paymentLabel = (type: string) => {
  if (type === "oil") return "دفع بالزيت";
  if (type === "cash") return "دفع نقدي";
  return "دفع مختلط";
};

const Customers = () => {
  const { user, currentMillId, effectiveUserId, profile } = useAuth();
  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";
  const targetMillId = currentMillId || effectiveUserId || user?.id;
  const targetUserId = targetMillId;
  const { activeSeason } = useSeason();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPaymentRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"invoices" | "payments">("invoices");

  // New Customer Dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [savingNewCust, setSavingNewCust] = useState(false);

  // Record Payment Dialog (سند قبض / سداد دين)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number | "">("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  // Preview Invoice Dialog
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(null);

  // Edit Invoice Dialog
  const [editInvoice, setEditInvoice] = useState<InvoiceRecord | null>(null);
  const [editFormData, setEditFormData] = useState({
    customer_name: "",
    oil_produced: 0,
    container_count: 0,
    container_type: "",
    payment_type: "cash",
    cash_amount: 0,
    oil_amount: 0,
    unpaid_amount: 0,
    total_display: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Starred / VIP Customers
  const [starredIds, setStarredIds] = useState<string[]>(() => {
    if (!targetUserId) return [];
    try {
      const saved = localStorage.getItem(`starred_customers_${targetUserId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (targetUserId) {
      try {
        const saved = localStorage.getItem(`starred_customers_${targetUserId}`);
        if (saved) setStarredIds(JSON.parse(saved));
      } catch {}
    }
  }, [targetUserId]);

  const toggleStar = (customerId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStarredIds(prev => {
      const exists = prev.includes(customerId);
      const next = exists ? prev.filter(id => id !== customerId) : [...prev, customerId];
      if (targetUserId) {
        try {
          localStorage.setItem(`starred_customers_${targetUserId}`, JSON.stringify(next));
        } catch {}
      }
      toast({
        title: exists ? "تم إلغاء تمييز الزبون" : "تم تمييز الزبون بنجاح ⭐",
      });
      return next;
    });
  };

  useEffect(() => {
    if (targetUserId && activeSeason) {
      fetchAllData();
    }
  }, [targetUserId, activeSeason]);

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([fetchCustomers(), fetchInvoices(), fetchCustomerPayments()]);
    setLoading(false);
  };

  const fetchCustomers = async () => {
    if (!targetMillId || !activeSeason) return;
    const { data } = await supabase
      .from("customers")
      .select("*")
      .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: false });
    setCustomers((data as Customer[]) || []);
  };

  const fetchInvoices = async () => {
    if (!targetMillId || !activeSeason) return;
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .or(`mill_id.eq.${targetMillId},user_id.eq.${targetMillId}`)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: false });
    setInvoices((data as InvoiceRecord[]) || []);
  };

  const fetchCustomerPayments = async () => {
    if (!targetUserId || !activeSeason) return;
    try {
      const { data, error } = await supabase
        .from("customer_payments")
        .select("*")
        .eq("season_id", activeSeason.id)
        .order("created_at", { ascending: false });
      if (!error && data) {
        setCustomerPayments(data as CustomerPaymentRecord[]);
      }
    } catch (err) {
      console.warn("Could not fetch customer_payments", err);
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustName.trim()) {
      toast({ title: "تنبيه", description: "يرجى كتابة اسم الزبون", variant: "destructive" });
      return;
    }
    setSavingNewCust(true);
    try {
      const { error } = await supabase
        .from("customers")
        .insert({
          mill_id: targetMillId!,
          user_id: user?.id || targetMillId!,
          season_id: activeSeason!.id,
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: "تمت الإضافة بنجاح", description: `تمت إضافة الزبون "${newCustName}" بنجاح` });
      setNewCustName("");
      setNewCustPhone("");
      setAddDialogOpen(false);
      await fetchCustomers();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "تعذر إضافة الزبون", variant: "destructive" });
    } finally {
      setSavingNewCust(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedCustomer || !activeSeason || !targetUserId) return;
    const amt = Number(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "تنبيه", description: "يرجى إدخال مبلغ صحيح أكبر من صفر", variant: "destructive" });
      return;
    }
    setSavingPayment(true);
    try {
      const res = await recordCustomerPaymentAtomic({
        seasonId: activeSeason.id,
        customerId: selectedCustomer.id,
        amount: amt,
        notes: paymentNotes.trim() || `سند قبض / سداد ذمة - ${selectedCustomer.name}`,
        targetUserId: targetUserId,
      });

      if (res.error) throw res.error;

      toast({
        title: "تم تسجيل الدفعة بنجاح",
        description: `تم إيداع ${amt} ₪ في الصندوق وقيدها في حساب الزبون بنجاح`,
      });

      setPaymentDialogOpen(false);
      setPaymentAmount("");
      setPaymentNotes("");
      await fetchCustomerPayments();
      await fetchInvoices();
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message || "تعذر تسجيل الدفعة",
        variant: "destructive",
      });
    } finally {
      setSavingPayment(false);
    }
  };

  const handleOpenEdit = (inv: InvoiceRecord) => {
    setEditInvoice(inv);
    setEditFormData({
      customer_name: inv.customer_name || "",
      oil_produced: Number(inv.oil_produced) || 0,
      container_count: Number(inv.container_count) || 0,
      container_type: inv.container_type || "بدون تنكات",
      payment_type: inv.payment_type || "cash",
      cash_amount: Number(inv.cash_amount) || 0,
      oil_amount: Number(inv.oil_amount) || 0,
      unpaid_amount: Number(inv.unpaid_amount) || 0,
      total_display: inv.total_display || "",
    });
  };

  const handleSaveInvoiceEdit = async () => {
    if (!editInvoice) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("invoices")
        .update({
          customer_name: editFormData.customer_name.trim(),
          oil_produced: Number(editFormData.oil_produced),
          container_count: Number(editFormData.container_count),
          container_type: editFormData.container_type.trim(),
          payment_type: editFormData.payment_type,
          cash_amount: Number(editFormData.cash_amount),
          oil_amount: Number(editFormData.oil_amount),
          unpaid_amount: Number(editFormData.unpaid_amount) || 0,
          total_display: editFormData.total_display.trim() || `${editFormData.cash_amount} ₪`,
        })
        .eq("id", editInvoice.id);

      if (error) throw error;

      toast({
        title: "تم الحفظ بنجاح",
        description: "تم تحديث بيانات الفاتورة بنجاح",
      });

      setEditInvoice(null);
      await fetchInvoices();
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message || "تعذر حفظ التعديلات",
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleInvoiceUnpaid = async (inv: InvoiceRecord) => {
    const currentUnpaid = Number(inv.unpaid_amount) || 0;
    const newUnpaid = currentUnpaid > 0 ? 0 : (Number(inv.cash_amount) || 0);

    try {
      const { error } = await supabase
        .from("invoices")
        .update({ unpaid_amount: newUnpaid })
        .eq("id", inv.id);

      if (error) throw error;

      toast({
        title: "تم تحديث حالة الفاتورة",
        description: newUnpaid > 0 ? `تم تقييد الفاتورة كدين بذمة الزبون (${newUnpaid} ₪)` : "تم تحديد الفاتورة كمدفوعة بالكامل",
      });

      await fetchInvoices();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "تعذر تحديث الفاتورة", variant: "destructive" });
    }
  };

  const separateInvoiceToNewCustomer = async (inv: InvoiceRecord) => {
    if (!activeSeason || !targetUserId) return;
    try {
      const { data: newCust, error: cErr } = await supabase
        .from("customers")
        .insert({
          user_id: targetUserId,
          season_id: activeSeason.id,
          name: inv.customer_name,
          phone: selectedCustomer?.phone || null,
          created_at: inv.created_at,
        })
        .select("id")
        .single();

      if (cErr || !newCust) throw cErr || new Error("تعذر إنشاء زبون جديد");

      const { error: invErr } = await supabase
        .from("invoices")
        .update({ customer_id: newCust.id })
        .eq("id", inv.id);

      if (invErr) throw invErr;

      toast({
        title: "تم الفصل بنجاح",
        description: `تم فصل الفاتورة وإنشاء سجل زبون مستقل لـ "${inv.customer_name}"`,
      });

      await fetchCustomers();
      await fetchInvoices();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message || "تعذر فصل الفاتورة", variant: "destructive" });
    }
  };

  const getCustomerInvoices = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return [];
    return invoices.filter(inv =>
      (inv.customer_id && inv.customer_id === customer.id) ||
      (!inv.customer_id && inv.customer_name === customer.name)
    );
  };

  const getCustomerDebts = (customerId: string) => {
    const custInvs = getCustomerInvoices(customerId);
    const custPmts = customerPayments.filter(p => p.customer_id === customerId);

    const totalOil = custInvs.reduce((s, i) => s + (Number(i.oil_produced) || 0), 0);
    const totalCashBilled = custInvs.reduce((s, i) => s + (Number(i.cash_amount) || 0), 0);
    const totalUnpaidFromInvoices = custInvs.reduce((s, i) => s + (Number(i.unpaid_amount) || 0), 0);
    const totalPaymentsReceived = custPmts.reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const remainingDebt = Math.max(0, totalUnpaidFromInvoices - totalPaymentsReceived);
    const totalPaid = (totalCashBilled - totalUnpaidFromInvoices) + totalPaymentsReceived;

    return {
      totalOil,
      totalCashBilled,
      totalUnpaidFromInvoices,
      totalPaymentsReceived,
      totalPaid,
      remainingDebt,
      payments: custPmts,
    };
  };

  const filteredCustomers = customers.filter(c =>
    c.name.includes(searchTerm) || c.phone?.includes(searchTerm)
  );

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const customerInvoices = selectedCustomerId ? getCustomerInvoices(selectedCustomerId) : [];
  const selectedCustomerDebts = selectedCustomerId ? getCustomerDebts(selectedCustomerId) : null;
  const isSelectedCustomerStarred = selectedCustomer ? starredIds.includes(selectedCustomer.id) : false;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">إدارة الزبائن والذمم</h1>
            <p className="text-xs text-muted-foreground mt-0.5">عرض سجلات الزبائن، فواتيرهم، كشوفات الحساب وسداد الديون</p>
          </div>
        </div>

        <Button
          onClick={() => setAddDialogOpen(true)}
          className="gap-2 bg-primary text-primary-foreground font-bold shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>+ إضافة زبون جديد</span>
        </Button>
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <UserPlus className="h-5 w-5 text-primary" />
              إضافة زبون جديد للنظام
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              تسجيل زبون جديد في سجلات الموسم الحالي
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">
                اسم الزبون <span className="text-destructive">*</span>
              </Label>
              <Input
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="مثال: اوس أحمد"
                className="text-sm font-medium"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCustomer();
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">رقم الهاتف (اختياري)</Label>
              <Input
                value={newCustPhone}
                onChange={(e) => setNewCustPhone(e.target.value)}
                placeholder="مثال: 0599123456"
                className="text-sm font-medium"
                dir="ltr"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCustomer();
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleCreateCustomer}
              disabled={savingNewCust || !newCustName.trim()}
              className="gap-1.5 font-bold"
            >
              <Plus className="h-4 w-4" />
              {savingNewCust ? "جارٍ الحفظ..." : "حفظ الزبون"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main Customers List Card */}
      <Card className="border border-border shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-border/80 bg-card/60 pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg font-bold">قائمة الزبائن ({customers.length})</CardTitle>
              <CardDescription className="text-xs">عرض ومتابعة جميع الزبائن المسجلين وأرصدة ذممهم</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث بالاسم أو الهاتف..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pe-9 h-9 text-sm rounded-lg"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center py-12 text-muted-foreground text-sm">جارٍ التحميل...</p>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-base font-medium">لا يوجد زبائن مطابقين</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">رقم الهاتف</TableHead>
                  <TableHead className="text-right">الفواتير</TableHead>
                  <TableHead className="text-right">رصيد الذمة / الدين</TableHead>
                  <TableHead className="text-right">تاريخ التسجيل</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => {
                  const custInvoices = invoices.filter(inv =>
                    (inv.customer_id && inv.customer_id === customer.id) ||
                    (!inv.customer_id && inv.customer_name === customer.name)
                  );
                  const isStarred = starredIds.includes(customer.id);
                  const debts = getCustomerDebts(customer.id);

                  return (
                    <TableRow key={customer.id} className="hover:bg-accent/30 transition-colors">
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => toggleStar(customer.id, e)}
                            className="p-1 rounded text-muted-foreground/40 hover:text-amber-500 transition-colors"
                            title={isStarred ? "إلغاء التمييز" : "تمييز الزبون كـ VIP"}
                          >
                            <Star
                              className={cn(
                                "h-4 w-4 transition-colors",
                                isStarred && "fill-amber-500 text-amber-500"
                              )}
                            />
                          </button>
                          <span className="font-semibold text-foreground text-sm">{customer.name}</span>
                          {isStarred && (
                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-500/20 px-1.5 py-0.2 rounded-md">
                              مميز
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {customer.phone ? (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono" dir="ltr">
                            <span>{customer.phone}</span>
                            <Phone className="h-3 w-3" />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/60">غير محدد</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="font-bold text-xs bg-muted/40">
                          {custInvoices.length}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {debts.remainingDebt > 0 ? (
                          <Badge variant="destructive" className="font-mono text-xs font-bold gap-1">
                            <span>مطلوب: {debts.remainingDebt} ₪</span>
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="font-semibold text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200">
                            خالص (0 ₪)
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                          <Calendar className="h-3.5 w-3.5 opacity-70" />
                          <span>{formatDate(customer.created_at)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-left">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 text-xs gap-1.5 rounded-lg border-border hover:bg-muted font-medium"
                          onClick={() => {
                            setSelectedCustomerId(customer.id);
                            setActiveTab("invoices");
                          }}
                        >
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>كشف الحساب والذمم</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Customer Details, Statement & Debts Dialog */}
      <Dialog open={!!selectedCustomerId} onOpenChange={(open) => !open && setSelectedCustomerId(null)}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6 rounded-2xl" dir="rtl">
          <DialogHeader className="border-b border-border/80 pb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => selectedCustomer && toggleStar(selectedCustomer.id)}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  title={isSelectedCustomerStarred ? "إلغاء التمييز" : "تمييز الزبون"}
                >
                  <Star
                    className={cn(
                      "h-5 w-5 transition-colors",
                      isSelectedCustomerStarred
                        ? "fill-amber-500 text-amber-500"
                        : "text-muted-foreground/40 hover:text-amber-500"
                    )}
                  />
                </button>
                <div>
                  <DialogTitle className="text-right text-lg font-bold flex items-center gap-2 text-foreground">
                    <span>{selectedCustomer?.name}</span>
                    {isSelectedCustomerStarred && (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-xs font-semibold px-2 py-0.5">
                        زبون مميز ⭐
                      </Badge>
                    )}
                  </DialogTitle>
                  <div className="flex items-center gap-2.5 text-xs text-muted-foreground mt-1 flex-wrap">
                    {selectedCustomer?.phone ? (
                      <span className="flex items-center gap-1 font-mono" dir="ltr">
                        <Phone className="h-3 w-3" />
                        {selectedCustomer.phone}
                      </span>
                    ) : (
                      <span>بدون هاتف</span>
                    )}
                    <span>•</span>
                    <span>{customerInvoices.length} فواتير مسجلة</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setPaymentDialogOpen(true)}
                  className="h-8 px-3 text-xs gap-1.5 font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                >
                  <HandCoins className="h-3.5 w-3.5" />
                  <span>+ تسجيل سند قبض / سداد دين</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedCustomer && toggleStar(selectedCustomer.id)}
                  className={cn(
                    "h-8 px-3 text-xs gap-1.5 rounded-lg border font-medium",
                    isSelectedCustomerStarred
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Star className={cn("h-3.5 w-3.5", isSelectedCustomerStarred && "fill-amber-500 text-amber-500")} />
                  <span>{isSelectedCustomerStarred ? "مميز" : "تمييز"}</span>
                </Button>
              </div>
            </div>

            {/* Financial Stat Summary Cards */}
            {selectedCustomerDebts && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-border/50">
                <div className="p-3 rounded-xl bg-card border">
                  <span className="text-[11px] text-muted-foreground block">إجمالي الزيت المعصور</span>
                  <span className="text-base font-bold text-foreground font-mono">{selectedCustomerDebts.totalOil} كغم</span>
                </div>
                <div className="p-3 rounded-xl bg-card border">
                  <span className="text-[11px] text-muted-foreground block">إجمالي الخدمات النقدية</span>
                  <span className="text-base font-bold text-foreground font-mono">{selectedCustomerDebts.totalCashBilled} ₪</span>
                </div>
                <div className="p-3 rounded-xl bg-card border">
                  <span className="text-[11px] text-muted-foreground block">إجمالي المسدد والمقبوض</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">{selectedCustomerDebts.totalPaid} ₪</span>
                </div>
                <div className={cn(
                  "p-3 rounded-xl border",
                  selectedCustomerDebts.remainingDebt > 0
                    ? "bg-destructive/10 border-destructive/30"
                    : "bg-emerald-500/10 border-emerald-500/30"
                )}>
                  <span className="text-[11px] font-semibold block text-muted-foreground">الرصيد المتبقي (الذمة)</span>
                  <span className={cn(
                    "text-base font-black font-mono",
                    selectedCustomerDebts.remainingDebt > 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"
                  )}>
                    {selectedCustomerDebts.remainingDebt > 0 ? `${selectedCustomerDebts.remainingDebt} ₪ (دين)` : "خالص (0 ₪)"}
                  </span>
                </div>
              </div>
            )}
          </DialogHeader>

          {/* Tabs: Invoices vs Customer Payments */}
          <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="mt-4">
            <TabsList className="grid grid-cols-2 w-full max-w-xs">
              <TabsTrigger value="invoices" className="text-xs font-semibold gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                <span>فواتير العصر ({customerInvoices.length})</span>
              </TabsTrigger>
              <TabsTrigger value="payments" className="text-xs font-semibold gap-1.5">
                <HandCoins className="h-3.5 w-3.5" />
                <span>سندات القبض ({selectedCustomerDebts?.payments.length || 0})</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: INVOICES */}
            <TabsContent value="invoices" className="mt-4">
              {customerInvoices.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">لا توجد فواتير مسجلة لهذا الزبون حتى الآن</p>
                </div>
              ) : (
                <div className="overflow-hidden border border-border/70 rounded-xl bg-card">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">كمية الزيت</TableHead>
                        <TableHead className="text-right">التنكات</TableHead>
                        <TableHead className="text-right">طريقة الدفع</TableHead>
                        <TableHead className="text-right">الإجمالي</TableHead>
                        <TableHead className="text-right">حالة السداد</TableHead>
                        <TableHead className="text-left">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerInvoices.map((inv) => {
                        const unpaid = Number(inv.unpaid_amount) || 0;
                        const isCashInv = Number(inv.cash_amount) > 0;

                        return (
                          <TableRow key={inv.id} className="hover:bg-accent/30 transition-colors">
                            <TableCell className="text-right">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>{formatDate(inv.created_at)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium text-sm">
                              {inv.oil_produced} كغم
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {inv.container_count && inv.container_count > 0 ? (
                                <span>{inv.container_count} ({inv.container_type || "تنكة"})</span>
                              ) : (
                                <span>-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant={inv.payment_type === 'oil' ? 'default' : inv.payment_type === 'cash' ? 'secondary' : 'outline'}
                                className="text-xs"
                              >
                                {paymentLabel(inv.payment_type)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-bold text-sm text-foreground">
                              {inv.total_display}
                            </TableCell>
                            <TableCell className="text-right">
                              {isCashInv ? (
                                unpaid > 0 ? (
                                  <Badge variant="destructive" className="text-xs font-mono">
                                    متبقي دين: {unpaid} ₪
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200 bg-emerald-50/50">
                                    مدفوع كاش
                                  </Badge>
                                )
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  سداد عيني
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-left">
                              <div className="flex items-center gap-1.5 justify-end">
                                {isCashInv && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-[11px] gap-1 rounded-md text-muted-foreground hover:text-foreground"
                                    onClick={() => toggleInvoiceUnpaid(inv)}
                                    title={unpaid > 0 ? "تحديد كمدفوعة" : "تحديد كدين بذمة الزبون"}
                                  >
                                    <CreditCard className="h-3 w-3" />
                                    <span>{unpaid > 0 ? "سداد الفاتورة" : "قيد كدين"}</span>
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs gap-1 rounded-md"
                                  onClick={() => setPreviewInvoice(inv)}
                                  title="معاينة الفاتورة"
                                >
                                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>معاينة</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs gap-1 rounded-md"
                                  onClick={() => handleOpenEdit(inv)}
                                  title="تعديل الفاتورة"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>تعديل</span>
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-xs gap-1 rounded-md bg-primary text-primary-foreground shadow-xs"
                                  onClick={() => printThermalReceipt({
                                    customer_name: inv.customer_name,
                                    oil_produced: inv.oil_produced,
                                    container_count: inv.container_count,
                                    container_type: inv.container_type,
                                    payment_type: inv.payment_type,
                                    oil_amount: inv.oil_amount,
                                    cash_amount: inv.cash_amount,
                                    total_display: inv.total_display,
                                    created_at: inv.created_at,
                                    season_name: activeSeason?.name,
                                  }, millName)}
                                  title="طباعة إيصال حراري (80mm)"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  <span>طباعة</span>
                                </Button>
                                {customerInvoices.length > 1 && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground rounded-md"
                                    onClick={() => separateInvoiceToNewCustomer(inv)}
                                    title="فصل هذه الفاتورة لزبون جديد مستقل"
                                  >
                                    <UserPlus className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* TAB 2: DEBT SETTLEMENT PAYMENTS */}
            <TabsContent value="payments" className="mt-4">
              {!selectedCustomerDebts || selectedCustomerDebts.payments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <HandCoins className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">لا توجد سندات قبض أو سداد ديون مسجلة لهذا الزبون</p>
                  <Button
                    size="sm"
                    onClick={() => setPaymentDialogOpen(true)}
                    className="mt-3 gap-1.5 font-bold"
                  >
                    <Plus className="h-4 w-4" />
                    <span>تسجيل أول دفعة سداد</span>
                  </Button>
                </div>
              ) : (
                <div className="overflow-hidden border border-border/70 rounded-xl bg-card">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="text-right">تاريخ السند</TableHead>
                        <TableHead className="text-right">المبلغ المسدد</TableHead>
                        <TableHead className="text-right">طريقة الدفع</TableHead>
                        <TableHead className="text-right">البيان / الملاحظات</TableHead>
                        <TableHead className="text-left">طباعة السند</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCustomerDebts.payments.map((p) => (
                        <TableRow key={p.id} className="hover:bg-accent/30 transition-colors">
                          <TableCell className="text-right">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{formatDate(p.created_at)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-black text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                            {p.amount} ₪
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <Badge variant="outline" className="font-semibold">
                              {p.payment_method === 'cash' ? 'نقدي (صندوق)' : p.payment_method}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {p.notes || "سداد دفعة حساب"}
                          </TableCell>
                          <TableCell className="text-left">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs gap-1 rounded-md"
                              onClick={() => {
                                printThermalReceipt({
                                  customer_name: selectedCustomer?.name || "",
                                  oil_produced: 0,
                                  payment_type: "cash",
                                  cash_amount: p.amount,
                                  total_display: `${p.amount} ₪`,
                                  created_at: p.created_at,
                                  season_name: activeSeason?.name,
                                }, `${millName} - سند قبض`);
                              }}
                            >
                              <Printer className="h-3 w-3" />
                              <span>طباعة سند</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Record Payment Voucher Dialog (سند قبض نقدي) */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-5" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <HandCoins className="h-5 w-5 text-emerald-600" />
              تسجيل سند قبض / سداد دين
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              استلام دفعة نقدية من الزبون ({selectedCustomer?.name}) وتوريدها مباشرة إلى الصندوق
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">
                المبلغ المسدد (شيكل) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder="أدخل المبلغ المقبوض"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value === "" ? "" : Number(e.target.value))}
                className="text-base font-bold font-mono h-10"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRecordPayment();
                }}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">البيان / ملاحظات السند</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="مثال: دفعة تحت الحساب / رقم سند يدوي"
                className="text-sm font-medium h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRecordPayment();
                }}
              />
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border text-xs space-y-1 text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>الحركة المالية:</span>
                <span className="font-semibold text-emerald-600">قبض نقدي (توريد للصندوق)</span>
              </div>
              <div className="flex items-center justify-between">
                <span>الأثر المحاسبي:</span>
                <span>تخفيض دين الزبون + زيادة رصيد الكاش</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setPaymentDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleRecordPayment}
              disabled={savingPayment || !paymentAmount || Number(paymentAmount) <= 0}
              className="gap-1.5 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle className="h-4 w-4" />
              {savingPayment ? "جارٍ التوريد..." : "اعتماد سند القبض"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog open={!!editInvoice} onOpenChange={(open) => !open && setEditInvoice(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl p-5" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Pencil className="h-4 w-4 text-primary" />
              تعديل بيانات الفاتورة
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              تحديث تفاصيل الفاتورة ومبالغ المحاسبة
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">اسم الزبون</Label>
                <Input
                  value={editFormData.customer_name}
                  onChange={(e) => setEditFormData(p => ({ ...p, customer_name: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">كمية الزيت (كغم)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={editFormData.oil_produced}
                  onChange={(e) => setEditFormData(p => ({ ...p, oil_produced: Number(e.target.value) }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">عدد التنكات</Label>
                <Input
                  type="number"
                  min="0"
                  value={editFormData.container_count}
                  onChange={(e) => setEditFormData(p => ({ ...p, container_count: Number(e.target.value) }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">نوع التنكات</Label>
                <Input
                  value={editFormData.container_type}
                  onChange={(e) => setEditFormData(p => ({ ...p, container_type: e.target.value }))}
                  placeholder="مثال: بلاستيك"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">طريقة الدفع</Label>
                <Select
                  value={editFormData.payment_type}
                  onValueChange={(val) => setEditFormData(p => ({ ...p, payment_type: val }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="cash">دفع نقدي (شيكل)</SelectItem>
                    <SelectItem value="oil">دفع بالزيت (رد عيني)</SelectItem>
                    <SelectItem value="mixed">دفع مختلط (زيت + نقد)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">المبلغ النقدي (شيكل)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={editFormData.cash_amount}
                  onChange={(e) => setEditFormData(p => ({ ...p, cash_amount: Number(e.target.value) }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">المبلغ المتبقي كدين (شيكل)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={editFormData.unpaid_amount}
                  onChange={(e) => setEditFormData(p => ({ ...p, unpaid_amount: Number(e.target.value) }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">المبلغ المعروض</Label>
                <Input
                  value={editFormData.total_display}
                  onChange={(e) => setEditFormData(p => ({ ...p, total_display: e.target.value }))}
                  placeholder="مثال: 112.50 ₪"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t">
            <Button variant="outline" size="sm" onClick={() => setEditInvoice(null)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              onClick={handleSaveInvoiceEdit}
              disabled={savingEdit}
              className="gap-1.5 font-bold"
            >
              <CheckCircle className="h-4 w-4" />
              {savingEdit ? "جارٍ الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice Preview Modal (Matches /invoices exactly) */}
      <Dialog open={!!previewInvoice} onOpenChange={(o) => !o && setPreviewInvoice(null)}>
        <DialogContent dir="rtl" className="max-w-md p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle>معاينة الفاتورة</DialogTitle>
          </DialogHeader>
          {previewInvoice && (
            <InvoicePreview
              millName={millName}
              data={{
                ...previewInvoice,
                season_name: activeSeason?.name,
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
