import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, Search, FileText, Phone, Calendar, UserPlus, Plus,
  Printer, Eye, Pencil, Star, CheckCircle, Receipt
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoicePreview } from "@/components/invoices/InvoicePreview";
import { printThermalReceipt } from "@/lib/thermalReceiptPrinter";
import { cn } from "@/lib/utils";

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
  total_display: string;
  created_at: string;
  notes?: string | null;
}

const paymentLabel = (type: string) => {
  if (type === "oil") return "دفع بالزيت";
  if (type === "cash") return "دفع نقدي";
  return "دفع مختلط";
};

const Customers = () => {
  const { user, effectiveUserId, profile } = useAuth();
  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";
  const targetUserId = effectiveUserId || user?.id;
  const { activeSeason } = useSeason();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // New Customer Dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [savingNewCust, setSavingNewCust] = useState(false);

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
      fetchCustomers();
      fetchInvoices();
    }
  }, [targetUserId, activeSeason]);

  const fetchCustomers = async () => {
    if (!targetUserId || !activeSeason) return;
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: false });
    setCustomers((data as Customer[]) || []);
    setLoading(false);
  };

  const fetchInvoices = async () => {
    if (!targetUserId || !activeSeason) return;
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("season_id", activeSeason.id)
      .order("created_at", { ascending: false });
    setInvoices((data as InvoiceRecord[]) || []);
  };

  const handleCreateCustomer = async () => {
    if (!newCustName.trim()) {
      toast({ title: "تنبيه", description: "يرجى كتابة اسم الزبون", variant: "destructive" });
      return;
    }
    setSavingNewCust(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          user_id: targetUserId!,
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

  const separateInvoiceToNewCustomer = async (inv: InvoiceRecord) => {
    if (!activeSeason || !targetUserId) return;
    try {
      // 1. Create a distinct customer for this invoice
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

      // 2. Link this specific invoice to the new customer
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

  const filteredCustomers = customers.filter(c =>
    c.name.includes(searchTerm) || c.phone?.includes(searchTerm)
  );

  const getCustomerInvoices = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return [];
    return invoices.filter(inv =>
      (inv.customer_id && inv.customer_id === customer.id) ||
      (!inv.customer_id && inv.customer_name === customer.name)
    );
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const customerInvoices = selectedCustomerId ? getCustomerInvoices(selectedCustomerId) : [];
  const isSelectedCustomerStarred = selectedCustomer ? starredIds.includes(selectedCustomer.id) : false;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">إدارة الزبائن</h1>
            <p className="text-xs text-muted-foreground mt-0.5">عرض سجلات الزبائن وفواتيرهم وإدارتها</p>
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
              <CardDescription className="text-xs">عرض ومتابعة جميع الزبائن المسجلين في النظام</CardDescription>
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
                  <TableHead className="text-right">عدد الفواتير</TableHead>
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
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 opacity-70" />
                          <span>{new Date(customer.created_at).toLocaleDateString('ar-SA')}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-left">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 text-xs gap-1.5 rounded-lg border-border hover:bg-muted font-medium"
                          onClick={() => setSelectedCustomerId(customer.id)}
                        >
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>التفاصيل</span>
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

      {/* Customer Details & Invoices History Dialog (Matches Invoices page layout) */}
      <Dialog open={!!selectedCustomerId} onOpenChange={(open) => !open && setSelectedCustomerId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl" dir="rtl">
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
                    <span>•</span>
                    <span>إجمالي الزيت: {customerInvoices.reduce((s, i) => s + (Number(i.oil_produced) || 0), 0)} كغم</span>
                  </div>
                </div>
              </div>

              {/* Action: Toggle VIP */}
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
                <span>{isSelectedCustomerStarred ? "زبون مميز" : "تمييز الزبون"}</span>
              </Button>
            </div>
          </DialogHeader>

          {customerInvoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">لا توجد فواتير مسجلة لهذا الزبون حتى الآن</p>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden border border-border/70 rounded-xl bg-card">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">كمية الزيت</TableHead>
                    <TableHead className="text-right">التنكات</TableHead>
                    <TableHead className="text-right">طريقة الدفع</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-left">الفاتورة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerInvoices.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-accent/30 transition-colors">
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{new Date(inv.created_at).toLocaleDateString('ar-SA')}</span>
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
                      <TableCell className="text-left">
                        <div className="flex items-center gap-1.5 justify-end">
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
                <Label className="text-xs font-semibold">زيت الرد (كغم)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={editFormData.oil_amount}
                  onChange={(e) => setEditFormData(p => ({ ...p, oil_amount: Number(e.target.value) }))}
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
