import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users, Search, FileText, Phone, Calendar, UserPlus, Plus,
  Printer, Eye, Star, Receipt, BookOpen
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSeason } from "@/contexts/SeasonContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InvoicePreview } from "@/components/invoices/InvoicePreview";
import { printThermalReceipt } from "@/lib/thermalReceiptPrinter";
import { formatDate } from "@/lib/formatters";
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
  const navigate = useNavigate();
  const { user, millId, profile } = useAuth();
  const millName = profile?.mill_name || localStorage.getItem("mill_name") || "المعصرة الذكية";
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

  // Starred / VIP Customers
  const [starredIds, setStarredIds] = useState<string[]>(() => {
    const ownerOrMillKey = millId || user?.id;
    if (!ownerOrMillKey) return [];
    try {
      const saved = localStorage.getItem(`starred_customers_${ownerOrMillKey}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const ownerOrMillKey = millId || user?.id;
    if (ownerOrMillKey) {
      try {
        const saved = localStorage.getItem(`starred_customers_${ownerOrMillKey}`);
        if (saved) setStarredIds(JSON.parse(saved));
      } catch {}
    }
  }, [millId, user?.id]);

  const toggleStar = (customerId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStarredIds(prev => {
      const exists = prev.includes(customerId);
      const next = exists ? prev.filter(id => id !== customerId) : [...prev, customerId];
      const ownerOrMillKey = millId || user?.id;
      if (ownerOrMillKey) {
        try {
          localStorage.setItem(`starred_customers_${ownerOrMillKey}`, JSON.stringify(next));
        } catch {}
      }
      toast({
        title: exists ? "تم إلغاء تمييز الزبون" : "تم تمييز الزبون بنجاح ⭐",
      });
      return next;
    });
  };

  useEffect(() => {
    if (activeSeason) {
      fetchCustomers();
      fetchInvoices();
    }
  }, [activeSeason?.id, millId, user?.id]);

  const fetchCustomers = async () => {
    if (!activeSeason) return;
    let query = supabase
      .from("customers")
      .select("*")
      .eq("season_id", activeSeason.id);

    if (millId || activeSeason.mill_id) {
      query = query.eq("mill_id", millId || activeSeason.mill_id);
    } else if (user?.id) {
      query = query.eq("user_id", user.id);
    }

    const { data } = await query.order("created_at", { ascending: false });
    setCustomers((data as Customer[]) || []);
    setLoading(false);
  };

  const fetchInvoices = async () => {
    if (!activeSeason) return;
    let query = supabase
      .from("invoices")
      .select("*")
      .eq("season_id", activeSeason.id);

    if (millId || activeSeason.mill_id) {
      query = query.eq("mill_id", millId || activeSeason.mill_id);
    } else if (user?.id) {
      query = query.eq("user_id", user.id);
    }

    const { data } = await query.order("created_at", { ascending: false });
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
          user_id: user?.id!,
          mill_id: millId || activeSeason?.mill_id || null,
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

  const showInvoiceCorrectionGuidance = () => {
    toast({
      title: "الفاتورة المعتمدة غير قابلة للتعديل",
      description: "لتصحيح القيم المالية ألغِ الفاتورة وأنشئ فاتورة جديدة.",
    });
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
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">الزبائن والفواتير</h1>
            <p className="text-xs text-muted-foreground mt-0.5">عرض سجلات الزبائن وفواتيرهم وإدارتها</p>
          </div>
        </div>

        <Button variant="outline" onClick={() => navigate("/financial-ledger")} className="gap-2">
          <BookOpen className="h-4 w-4" />
          الدفتر المالي
        </Button>
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
                            onClick={showInvoiceCorrectionGuidance}
                            title="تصحيح فاتورة معتمدة"
                          >
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>تصحيح</span>
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
                oil_amount: previewInvoice.oil_amount ?? 0,
                cash_amount: previewInvoice.cash_amount ?? 0,
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
